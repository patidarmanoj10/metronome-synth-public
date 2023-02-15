/* eslint-disable camelcase */
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import chai, {expect} from 'chai'
import {parseEther} from 'ethers/lib/utils'
import {ethers} from 'hardhat'
import {
  DepositToken,
  DepositToken__factory,
  ERC20Mock,
  ERC20Mock__factory,
  PoolMock,
  PoolMock__factory,
  MasterOracleMock,
  MasterOracleMock__factory,
  VesperGateway,
  VesperGateway__factory,
  Treasury__factory,
  Treasury,
  FeeProvider__factory,
  VPoolMock__factory,
  VPoolMock,
} from '../typechain'
import {disableForking, enableForking} from './helpers'
import {parseUnits, toUSD} from '../helpers'
import {FakeContract, smock} from '@defi-wonderland/smock'

chai.use(smock.matchers)

const {MaxUint256} = ethers.constants

describe('VesperGateway', function () {
  let deployer: SignerWithAddress
  let user: SignerWithAddress
  let vaUSDCMock: VPoolMock
  let msdVaUSDC: DepositToken
  let treasury: Treasury
  let masterOracleMock: MasterOracleMock
  let poolRegistryMock: FakeContract
  let poolMock: PoolMock
  let vesperGateway: VesperGateway
  let usdcMock: ERC20Mock

  before(enableForking)

  after(disableForking)

  beforeEach(async function () {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[deployer, user] = await ethers.getSigners()

    const masterOracleMockFactory = new MasterOracleMock__factory(deployer)
    masterOracleMock = await masterOracleMockFactory.deploy()
    await masterOracleMock.deployed()

    const depositTokenFactory = new DepositToken__factory(deployer)
    msdVaUSDC = await depositTokenFactory.deploy()
    await msdVaUSDC.deployed()

    const treasuryFactory = new Treasury__factory(deployer)
    treasury = await treasuryFactory.deploy()
    await treasury.deployed()

    poolRegistryMock = await smock.fake('PoolRegistry')
    poolRegistryMock.isPoolRegistered.returns(true)

    const esMET = await smock.fake('IESMET')
    const feeProviderFactory = new FeeProvider__factory(deployer)
    const feeProvider = await feeProviderFactory.deploy()
    await feeProvider.deployed()
    await feeProvider.initialize(poolRegistryMock.address, esMET.address)

    const poolMockFactory = new PoolMock__factory(deployer)
    poolMock = await poolMockFactory.deploy(
      msdVaUSDC.address,
      masterOracleMock.address,
      ethers.constants.AddressZero,
      ethers.constants.AddressZero,
      ethers.constants.AddressZero,
      feeProvider.address
    )
    await poolMock.deployed()

    const erc20MockFactory = new ERC20Mock__factory(deployer)
    usdcMock = await erc20MockFactory.deploy('USDC Mock', 'USDC', 6)
    await usdcMock.deployed()

    const vPoolMockFactory = new VPoolMock__factory(deployer)
    vaUSDCMock = await vPoolMockFactory.deploy('vaUSDC', 'vaUSDC', usdcMock.address)

    const vesperGatewayFactory = new VesperGateway__factory(deployer)
    vesperGateway = await vesperGatewayFactory.deploy(poolRegistryMock.address)
    await vesperGateway.deployed()

    await msdVaUSDC.initialize(
      vaUSDCMock.address,
      poolMock.address,
      'Metronome Synth vaUSDC-Deposit',
      'msdUSDC',
      18,
      parseEther('1'),
      MaxUint256
    )

    await poolMock.updateTreasury(treasury.address)
    await masterOracleMock.updatePrice(vaUSDCMock.address, toUSD('1'))
    await treasury.initialize(poolMock.address)

    await usdcMock.mint(user.address, parseUnits('1,000', 6))
  })

  describe('deposit', function () {
    it('should revert if pool is not registered', async function () {
      // given
      poolRegistryMock.isPoolRegistered.returns(false)

      // when
      const amount = parseUnits('1', 6)
      const tx = vesperGateway.connect(user).deposit(poolMock.address, vaUSDCMock.address, amount)

      // then
      await expect(tx).revertedWithCustomError(vesperGateway, 'UnregisteredPool')
    })

    it('should deposit USDC->vaUSDC to Pool', async function () {
      // when
      const amount6 = parseUnits('1', 6)
      const amount18 = parseUnits('1', 18)
      await usdcMock.connect(user).approve(vesperGateway.address, MaxUint256)
      const tx = () => vesperGateway.connect(user).deposit(poolMock.address, vaUSDCMock.address, amount6)

      // then
      // Note: Each matcher below re-runs the transaction (Refs: https://github.com/EthWorks/Waffle/issues/569)
      await expect(tx)
        .changeTokenBalances(usdcMock, [user, vaUSDCMock], [amount6.mul('-1'), amount6])
        .and.to.changeTokenBalance(vaUSDCMock, treasury, amount18)
        .and.to.changeTokenBalance(msdVaUSDC, user, amount18)
    })

    it('should allow N deposits', async function () {
      // given
      const before = await usdcMock.balanceOf(user.address)

      // when
      const amount = parseUnits('1', 6)
      await usdcMock.connect(user).approve(vesperGateway.address, MaxUint256)
      await vesperGateway.connect(user).deposit(poolMock.address, vaUSDCMock.address, amount)
      await vesperGateway.connect(user).deposit(poolMock.address, vaUSDCMock.address, amount)

      // then
      const after = await usdcMock.balanceOf(user.address)
      expect(after).closeTo(before.sub(amount.mul('2')), parseUnits('0.01', 6))
    })
  })

  describe('withdraw', function () {
    beforeEach(async function () {
      const amount = parseUnits('100', 6)
      await usdcMock.connect(user).approve(vesperGateway.address, MaxUint256)
      await vesperGateway.connect(user).deposit(poolMock.address, vaUSDCMock.address, amount)
    })

    it('should revert if pool is not registered', async function () {
      // given
      poolRegistryMock.isPoolRegistered.returns(false)

      // when
      const amount = parseUnits('1', 6)
      const tx = vesperGateway.connect(user).withdraw(poolMock.address, vaUSDCMock.address, amount)

      // then
      await expect(tx).revertedWithCustomError(vesperGateway, 'UnregisteredPool')
    })

    it('should withdraw ETH from Pool', async function () {
      // when
      const amount6 = parseUnits('1', 6)
      const amount18 = parseUnits('1', 18)
      await msdVaUSDC.connect(user).approve(vesperGateway.address, MaxUint256)
      const tx = () => vesperGateway.connect(user).withdraw(poolMock.address, vaUSDCMock.address, amount18)

      // then
      // Note: Each expect below re-runs the transaction (Refs: https://github.com/EthWorks/Waffle/issues/569)
      await expect(tx)
        .changeTokenBalances(usdcMock, [vaUSDCMock, user], [amount6.mul('-1'), amount18])
        .and.to.changeTokenBalance(vaUSDCMock, treasury, amount18.mul('-1'))
        .and.to.changeTokenBalance(msdVaUSDC, user, amount18.mul('-1'))
    })
  })
})
