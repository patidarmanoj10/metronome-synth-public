/* eslint-disable max-len */
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {expect} from 'chai'
import {BigNumber, Contract} from 'ethers'
import hre, {ethers} from 'hardhat'
import {loadFixture, setCode, time} from '@nomicfoundation/hardhat-network-helpers'
import {toUSD, parseEther, parseUnits} from '../helpers'
import {impersonateAccount, setTokenBalance, disableForking, enableForking} from './helpers'
import Address from '../helpers/address'
import {
  DepositToken,
  SyntheticToken,
  Pool,
  ERC20,
  DebtToken,
  IWETH,
  NativeTokenGateway,
  PoolRegistry,
  SmartFarmingManager,
  ProxyOFT,
} from '../typechain'
import Constants from '../helpers/constants'
import {address as POOL_REGISTRY_ADDRESS} from '../deployments/base/PoolRegistry.json'
import {address as WETH_DEPOSIT_ADDRESS} from '../deployments/base/WETHDepositToken_Pool1.json'
import {address as USDC_DEPOSIT_ADDRESS} from '../deployments/base/USDCDepositToken_Pool1.json'
import {address as VAETH_DEPOSIT_ADDRESS} from '../deployments/base/VaETHDepositToken_Pool1.json'
import {address as VAWSTETH_DEPOSIT_ADDRESS} from '../deployments/base/VaWSTETHDepositToken_Pool1.json'
import {address as VAUSDC_DEPOSIT_ADDRESS} from '../deployments/base/VaUSDCDepositToken_Pool1.json'
import {address as VACBETH_DEPOSIT_ADDRESS} from '../deployments/base/VaCBETHDepositToken_Pool1.json'
import {address as MSUSD_DEBT_ADDRESS} from '../deployments/base/MsUSDDebt_Pool1.json'
import {address as MSETH_DEBT_ADDRESS} from '../deployments/base/MsETHDebt_Pool1.json'
import {address as MSUSD_SYNTHETIC_ADDRESS} from '../deployments/base/MsUSDSynthetic.json'
import {address as MSETH_SYNTHETIC_ADDRESS} from '../deployments/base/MsETHSynthetic.json'
import {address as MSUSD_PROXYOFT_ADDRESS} from '../deployments/base/MsUSDProxyOFT.json'
import {address as MSETH_PROXYOFT_ADDRESS} from '../deployments/base/MsETHProxyOFT.json'
import {address as NATIVE_TOKEN_GATEWAY_ADDRESS} from '../deployments/base/NativeTokenGateway.json'
import {address as SFM_ADDRESS} from '../deployments/base/SmartFarmingManager_Pool1.json'

const {MaxUint256} = ethers.constants
const dust = toUSD('5')

const isNodeHardhat = hre.network.name === 'hardhat'

/**
 * The goal of this test suite is to test current state of the base's contracts
 * Note: When we have on-going changes the TypesChain types may be different than the deployed contracts
 * For these cases, use `new ethers.Contract()` instead and amend ABI manually
 */
