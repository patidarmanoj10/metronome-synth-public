/* eslint-disable camelcase */
/* eslint-disable new-cap */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import {parseEther} from '@ethersproject/units'
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {loadFixture, setBalance} from '@nomicfoundation/hardhat-network-helpers'
import chai, {expect} from 'chai'
import hre, {ethers} from 'hardhat'
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
  SmartFarmingManagerMock,
} from '../typechain'
import {FakeContract, smock} from '@defi-wonderland/smock'
import {toUSD} from '../helpers'

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
  let smartFarmingManager: SmartFarmingManagerMock
  let pool: Pool
  let poolRegistryMock: FakeContract
  let feeProvider: FeeProvider
  let proxyOFT_msUSD: FakeContract
  let proxyOFT_msETH: FakeContract

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

    const depositTokenFactory = await ethers.getContractFactory('DepositToken', deployer)
    msdMET = await depositTokenFactory.deploy()
    await msdMET.deployed()

    msdDAI = await depositTokenFactory.deploy()
    await msdDAI.deployed()

    msdVaDAI = await depositTokenFactory.deploy()
    await msdVaDAI.deployed()

    const debtTokenFactory = await ethers.getContractFactory('DebtToken', deployer)

    msUsdDebtToken = await debtTokenFactory.deploy()
    await msUsdDebtToken.deployed()

    msEthDebtToken = await debtTokenFactory.deploy()
    await msEthDebtToken.deployed()

    const syntheticTokenFactory = await ethers.getContractFactory('SyntheticToken', deployer)

    msUSD = await syntheticTokenFactory.deploy()
    await msUSD.deployed()

    msETH = await syntheticTokenFactory.deploy()
    await msETH.deployed()

    const feeProviderFactory = await ethers.getContractFactory('FeeProvider', deployer)
    feeProvider = await feeProviderFactory.deploy()
    await feeProvider.deployed()

    const poolFactory = await ethers.getContractFactory('contracts/Pool.sol:Pool', deployer)
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    pool = await poolFactory.deploy()
    await pool.deployed()

    const smartFarmingManagerFactory = await ethers.getContractFactory('SmartFarmingManagerMock', deployer)
    smartFarmingManager = await smartFarmingManagerFactory.deploy()
    await smartFarmingManager.deployed()
    await smartFarmingManager.updateChainId(2)

    poolRegistryMock = await smock.fake('PoolRegistry')
    poolRegistryMock.governor.returns(deployer.address)
    poolRegistryMock.isPoolRegistered.returns((address: string) => address == pool.address)
    poolRegistryMock.masterOracle.returns(masterOracle.address)
    poolRegistryMock.feeCollector.returns(feeCollector.address)
    poolRegistryMock.isBridgingActive.returns(true)
    poolRegistryMock.swapper.returns(swapper.address)

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

    await msUSD.initialize('Metronome Synth USD', 'msUSD', 18, poolRegistryMock.address)
    await msETH.initialize('Metronome Synth ETH', 'msETH', 18, poolRegistryMock.address)
    await msUsdDebtToken.initialize('msUSD Debt', 'msUSD-Debt', pool.address, msUSD.address, interestRate, MaxUint256)
    await msEthDebtToken.initialize('msETH Debt', 'msETH-Debt', pool.address, msETH.address, interestRate, MaxUint256)
    await feeProvider.initialize(poolRegistryMock.address, esMET.address)
    await smartFarmingManager.initialize(pool.address)
    await pool.initialize(poolRegistryMock.address)
    await pool.updateMaxLiquidable(parseEther('1')) // 100%
    await pool.updateTreasury(treasury.address)
    await pool.updateSmartFarmingManager(smartFarmingManager.address)
    await pool.updateFeeProvider(feeProvider.address)
    await pool.addDepositToken(msdMET.address)
    await pool.addDepositToken(msdDAI.address)
    await pool.addDepositToken(msdVaDAI.address)
    await pool.addDebtToken(msUsdDebtToken.address)
    await pool.addDebtToken(msEthDebtToken.address)

    proxyOFT_msUSD = await smock.fake('Layer2ProxyOFT')
    proxyOFT_msUSD.token.returns(msUSD.address)
    msUSD.updateProxyOFT(proxyOFT_msUSD.address)
    await setBalance(proxyOFT_msUSD.address, parseEther('10'))

    proxyOFT_msETH = await smock.fake('Layer2ProxyOFT')
    proxyOFT_msETH.token.returns(msETH.address)
    msETH.updateProxyOFT(proxyOFT_msETH.address)
    await setBalance(proxyOFT_msETH.address, parseEther('10'))

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

  describe('layer2FlashRepay', function () {
    beforeEach('leverage vaDAI->msUSD', async function () {
      const amountIn = parseUnits('100', 18)
      const leverage = parseEther('1.5')
      await smartFarmingManager
        .connect(alice)
        .leverage(vaDAI.address, msdVaDAI.address, msUSD.address, amountIn, leverage, 0)
    })

    it('should revert if deposit token is invalid', async function () {
      // when
      const fee = parseEther('0.1')
      const syntheticToken = msUSD.address
      const withdrawAmount = parseEther('10')
      const underlyingAmountMin = parseEther('10')
      const layer1SwapAmountOutMin = parseEther('9.5')
      const repayAmountMin = parseEther('9')
      const lzArgs = '0x'
      const tx = smartFarmingManager.connect(alice).layer2FlashRepay(
        syntheticToken,
        alice.address, // invalid msdToken
        withdrawAmount,
        dai.address,
        underlyingAmountMin,
        layer1SwapAmountOutMin,
        repayAmountMin,
        lzArgs,
        {value: fee}
      )

      // then
      await expect(tx).revertedWithCustomError(smartFarmingManager, 'DepositTokenDoesNotExist')
    })

    it('should revert if synthetic token is invalid', async function () {
      // when
      const fee = parseEther('0.1')
      const syntheticToken = alice.address // invalid msToken
      const withdrawAmount = parseEther('10')
      const underlyingAmountMin = parseEther('10')
      const layer1SwapAmountOutMin = parseEther('9.5')
      const repayAmountMin = parseEther('9')
      const lzArgs = '0x'
      const tx = smartFarmingManager
        .connect(alice)
        .layer2FlashRepay(
          syntheticToken,
          msdVaDAI.address,
          withdrawAmount,
          dai.address,
          underlyingAmountMin,
          layer1SwapAmountOutMin,
          repayAmountMin,
          lzArgs,
          {value: fee}
        )

      // then
      await expect(tx).revertedWithCustomError(smartFarmingManager, 'SyntheticDoesNotExist')
    })

    it('should revert if shutdown', async function () {
      // given
      await pool.shutdown()

      // when
      const fee = parseEther('0.1')
      const syntheticToken = msUSD.address
      const withdrawAmount = parseEther('10')
      const underlyingAmountMin = parseEther('10')
      const layer1SwapAmountOutMin = parseEther('9.5')
      const repayAmountMin = parseEther('9')
      const lzArgs = '0x'
      const tx = smartFarmingManager
        .connect(alice)
        .layer2FlashRepay(
          syntheticToken,
          msdVaDAI.address,
          withdrawAmount,
          dai.address,
          underlyingAmountMin,
          layer1SwapAmountOutMin,
          repayAmountMin,
          lzArgs,
          {value: fee}
        )

      // then
      await expect(tx).revertedWithCustomError(smartFarmingManager, 'IsShutdown')
    })

    it('should revert if amount to withdraw is zero', async function () {
      // when
      const fee = parseEther('0.1')
      const syntheticToken = msUSD.address
      const withdrawAmount = '0'
      const underlyingAmountMin = parseEther('10')
      const layer1SwapAmountOutMin = parseEther('9.5')
      const repayAmountMin = parseEther('9')
      const lzArgs = '0x'
      const tx = smartFarmingManager
        .connect(alice)
        .layer2FlashRepay(
          syntheticToken,
          msdVaDAI.address,
          withdrawAmount,
          dai.address,
          underlyingAmountMin,
          layer1SwapAmountOutMin,
          repayAmountMin,
          lzArgs,
          {value: fee}
        )

      // then
      await expect(tx).revertedWithCustomError(smartFarmingManager, 'AmountIsZero')
    })

    it('should revert if amount to withdraw is higher than the unlock balance', async function () {
      // when
      const fee = parseEther('0.1')
      const syntheticToken = msUSD.address
      const withdrawAmount = parseEther('100')
      const underlyingAmountMin = parseEther('10')
      const layer1SwapAmountOutMin = parseEther('9.5')
      const repayAmountMin = parseEther('9')
      const lzArgs = '0x'
      const tx = smartFarmingManager
        .connect(alice)
        .layer2FlashRepay(
          syntheticToken,
          msdVaDAI.address,
          withdrawAmount,
          dai.address,
          underlyingAmountMin,
          layer1SwapAmountOutMin,
          repayAmountMin,
          lzArgs,
          {value: fee}
        )

      // then
      await expect(tx).revertedWithCustomError(msdVaDAI, 'NotEnoughFreeBalance')
    })

    it('should revert if amount to repay is too high', async function () {
      // when
      const fee = parseEther('0.1')
      const syntheticToken = msUSD.address
      const withdrawAmount = parseEther('10')
      const underlyingAmountMin = parseEther('10')
      const layer1SwapAmountOutMin = parseEther('9.5')
      const repayAmountMin = parseEther('51')
      const lzArgs = '0x'
      const tx = smartFarmingManager
        .connect(alice)
        .layer2FlashRepay(
          syntheticToken,
          msdVaDAI.address,
          withdrawAmount,
          dai.address,
          underlyingAmountMin,
          layer1SwapAmountOutMin,
          repayAmountMin,
          lzArgs,
          {value: fee}
        )

      // then
      await expect(tx).revertedWithCustomError(smartFarmingManager, 'AmountIsTooHigh')
    })

    it('should revert if swap slippage is too high', async function () {
      // given
      expect(await smartFarmingManager.layer2RequestId()).eq(0)

      // when
      const fee = parseEther('0.1')
      const syntheticToken = msUSD.address
      const withdrawAmount = parseEther('10')
      const underlyingAmountMin = parseEther('100000')
      const layer1SwapAmountOutMin = parseEther('9.5')
      const repayAmountMin = parseEther('9')
      const lzArgs = '0x'
      const tx = smartFarmingManager
        .connect(alice)
        .layer2FlashRepay(
          syntheticToken,
          msdVaDAI.address,
          withdrawAmount,
          dai.address,
          underlyingAmountMin,
          layer1SwapAmountOutMin,
          repayAmountMin,
          lzArgs,
          {value: fee}
        )

      // then
      await expect(tx).reverted
    })

    it('should revert if position is unhealthy', async function () {
      // given
      await masterOracle.updatePrice(msUSD.address, parseEther('10'))

      // when
      const fee = parseEther('0.1')
      const syntheticToken = msUSD.address
      const withdrawAmount = parseEther('10')
      const underlyingAmountMin = parseEther('10')
      const layer1SwapAmountOutMin = parseEther('9.5')
      const repayAmountMin = parseEther('9')
      const lzArgs = '0x'
      const tx = smartFarmingManager
        .connect(alice)
        .layer2FlashRepay(
          syntheticToken,
          msdVaDAI.address,
          withdrawAmount,
          dai.address,
          underlyingAmountMin,
          layer1SwapAmountOutMin,
          repayAmountMin,
          lzArgs,
          {value: fee}
        )

      // then
      await expect(tx).revertedWithCustomError(msdVaDAI, 'NotEnoughFreeBalance')
    })

    it('should revert if position end up unhealthy', async function () {
      // when
      const fee = parseEther('0.1')
      const syntheticToken = msUSD.address
      const withdrawAmount = (await msdVaDAI.unlockedBalanceOf(alice.address)).add('1')
      const underlyingAmountMin = parseEther('10')
      const layer1SwapAmountOutMin = parseEther('9.5')
      const repayAmountMin = parseEther('9')
      const lzArgs = '0x'
      const tx = smartFarmingManager
        .connect(alice)
        .layer2FlashRepay(
          syntheticToken,
          msdVaDAI.address,
          withdrawAmount,
          dai.address,
          underlyingAmountMin,
          layer1SwapAmountOutMin,
          repayAmountMin,
          lzArgs,
          {value: fee}
        )

      // then
      await expect(tx).revertedWithCustomError(msdVaDAI, 'NotEnoughFreeBalance')
    })

    it('should start L2 flash repay flow', async function () {
      // given
      expect(await smartFarmingManager.layer2RequestId()).eq(0)

      // when
      const fee = parseEther('0.1')
      const syntheticToken = msUSD.address
      const withdrawAmount = parseEther('10')
      const underlyingAmountMin = parseEther('10')
      const layer1SwapAmountOutMin = parseEther('9.5')
      const repayAmountMin = parseEther('9')
      const lzArgs = '0x'
      const tx = smartFarmingManager
        .connect(alice)
        .layer2FlashRepay(
          syntheticToken,
          msdVaDAI.address,
          withdrawAmount,
          dai.address,
          underlyingAmountMin,
          layer1SwapAmountOutMin,
          repayAmountMin,
          lzArgs,
          {value: fee}
        )

      // then
      await expect(tx)
        .changeTokenBalance(vaDAI, treasury.address, withdrawAmount.mul('-1'))
        .changeTokenBalance(dai, proxyOFT_msUSD.address, withdrawAmount)

      const id = 1
      expect(await smartFarmingManager.layer2RequestId()).eq(id)
      const request = await smartFarmingManager.layer2FlashRepays(id)
      expect(request.syntheticToken).eq(syntheticToken)
      expect(request.repayAmountMin).eq(repayAmountMin)
      expect(request.account).eq(alice.address)
      expect(request.finished).eq(false)
      expect(proxyOFT_msUSD.triggerFlashRepaySwap)
        .calledWith(id, alice.address, dai.address, parseEther('10'), layer1SwapAmountOutMin, lzArgs)
        .calledWithValue(fee)
    })
  })

  describe('layer2FlashRepayCallback', function () {
    const id = 1

    beforeEach(async function () {
      // Create position
      const amountIn = parseUnits('100', 18)
      const leverage = parseEther('1.5')
      await smartFarmingManager
        .connect(alice)
        .leverage(vaDAI.address, msdVaDAI.address, msUSD.address, amountIn, leverage, 0)

      // Start flash repay
      const fee = parseEther('0.1')
      const syntheticToken = msUSD.address
      const withdrawAmount = parseEther('10')
      const underlyingAmountMin = parseEther('10')
      const layer1SwapAmountOutMin = parseEther('9.5')
      const repayAmountMin = parseEther('9')
      const lzArgs = '0x'
      await smartFarmingManager
        .connect(alice)
        .layer2FlashRepay(
          syntheticToken,
          msdVaDAI.address,
          withdrawAmount,
          dai.address,
          underlyingAmountMin,
          layer1SwapAmountOutMin,
          repayAmountMin,
          lzArgs,
          {value: fee}
        )

      expect(await smartFarmingManager.layer2RequestId()).eq(id)

      await dai.mint(proxyOFT_msUSD.address, parseEther('10000'))
      await dai.connect(proxyOFT_msUSD.wallet).approve(smartFarmingManager.address, ethers.constants.MaxUint256)
      await dai.connect(proxyOFT_msUSD.wallet).approve(msdDAI.address, ethers.constants.MaxUint256)

      await msdDAI.connect(proxyOFT_msUSD.wallet).deposit(parseEther('2000'), proxyOFT_msUSD.address)
      await msUsdDebtToken.connect(proxyOFT_msUSD.wallet).issue(parseEther('1000'), proxyOFT_msUSD.address)
      await msUSD.connect(proxyOFT_msUSD.wallet).approve(smartFarmingManager.address, ethers.constants.MaxUint256)
    })

    it('should revert if shutdown', async function () {
      // given
      await pool.shutdown()

      // when
      const tx = smartFarmingManager.connect(proxyOFT_msUSD.wallet).layer2FlashRepayCallback(id, parseEther('10'))

      // then
      await expect(tx).revertedWithCustomError(smartFarmingManager, 'IsShutdown')
    })

    it('should revert if caller is not a proxyOFT', async function () {
      // given
      const fakeOFT = await smock.fake('Layer2ProxyOFT')
      fakeOFT.token.returns(msUSD.address)
      await setBalance(fakeOFT.address, parseEther('10'))

      // when
      const tx = smartFarmingManager.connect(fakeOFT.wallet).layer2FlashRepayCallback(id, parseEther('10'))

      // then
      await expect(tx).revertedWithCustomError(smartFarmingManager, 'SenderIsNotProxyOFT')
    })

    it('should revert if caller is not the same proxyOFT as request', async function () {
      // when
      const tx = smartFarmingManager.connect(proxyOFT_msETH.wallet).layer2FlashRepayCallback(id, parseEther('10'))

      // then
      await expect(tx).revertedWithCustomError(smartFarmingManager, 'SenderIsNotProxyOFT')
    })

    it('should revert if request does not exist', async function () {
      // given
      const invalidId = 2

      // when
      const tx = smartFarmingManager
        .connect(proxyOFT_msUSD.wallet)
        .layer2FlashRepayCallback(invalidId, parseEther('10'))

      // then
      await expect(tx).revertedWithCustomError(smartFarmingManager, 'Layer2RequestInvalidKey')
    })

    it('should revert if request already finished', async function () {
      // given
      const swapAmountOut = parseEther('10')
      await smartFarmingManager.connect(proxyOFT_msUSD.wallet).layer2FlashRepayCallback(id, swapAmountOut)

      // when
      const tx = smartFarmingManager.connect(proxyOFT_msUSD.wallet).layer2FlashRepayCallback(id, swapAmountOut)

      // then
      await expect(tx).revertedWithCustomError(smartFarmingManager, 'Layer2RequestCompletedAlready')
    })

    it('should revert if swapAmountOut slippage is too high', async function () {
      // given
      const {repayAmountMin} = await smartFarmingManager.layer2FlashRepays(id)

      // when
      const tx = smartFarmingManager
        .connect(proxyOFT_msUSD.wallet)
        .layer2FlashRepayCallback(id, repayAmountMin.sub('1'))

      // then
      await expect(tx).revertedWithCustomError(smartFarmingManager, 'FlashRepaySlippageTooHigh')
    })

    it('should finish L2 flash repay flow', async function () {
      // given
      const swapAmountOut = parseEther('10')

      // when
      const tx = smartFarmingManager.connect(proxyOFT_msUSD.wallet).layer2FlashRepayCallback(id, swapAmountOut)

      // then
      await expect(tx)
        .changeTokenBalance(msUSD, proxyOFT_msUSD.address, swapAmountOut.mul('-1'))
        .changeTokenBalance(msUsdDebtToken, alice.address, swapAmountOut.mul('-1'))
      const {finished} = await smartFarmingManager.layer2FlashRepays(id)
      expect(finished).true
    })
  })

  describe('layer2Leverage', function () {
    beforeEach(async function () {
      await dai.connect(alice).approve(smartFarmingManager.address, ethers.constants.MaxUint256)
    })

    it('should revert if shutdown', async function () {
      // given
      await pool.shutdown()

      // when
      const fee = parseEther('0.1')
      const underlying = dai.address
      const depositToken = msdVaDAI.address
      const syntheticToken = msUSD.address
      const amountIn = parseEther('10')
      const leverage = parseEther('1.5')
      const layer1SwapAmountOutMin = parseEther('9.5')
      const depositAmountMin = parseEther('9')
      const lzArgs = '0x'
      const tx = smartFarmingManager
        .connect(alice)
        .layer2Leverage(
          underlying,
          depositToken,
          syntheticToken,
          amountIn,
          leverage,
          layer1SwapAmountOutMin,
          depositAmountMin,
          lzArgs,
          {value: fee}
        )

      // then
      await expect(tx).revertedWithCustomError(smartFarmingManager, 'IsShutdown')
    })

    it('should revert if leverage is too low', async function () {
      // when
      const fee = parseEther('0.1')
      const underlying = dai.address
      const depositToken = msdVaDAI.address
      const syntheticToken = msUSD.address
      const amountIn = parseEther('10')
      const leverage = parseEther('0.99')
      const layer1SwapAmountOutMin = parseEther('9.5')
      const depositAmountMin = parseEther('9')
      const lzArgs = '0x'
      const tx = smartFarmingManager
        .connect(alice)
        .layer2Leverage(
          underlying,
          depositToken,
          syntheticToken,
          amountIn,
          leverage,
          layer1SwapAmountOutMin,
          depositAmountMin,
          lzArgs,
          {value: fee}
        )

      // then
      await expect(tx).revertedWithCustomError(smartFarmingManager, 'LeverageTooLow')
    })

    it('should revert if leverage is too high', async function () {
      // when
      const fee = parseEther('0.1')
      const underlying = dai.address
      const depositToken = msdVaDAI.address
      const syntheticToken = msUSD.address
      const amountIn = parseEther('10')
      const leverage = parseEther('20')
      const layer1SwapAmountOutMin = parseEther('9.5')
      const depositAmountMin = parseEther('9')
      const lzArgs = '0x'
      const tx = smartFarmingManager
        .connect(alice)
        .layer2Leverage(
          underlying,
          depositToken,
          syntheticToken,
          amountIn,
          leverage,
          layer1SwapAmountOutMin,
          depositAmountMin,
          lzArgs,
          {value: fee}
        )

      // then
      await expect(tx).revertedWithCustomError(smartFarmingManager, 'LeverageTooHigh')
    })

    it('should revert if underlying is null', async function () {
      // when
      const fee = parseEther('0.1')
      const underlying = ethers.constants.AddressZero
      const depositToken = msdVaDAI.address
      const syntheticToken = msUSD.address
      const amountIn = parseEther('10')
      const leverage = parseEther('1.5')
      const layer1SwapAmountOutMin = parseEther('9.5')
      const depositAmountMin = parseEther('9')
      const lzArgs = '0x'
      const tx = smartFarmingManager
        .connect(alice)
        .layer2Leverage(
          underlying,
          depositToken,
          syntheticToken,
          amountIn,
          leverage,
          layer1SwapAmountOutMin,
          depositAmountMin,
          lzArgs,
          {value: fee}
        )

      // then
      await expect(tx).revertedWithCustomError(smartFarmingManager, 'TokenInIsNull')
    })

    // TODO: Should we allow unhealthy position to call leverage?
    it.skip('should revert if position is unhealthy', async function () {
      // given
      await dai.connect(alice).approve(msdDAI.address, ethers.constants.MaxUint256)
      await msdDAI.connect(alice).deposit(parseEther('10'), alice.address)
      await msUsdDebtToken.connect(alice).issue(parseEther('5'), alice.address)
      await masterOracle.updatePrice(msUSD.address, parseEther('2'))
      const {_isHealthy} = await pool.debtPositionOf(alice.address)
      expect(_isHealthy).false

      // when
      const fee = parseEther('0.1')
      const underlying = dai.address
      const depositToken = msdVaDAI.address
      const syntheticToken = msUSD.address
      const amountIn = parseEther('10')
      const leverage = parseEther('1.5')
      const layer1SwapAmountOutMin = parseEther('9.5')
      const depositAmountMin = parseEther('9')
      const lzArgs = '0x'
      const tx = smartFarmingManager
        .connect(alice)
        .layer2Leverage(
          underlying,
          depositToken,
          syntheticToken,
          amountIn,
          leverage,
          layer1SwapAmountOutMin,
          depositAmountMin,
          lzArgs,
          {value: fee}
        )

      // then
      await expect(tx).revertedWithCustomError(smartFarmingManager, 'PositionIsNotHealthy')
    })

    it('should start L2 leverage flow', async function () {
      // given
      expect(await smartFarmingManager.layer2RequestId()).eq(0)

      // when
      const fee = parseEther('0.1')
      const underlying = dai.address
      const depositToken = msdVaDAI.address
      const syntheticToken = msUSD.address
      const amountIn = parseEther('10')
      const leverage = parseEther('1.5')
      const layer1SwapAmountOutMin = parseEther('9.5')
      const depositAmountMin = parseEther('9')
      const lzArgs = '0x'
      const expectedToIssue = parseEther('5')
      const tx = smartFarmingManager
        .connect(alice)
        .layer2Leverage(
          underlying,
          depositToken,
          syntheticToken,
          amountIn,
          leverage,
          layer1SwapAmountOutMin,
          depositAmountMin,
          lzArgs,
          {value: fee}
        )

      // then
      await expect(tx)
        .changeTokenBalance(dai, smartFarmingManager.address, amountIn)
        .changeTokenBalance(msUSD, proxyOFT_msUSD.address, expectedToIssue)

      const id = 1
      expect(await smartFarmingManager.layer2RequestId()).eq(id)
      const request = await smartFarmingManager.layer2Leverages(id)
      expect(request.underlying).eq(underlying)
      expect(request.depositToken).eq(depositToken)
      expect(request.syntheticToken).eq(syntheticToken)
      expect(request.depositAmountMin).eq(depositAmountMin)
      expect(request.syntheticTokenIssued).eq(expectedToIssue)
      expect(request.account).eq(alice.address)
      expect(request.finished).eq(false)
      expect(proxyOFT_msUSD.triggerLeverageSwap)
        .calledWith(id, alice.address, dai.address, expectedToIssue, layer1SwapAmountOutMin, lzArgs)
        .calledWithValue(fee)
    })
  })

  describe('layer2LeverageCallback', function () {
    const id = 1

    beforeEach(async function () {
      await dai.connect(alice).approve(smartFarmingManager.address, ethers.constants.MaxUint256)

      const fee = parseEther('0.1')
      const underlying = dai.address
      const depositToken = msdVaDAI.address
      const syntheticToken = msUSD.address
      const amountIn = parseEther('10')
      const leverage = parseEther('1.5')
      const layer1SwapAmountOutMin = parseEther('4.5')
      const depositAmountMin = parseEther('14')
      const lzArgs = '0x'
      await smartFarmingManager
        .connect(alice)
        .layer2Leverage(
          underlying,
          depositToken,
          syntheticToken,
          amountIn,
          leverage,
          layer1SwapAmountOutMin,
          depositAmountMin,
          lzArgs,
          {value: fee}
        )

      expect(await smartFarmingManager.layer2RequestId()).eq(id)

      await dai.mint(proxyOFT_msUSD.address, parseEther('10000'))
      await dai.connect(proxyOFT_msUSD.wallet).approve(smartFarmingManager.address, ethers.constants.MaxUint256)
    })

    it('should revert if caller is not a proxyOFT', async function () {
      // given
      const fakeOFT = await smock.fake('Layer2ProxyOFT')
      fakeOFT.token.returns(msUSD.address)
      await setBalance(fakeOFT.address, parseEther('10'))

      // when
      const tx = smartFarmingManager.connect(fakeOFT.wallet).layer2LeverageCallback(id, parseEther('10'))

      // then
      await expect(tx).revertedWithCustomError(smartFarmingManager, 'SenderIsNotProxyOFT')
    })

    it('should revert if shutdown', async function () {
      // given
      await pool.shutdown()

      // when
      const tx = smartFarmingManager.connect(proxyOFT_msUSD.wallet).layer2LeverageCallback(id, parseEther('10'))

      // then
      await expect(tx).revertedWithCustomError(msdVaDAI, 'IsPaused')
    })

    it('should revert if caller is not the same proxyOFT as request', async function () {
      // when
      const tx = smartFarmingManager.connect(proxyOFT_msETH.wallet).layer2LeverageCallback(id, parseEther('10'))

      // then
      await expect(tx).revertedWithCustomError(smartFarmingManager, 'SenderIsNotProxyOFT')
    })

    it('should revert if request does not exist', async function () {
      // given
      const invalidId = 2

      // when
      const tx = smartFarmingManager.connect(proxyOFT_msUSD.wallet).layer2LeverageCallback(invalidId, parseEther('10'))

      // then
      await expect(tx).revertedWithCustomError(smartFarmingManager, 'Layer2RequestInvalidKey')
    })

    it('should revert if request already finished', async function () {
      // given
      const swapAmountOut = parseEther('10')
      await smartFarmingManager.connect(proxyOFT_msUSD.wallet).layer2LeverageCallback(id, swapAmountOut)

      // when
      const tx = smartFarmingManager.connect(proxyOFT_msUSD.wallet).layer2LeverageCallback(id, swapAmountOut)

      // then
      await expect(tx).revertedWithCustomError(smartFarmingManager, 'Layer2RequestCompletedAlready')
    })

    it('should revert if swapAmountOut slippage is too high', async function () {
      // given
      const {depositAmountMin, underlyingAmountIn} = await smartFarmingManager.layer2Leverages(id)

      // when
      const swapAmountOut = depositAmountMin.sub(underlyingAmountIn).sub('1')
      const tx = smartFarmingManager.connect(proxyOFT_msUSD.wallet).layer2LeverageCallback(id, swapAmountOut)

      // then
      await expect(tx).revertedWithCustomError(smartFarmingManager, 'LeverageSlippageTooHigh')
    })

    it('should revert if position end up unhealthy', async function () {
      // given
      await masterOracle.updatePrice(msUSD.address, parseEther('2'))

      // when
      const swapAmountOut = parseEther('4.1')
      const tx = smartFarmingManager.connect(proxyOFT_msUSD.wallet).layer2LeverageCallback(id, swapAmountOut)

      // then
      await expect(tx).revertedWithCustomError(smartFarmingManager, 'PositionIsNotHealthy')
    })

    it('should finish L2 leverage flow', async function () {
      // given
      const {syntheticTokenIssued} = await smartFarmingManager.layer2Leverages(id)

      // when
      const swapAmountOut = parseEther('4.1')
      const tx = smartFarmingManager.connect(proxyOFT_msUSD.wallet).layer2LeverageCallback(id, swapAmountOut)

      // then
      await expect(tx)
        .changeTokenBalance(dai, proxyOFT_msUSD.address, swapAmountOut.mul('-1'))
        .changeTokenBalance(msUsdDebtToken, alice.address, syntheticTokenIssued)
      const {finished} = await smartFarmingManager.layer2Leverages(id)
      expect(finished).true
    })
  })

  describe('retryLayer2FlashRepayCallback', function () {
    const id = 1
    const newRepayAmountMin = 1
    const srcChainId = 101
    const srcAddress = '0x0000000000000000000000000000000000000001'
    const nonce = 123
    const amount = parseEther('1')
    const payload = '0x'

    beforeEach(async function () {
      // Create position
      const amountIn = parseUnits('100', 18)
      const leverage = parseEther('1.5')
      await smartFarmingManager
        .connect(alice)
        .leverage(vaDAI.address, msdVaDAI.address, msUSD.address, amountIn, leverage, 0)

      // Start flash repay
      const fee = parseEther('0.1')
      const syntheticToken = msUSD.address
      const withdrawAmount = parseEther('10')
      const underlyingAmountMin = parseEther('10')
      const layer1SwapAmountOutMin = parseEther('9.5')
      const repayAmountMin = parseEther('9')
      const lzArgs = '0x'
      await smartFarmingManager
        .connect(alice)
        .layer2FlashRepay(
          syntheticToken,
          msdVaDAI.address,
          withdrawAmount,
          dai.address,
          underlyingAmountMin,
          layer1SwapAmountOutMin,
          repayAmountMin,
          lzArgs,
          {value: fee}
        )

      expect(await smartFarmingManager.layer2RequestId()).eq(id)

      await dai.mint(proxyOFT_msUSD.address, parseEther('10000'))
      await dai.connect(proxyOFT_msUSD.wallet).approve(smartFarmingManager.address, ethers.constants.MaxUint256)
      await dai.connect(proxyOFT_msUSD.wallet).approve(msdDAI.address, ethers.constants.MaxUint256)

      await msdDAI.connect(proxyOFT_msUSD.wallet).deposit(parseEther('2000'), proxyOFT_msUSD.address)
      await msUsdDebtToken.connect(proxyOFT_msUSD.wallet).issue(parseEther('1000'), proxyOFT_msUSD.address)
      await msUSD.connect(proxyOFT_msUSD.wallet).approve(smartFarmingManager.address, ethers.constants.MaxUint256)
    })

    it('should revert if request does not exist', async function () {
      // given
      const invalidId = 2

      // when
      const tx = smartFarmingManager.retryLayer2FlashRepayCallback(
        invalidId,
        newRepayAmountMin,
        srcChainId,
        srcAddress,
        nonce,
        amount,
        payload
      )

      // then
      await expect(tx).revertedWithCustomError(smartFarmingManager, 'Layer2RequestInvalidKey')
    })

    it('should revert if caller is not the correct account', async function () {
      // when
      const tx = smartFarmingManager
        .connect(bob)
        .retryLayer2FlashRepayCallback(id, newRepayAmountMin, srcChainId, srcAddress, nonce, amount, payload)

      // then
      await expect(tx).revertedWithCustomError(smartFarmingManager, 'SenderIsNotAccount')
    })

    it('should revert if request already finished', async function () {
      // given
      const swapAmountOut = parseEther('10')
      await smartFarmingManager.connect(proxyOFT_msUSD.wallet).layer2FlashRepayCallback(id, swapAmountOut)
      const {finished} = await smartFarmingManager.layer2FlashRepays(id)
      expect(finished).true

      // when
      const tx = smartFarmingManager
        .connect(alice)
        .retryLayer2FlashRepayCallback(id, newRepayAmountMin, srcChainId, srcAddress, nonce, amount, payload)

      // then
      await expect(tx).revertedWithCustomError(smartFarmingManager, 'Layer2RequestCompletedAlready')
    })

    it('should update repayAmountMin and retry', async function () {
      // given
      const {repayAmountMin: before} = await smartFarmingManager.layer2FlashRepays(id)
      const from = '0x0000000000000000000000000000000000000002'
      proxyOFT_msUSD.getProxyOFTOf.returns(from)

      // when
      await smartFarmingManager
        .connect(alice)
        .retryLayer2FlashRepayCallback(id, newRepayAmountMin, srcChainId, srcAddress, nonce, amount, payload)

      // then
      const {repayAmountMin: after} = await smartFarmingManager.layer2FlashRepays(id)
      expect(after).not.eq(before)
      expect(proxyOFT_msUSD.retryOFTReceived).calledWith(
        srcChainId,
        srcAddress,
        nonce,
        from,
        proxyOFT_msUSD.address,
        amount,
        payload
      )
    })
  })

  describe('retryLayer2LeverageCallback', function () {
    const id = 1
    const newDepositAmountMin = 1
    const srcChainId = 101
    const srcAddress = '0x0000000000000000000000000000000000000001'
    const nonce = 123

    beforeEach(async function () {
      await dai.connect(alice).approve(smartFarmingManager.address, ethers.constants.MaxUint256)

      const fee = parseEther('0.1')
      const underlying = dai.address
      const depositToken = msdVaDAI.address
      const syntheticToken = msUSD.address
      const amountIn = parseEther('10')
      const leverage = parseEther('1.5')
      const layer1SwapAmountOutMin = parseEther('4.5')
      const depositAmountMin = parseEther('14')
      const lzArgs = '0x'
      await smartFarmingManager
        .connect(alice)
        .layer2Leverage(
          underlying,
          depositToken,
          syntheticToken,
          amountIn,
          leverage,
          layer1SwapAmountOutMin,
          depositAmountMin,
          lzArgs,
          {value: fee}
        )

      expect(await smartFarmingManager.layer2RequestId()).eq(id)

      await dai.mint(proxyOFT_msUSD.address, parseEther('10000'))
      await dai.connect(proxyOFT_msUSD.wallet).approve(smartFarmingManager.address, ethers.constants.MaxUint256)
    })

    it('should revert if request does not exist', async function () {
      // given
      const invalidId = 2

      // when
      const tx = smartFarmingManager.retryLayer2LeverageCallback(
        invalidId,
        newDepositAmountMin,
        srcChainId,
        srcAddress,
        nonce
      )

      // then
      await expect(tx).revertedWithCustomError(smartFarmingManager, 'Layer2RequestInvalidKey')
    })

    it('should revert if caller is not the correct account', async function () {
      // when
      const tx = smartFarmingManager
        .connect(bob)
        .retryLayer2LeverageCallback(id, newDepositAmountMin, srcChainId, srcAddress, nonce)

      // then
      await expect(tx).revertedWithCustomError(smartFarmingManager, 'SenderIsNotAccount')
    })

    it('should revert if request already finished', async function () {
      // given
      const swapAmountOut = parseEther('10')
      await smartFarmingManager.connect(proxyOFT_msUSD.wallet).layer2LeverageCallback(id, swapAmountOut)
      const {finished} = await smartFarmingManager.layer2Leverages(id)
      expect(finished).true

      // when
      const tx = smartFarmingManager
        .connect(alice)
        .retryLayer2LeverageCallback(id, newDepositAmountMin, srcChainId, srcAddress, nonce)

      // then
      await expect(tx).revertedWithCustomError(smartFarmingManager, 'Layer2RequestCompletedAlready')
    })

    it('should update depositAmountMin and retry', async function () {
      // given
      const stargateRouter = await smock.fake('IStargateRouter')
      poolRegistryMock.stargateRouter.returns(stargateRouter.address)
      const {depositAmountMin: before} = await smartFarmingManager.layer2Leverages(id)

      // when
      await smartFarmingManager
        .connect(alice)
        .retryLayer2LeverageCallback(id, newDepositAmountMin, srcChainId, srcAddress, nonce)

      // then
      const {depositAmountMin: after} = await smartFarmingManager.layer2Leverages(id)
      expect(after).not.eq(before)
      expect(stargateRouter.clearCachedSwap).calledWith(srcChainId, srcAddress, nonce)
    })
  })
})
