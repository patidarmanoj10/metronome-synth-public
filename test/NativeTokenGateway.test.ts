/* eslint-disable camelcase */
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {expect} from 'chai'
import {parseEther} from 'ethers/lib/utils'
import {ethers} from 'hardhat'
import {
  DepositToken,
  DepositToken__factory,
  ERC20Mock,
  ERC20Mock__factory,
  PoolMock,
  PoolMock__factory,
  IWETH,
  IWETH__factory,
  MasterOracleMock,
  MasterOracleMock__factory,
  NativeTokenGateway,
  NativeTokenGateway__factory,
  Treasury__factory,
  Treasury,
} from '../typechain'
import {disableForking, enableForking} from './helpers'
import Address from '../helpers/address'
import {toUSD} from '../helpers'

const {NATIVE_TOKEN_ADDRESS} = Address

const {MaxUint256} = ethers.constants

describe('NativeTokenGateway', function () {
  let deployer: SignerWithAddress
  let user: SignerWithAddress
  let nativeToken: IWETH
  let msdNativeToken: DepositToken
  let treasury: Treasury
  let masterOracleMock: MasterOracleMock
  let poolMock: PoolMock
  let nativeTokenGateway: NativeTokenGateway
  let tokenMock: ERC20Mock

  before(enableForking)

  after(disableForking)

  beforeEach(async function () {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[deployer, user] = await ethers.getSigners()

    nativeToken = IWETH__factory.connect(NATIVE_TOKEN_ADDRESS, deployer)

    const masterOracleMockFactory = new MasterOracleMock__factory(deployer)
    masterOracleMock = await masterOracleMockFactory.deploy()
    await masterOracleMock.deployed()

    const depositTokenFactory = new DepositToken__factory(deployer)
    msdNativeToken = await depositTokenFactory.deploy()
    await msdNativeToken.deployed()

    const treasuryFactory = new Treasury__factory(deployer)
    treasury = await treasuryFactory.deploy()
    await treasury.deployed()

    const poolMockFactory = new PoolMock__factory(deployer)
    poolMock = await poolMockFactory.deploy(
      msdNativeToken.address,
      masterOracleMock.address,
      ethers.constants.AddressZero,
      ethers.constants.AddressZero,
      ethers.constants.AddressZero
    )
    await poolMock.deployed()

    const nativeTokenGatewayFactory = new NativeTokenGateway__factory(deployer)
    nativeTokenGateway = await nativeTokenGatewayFactory.deploy(NATIVE_TOKEN_ADDRESS)
    await nativeTokenGateway.deployed()

    await msdNativeToken.initialize(NATIVE_TOKEN_ADDRESS, poolMock.address, 'msdETH', 18, parseEther('1'), MaxUint256)

    const erc20MockFactory = new ERC20Mock__factory(deployer)
    tokenMock = await erc20MockFactory.deploy('Name', 'SYMBOL', 18)
    await tokenMock.deployed()

    await poolMock.updateTreasury(treasury.address)
    await masterOracleMock.updatePrice(NATIVE_TOKEN_ADDRESS, toUSD('1'))
    await treasury.initialize(poolMock.address)
  })

  it('should not receive ETH if sender is not WETH contract', async function () {
    const tx = deployer.sendTransaction({to: nativeTokenGateway.address, value: parseEther('1')})
    await expect(tx).reverted
  })

  describe('deposit', function () {
    it('should deposit ETH to Pool', async function () {
      // when
      const value = parseEther('1')
      const tx = () => nativeTokenGateway.connect(user).deposit(poolMock.address, {value})

      // then
      // Note: Each expect below re-runs the transaction (Refs: https://github.com/EthWorks/Waffle/issues/569)
      await expect(tx).changeEtherBalances([user, nativeToken], [value.mul('-1'), value])
      await expect(tx).changeTokenBalance(nativeToken, treasury, value)
      await expect(tx).changeTokenBalance(msdNativeToken, user, value)
    })

    it('should allow N deposits', async function () {
      // given
      const before = await ethers.provider.getBalance(user.address)

      // when
      const value = parseEther('1')
      await nativeTokenGateway.connect(user).deposit(poolMock.address, {value})
      await nativeTokenGateway.connect(user).deposit(poolMock.address, {value})

      // then
      const after = await ethers.provider.getBalance(user.address)
      expect(after).closeTo(before.sub(value.mul('2')), parseEther('0.01'))
    })
  })

  describe('withdraw', function () {
    beforeEach(async function () {
      const value = parseEther('100')
      await nativeTokenGateway.connect(user).deposit(poolMock.address, {value})
      await msdNativeToken.connect(user).approve(nativeTokenGateway.address, value)
    })

    it('should withdraw ETH from Pool', async function () {
      // when
      const amount = parseEther('1')
      const tx = () => nativeTokenGateway.connect(user).withdraw(poolMock.address, amount)

      // then
      // Note: Each expect below re-runs the transaction (Refs: https://github.com/EthWorks/Waffle/issues/569)
      await expect(tx).changeEtherBalances([nativeToken, user], [amount.mul('-1'), amount])
      await expect(tx).changeTokenBalance(nativeToken, treasury, amount.mul('-1'))
      await expect(tx).changeTokenBalance(msdNativeToken, user, amount.mul('-1'))
    })
  })
})