describe.skip('E2E tests (base)', function () {
  let governor: SignerWithAddress
  let alice: SignerWithAddress
  let bob: SignerWithAddress
  let weth: IWETH
  let usdc: ERC20
  let vaETH: ERC20
  let vaCBETH: ERC20
  let vaUSDC: ERC20
  let vaWSTETH: ERC20
  let masterOracle: Contract
  let poolRegistry: PoolRegistry
  let nativeGateway: NativeTokenGateway
  let smartFarmingManager: SmartFarmingManager
  let pool: Pool
  let msdWETH: DepositToken
  let msdUSDC: DepositToken
  let msdVaETH: DepositToken
  let msdVaCBETH: DepositToken
  let msdVaUSDC: DepositToken
  let msdVaWSTETH: DepositToken

  let msUSDDebt: DebtToken
  let msETHDebt: DebtToken
  let msUSD: SyntheticToken
  let msETH: SyntheticToken
  let msUSDProxyOFT: ProxyOFT
  let msETHProxyOFT: ProxyOFT

  if (isNodeHardhat) {
    before(async function () {
      await enableForking('base')
    })

    after(disableForking)
  }

  async function fixture() {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[, alice, bob] = await ethers.getSigners()
    usdc = await ethers.getContractAt('ERC20', Address.USDC_ADDRESS, alice)
    weth = await ethers.getContractAt('IWETH', Address.WETH_ADDRESS, alice)
    vaUSDC = await ethers.getContractAt('ERC20', Address.VAUSDC_ADDRESS, alice)
    vaETH = await ethers.getContractAt('ERC20', Address.VAETH_ADDRESS, alice)
    vaWSTETH = await ethers.getContractAt('ERC20', Address.VAWSTETH_ADDRESS, alice)
    vaCBETH = await ethers.getContractAt('ERC20', Address.VACBETH_ADDRESS, alice)

    poolRegistry = await ethers.getContractAt('PoolRegistry', POOL_REGISTRY_ADDRESS, alice)
    governor = await impersonateAccount(await poolRegistry.governor())
    nativeGateway = await ethers.getContractAt('NativeTokenGateway', NATIVE_TOKEN_GATEWAY_ADDRESS, alice)

    const [pool1Address] = await poolRegistry.getPools()
    pool = <Pool>await ethers.getContractAt('contracts/Pool.sol:Pool', pool1Address, alice)

    msdWETH = await ethers.getContractAt('DepositToken', WETH_DEPOSIT_ADDRESS, alice)
    msdUSDC = await ethers.getContractAt('DepositToken', USDC_DEPOSIT_ADDRESS, alice) // 6 decimals.
    msdVaETH = await ethers.getContractAt('DepositToken', VAETH_DEPOSIT_ADDRESS, alice)
    msdVaCBETH = await ethers.getContractAt('DepositToken', VACBETH_DEPOSIT_ADDRESS, alice)
    msdVaUSDC = await ethers.getContractAt('DepositToken', VAUSDC_DEPOSIT_ADDRESS, alice)
    msdVaWSTETH = await ethers.getContractAt('DepositToken', VAWSTETH_DEPOSIT_ADDRESS, alice)

    msUSDDebt = await ethers.getContractAt('DebtToken', MSUSD_DEBT_ADDRESS, alice)
    msETHDebt = await ethers.getContractAt('DebtToken', MSETH_DEBT_ADDRESS, alice)

    msUSD = await ethers.getContractAt('SyntheticToken', MSUSD_SYNTHETIC_ADDRESS, alice)
    msETH = await ethers.getContractAt('SyntheticToken', MSETH_SYNTHETIC_ADDRESS, alice)

    msUSDProxyOFT = await ethers.getContractAt('ProxyOFT', MSUSD_PROXYOFT_ADDRESS, alice)
    msETHProxyOFT = await ethers.getContractAt('ProxyOFT', MSETH_PROXYOFT_ADDRESS, alice)

    smartFarmingManager = await ethers.getContractAt('SmartFarmingManager', SFM_ADDRESS, alice)

    await setTokenBalance(usdc.address, alice.address, parseUnits('10,000', 6))
    await setTokenBalance(weth.address, alice.address, parseUnits('20', 18))
    await setTokenBalance(vaCBETH.address, alice.address, parseUnits('1000', 18))
    await setTokenBalance(vaUSDC.address, alice.address, parseUnits('1000', 18))
    await setTokenBalance(vaETH.address, alice.address, parseUnits('1000', 18))
    await setTokenBalance(vaWSTETH.address, alice.address, parseUnits('20', 18))

    await usdc.connect(alice).approve(msdUSDC.address, MaxUint256)
    await weth.connect(alice).approve(msdWETH.address, MaxUint256)
    await vaUSDC.connect(alice).approve(msdVaUSDC.address, MaxUint256)
    await vaETH.connect(alice).approve(msdVaETH.address, MaxUint256)
    await vaWSTETH.connect(alice).approve(msdVaWSTETH.address, MaxUint256)
    await vaCBETH.connect(alice).approve(msdVaCBETH.address, MaxUint256)

    const masterOracleGovernor = await impersonateAccount(Address.MASTER_ORACLE_GOVERNOR_ADDRESS)
    masterOracle = new ethers.Contract(
      Address.MASTER_ORACLE_ADDRESS,
      [
        'function defaultOracle() view returns(address)',
        'function getPriceInUsd(address) view returns(uint256)',
        'function quote(address,address,uint256) view returns(uint256)',
      ],
      masterOracleGovernor
    )
    const defaultOracle = new ethers.Contract(
      await masterOracle.defaultOracle(),
      ['function updateDefaultStalePeriod(uint256)'],
      masterOracleGovernor
    )
    await defaultOracle.updateDefaultStalePeriod(ethers.constants.MaxUint256)

    // TODO: Remove when the production cap has enough room
    await msUSDDebt.connect(governor).updateMaxTotalSupply(ethers.constants.MaxUint256)

    await msdVaUSDC.connect(governor).updateMaxTotalSupply(ethers.constants.MaxUint256)
    await msdVaETH.connect(governor).updateMaxTotalSupply(ethers.constants.MaxUint256)
    await msdVaWSTETH.connect(governor).updateMaxTotalSupply(ethers.constants.MaxUint256)
    await msdVaCBETH.connect(governor).updateMaxTotalSupply(ethers.constants.MaxUint256)

    if (await pool.everythingStopped()) {
      await pool.connect(governor).open()
    }

    if (await poolRegistry.everythingStopped()) {
      await poolRegistry.connect(governor).open()
    }

    if (await pool.paused()) {
      await pool.connect(governor).unpause()
    }

    if (await poolRegistry.paused()) {
      await poolRegistry.connect(governor).unpause()
    }

    if (!(await msUSD.isActive())) {
      await msUSD.connect(governor).toggleIsActive()
    }

    if (!(await msETH.isActive())) {
      await msETH.connect(governor).toggleIsActive()
    }

    // These well-known accounts have delegated code which reverts when receiving ETH
    await setCode(alice.address, '0x00')
    await setCode(bob.address, '0x00')
  }

  beforeEach(async function () {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[, alice, bob] = await ethers.getSigners()
    await loadFixture(fixture)

    if (process.env.DEPLOYER) {
      // See more: https://github.com/wighawag/hardhat-deploy/issues/152#issuecomment-1402298376
      await impersonateAccount(process.env.DEPLOYER)
    }
  })

  describe('initial setup', function () {
    it('should have correct addresses', async function () {
      expect(POOL_REGISTRY_ADDRESS).eq(await pool.poolRegistry())
      expect(SFM_ADDRESS).eq(await pool.smartFarmingManager())
      expect(pool.address).eq(await smartFarmingManager.pool())

      expect(USDC_DEPOSIT_ADDRESS).eq(await pool.depositTokenOf(usdc.address))
      expect(WETH_DEPOSIT_ADDRESS).eq(await pool.depositTokenOf(weth.address))
      expect(VAUSDC_DEPOSIT_ADDRESS).eq(await pool.depositTokenOf(vaUSDC.address))
      expect(VAETH_DEPOSIT_ADDRESS).eq(await pool.depositTokenOf(vaETH.address))
      expect(VACBETH_DEPOSIT_ADDRESS).eq(await pool.depositTokenOf(vaCBETH.address))
      expect(VAWSTETH_DEPOSIT_ADDRESS).eq(await pool.depositTokenOf(vaWSTETH.address))

      expect(MSUSD_SYNTHETIC_ADDRESS).eq(await msUSDProxyOFT.token())
      expect(MSETH_SYNTHETIC_ADDRESS).eq(await msETHProxyOFT.token())

      expect(MSUSD_DEBT_ADDRESS).eq(await pool.debtTokenOf(msUSD.address))
      expect(MSETH_DEBT_ADDRESS).eq(await pool.debtTokenOf(msETH.address))

      expect(MSUSD_PROXYOFT_ADDRESS).eq(await msUSD.proxyOFT())
      expect(MSETH_PROXYOFT_ADDRESS).eq(await msETH.proxyOFT())
    })

    it('should get prices for all assets', async function () {
      expect(await masterOracle.getPriceInUsd(usdc.address)).gt(0)
      expect(await masterOracle.getPriceInUsd(weth.address)).gt(0)
      expect(await masterOracle.getPriceInUsd(msUSD.address)).gt(0)
      expect(await masterOracle.getPriceInUsd(msETH.address)).gt(0)
      expect(await masterOracle.getPriceInUsd(vaCBETH.address)).gt(0)
      expect(await masterOracle.getPriceInUsd(vaUSDC.address)).gt(0)
      expect(await masterOracle.getPriceInUsd(vaETH.address)).gt(0)
      expect(await masterOracle.getPriceInUsd(vaWSTETH.address)).gt(0)
    })
  })

  describe('synth mainnet end to end sanity tests', function () {
    it('should deposit USDC', async function () {
      // given
      const amount = parseUnits('1', 6)

      // when
      const tx = () => msdUSDC.deposit(amount, alice.address)

      // then
      await expect(tx).changeTokenBalance(msdUSDC, alice, amount)
    })

    it('should deposit WETH', async function () {
      // given
      const amount = parseUnits('1', 18)

      // when
      const tx = () => msdWETH.deposit(amount, alice.address)

      // then
      await expect(tx).changeTokenBalance(msdWETH, alice, amount)
    })

    it('should deposit WETH using ETH', async function () {
      // given
      const amount = parseUnits('1', 18)

      // when
      const tx = () => nativeGateway.deposit(pool.address, {value: amount})

      // then
      await expect(tx).changeTokenBalance(msdWETH, alice, amount)
    })

    it('should deposit vaUSDC using USDC', async function () {
      //
      // Deploy `VesperGateway` implementation
      // Note: It won't be necessary when this contract get online
      //
      const vesperGatewayFactory = await ethers.getContractFactory('VesperGateway', alice)
      const vesperGateway = await vesperGatewayFactory.deploy(poolRegistry.address)

      // given
      const amount6 = parseUnits('1', 6)
      const before = await msdVaUSDC.balanceOf(alice.address)
      expect(before).eq(0)

      // when
      await usdc.approve(vesperGateway.address, amount6)
      await vesperGateway.deposit(pool.address, vaUSDC.address, amount6)

      // then
      const after = await msdVaUSDC.balanceOf(alice.address)
      expect(after).closeTo(parseUnits('0.89', 18), parseUnits('0.1', 18))
    })

    it('should deposit vaETH', async function () {
      // given
      const amount = parseUnits('1', 18)

      // when
      const tx = () => msdVaETH.deposit(amount, alice.address)

      // then
      await expect(tx).changeTokenBalance(msdVaETH, alice, amount)
    })

    it('should deposit vaWSTETH', async function () {
      // given
      const amount = parseUnits('1', 18)

      // when
      const tx = () => msdVaWSTETH.deposit(amount, alice.address)

      // then
      await expect(tx).changeTokenBalance(msdVaWSTETH, alice, amount)
    })

    it('should deposit vaCBETH', async function () {
      // given
      const amount = parseUnits('1', 18)

      // when
      const tx = () => msdVaCBETH.deposit(amount, alice.address)

      // then
      await expect(tx).changeTokenBalance(msdVaCBETH, alice, amount)
    })

    it('should issue msUSD', async function () {
      // given
      await msdUSDC.deposit(parseUnits('10', await usdc.decimals()), alice.address)

      // when
      const amount = parseUnits('1', 6)
      const tx = () => msUSDDebt.issue(amount, alice.address)

      // then
      await expect(tx).changeTokenBalance(msUSD, alice, amount)
    })

    it('should issue msETH', async function () {
      // given
      await msdUSDC.deposit(parseUnits('10,000', await usdc.decimals()), alice.address)

      // when
      const amount = parseEther('1')
      const tx = () => msETHDebt.issue(amount, alice.address)

      // then
      await expect(tx).changeTokenBalance(msETH, alice, amount)
    })

    it('should increase debt by the time', async function () {
      // given
      await msdUSDC.deposit(parseUnits('500', await usdc.decimals()), alice.address)
      await msUSDDebt.issue(parseEther('100'), alice.address)
      const debtBefore = await msUSDDebt.balanceOf(alice.address)

      // when
      const interestRate = parseEther('0.02') // 2%
      if (!(await msUSDDebt.interestRate()).eq(interestRate)) {
        await msUSDDebt.connect(governor).updateInterestRate(interestRate)
      }

      await time.increase(time.duration.years(1))
      await msUSDDebt.accrueInterest()

      // then
      const expectedDebt = debtBefore.mul(parseEther('1').add(interestRate)).div(parseEther('1'))
      expect(await pool.debtOf(alice.address)).closeTo(expectedDebt, parseEther('0.01'))
    })

    it('should liquidate unhealthy position', async function () {
      // given
      await msdUSDC.deposit(parseUnits('400', await usdc.decimals()), alice.address)
      await msUSDDebt.connect(governor).updateInterestRate(parseEther('0')) // 0%
      const {_issuableInUsd} = await pool.debtPositionOf(alice.address)
      await msUSDDebt.issue(_issuableInUsd, alice.address)
      await msUSDDebt.connect(governor).updateInterestRate(parseEther('0.5')) // 50%
      await time.increase(time.duration.minutes(10))
      await msUSDDebt.accrueInterest()
      expect((await pool.debtPositionOf(alice.address))._isHealthy).false

      // when
      await msdUSDC.deposit(parseUnits('400', await usdc.decimals()), bob.address)
      await msUSDDebt.connect(bob).issue(parseEther('100'), bob.address)
      const amountToRepay = parseEther('50') // repay all user's debt
      const tx = await pool.connect(bob).liquidate(msUSD.address, alice.address, amountToRepay, msdUSDC.address)

      // then
      await expect(tx).emit(pool, 'PositionLiquidated')
    })

    it('should swap', async function () {
      // given
      await msdUSDC.deposit(parseUnits('10', await usdc.decimals()), alice.address)
      await msUSDDebt.issue(parseEther('1'), alice.address)
      const debtBefore = await pool.debtOf(alice.address)
      expect(await msUSD.balanceOf(alice.address)).gt(0)
      expect(await msETH.balanceOf(alice.address)).eq(0)

      // when
      await pool.swap(msUSD.address, msETH.address, await msUSD.balanceOf(alice.address))

      // then
      expect(await msUSD.balanceOf(alice.address)).eq(0)
      expect(await msETH.balanceOf(alice.address)).gt(0)
      const debtsAfter = await pool.debtOf(alice.address)
      expect(debtsAfter).closeTo(debtBefore, parseEther('0.0001'))
    })

    it('should repay', async function () {
      // given
      await msdUSDC.deposit(parseUnits('10', await usdc.decimals()), alice.address)
      const debtBefore = await msUSDDebt.balanceOf(alice.address)
      const debtToIssue = parseEther('1')
      await msUSDDebt.issue(debtToIssue, alice.address)
      const msUSDDebtBalance = await msUSDDebt.balanceOf(alice.address)
      const expectedDebt = debtBefore.add(debtToIssue)
      expect(await pool.debtOf(alice.address)).closeTo(expectedDebt, dust)
      expect(await msUSD.balanceOf(alice.address)).closeTo(expectedDebt, dust)

      // when
      const debtToRepay = parseEther('0.5')
      const repayFee = parseEther('0')
      const debtPlusRepayFee = debtToRepay.mul(parseEther('1').add(repayFee)).div(parseEther('1'))
      await msUSDDebt.repay(alice.address, debtPlusRepayFee)

      // then
      expect(await msUSDDebt.balanceOf(alice.address)).lt(msUSDDebtBalance)
    })

    it('should revert if repaying using wrong synthetic asset', async function () {
      // given
      await msdUSDC.deposit(parseUnits('10', await usdc.decimals()), alice.address)
      const debtBefore = await msUSDDebt.balanceOf(alice.address)
      const debtToIssue = parseEther('1')
      await msUSDDebt.issue(debtToIssue, alice.address)
      const expectedDebt = debtBefore.add(debtToIssue)
      expect(await pool.debtOf(alice.address)).closeTo(expectedDebt, dust)
      expect(await msUSD.balanceOf(alice.address)).closeTo(expectedDebt, dust)
      await pool.swap(msUSD.address, msETH.address, await msUSD.balanceOf(alice.address))

      // when
      const tx = msUSDDebt.repay(alice.address, 10) // pay 10 wei

      // then
      await expect(tx).revertedWithCustomError(msUSDDebt, 'BurnAmountExceedsBalance')
    })

    it('should withdraw', async function () {
      await msdUSDC.deposit(parseUnits('10', await usdc.decimals()), alice.address)
      await msUSDDebt.issue(parseEther('1'), alice.address)

      // when
      const amount = await msdUSDC.unlockedBalanceOf(alice.address)
      await msdUSDC.withdraw(amount, alice.address)

      // then
      const {_depositInUsd: depositAfter} = await pool.depositOf(alice.address)
      expect(depositAfter).closeTo(0, dust)
    })

    describe('cross-chain operations', function () {
      // Destination chains this deployment supports. See `deploy/scripts/base/01_pool_registry.ts`.
      const supportedDstChainIds = [
        Constants.LZ_MAINNET_CHAIN_ID,
        Constants.LZ_OP_CHAIN_ID,
        Constants.LZ_PLASMA_CHAIN_ID,
        Constants.LZ_HEMI_CHAIN_ID,
      ]

      // One entry per bridgeable synth. Expected caps mirror the deploy scripts:
      // `deploy/scripts/base/05_msusd_proxy_oft.ts` and `06_mseth_proxy_oft.ts`.
      const bridgeCases = [
        {
          name: 'msUSD',
          oft: () => msUSDProxyOFT,
          synth: () => msUSD,
          debt: () => msUSDDebt,
          amount: parseEther('10'),
          dstChainId: Constants.LZ_MAINNET_CHAIN_ID,
          expectedMaxBridgedInSupply: parseEther('35000000'),
          expectedMaxBridgedOutSupply: parseEther('10000000'),
        },
        {
          name: 'msETH',
          oft: () => msETHProxyOFT,
          synth: () => msETH,
          debt: () => msETHDebt,
          amount: parseEther('0.1'),
          dstChainId: Constants.LZ_MAINNET_CHAIN_ID,
          expectedMaxBridgedInSupply: parseEther('4500'),
          expectedMaxBridgedOutSupply: parseEther('4500'),
        },
      ]

      // Deposit collateral and issue `amount` of the synth to alice so she has something to bridge.
      async function issueSynth(debt: DebtToken, amount: BigNumber) {
        await msdWETH.deposit(parseEther('1'), alice.address)
        await debt.issue(amount, alice.address)
      }

      bridgeCases.forEach((c) => {
        describe(c.name, function () {
          it('should have the proxyOFT wired to the synthetic token', async function () {
            expect(await c.oft().token()).eq(c.synth().address)
            expect(await c.synth().proxyOFT()).eq(c.oft().address)
            expect(await c.oft().owner()).eq(await poolRegistry.governor())
          })

          it('should have bridging enabled to all supported chains', async function () {
            expect(await poolRegistry.isBridgingActive()).true
            expect(await poolRegistry.lzBaseGasLimit()).gt(0)
            for (const dstChainId of supportedDstChainIds) {
              expect(await poolRegistry.isDestinationChainSupported(dstChainId), `dst ${dstChainId}`).true
              expect(await c.oft().getProxyOFTOf(dstChainId), `remote ${dstChainId}`).not.eq(
                ethers.constants.AddressZero
              )
            }
          })

          it('should have the expected bridging supply caps', async function () {
            expect(await c.synth().maxBridgedInSupply()).eq(c.expectedMaxBridgedInSupply)
            expect(await c.synth().maxBridgedOutSupply()).eq(c.expectedMaxBridgedOutSupply)
          })

          it('should estimate a non-zero bridging fee', async function () {
            expect(await c.oft()['estimateSendFee(uint16,address,uint256)'](c.dstChainId, alice.address, c.amount)).gt(
              0
            )
          })

          it('should burn and account for the synth when bridging out', async function () {
            await issueSynth(c.debt(), c.amount)
            const totalSupplyBefore = await c.synth().totalSupply()
            const bridgedOutBefore = await c.synth().totalBridgedOut()

            const tx = () =>
              c
                .oft()
                ['sendFrom(address,uint16,address,uint256)'](alice.address, c.dstChainId, alice.address, c.amount, {
                  value: parseEther('0.5'),
                })

            await expect(tx).changeTokenBalance(c.synth(), alice, c.amount.mul(-1))
            expect(await c.synth().totalSupply()).eq(totalSupplyBefore.sub(c.amount))
            expect(await c.synth().totalBridgedOut()).eq(bridgedOutBefore.add(c.amount))
          })

          it('should revert when bridging is paused', async function () {
            await issueSynth(c.debt(), c.amount)
            await poolRegistry.connect(governor).toggleBridgingIsActive()

            await expect(
              c
                .oft()
                ['sendFrom(address,uint16,address,uint256)'](alice.address, c.dstChainId, alice.address, c.amount, {
                  value: parseEther('0.5'),
                })
            ).revertedWithCustomError(c.oft(), 'BridgingIsPaused')
          })

          it('should revert when the destination chain is not supported', async function () {
            await issueSynth(c.debt(), c.amount)
            await poolRegistry.connect(governor).toggleDestinationChainIsActive(c.dstChainId)

            await expect(
              c
                .oft()
                ['sendFrom(address,uint16,address,uint256)'](alice.address, c.dstChainId, alice.address, c.amount, {
                  value: parseEther('0.5'),
                })
            ).revertedWithCustomError(c.oft(), 'DestinationChainNotAllowed')
          })

          it('should revert when the caller does not own the funds', async function () {
            await issueSynth(c.debt(), c.amount)

            await expect(
              c.oft()['sendFrom(address,uint16,address,uint256)'](bob.address, c.dstChainId, alice.address, c.amount, {
                value: parseEther('0.5'),
              })
            ).revertedWithCustomError(c.oft(), 'SenderIsNotTheOwner')
          })

          it('should revert when using the disabled sendAndCall path', async function () {
            const toAddress = ethers.utils.solidityPack(['address'], [alice.address])

            await expect(
              c
                .oft()
                .sendAndCall(
                  alice.address,
                  c.dstChainId,
                  toAddress,
                  c.amount,
                  '0x',
                  0,
                  alice.address,
                  ethers.constants.AddressZero,
                  '0x',
                  {value: parseEther('0.5')}
                )
            ).revertedWithCustomError(c.oft(), 'SendAndCallNotAllowed')
          })

          it('should revert when the bridged-out supply cap is surpassed', async function () {
            await issueSynth(c.debt(), c.amount)
            const bridgedIn = await c.synth().totalBridgedIn()
            const bridgedOut = await c.synth().totalBridgedOut()
            const outSupplyNow = await c.synth().bridgedOutSupply()
            // Net out-supply after the burn, computed exactly as `SyntheticToken._burn` does.
            const outSupplyAfter = bridgedOut.add(c.amount).gt(bridgedIn)
              ? bridgedOut.add(c.amount).sub(bridgedIn)
              : ethers.constants.Zero

            // Only reachable when the bridge-out raises the net out-supply. If the fork is deeply
            // net-in for this synth a small bridge-out cannot exceed the out cap, so skip.
            if (!outSupplyAfter.gt(outSupplyNow)) {
              this.skip()
            }

            // Pin the cap at the current out-supply so the next burn surpasses it by `amount`.
            await c.synth().connect(governor).updateMaxBridgedOutSupply(outSupplyNow)

            await expect(
              c
                .oft()
                ['sendFrom(address,uint16,address,uint256)'](alice.address, c.dstChainId, alice.address, c.amount, {
                  value: parseEther('0.5'),
                })
            ).revertedWithCustomError(c.synth(), 'SurpassMaxBridgingSupply')
          })
        })
      })
    })

    // TODO(upgrade): confirm still applicable post-upgrade. These leverage/flashRepay cases exist in the
    // pre-upgrade suite but were not carried into `E2E.base.next.test.ts`; kept skipped for triage.
    describe.skip('leverage', function () {
      beforeEach(async function () {
        const {_debtInUsd, _depositInUsd} = await pool.debtPositionOf(alice.address)
        expect(_debtInUsd).eq(0)
        expect(_depositInUsd).eq(0)
      })

      it('should leverage vaUSDC->msUSD', async function () {
        // when
        const amountIn = parseUnits('100', 18)
        const amountInUsd = await masterOracle.quote(vaUSDC.address, msUSD.address, amountIn)
        const leverage = parseEther('1.5')
        await vaUSDC.connect(alice).approve(smartFarmingManager.address, MaxUint256)
        const tx = await smartFarmingManager.leverage(
          vaUSDC.address,
          msdVaUSDC.address,
          msUSD.address,
          amountIn,
          leverage,
          0
        )

        // then
        const {gasUsed} = await tx.wait()
        expect(gasUsed.lt(1.4e6))
        const {_debtInUsd, _depositInUsd} = await pool.debtPositionOf(alice.address)
        expect(_depositInUsd).closeTo(parseEther('150'), parseEther('10'))
        expect(_debtInUsd).closeTo(
          amountInUsd.mul(leverage.sub(parseEther('1'))).div(parseEther('1')),
          parseEther('10')
        )
      })

      it('should leverage vaETH->msETH', async function () {
        // when
        const amountIn = parseUnits('0.1', 18)
        const amountInUsd = await masterOracle.quote(vaETH.address, msUSD.address, amountIn)
        const leverage = parseEther('1.5')
        await vaETH.connect(alice).approve(smartFarmingManager.address, MaxUint256)
        const tx = await smartFarmingManager.leverage(
          vaETH.address,
          msdVaETH.address,
          msETH.address,
          amountIn,
          leverage,
          0
        )

        // then
        const {gasUsed} = await tx.wait()
        expect(gasUsed.lt(1.4e6))
        const {_debtInUsd, _depositInUsd} = await pool.debtPositionOf(alice.address)
        expect(_depositInUsd).closeTo(amountInUsd.mul(leverage).div(parseEther('1')), parseEther('100'))
        expect(_debtInUsd).closeTo(
          amountInUsd.mul(leverage.sub(parseEther('1'))).div(parseEther('1')),
          parseEther('100')
        )
      })

      it('should leverage vastETH->msETH', async function () {
        // when
        const amountIn = parseUnits('0.1', 18)
        const amountInUsd = await masterOracle.quote(vaWSTETH.address, msUSD.address, amountIn)
        const leverage = parseEther('1.5')
        await vaWSTETH.connect(alice).approve(smartFarmingManager.address, MaxUint256)
        const tx = await smartFarmingManager.leverage(
          vaWSTETH.address,
          msdVaWSTETH.address,
          msETH.address,
          amountIn,
          leverage,
          0
        )

        // then
        const {gasUsed} = await tx.wait()
        expect(gasUsed.lt(1.4e6))
        const {_debtInUsd, _depositInUsd} = await pool.debtPositionOf(alice.address)
        expect(_depositInUsd).closeTo(amountInUsd.mul(leverage).div(parseEther('1')), parseEther('100'))
        expect(_debtInUsd).closeTo(
          amountInUsd.mul(leverage.sub(parseEther('1'))).div(parseEther('1')),
          parseEther('100')
        )
      })

      it('should leverage vacbETH->msETH', async function () {
        // when
        const amountIn = parseUnits('0.1', 18)
        const amountInUsd = await masterOracle.quote(vaCBETH.address, msUSD.address, amountIn)
        const leverage = parseEther('1.5')
        await vaCBETH.connect(alice).approve(smartFarmingManager.address, MaxUint256)
        const tx = await smartFarmingManager.leverage(
          vaCBETH.address,
          msdVaCBETH.address,
          msETH.address,
          amountIn,
          leverage,
          0
        )

        // then
        const {gasUsed} = await tx.wait()
        expect(gasUsed.lt(1.4e6))
        const {_debtInUsd, _depositInUsd} = await pool.debtPositionOf(alice.address)
        expect(_depositInUsd).closeTo(amountInUsd.mul(leverage).div(parseEther('1')), parseEther('100'))
        expect(_debtInUsd).closeTo(
          amountInUsd.mul(leverage.sub(parseEther('1'))).div(parseEther('1')),
          parseEther('100')
        )
      })
    })

    // TODO(upgrade): confirm still applicable post-upgrade. Absent from `E2E.base.next.test.ts`; kept skipped for triage.
    describe.skip('flashRepay', function () {
      beforeEach(async function () {
        const {_debtInUsd, _depositInUsd} = await pool.debtPositionOf(alice.address)
        expect(_debtInUsd).eq(0)
        expect(_depositInUsd).eq(0)
        const amountIn = parseUnits('100', 18)
        const leverage = parseEther('1.5')
        await vaUSDC.connect(alice).approve(smartFarmingManager.address, MaxUint256)
        await smartFarmingManager.leverage(vaUSDC.address, msdVaUSDC.address, msUSD.address, amountIn, leverage, 0)
      })

      it('should flash repay msUSD debt using vaUSDC', async function () {
        // when
        const withdrawAmount = parseEther('45')
        const tx = await smartFarmingManager.flashRepay(msUSD.address, msdVaUSDC.address, withdrawAmount, 0)

        // then
        const {gasUsed} = await tx.wait()
        expect(gasUsed.lt(1e6))
        const {_debtInUsd} = await pool.debtPositionOf(alice.address)
        expect(_debtInUsd).closeTo(0, parseEther('10'))
      })
    })
  })
})
