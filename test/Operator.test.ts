/* eslint-disable camelcase */
import {parseEther, parseUnits} from '@ethersproject/units'
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {expect} from 'chai'
import {deployments, ethers} from 'hardhat'
import {DepositToken, ERC20, MasterOracleMock, NativeTokenGateway, Operator, Pool, PoolRegistry} from '../typechain'
import Address from '../helpers/address'
import {setTokenBalance, enableForking} from './helpers'
import {setBalance, time} from '@nomicfoundation/hardhat-network-helpers'
import {IOperator} from '../typechain/Operator'

describe('Operator', function () {
  let deployer: SignerWithAddress
  let alice: SignerWithAddress
  let operator: Operator
  let pool: Pool
  let poolRegistry: PoolRegistry
  let usdc: ERC20
  let weth: ERC20
  let msdUSDC: DepositToken
  let msdWETH: DepositToken
  let pullOracle: MasterOracleMock
  let nativeTokenGateway: NativeTokenGateway

  before(enableForking)

  beforeEach(async function () {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[deployer, alice] = await ethers.getSigners()

    const {
      Pool1: {address: poolAddress},
      USDCDepositToken_Pool1: {address: msdUSDCAddress},
      WETHDepositToken_Pool1: {address: msdWETHAddress},
      PoolRegistry: {address: poolRegistryAddress},
      NativeTokenGateway: {address: nativeTokenGatewayAddress},
    } = await deployments.fixture()

    usdc = await ethers.getContractAt('ERC20', Address.USDC_ADDRESS, deployer)
    weth = await ethers.getContractAt('ERC20', Address.WETH_ADDRESS, deployer)
    msdUSDC = await ethers.getContractAt('DepositToken', msdUSDCAddress, deployer)
    msdWETH = await ethers.getContractAt('DepositToken', msdWETHAddress, deployer)
    poolRegistry = await ethers.getContractAt('PoolRegistry', poolRegistryAddress, deployer)
    pool = <Pool>await ethers.getContractAt('contracts/Pool.sol:Pool', poolAddress, deployer)
    nativeTokenGateway = await ethers.getContractAt('NativeTokenGateway', nativeTokenGatewayAddress, deployer)

    const operatorFactory = await ethers.getContractFactory('Operator', deployer)
    operator = await operatorFactory.deploy()

    const pullOracleFactory = await ethers.getContractFactory('MasterOracleMock', deployer)
    pullOracle = await pullOracleFactory.deploy()

    await poolRegistry.updateOperator(operator.address)
    await poolRegistry.updateMasterOracle(pullOracle.address)
    await setTokenBalance(usdc.address, alice.address, parseUnits('1000', 6))
    await setTokenBalance(weth.address, alice.address, parseEther('1000'))
    await setBalance(alice.address, parseEther('1000'))

    await pullOracle.updatePrice(usdc.address, parseEther('1'))
  })

  it('should deposit through operator', async function () {
    const amount = parseUnits('100', 6)

    await usdc.connect(alice).approve(msdUSDC.address, amount)
    const calls: IOperator.CallStruct[] = [
      {
        target: msdUSDC.address,
        value: 0,
        callData: msdUSDC.interface.encodeFunctionData('deposit', [amount, alice.address]),
      },
    ]
    await operator.connect(alice).execute(calls)

    expect(await msdUSDC.balanceOf(alice.address)).eq(amount)
  })

  describe('when user has deposit', function () {
    beforeEach(async function () {
      await pullOracle.setExpirationPeriod(time.duration.hours(1))
      await pullOracle.updatePrice(usdc.address, parseEther('1'))

      // alice deposited collateral
      const amount = parseUnits('100', 6)
      await usdc.connect(alice).approve(msdUSDC.address, amount)
      await msdUSDC.connect(alice).deposit(amount, alice.address)
      const {_depositInUsd: before} = await pool.debtPositionOf(alice.address)
      expect(before).eq(parseEther('100'))
    })

    it('should use operator to update oracle and read call', async function () {
      // given
      await time.increase(time.duration.hours(2))
      const tx = pool.debtPositionOf(alice.address)
      await expect(tx).revertedWith('price-expired')

      // when
      const updatePriceCallData = pullOracle.interface.encodeFunctionData('updatePrice', [
        usdc.address,
        parseEther('1'),
      ])
      const readDebtPositionCallData = pool.interface.encodeFunctionData('debtPositionOf', [alice.address])
      const calls: IOperator.CallStruct[] = [
        {target: pullOracle.address, value: 0, callData: updatePriceCallData},
        {target: pool.address, value: 0, callData: readDebtPositionCallData},
      ]
      const [, debtPosition] = await operator.callStatic.execute(calls)

      // then
      const [isHealthy, depositInUsd, debtInUsd, issuableLimitInUsd, issuableInUsd] =
        ethers.utils.defaultAbiCoder.decode(['bool', 'uint256', 'uint256', 'uint256', 'uint256'], debtPosition)
      expect([isHealthy, depositInUsd, debtInUsd, issuableLimitInUsd, issuableInUsd]).deep.eq([
        true,
        parseEther('100'),
        0,
        parseEther('75'),
        parseEther('75'),
      ])
    })

    it('should use operator to update oracle and write call', async function () {
      // given
      await time.increase(time.duration.hours(2))
      const withdrawAmount = parseUnits('50', 6)
      const tx = msdUSDC.connect(alice).withdraw(withdrawAmount, alice.address)
      await expect(tx).revertedWith('price-expired')

      expect(await msdUSDC.balanceOf(alice.address)).eq(parseUnits('100', 6))

      // when
      const updatePriceCallData = pullOracle.interface.encodeFunctionData('updatePrice', [
        usdc.address,
        parseEther('1'),
      ])
      const withdrawCallData = msdUSDC.interface.encodeFunctionData('withdraw', [withdrawAmount, alice.address])
      const calls: IOperator.CallStruct[] = [
        {target: pullOracle.address, value: 0, callData: updatePriceCallData},
        {target: msdUSDC.address, value: 0, callData: withdrawCallData},
      ]
      await operator.connect(alice).execute(calls)

      // then
      expect(await msdUSDC.balanceOf(alice.address)).eq(parseUnits('50', 6))
    })
  })

  it('should not accept reentrant calls', async function () {
    const multicall = await ethers.getContractAt('IMulticall', Address.MULTICALL3, deployer)
    const amount = parseUnits('10', 6)
    await usdc.connect(alice).transfer(multicall.address, amount)

    const operatorCalls: IOperator.CallStruct[] = [
      {
        target: msdUSDC.address,
        value: 0,
        callData: msdUSDC.interface.encodeFunctionData('deposit', [amount, multicall.address]),
      },
    ]

    const multicallCalls: IOperator.CallStruct[] = [
      {
        target: usdc.address,
        value: 0,
        callData: usdc.interface.encodeFunctionData('approve', [msdUSDC.address, amount]),
      },
      {
        target: operator.address,
        value: 0,
        callData: operator.interface.encodeFunctionData('execute', [operatorCalls]),
      },
    ]

    // Trying to create de deposit position through multicall contract
    const tx = operator.connect(alice).execute([
      {
        target: multicall.address,
        value: 0,
        callData: multicall.interface.encodeFunctionData('aggregate', [multicallCalls]),
      },
    ])

    await expect(tx).revertedWith('Multicall3: call failed')
  })

  it('should send ETH', async function () {
    // given
    expect(await msdWETH.balanceOf(alice.address)).eq(0)

    // when
    const value = parseEther('1')
    const calls: IOperator.CallStruct[] = [
      {
        target: nativeTokenGateway.address,
        value,
        callData: nativeTokenGateway.interface.encodeFunctionData('deposit', [pool.address]),
      },
    ]
    await operator.connect(alice).execute(calls, {value})

    // then
    expect(await msdWETH.balanceOf(alice.address)).eq(value)
  })

  it('should receive ETH', async function () {
    // given
    const value = parseEther('1')
    await nativeTokenGateway.connect(alice).deposit(pool.address, {value})
    expect(await msdWETH.balanceOf(alice.address)).eq(value)

    // when
    const calls: IOperator.CallStruct[] = [
      {
        target: msdWETH.address,
        value: 0,
        callData: msdWETH.interface.encodeFunctionData('approve', [nativeTokenGateway.address, value]),
      },
      {
        target: nativeTokenGateway.address,
        value: 0,
        callData: nativeTokenGateway.interface.encodeFunctionData('withdraw', [pool.address, value]),
      },
    ]
    await operator.connect(alice).execute(calls)

    // then
    expect(await msdWETH.balanceOf(alice.address)).eq(0)
  })

  it('should handle errors', async function () {
    await expect(
      operator.connect(alice).execute([
        {
          target: msdUSDC.address,
          value: 0,
          callData: msdUSDC.interface.encodeFunctionData('deposit', [parseUnits('0', 6), alice.address]),
        },
      ])
    ).revertedWithCustomError(msdUSDC, 'AmountIsZero')

    await expect(
      operator.connect(alice).execute([
        {
          target: msdUSDC.address,
          value: 0,
          callData: msdUSDC.interface.encodeFunctionData('deposit', [parseUnits('999999999', 6), alice.address]),
        },
      ])
    ).revertedWith('ERC20: transfer amount exceeds allowance')
  })
})
