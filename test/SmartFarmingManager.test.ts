/* eslint-disable no-unexpected-multiline */
/* eslint-disable camelcase */
/* eslint-disable new-cap */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import {parseEther} from '@ethersproject/units'
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {loadFixture, setBalance, setCode, setStorageAt} from '@nomicfoundation/hardhat-network-helpers'
import chai, {expect} from 'chai'
import {ethers} from 'hardhat'
import {
  DepositToken,
  ERC20Mock,
  MasterOracleMock,
  SyntheticToken,
  Treasury,
  Pool,
  DebtToken,
  SwapperMock,
  VPoolMock,
  FeeProvider,
  SmartFarmingManager,
  PoolRegistry,
  ProxyOFT,
} from '../typechain'
import {FakeContract, smock} from '@defi-wonderland/smock'
import {toUSD} from '../helpers'
import {impersonateAccount, setTokenBalance} from './helpers'

chai.use(smock.matchers)

const {MaxUint256} = ethers.constants
const {parseUnits} = ethers.utils

const CF = parseEther('0.5') // 60%
const metPrice = toUSD('4') // 1 MET = $4
const daiPrice = toUSD('1') // 1 DAI = $1
const msUsdPrice = toUSD('1')
const msEthPrice = toUSD('1')
const interestRate = parseEther('0')

