/* eslint-disable new-cap */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import {parseEther} from '@ethersproject/units'
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {loadFixture} from '@nomicfoundation/hardhat-network-helpers'
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
} from '../typechain'
import {FakeContract, smock} from '@defi-wonderland/smock'
import {toUSD} from '../helpers'

chai.use(smock.matchers)

const {MaxUint256} = ethers.constants
const {parseUnits} = ethers.utils

const liquidatorIncentive = parseEther('0.1') // 10%
const metCF = parseEther('0.67') // 67%
const daiCF = parseEther('0.5') // 50%
const vaDaiCF = parseEther('0.6') // 60%
const metPrice = toUSD('4') // 1 MET = $4
const daiPrice = toUSD('1') // 1 DAI = $1
const msUsdPrice = toUSD('1')
const interestRate = parseEther('0')

describe('SmartFarmingManager', function () {
  let deployer: SignerWithAddress
  let alice: SignerWithAddress
  let liquidator: SignerWithAddress
  let feeCollector: SignerWithAddress
  let swapper: SwapperMock
  let met: ERC20Mock
  let dai: ERC20Mock
  let vaDAI: VPoolMock
  let msUsdDebtToken: DebtToken
  let msUSD: SyntheticToken
  let treasury: Treasury
  let msdMET: DepositToken
  let msdDAI: DepositToken
  let msdVaDAI: DepositToken
  let masterOracle: MasterOracleMock
  let smartFarmingManager: SmartFarmingManager
  let pool: Pool
  let poolRegistryMock: FakeContract
  let feeProvider: FeeProvider

  async function fixture() {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[deployer, alice, , liquidator, feeCollector] = await ethers.getSigners()
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

    const syntheticTokenFactory = await ethers.getContractFactory('SyntheticToken', deployer)

    msUSD = await syntheticTokenFactory.deploy()
    await msUSD.deployed()

    const feeProviderFactory = await ethers.getContractFactory('FeeProvider', deployer)
    feeProvider = await feeProviderFactory.deploy()
    await feeProvider.deployed()

    const poolFactory = await ethers.getContractFactory('contracts/Pool.sol:Pool', deployer)
    pool = await poolFactory.deploy()
    await pool.deployed()

    const smartFarmingManagerFactory = await ethers.getContractFactory('SmartFarmingManager', deployer)
    smartFarmingManager = await smartFarmingManagerFactory.deploy()
    await smartFarmingManager.deployed()

    poolRegistryMock = await smock.fake('PoolRegistry')
    poolRegistryMock.governor.returns(deployer.address)
    poolRegistryMock.isPoolRegistered.returns((address: string) => address == pool.address)
    poolRegistryMock.masterOracle.returns(masterOracle.address)
    poolRegistryMock.feeCollector.returns(feeCollector.address)
    poolRegistryMock.swapper.returns(swapper.address)

    const esMET = await smock.fake('IESMET')

    // Deployment tasks
    await msdMET.initialize(met.address, pool.address, 'Metronome Synth WETH-Deposit', 'msdMET', 18, metCF, MaxUint256)
    await msdDAI.initialize(dai.address, pool.address, 'Metronome Synth DAI-Deposit', 'msdDAI', 18, daiCF, MaxUint256)
    await msdVaDAI.initialize(
      vaDAI.address,
      pool.address,
      'Metronome Synth vaDAI-Deposit',
      'msdVaDAI',
      18,
      vaDaiCF,
      MaxUint256
    )
    await treasury.initialize(pool.address)

    await msUSD.initialize('Metronome Synth USD', 'msUSD', 18, poolRegistryMock.address)
    await msUsdDebtToken.initialize('msUSD Debt', 'msUSD-Debt', pool.address, msUSD.address, interestRate, MaxUint256)
    await feeProvider.initialize(poolRegistryMock.address, esMET.address)

    await smartFarmingManager.initialize(pool.address)

    await pool.initialize(poolRegistryMock.address)
    await pool.updateMaxLiquidable(parseEther('1')) // 100%
    await pool.updateTreasury(treasury.address)
    await pool.updateSmartFarmingManager(smartFarmingManager.address)
    await pool.updateFeeProvider(feeProvider.address)
    const liquidationFees = await feeProvider.liquidationFees()
    expect(liquidationFees.liquidatorIncentive).eq(liquidatorIncentive)
    await pool.addDepositToken(msdMET.address)
    await pool.addDepositToken(msdDAI.address)

    // mint some collaterals to users
    await met.mint(alice.address, parseEther(`${1e6}`))
    await met.mint(liquidator.address, parseEther(`${1e6}`))
    await dai.mint(alice.address, parseEther(`${1e6}`))
    await vaDAI.mint(alice.address, parseEther(`${1e6}`))

    // initialize mocked oracle
    await masterOracle.updatePrice(dai.address, daiPrice)
    await masterOracle.updatePrice(met.address, metPrice)
    await masterOracle.updatePrice(vaDAI.address, daiPrice)
    await masterOracle.updatePrice(msUSD.address, msUsdPrice)
  }

  beforeEach(async function () {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[deployer, alice, liquidator] = await ethers.getSigners()
    await loadFixture(fixture)
  })

  describe('leverage', function () {
    beforeEach(async function () {
      await dai.mint(swapper.address, parseEther(`${1e6}`))
      await vaDAI.mint(swapper.address, parseEther(`${1e6}`))
      await met.mint(swapper.address, parseEther(`${1e6}`))
      await pool.connect(deployer).addDepositToken(msdVaDAI.address)
      await pool.connect(deployer).addDebtToken(msUsdDebtToken.address)

      // given
      expect(await feeProvider.issueFee()).eq(0)
      expect(await feeProvider.depositFee()).eq(0)
      const {_debtInUsd, _depositInUsd} = await pool.debtPositionOf(alice.address)
      expect(_debtInUsd).eq(0)
      expect(_depositInUsd).eq(0)
      await vaDAI.connect(alice).approve(smartFarmingManager.address, MaxUint256)
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
      expect(maxLeverage).eq(parseEther('2.5'))
      const damper = parseEther('0.05')
      const leverage = maxLeverage.sub(damper) // -5% to cover fees + slippage
      await smartFarmingManager
        .connect(alice)
        .leverage(vaDAI.address, msdVaDAI.address, msUSD.address, amountIn, leverage, 0)

      // then
      const {_debtInUsd, _depositInUsd} = await pool.debtPositionOf(alice.address)
      expect(_depositInUsd).closeTo(parseEther('250'), parseEther('10')) // ~$250
      expect(_debtInUsd).closeTo(parseEther('150'), parseEther('10')) // ~$150
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
  })
})