describe('SmartFarmingManager', function () {
  let deployer: SignerWithAddress
  let alice: SignerWithAddress
  let bob: SignerWithAddress
  let feeCollector: SignerWithAddress
  let swapper: SwapperMock
  let met: ERC20Mock
  let dai: ERC20Mock
  let vaDAI: VPoolMock
  let msUsdDebtToken: DebtToken
  let msUSD: SyntheticToken
  let msEthDebtToken: DebtToken
  let msETH: SyntheticToken
  let treasury: Treasury
  let msdMET: DepositToken
  let msdDAI: DepositToken
  let msdVaDAI: DepositToken
  let masterOracle: MasterOracleMock
  let smartFarmingManager: SmartFarmingManager
  let pool: Pool
  let poolRegistry: PoolRegistry
  let feeProvider: FeeProvider
  let proxyOFT: FakeContract<ProxyOFT>

  async function fixture() {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[deployer, alice, bob, feeCollector] = await ethers.getSigners()
    const masterOracleMockFactory = await ethers.getContractFactory('MasterOracleMock', deployer)
    masterOracle = await masterOracleMockFactory.deploy()
    await masterOracle.deployed()

    const swapperMockFactory = await ethers.getContractFactory('SwapperMock', deployer)
    swapper = await swapperMockFactory.deploy(masterOracle.address)
    await swapper.deployed()

    const erc20MockFactory = await ethers.getContractFactory('ERC20Mock', deployer)
    const vPoolMockFactory = await ethers.getContractFactory('VPoolMock', deployer)

    met = await erc20MockFactory.deploy('Metronome', 'MET', 18)
    await met.deployed()

    dai = await erc20MockFactory.deploy('Dai Stablecoin', 'DAI', 18)
    await dai.deployed()

    vaDAI = await vPoolMockFactory.deploy('Vesper Pool Dai', 'vaDAI', dai.address)
    await vaDAI.deployed()

    const treasuryFactory = await ethers.getContractFactory('Treasury', deployer)
    treasury = await treasuryFactory.deploy()
    await treasury.deployed()
    await setStorageAt(treasury.address, 0, 0) // Undo initialization made by constructor

    const depositTokenFactory = await ethers.getContractFactory('DepositToken', deployer)
    msdMET = await depositTokenFactory.deploy()
    await msdMET.deployed()
    await setStorageAt(msdMET.address, 0, 0) // Undo initialization made by constructor

    msdDAI = await depositTokenFactory.deploy()
    await msdDAI.deployed()
    await setStorageAt(msdDAI.address, 0, 0) // Undo initialization made by constructor

    msdVaDAI = await depositTokenFactory.deploy()
    await msdVaDAI.deployed()
    await setStorageAt(msdVaDAI.address, 0, 0) // Undo initialization made by constructor

    const debtTokenFactory = await ethers.getContractFactory('DebtToken', deployer)

    msUsdDebtToken = await debtTokenFactory.deploy()
    await msUsdDebtToken.deployed()
    await setStorageAt(msUsdDebtToken.address, 0, 0) // Undo initialization made by constructor

    msEthDebtToken = await debtTokenFactory.deploy()
    await msEthDebtToken.deployed()
    await setStorageAt(msEthDebtToken.address, 0, 0) // Undo initialization made by constructor

    const syntheticTokenFactory = await ethers.getContractFactory('SyntheticToken', deployer)

    msUSD = await syntheticTokenFactory.deploy()
    await msUSD.deployed()
    await setStorageAt(msUSD.address, 0, 0) // Undo initialization made by constructor

    msETH = await syntheticTokenFactory.deploy()
    await msETH.deployed()
    await setStorageAt(msETH.address, 0, 0) // Undo initialization made by constructor

    const feeProviderFactory = await ethers.getContractFactory('FeeProvider', deployer)
    feeProvider = await feeProviderFactory.deploy()
    await feeProvider.deployed()
    await setStorageAt(feeProvider.address, 0, 0) // Undo initialization made by constructor

    const poolFactory = await ethers.getContractFactory('contracts/Pool.sol:Pool', deployer)
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    pool = await poolFactory.deploy()
    await pool.deployed()
    await setStorageAt(pool.address, 0, 0) // Undo initialization made by constructor

    const smartFarmingManagerFactory = await ethers.getContractFactory('SmartFarmingManager', deployer)
    smartFarmingManager = await smartFarmingManagerFactory.deploy()
    await smartFarmingManager.deployed()
    await setStorageAt(smartFarmingManager.address, 0, 0) // Undo initialization made by constructor

    const stargateFactory = await smock.fake('IStargateFactory')
    const stargatePool = await smock.fake('IStargatePool')
    const stargateRouter = await smock.fake('IStargateRouter')
    stargateRouter.factory.returns(stargateFactory.address)
    stargateFactory.getPool.returns(stargatePool.address)
    stargatePool.token.returns(dai.address)
    await setCode(stargateRouter.address, '0x01')
    await setCode(stargatePool.address, '0x01')

    const poolRegistryFactory = await ethers.getContractFactory('PoolRegistry', deployer)
    poolRegistry = await poolRegistryFactory.deploy()
    await poolRegistry.deployed()
    await setStorageAt(poolRegistry.address, 0, 0) // Undo initialization made by constructor
    await poolRegistry.initialize(masterOracle.address, feeCollector.address)
    await poolRegistry.registerPool(pool.address)
    await poolRegistry.updateSwapper(swapper.address)
    await poolRegistry.toggleBridgingIsActive()

    const esMET = await smock.fake('IESMET')

    // Deployment tasks
    await msdMET.initialize(met.address, pool.address, 'Metronome Synth WETH-Deposit', 'msdMET', 18, CF, MaxUint256)
    await msdDAI.initialize(dai.address, pool.address, 'Metronome Synth DAI-Deposit', 'msdDAI', 18, CF, MaxUint256)
    await msdVaDAI.initialize(
      vaDAI.address,
      pool.address,
      'Metronome Synth vaDAI-Deposit',
      'msdVaDAI',
      18,
      CF,
      MaxUint256
    )
    await treasury.initialize(pool.address)

    await msUSD.initialize('Metronome Synth USD', 'msUSD', 18, poolRegistry.address)
    await msETH.initialize('Metronome Synth ETH', 'msETH', 18, poolRegistry.address)
    await msUsdDebtToken.initialize('msUSD Debt', 'msUSD-Debt', pool.address, msUSD.address, interestRate, MaxUint256)
    await msEthDebtToken.initialize('msETH Debt', 'msETH-Debt', pool.address, msETH.address, interestRate, MaxUint256)
    await feeProvider.initialize(poolRegistry.address, esMET.address)
    await smartFarmingManager.initialize(pool.address)
    await pool.initialize(poolRegistry.address)
    await pool.updateMaxLiquidable(parseEther('1')) // 100%
    await pool.updateTreasury(treasury.address)
    await pool.updateSmartFarmingManager(smartFarmingManager.address)
    await pool.updateFeeProvider(feeProvider.address)
    await pool.addDepositToken(msdMET.address)
    await pool.addDepositToken(msdDAI.address)
    await pool.addDepositToken(msdVaDAI.address)
    await pool.addDebtToken(msUsdDebtToken.address)
    await pool.addDebtToken(msEthDebtToken.address)

    proxyOFT = await smock.fake('ProxyOFT')
    proxyOFT.token.returns(msUSD.address)
    msUSD.updateProxyOFT(proxyOFT.address)
    await setBalance(proxyOFT.address, parseEther('10'))

    // mint some collaterals to users
    await met.mint(alice.address, parseEther(`${1e6}`))
    await dai.mint(alice.address, parseEther(`${1e6}`))
    await vaDAI.mint(alice.address, parseEther(`${1e6}`))

    // initialize mocked oracle
    await masterOracle.updatePrice(dai.address, daiPrice)
    await masterOracle.updatePrice(met.address, metPrice)
    await masterOracle.updatePrice(vaDAI.address, daiPrice)
    await masterOracle.updatePrice(msUSD.address, msUsdPrice)
    await masterOracle.updatePrice(msETH.address, msEthPrice)

    await dai.mint(swapper.address, parseEther(`${1e6}`))
    await vaDAI.mint(swapper.address, parseEther(`${1e6}`))
    await met.mint(swapper.address, parseEther(`${1e6}`))
    await setTokenBalance(msUSD.address, swapper.address, parseEther(`${1e6}`), 3)

    await vaDAI.connect(alice).approve(smartFarmingManager.address, MaxUint256)
  }

  beforeEach(async function () {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[deployer, alice, bob] = await ethers.getSigners()
    await loadFixture(fixture)
  })

  describe('flashRepay', function () {
    beforeEach('leverage vaDAI->msUSD', async function () {
      const amountIn = parseUnits('100', 18)
      const leverage = parseEther('1.5')

      await smartFarmingManager
        .connect(alice)
        .leverage(vaDAI.address, msdVaDAI.address, msUSD.address, amountIn, leverage, 0)
    })

    it('should revert if withdraw amount is too high', async function () {
      // when
      const withdrawAmount = (await msdVaDAI.balanceOf(alice.address)).add('1')
      const tx = smartFarmingManager.connect(alice).flashRepay(msUSD.address, msdVaDAI.address, withdrawAmount, 0)

      // then
      await expect(tx).revertedWithCustomError(smartFarmingManager, 'AmountIsTooHigh')
    })

    it('should revert if repay amount is too high', async function () {
      // when
      const withdrawAmount = await msdVaDAI.balanceOf(alice.address)
      const repayAmountMin = (await msUsdDebtToken.balanceOf(alice.address)).add('1')
      const tx = smartFarmingManager
        .connect(alice)
        .flashRepay(msUSD.address, msdVaDAI.address, withdrawAmount, repayAmountMin)

      // then
      await expect(tx).revertedWithCustomError(smartFarmingManager, 'AmountIsTooHigh')
    })

    it('should revert if slippage is too high', async function () {
      // given
      await swapper.updateRate(parseEther('0.9')) // 10% slippage

      // when
      const withdrawAmount = parseEther('50')
      const repayAmountMin = parseEther('49.5') // 1% slippage
      const tx = smartFarmingManager
        .connect(alice)
        .flashRepay(msUSD.address, msdVaDAI.address, withdrawAmount, repayAmountMin)

      // then
      await expect(tx).revertedWithCustomError(smartFarmingManager, 'FlashRepaySlippageTooHigh')
    })

    it('should revert if the outcome position is unhealthy', async function () {
      // given
      const {_debtInUsd: debtBefore, _depositInUsd: depositBefore} = await pool.debtPositionOf(alice.address)
      expect(depositBefore).eq(parseEther('150'))
      expect(debtBefore).eq(parseEther('50'))
      // Simulates huge slippage (90%), that makes user withdraw large collateral but repay small amount
      await swapper.updateRate(parseEther('0.1'))

      // when
      const withdrawAmount = parseEther('100')
      const tx = smartFarmingManager.connect(alice).flashRepay(msUSD.address, msdVaDAI.address, withdrawAmount, 0)

      // then
      await expect(tx).revertedWithCustomError(smartFarmingManager, 'PositionIsNotHealthy')
    })

    it('should refund synth if swap amount out is too much', async function () {
      // given
      const {_debtInUsd: debtBefore} = await pool.debtPositionOf(alice.address)
      expect(debtBefore).eq(parseEther('50'))
      const before = await msUSD.balanceOf(alice.address)
      expect(before).eq(0)

      // when
      const withdrawAmount = parseEther('60')
      await smartFarmingManager.connect(alice).flashRepay(msUSD.address, msdVaDAI.address, withdrawAmount, 0)

      // then
      const after = await msUSD.balanceOf(alice.address)
      expect(after).eq(parseEther('10'))
    })

    it('should flashRepay vaDAI->msUSD', async function () {
      // given
      const {_debtInUsd: debtBefore, _depositInUsd: depositBefore} = await pool.debtPositionOf(alice.address)
      expect(depositBefore).eq(parseEther('150'))
      expect(debtBefore).eq(parseEther('50'))

      // when
      const withdrawAmount = parseEther('50')
      await smartFarmingManager.connect(alice).flashRepay(msUSD.address, msdVaDAI.address, withdrawAmount, 0)

      // then
      const {_debtInUsd: debtAfter, _depositInUsd: depositAfter} = await pool.debtPositionOf(alice.address)
      expect(depositAfter).eq(parseEther('100'))
      expect(debtAfter).eq(0)
    })
  })

  describe('leverage', function () {
    beforeEach(async function () {
      // given
      expect(await feeProvider.issueFee()).eq(0)
      expect(await feeProvider.depositFee()).eq(0)
      const {_debtInUsd, _depositInUsd} = await pool.debtPositionOf(alice.address)
      expect(_debtInUsd).eq(0)
      expect(_depositInUsd).eq(0)
    })

    it('should revert if X it too low', async function () {
      // when
      const amountIn = parseUnits('100', 18)
      const leverage = parseEther('1').sub('1')
      const tx = smartFarmingManager
        .connect(alice)
        .leverage(vaDAI.address, msdVaDAI.address, msUSD.address, amountIn, leverage, 0)

      // then
      await expect(tx).revertedWithCustomError(smartFarmingManager, 'LeverageTooLow')
    })

    it('should revert if X it too high', async function () {
      // when
      const amountIn = parseUnits('100', 18)
      const cf = await msdVaDAI.collateralFactor()
      const maxLeverage = parseEther('1').mul(parseEther('1')).div(parseEther('1').sub(cf))
      const leverage = maxLeverage.add('1')
      const tx = smartFarmingManager
        .connect(alice)
        .leverage(vaDAI.address, msdVaDAI.address, msUSD.address, amountIn, leverage, 0)

      // then
      await expect(tx).revertedWithCustomError(smartFarmingManager, 'LeverageTooHigh')
    })

    it('should revert if slippage is too high', async function () {
      // given
      await swapper.updateRate(parseEther('0.9')) // 10% slippage

      // when
      const amountIn = parseUnits('100', 18)
      const leverage = parseEther('1.5')
      const depositAmountMin = parseEther('147.5') // 5% slippage (100 + 50*0.95)
      const tx = smartFarmingManager
        .connect(alice)
        .leverage(vaDAI.address, msdVaDAI.address, msUSD.address, amountIn, leverage, depositAmountMin)

      // then
      await expect(tx).revertedWithCustomError(smartFarmingManager, 'LeverageSlippageTooHigh')
    })

    it('should revert if outcome position is not healthy', async function () {
      // given
      await swapper.updateRate(parseEther('0.9')) // 10% slippage

      // when
      const amountIn = parseUnits('100', 18)
      const cf = await msdVaDAI.collateralFactor()
      const maxLeverage = parseEther('1').mul(parseEther('1')).div(parseEther('1').sub(cf))
      const tx = smartFarmingManager
        .connect(alice)
        .leverage(vaDAI.address, msdVaDAI.address, msUSD.address, amountIn, maxLeverage, 0)

      // then
      await expect(tx).revertedWithCustomError(smartFarmingManager, 'PositionIsNotHealthy')
    })

    it('should revert if outcome position is too close to min leverage making swap return 0', async function () {
      // when
      const amountIn = parseUnits('100', 18)
      const minLeverage = parseEther('1').add('1')
      const tx = smartFarmingManager
        .connect(alice)
        .leverage(vaDAI.address, msdVaDAI.address, msUSD.address, amountIn, minLeverage, 0)

      // then
      await expect(tx).revertedWith('amount-out-zero') // Error from DEX
    })

    it('should be able to leverage close to min', async function () {
      // when
      const amountIn = parseUnits('100', 18)
      const leverage = parseEther('1.01')
      await smartFarmingManager
        .connect(alice)
        .leverage(vaDAI.address, msdVaDAI.address, msUSD.address, amountIn, leverage, 0)

      // then
      const {_debtInUsd, _depositInUsd} = await pool.debtPositionOf(alice.address)
      expect(_depositInUsd).closeTo(amountIn, parseEther('5')) // ~$100
      expect(_debtInUsd).closeTo(0, parseEther('5')) // ~$0
    })

    it('should be able to leverage (a little bit less than the) max', async function () {
      // given
      await swapper.updateRate(parseEther('0.999')) // 0.1% slippage

      // when
      const amountIn = parseUnits('100', 18)
      const cf = await msdVaDAI.collateralFactor()
      const maxLeverage = parseEther('1').mul(parseEther('1')).div(parseEther('1').sub(cf))
      expect(maxLeverage).eq(parseEther('2'))
      const damper = parseEther('0.05')
      const leverage = maxLeverage.sub(damper) // -5% to cover fees + slippage
      await smartFarmingManager
        .connect(alice)
        .leverage(vaDAI.address, msdVaDAI.address, msUSD.address, amountIn, leverage, 0)

      // then
      const {_debtInUsd, _depositInUsd} = await pool.debtPositionOf(alice.address)
      expect(_depositInUsd).closeTo(parseEther('200'), parseEther('10')) // ~$200
      expect(_debtInUsd).closeTo(parseEther('100'), parseEther('10')) // ~$100
    })

    it('should leverage vaDAI->msUSD', async function () {
      // when
      const amountIn = parseUnits('100', 18)
      const leverage = parseEther('1.5')
      await smartFarmingManager
        .connect(alice)
        .leverage(vaDAI.address, msdVaDAI.address, msUSD.address, amountIn, leverage, 0)

      // then
      const {_debtInUsd, _depositInUsd} = await pool.debtPositionOf(alice.address)
      expect(_depositInUsd).closeTo(amountIn.mul(leverage).div(parseEther('1')), parseEther('10')) // ~$150
      // eslint-disable-next-line max-len
      expect(_debtInUsd).closeTo(amountIn.mul(leverage.sub(parseEther('1'))).div(parseEther('1')), parseEther('10')) // ~$50
    })

    it('should leverage vaDAI->msUSD using MET as tokenIn', async function () {
      // given
      await masterOracle.updatePrice(met.address, parseEther('0.5'))

      // when
      const amountIn = parseUnits('100', 18)
      const leverage = parseEther('1.5')
      await met.connect(alice).approve(smartFarmingManager.address, MaxUint256)
      await smartFarmingManager
        .connect(alice)
        .leverage(met.address, msdVaDAI.address, msUSD.address, amountIn, leverage, 0)

      // then
      expect(await met.balanceOf(smartFarmingManager.address)).eq(0)
      const {_debtInUsd, _depositInUsd} = await pool.debtPositionOf(alice.address)
      expect(_depositInUsd).closeTo(parseEther('75'), parseEther('10'))
      expect(_debtInUsd).closeTo(parseEther('25'), parseEther('10'))
    })
  })
})
