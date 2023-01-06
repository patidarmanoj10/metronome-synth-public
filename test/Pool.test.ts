/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable camelcase */
import {BigNumber} from '@ethersproject/bignumber'
import {parseEther} from '@ethersproject/units'
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {loadFixture} from '@nomicfoundation/hardhat-network-helpers'
import chai, {expect} from 'chai'
import {ethers} from 'hardhat'
import {
  DepositToken,
  DepositToken__factory,
  ERC20Mock,
  ERC20Mock__factory,
  MasterOracleMock,
  MasterOracleMock__factory,
  SyntheticToken,
  SyntheticToken__factory,
  Treasury,
  Treasury__factory,
  Pool__factory,
  Pool,
  DebtToken,
  DebtToken__factory,
  SwapperMock,
  SwapperMock__factory,
  VPoolMock,
  VPoolMock__factory,
  FeeProvider__factory,
  FeeProvider,
} from '../typechain'
import {getMinLiquidationAmountInUsd} from './helpers'
import {setBalance} from '@nomicfoundation/hardhat-network-helpers'
import {FakeContract, smock} from '@defi-wonderland/smock'
import {toUSD} from '../helpers'

chai.use(smock.matchers)

const {MaxUint256} = ethers.constants
const {parseUnits} = ethers.utils

const liquidatorIncentive = parseEther('0.1') // 10%
const metCF = parseEther('0.67') // 67%
const daiCF = parseEther('0.5') // 50%
const vaDaiCF = parseEther('0.6') // 60%
const ethPrice = toUSD('4000') // 1 ETH = $4,000
const metPrice = toUSD('4') // 1 MET = $4
const daiPrice = toUSD('1') // 1 DAI = $1
const dogePrice = toUSD('0.4') // 1 DOGE = $0.4
const msUsdPrice = toUSD('1')
const interestRate = parseEther('0')

describe('Pool', function () {
  let deployer: SignerWithAddress
  let alice: SignerWithAddress
  let bob: SignerWithAddress
  let liquidator: SignerWithAddress
  let feeCollector: SignerWithAddress
  let swapper: SwapperMock
  let met: ERC20Mock
  let dai: ERC20Mock
  let vaDAI: VPoolMock
  let msEthDebtToken: DebtToken
  let msDogeDebtToken: DebtToken
  let msUsdDebtToken: DebtToken
  let msEth: SyntheticToken
  let msDoge: SyntheticToken
  let msUSD: SyntheticToken
  let treasury: Treasury
  let msdMET: DepositToken
  let msdDAI: DepositToken
  let msdVaDAI: DepositToken
  let masterOracle: MasterOracleMock
  let pool: Pool
  let poolRegistryMock: FakeContract
  let feeProvider: FeeProvider

  async function fixture() {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[deployer, alice, , liquidator, feeCollector] = await ethers.getSigners()
    const masterOracleMockFactory = new MasterOracleMock__factory(deployer)
    masterOracle = await masterOracleMockFactory.deploy()
    await masterOracle.deployed()

    const swapperMockFactory = new SwapperMock__factory(deployer)
    swapper = await swapperMockFactory.deploy()
    await swapper.deployed()

    const erc20MockFactory = new ERC20Mock__factory(deployer)
    const vPoolMockFactory = new VPoolMock__factory(deployer)

    met = await erc20MockFactory.deploy('Metronome', 'MET', 18)
    await met.deployed()

    dai = await erc20MockFactory.deploy('Dai Stablecoin', 'DAI', 18)
    await dai.deployed()

    vaDAI = await vPoolMockFactory.deploy('Vesper Pool Dai', 'vaDAI', dai.address)
    await vaDAI.deployed()

    const treasuryFactory = new Treasury__factory(deployer)
    treasury = await treasuryFactory.deploy()
    await treasury.deployed()

    const depositTokenFactory = new DepositToken__factory(deployer)
    msdMET = await depositTokenFactory.deploy()
    await msdMET.deployed()

    msdDAI = await depositTokenFactory.deploy()
    await msdDAI.deployed()

    msdVaDAI = await depositTokenFactory.deploy()
    await msdVaDAI.deployed()

    const debtTokenFactory = new DebtToken__factory(deployer)

    msEthDebtToken = await debtTokenFactory.deploy()
    await msEthDebtToken.deployed()

    msDogeDebtToken = await debtTokenFactory.deploy()
    await msDogeDebtToken.deployed()

    msUsdDebtToken = await debtTokenFactory.deploy()
    await msUsdDebtToken.deployed()

    const syntheticTokenFactory = new SyntheticToken__factory(deployer)

    msEth = await syntheticTokenFactory.deploy()
    await msEth.deployed()

    msDoge = await syntheticTokenFactory.deploy()
    await msDoge.deployed()

    msUSD = await syntheticTokenFactory.deploy()
    await msUSD.deployed()

    const feeProviderFactory = new FeeProvider__factory(deployer)
    feeProvider = await feeProviderFactory.deploy()
    await feeProvider.deployed()

    const poolFactory = new Pool__factory(deployer)
    pool = await poolFactory.deploy()
    await pool.deployed()

    poolRegistryMock = await smock.fake('PoolRegistry')
    poolRegistryMock.governor.returns(deployer.address)
    poolRegistryMock.isPoolRegistered.returns((address: string) => address == pool.address)
    poolRegistryMock.masterOracle.returns(masterOracle.address)
    poolRegistryMock.feeCollector.returns(feeCollector.address)

    // const esMET = await smock.fake('IESMET')

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
    await msEth.initialize('Metronome Synth ETH', 'msETH', 18, poolRegistryMock.address)
    await msEthDebtToken.initialize('msETH Debt', 'msETH-Debt', pool.address, msEth.address, interestRate, MaxUint256)
    await msDoge.initialize('Metronome Synth DOGE', 'msDOGE', 18, poolRegistryMock.address)
    await msDogeDebtToken.initialize(
      'msDOGE Debt',
      'msDOGE-Debt',
      pool.address,
      msDoge.address,
      interestRate,
      MaxUint256
    )
    await msUSD.initialize('Metronome Synth USD', 'msUSD', 18, poolRegistryMock.address)
    await msUsdDebtToken.initialize('msUSD Debt', 'msUSD-Debt', pool.address, msUSD.address, interestRate, MaxUint256)
    // await feeProvider.initialize(poolRegistryMock.address, esMET.address)
    await feeProvider.initialize()

    await pool.initialize(poolRegistryMock.address)
    await pool.updateMaxLiquidable(parseEther('1')) // 100%
    await pool.updateTreasury(treasury.address)
    await pool.updateSwapper(swapper.address)
    await pool.updateFeeProvider(feeProvider.address)
    const liquidationFees = await feeProvider.liquidationFees()
    expect(liquidationFees.liquidatorIncentive).eq(liquidatorIncentive)
    await pool.addDepositToken(msdMET.address)
    await pool.addDebtToken(msEthDebtToken.address)
    await pool.addDepositToken(msdDAI.address)
    await pool.addDebtToken(msDogeDebtToken.address)

    // mint some collaterals to users
    await met.mint(alice.address, parseEther(`${1e6}`))
    await met.mint(liquidator.address, parseEther(`${1e6}`))
    await dai.mint(alice.address, parseEther(`${1e6}`))
    await vaDAI.mint(alice.address, parseEther(`${1e6}`))

    // initialize mocked oracle
    await masterOracle.updatePrice(dai.address, daiPrice)
    await masterOracle.updatePrice(met.address, metPrice)
    await masterOracle.updatePrice(vaDAI.address, daiPrice)
    await masterOracle.updatePrice(msEth.address, ethPrice)
    await masterOracle.updatePrice(msDoge.address, dogePrice)
    await masterOracle.updatePrice(msUSD.address, msUsdPrice)
  }

  beforeEach(async function () {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[deployer, alice, bob, liquidator] = await ethers.getSigners()
    await loadFixture(fixture)
  })

  describe('leverage', function () {
    beforeEach(async function () {
      await dai.mint(swapper.address, parseEther(`${1e6}`))
      await pool.connect(deployer).addDepositToken(msdVaDAI.address)
      await pool.connect(deployer).addDebtToken(msUsdDebtToken.address)

      // given
      expect(await feeProvider.issueFee()).eq(0)
      expect(await feeProvider.depositFee()).eq(0)
      const {_debtInUsd, _depositInUsd} = await pool.debtPositionOf(alice.address)
      expect(_debtInUsd).eq(0)
      expect(_depositInUsd).eq(0)
      await vaDAI.connect(alice).approve(pool.address, MaxUint256)
    })

    it('should revert if X it too low', async function () {
      // when
      const amountIn = parseUnits('100', 18)
      const leverage = parseEther('1').sub('1')
      const tx = pool.connect(alice).leverage(msdVaDAI.address, msUSD.address, amountIn, leverage, 0, 1)

      // then
      await expect(tx).revertedWithCustomError(pool, 'LeverageTooLow')
    })

    it('should revert if X it too high', async function () {
      // when
      const amountIn = parseUnits('100', 18)
      const cf = await msdVaDAI.collateralFactor()
      const maxLeverage = parseEther('1').mul(parseEther('1')).div(parseEther('1').sub(cf))
      const leverage = maxLeverage.add('1')
      const tx = pool.connect(alice).leverage(msdVaDAI.address, msUSD.address, amountIn, leverage, 0, 1)

      // then
      await expect(tx).revertedWithCustomError(pool, 'LeverageTooHigh')
    })

    it('should revert if slippage is too high', async function () {
      // given
      await swapper.updateRate(parseEther('0.9')) // 10% slippage

      // when
      const amountIn = parseUnits('100', 18)
      const leverage = parseEther('1.5')
      const depositAmountMin = parseEther('147.5') // 5% slippage (100 + 50*0.95)
      const tx = pool.connect(alice).leverage(msdVaDAI.address, msUSD.address, amountIn, leverage, depositAmountMin, 1)

      // then
      await expect(tx).revertedWithCustomError(pool, 'LeverageSlippageTooHigh')
    })

    it('should revert if outcome position is not healthy', async function () {
      // given
      await swapper.updateRate(parseEther('0.9')) // 10% slippage

      // when
      const amountIn = parseUnits('100', 18)
      const cf = await msdVaDAI.collateralFactor()
      const maxLeverage = parseEther('1').mul(parseEther('1')).div(parseEther('1').sub(cf))
      const tx = pool.connect(alice).leverage(msdVaDAI.address, msUSD.address, amountIn, maxLeverage, 0, 1)

      // then
      await expect(tx).revertedWithCustomError(pool, 'PositionIsNotHealthy')
    })

    it('should revert if outcome position is too close to min leverage making swap return 0', async function () {
      // when
      const amountIn = parseUnits('100', 18)
      const minLeverage = parseEther('1').add('1')
      const tx = pool.connect(alice).leverage(msdVaDAI.address, msUSD.address, amountIn, minLeverage, 0, 1)

      // then
      await expect(tx).revertedWith('amount-out-zero') // Error from DEX
    })

    it('should be able to leverage close to min', async function () {
      // when
      const amountIn = parseUnits('100', 18)
      const leverage = parseEther('1.01')
      await pool.connect(alice).leverage(msdVaDAI.address, msUSD.address, amountIn, leverage, 0, 1)

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
      await pool.connect(alice).leverage(msdVaDAI.address, msUSD.address, amountIn, leverage, 0, 1)

      // then
      const {_debtInUsd, _depositInUsd} = await pool.debtPositionOf(alice.address)
      expect(_depositInUsd).closeTo(parseEther('250'), parseEther('10')) // ~$250
      expect(_debtInUsd).closeTo(parseEther('150'), parseEther('10')) // ~$150
    })

    it('should leverage vaDAI->msUSD', async function () {
      // when
      const amountIn = parseUnits('100', 18)
      const leverage = parseEther('1.5')
      await pool.connect(alice).leverage(msdVaDAI.address, msUSD.address, amountIn, leverage, 0, 1)

      // then
      const {_debtInUsd, _depositInUsd} = await pool.debtPositionOf(alice.address)
      expect(_depositInUsd).closeTo(amountIn.mul(leverage).div(parseEther('1')), parseEther('10')) // ~$150
      // eslint-disable-next-line max-len
      expect(_debtInUsd).closeTo(amountIn.mul(leverage.sub(parseEther('1'))).div(parseEther('1')), parseEther('10')) // ~$50
    })
  })

  describe('when user deposited multi-collateral', function () {
    const metDepositAmount = parseEther('6000') // ~$24,000
    const daiDepositAmount = parseEther('24000') // ~$24,000

    beforeEach(async function () {
      await met.connect(alice).approve(msdMET.address, ethers.constants.MaxUint256)
      await dai.connect(alice).approve(msdDAI.address, ethers.constants.MaxUint256)

      await msdMET.connect(alice).deposit(metDepositAmount, alice.address)
      await msdDAI.connect(alice).deposit(daiDepositAmount, alice.address)
    })

    it('should calculate deposit correctly', async function () {
      const {_isHealthy, _depositInUsd, _debtInUsd, _issuableLimitInUsd, _issuableInUsd} = await pool.debtPositionOf(
        alice.address
      )

      const limitForMet = (await msdMET.balanceOf(alice.address)).mul(metCF).div(parseEther('1'))
      const limitForDai = (await msdDAI.balanceOf(alice.address)).mul(daiCF).div(parseEther('1'))
      const limitForMetInUsd = await masterOracle.quoteTokenToUsd(met.address, limitForMet)
      const limitForDaiInUsd = await masterOracle.quoteTokenToUsd(dai.address, limitForDai)
      const _expectedMintableLimitInUsd = limitForMetInUsd.add(limitForDaiInUsd)

      expect(_isHealthy).eq(true)
      expect(_depositInUsd).eq(toUSD('48000'))
      expect(_debtInUsd).eq(0)
      expect(_issuableLimitInUsd).eq(_expectedMintableLimitInUsd)
      expect(_issuableInUsd).eq(_issuableLimitInUsd.sub(_debtInUsd))
    })

    it('should be able to issue using position among multiple collaterals', async function () {
      const {_issuableInUsd: _issuableInUsdBefore} = await pool.debtPositionOf(alice.address)

      const amountToIssue = await masterOracle.quoteUsdToToken(msEth.address, _issuableInUsdBefore)
      await msEthDebtToken.connect(alice).issue(amountToIssue, alice.address)

      const {_isHealthy, _issuableInUsd, _depositInUsd} = await pool.debtPositionOf(alice.address)

      expect(_isHealthy).eq(true)
      expect(_depositInUsd).eq(toUSD('48000'))
      expect(_issuableInUsd).eq(0)
    })
  })

  describe('when user deposited some MET', function () {
    const userDepositAmount = parseEther('6000')

    beforeEach(async function () {
      await met.connect(alice).approve(msdMET.address, ethers.constants.MaxUint256)
      await msdMET.connect(alice).deposit(userDepositAmount, alice.address)
    })

    it('should withdraw when collateral charges transfer fee', async function () {
      // given
      const fee = parseEther('0.1') // 10%
      await met.updateFee(fee)
      const metBalanceBefore = await met.balanceOf(alice.address)
      const amountToWithdraw = await msdMET.balanceOf(alice.address)

      // when
      const amountAfterFee = amountToWithdraw.sub(amountToWithdraw.mul(fee).div(parseEther('1')))
      const tx = msdMET.connect(alice).withdraw(amountToWithdraw, alice.address)
      await expect(tx)
        .emit(msdMET, 'CollateralWithdrawn')
        .withArgs(alice.address, alice.address, amountToWithdraw, amountToWithdraw, 0)

      // then
      expect(await met.balanceOf(alice.address)).eq(metBalanceBefore.add(amountAfterFee))
    })

    describe('when user minted some msETH', function () {
      const userMintAmount = parseEther('1')

      beforeEach(async function () {
        await msEthDebtToken.connect(alice).issue(userMintAmount, alice.address)
      })

      describe('liquidate', function () {
        const liquidatorDepositAmount = parseEther('100000')
        const liquidatorMintAmount = parseEther('2')

        beforeEach(async function () {
          await met.connect(liquidator).approve(msdMET.address, ethers.constants.MaxUint256)
          await msdMET.connect(liquidator).deposit(liquidatorDepositAmount, liquidator.address)
          await msEthDebtToken.connect(liquidator).issue(liquidatorMintAmount, liquidator.address)
        })

        it('should revert if amount to repay == 0', async function () {
          // when
          const tx = pool.liquidate(msEth.address, alice.address, 0, msdMET.address)

          // then
          await expect(tx).revertedWithCustomError(pool, 'AmountIsZero')
        })

        it('should revert if liquidator == account', async function () {
          // when
          const tx = pool.connect(alice).liquidate(msEth.address, alice.address, 1, msdMET.address)

          // then
          await expect(tx).revertedWithCustomError(pool, 'CanNotLiquidateOwnPosition')
        })

        it('should revert if position is healthy', async function () {
          // given
          const {_isHealthy} = await pool.debtPositionOf(alice.address)
          expect(_isHealthy).true

          // when
          const tx = pool.liquidate(msEth.address, alice.address, parseEther('1'), msdMET.address)

          // then
          await expect(tx).revertedWithCustomError(pool, 'PositionIsHealthy')
        })

        describe('when the position is unhealthy (collateral:debt >= 1)', function () {
          const newMetPrice = toUSD('0.95')

          beforeEach(async function () {
            await masterOracle.updatePrice(met.address, newMetPrice)

            const expectedDebtInUsd = userMintAmount.mul(ethPrice).div(parseEther('1'))
            const expectedDepositInUsd = userDepositAmount.mul(newMetPrice).div(parseEther('1'))
            const expectedMintableLimit = expectedDepositInUsd.mul(metCF).div(parseEther('1'))

            const {_isHealthy, _debtInUsd, _depositInUsd, _issuableInUsd, _issuableLimitInUsd} =
              await pool.debtPositionOf(alice.address)

            expect(_isHealthy).eq(false)
            expect(_debtInUsd).eq(expectedDebtInUsd)
            expect(_depositInUsd).eq(expectedDepositInUsd)
            expect(_issuableLimitInUsd).eq(expectedMintableLimit)
            expect(_issuableInUsd).eq(0)

            expect(await msdMET.balanceOf(alice.address)).eq(userDepositAmount)
            expect(await msEth.balanceOf(alice.address)).eq(userMintAmount)
            expect(await msEthDebtToken.balanceOf(alice.address)).eq(userMintAmount)
            expect(await msdMET.balanceOf(liquidator.address)).eq(liquidatorDepositAmount)
            expect(await msEth.balanceOf(liquidator.address)).eq(liquidatorMintAmount)
            expect(await msEthDebtToken.balanceOf(liquidator.address)).eq(liquidatorMintAmount)
          })

          it('should not revert if paused', async function () {
            // given
            await pool.pause()

            // when
            const amountToRepay = userMintAmount // repay all user's debt
            const tx = await pool
              .connect(liquidator)
              .liquidate(msEth.address, alice.address, amountToRepay, msdMET.address)

            // then
            await expect(tx).emit(pool, 'PositionLiquidated')
          })

          it('should revert if shutdown', async function () {
            // given
            await pool.shutdown()

            // when
            const amountToRepay = userMintAmount // repay all user's debt
            const tx = pool.connect(liquidator).liquidate(msEth.address, alice.address, amountToRepay, msdMET.address)

            // then
            await expect(tx).revertedWithCustomError(pool, 'IsShutdown')
          })

          it('should revert if liquidator has not enough msAsset to repay', async function () {
            // given
            const liquidatorMsEthBalanceBefore = await msEth.balanceOf(liquidator.address)
            await msEthDebtToken.connect(liquidator).repay(liquidator.address, liquidatorMsEthBalanceBefore)
            const amountToRepayInUsd = await getMinLiquidationAmountInUsd(pool, alice.address, msdMET)
            const amountToRepayInMsEth = amountToRepayInUsd.mul(parseEther('1')).div(ethPrice)
            expect(await msEth.balanceOf(liquidator.address)).lt(amountToRepayInMsEth)

            // when
            const tx = pool
              .connect(liquidator)
              .liquidate(msEth.address, alice.address, amountToRepayInMsEth, msdMET.address)

            // then
            await expect(tx).revertedWithCustomError(msEth, 'BurnAmountExceedsBalance')
          })

          it('should revert if debt amount is < amount to repay', async function () {
            // given
            const msEthDebt = await msEthDebtToken.balanceOf(alice.address)

            // when
            const amountToRepay = msEthDebt.add('1')
            const tx = pool.connect(liquidator).liquidate(msEth.address, alice.address, amountToRepay, msdMET.address)

            // then
            await expect(tx).revertedWithCustomError(pool, 'AmountGreaterThanMaxLiquidable')
          })

          describe('debt floor', function () {
            it('should revert if debt becomes < debt floor', async function () {
              // given
              await pool.updateDebtFloor(parseEther('3000')) // $3,000
              const debtBefore = await msEthDebtToken.balanceOf(alice.address)
              expect(debtBefore).eq(parseEther('1')) // $4,000

              // when
              const amountToRepay = debtBefore.div('2') // $2,0000
              const tx = pool.connect(liquidator).liquidate(msEth.address, alice.address, amountToRepay, msdMET.address)

              // then
              await expect(tx).revertedWithCustomError(pool, 'RemainingDebtIsLowerThanTheFloor')
            })

            it('should allow erase debt when debt floor set', async function () {
              // given
              await pool.updateDebtFloor(parseEther('3000')) // $3,000
              const debtBefore = await msEthDebtToken.balanceOf(alice.address)
              expect(debtBefore).eq(parseEther('1')) // $4,000

              // when
              const amountToRepay = debtBefore
              await pool.connect(liquidator).liquidate(msEth.address, alice.address, amountToRepay, msdMET.address)

              // then
              const debtAfter = await msEthDebtToken.balanceOf(alice.address)
              expect(debtAfter).eq(0)
            })
          })

          it('should revert if repaying more than max allowed to liquidate', async function () {
            // given
            const maxLiquidable = parseEther('0.5') // 50%
            await pool.updateMaxLiquidable(maxLiquidable)
            const msEthDebt = await msEthDebtToken.balanceOf(alice.address)

            // when
            const amountToRepay = msEthDebt.div('2').add('1')
            const tx = pool.connect(liquidator).liquidate(msEth.address, alice.address, amountToRepay, msdMET.address)

            // then
            await expect(tx).revertedWithCustomError(pool, 'AmountGreaterThanMaxLiquidable')
          })

          it('should liquidate by repaying all debt (protocolLiquidationFee == 0)', async function () {
            // given
            await feeProvider.updateProtocolLiquidationFee(0)
            const debtInUsdBefore = await pool.debtOf(alice.address)
            const {_depositInUsd: collateralInUsdBefore} = await pool.debtPositionOf(alice.address)

            // when
            const amountToRepay = userMintAmount // repay all user's debt
            const tx = await pool
              .connect(liquidator)
              .liquidate(msEth.address, alice.address, amountToRepay, msdMET.address)

            // then
            const [PositionLiquidated] = (await tx.wait()).events!.filter(({event}) => event === 'PositionLiquidated')
            const [, , , , depositSeized] = PositionLiquidated.args!

            const amountToSeizeInUsd = debtInUsdBefore
              .mul(parseEther('1').add(liquidatorIncentive))
              .div(parseEther('1'))
            const expectedDepositSeized = await masterOracle.quoteUsdToToken(met.address, amountToSeizeInUsd)
            const expectedDepositAfter = collateralInUsdBefore
              .sub(amountToSeizeInUsd)
              .mul(parseEther('1'))
              .div(newMetPrice)
            const {_isHealthy} = await pool.debtPositionOf(alice.address)

            expect(_isHealthy).true
            expect(depositSeized).eq(expectedDepositSeized)
            expect(await msdMET.balanceOf(alice.address)).closeTo(expectedDepositAfter, '1')
            expect(await msEth.balanceOf(alice.address)).eq(userMintAmount)
            expect(await msEthDebtToken.balanceOf(alice.address)).eq(0)
            expect(await msdMET.balanceOf(liquidator.address)).eq(liquidatorDepositAmount.add(depositSeized))
            expect(await msEth.balanceOf(liquidator.address)).eq(liquidatorMintAmount.sub(amountToRepay))
            expect(await msEthDebtToken.balanceOf(liquidator.address)).eq(liquidatorMintAmount)
          })

          it('should liquidate by repaying all debt (protocolLiquidationFee > 0)', async function () {
            // given
            const protocolLiquidationFee = parseEther('0.01') // 1%
            await feeProvider.updateProtocolLiquidationFee(protocolLiquidationFee)
            const debtInUsdBefore = await pool.debtOf(alice.address)
            const {_depositInUsd: depositInUsdBefore} = await pool.debtPositionOf(alice.address)
            const depositBefore = await masterOracle.quoteUsdToToken(met.address, depositInUsdBefore)

            // when
            const amountToRepay = userMintAmount // repay all user's debt
            const tx = await pool
              .connect(liquidator)
              .liquidate(msEth.address, alice.address, amountToRepay, msdMET.address)

            // then
            const [PositionLiquidated] = (await tx.wait()).events!.filter(({event}) => event === 'PositionLiquidated')
            const [, , , , depositSeized, fee] = PositionLiquidated.args!

            const depositToSeizeInUsd = debtInUsdBefore
              .mul(parseEther('1').add(liquidatorIncentive.add(protocolLiquidationFee)))
              .div(parseEther('1'))

            const expectedDepositToLiquidator = debtInUsdBefore
              .mul(parseEther('1').add(liquidatorIncentive))
              .div(newMetPrice)
            const expectedDepositSeized = await masterOracle.quoteUsdToToken(met.address, depositToSeizeInUsd)
            const expectedDepositAfter = depositBefore.sub(expectedDepositSeized)

            const {_isHealthy} = await pool.debtPositionOf(alice.address)

            expect(_isHealthy).true
            expect(depositSeized).eq(expectedDepositSeized)
            expect(await msdMET.balanceOf(alice.address)).eq(expectedDepositAfter)
            expect(await msdMET.balanceOf(poolRegistryMock.feeCollector())).eq(fee)
            expect(await msEth.balanceOf(alice.address)).eq(userMintAmount)
            expect(await msEthDebtToken.balanceOf(alice.address)).eq(0)
            expect(await msdMET.balanceOf(liquidator.address)).closeTo(
              liquidatorDepositAmount.add(expectedDepositToLiquidator),
              1
            )
            expect(await msEth.balanceOf(liquidator.address)).eq(liquidatorMintAmount.sub(amountToRepay))
            expect(await msEthDebtToken.balanceOf(liquidator.address)).eq(liquidatorMintAmount)
          })

          it('should liquidate by repaying > needed (protocolLiquidationFee == 0)', async function () {
            // given
            await feeProvider.updateProtocolLiquidationFee(0)
            const debtInUsdBefore = await pool.debtOf(alice.address)
            const {_depositInUsd: collateralInUsdBefore} = await pool.debtPositionOf(alice.address)
            const collateralBefore = await masterOracle.quoteUsdToToken(met.address, collateralInUsdBefore)
            const minAmountToRepayInUsd = await getMinLiquidationAmountInUsd(pool, alice.address, msdMET)

            // when
            const amountToRepayInUsd = minAmountToRepayInUsd.mul(parseEther('1.1')).div(parseEther('1')) // min + 10%
            expect(amountToRepayInUsd).lt(debtInUsdBefore) // ensure that isn't paying all debt
            const amountToRepay = amountToRepayInUsd.mul(parseEther('1')).div(ethPrice)
            const tx = await pool
              .connect(liquidator)
              .liquidate(msEth.address, alice.address, amountToRepay, msdMET.address)
            const [PositionLiquidated] = (await tx.wait()).events!.filter(({event}) => event === 'PositionLiquidated')
            const [, , , , depositSeized] = PositionLiquidated.args!
            const depositSeizedInUsd = await masterOracle.quoteTokenToUsd(met.address, depositSeized)

            // then
            const {_isHealthy: isHealthyAfter, _depositInUsd: collateralInUsdAfter} = await pool.debtPositionOf(
              alice.address
            )
            const lockedCollateralAfter = await msdMET.lockedBalanceOf(alice.address)

            expect(isHealthyAfter).true
            expect(collateralInUsdAfter).closeTo(collateralInUsdBefore.sub(depositSeizedInUsd), 1)
            expect(lockedCollateralAfter).gt(0)
            expect(await msdMET.balanceOf(alice.address)).eq(collateralBefore.sub(depositSeized))
            expect(await msEth.balanceOf(alice.address)).eq(userMintAmount)
            expect(await msEthDebtToken.balanceOf(alice.address)).eq(userMintAmount.sub(amountToRepay))
            expect(await msdMET.balanceOf(liquidator.address)).eq(liquidatorDepositAmount.add(depositSeized))
            expect(await msEth.balanceOf(liquidator.address)).eq(liquidatorMintAmount.sub(amountToRepay))
            expect(await msEthDebtToken.balanceOf(liquidator.address)).eq(liquidatorMintAmount)
          })

          it('should liquidate by repaying > needed (protocolLiquidationFee > 0)', async function () {
            // given
            const protocolLiquidationFee = parseEther('0.01') // 1%
            await feeProvider.updateProtocolLiquidationFee(protocolLiquidationFee)
            const debtInUsdBefore = await pool.debtOf(alice.address)
            const {_depositInUsd: collateralInUsdBefore} = await pool.debtPositionOf(alice.address)
            const minAmountToRepayInUsd = await getMinLiquidationAmountInUsd(pool, alice.address, msdMET)
            const collateralBefore = await masterOracle.quoteUsdToToken(met.address, collateralInUsdBefore)

            // when
            const amountToRepayInUsd = minAmountToRepayInUsd.mul(parseEther('1.1')).div(parseEther('1')) // min + 10%
            expect(amountToRepayInUsd).lt(debtInUsdBefore) // ensure that isn't paying all debt
            const amountToRepay = amountToRepayInUsd.mul(parseEther('1')).div(ethPrice)
            const tx = await pool
              .connect(liquidator)
              .liquidate(msEth.address, alice.address, amountToRepay, msdMET.address)
            const [PositionLiquidated] = (await tx.wait()).events!.filter(({event}) => event === 'PositionLiquidated')
            const [, , , , depositSeized] = PositionLiquidated.args!

            const amountToRepayInMET = await masterOracle.quote(msEth.address, met.address, amountToRepay)

            const expectedDepositToLiquidator = amountToRepayInMET
              .mul(parseEther('1').add(liquidatorIncentive))
              .div(parseEther('1'))

            // then
            const {_isHealthy: isHealthyAfter, _depositInUsd: collateralInUsdAfter} = await pool.debtPositionOf(
              alice.address
            )
            const collateralAfter = await masterOracle.quoteUsdToToken(met.address, collateralInUsdAfter)
            const lockedCollateralAfter = await msdMET.lockedBalanceOf(alice.address)

            expect(isHealthyAfter).true
            expect(collateralAfter).closeTo(collateralBefore.sub(depositSeized), 1)
            expect(lockedCollateralAfter).gt(0)
            expect(await msdMET.balanceOf(alice.address)).eq(collateralBefore.sub(depositSeized))
            expect(await msEth.balanceOf(alice.address)).eq(userMintAmount)
            expect(await msEthDebtToken.balanceOf(alice.address)).eq(userMintAmount.sub(amountToRepay))
            expect(await msdMET.balanceOf(liquidator.address)).closeTo(
              liquidatorDepositAmount.add(expectedDepositToLiquidator),
              0
            )
            expect(await msEth.balanceOf(liquidator.address)).eq(liquidatorMintAmount.sub(amountToRepay))
            expect(await msEthDebtToken.balanceOf(liquidator.address)).eq(liquidatorMintAmount)
          })

          it('should liquidate by repaying < needed (protocolLiquidationFee == 0)', async function () {
            // given
            await feeProvider.updateProtocolLiquidationFee(0)
            const {_depositInUsd: collateralInUsdBefore} = await pool.debtPositionOf(alice.address)
            const collateralBefore = await masterOracle.quoteUsdToToken(met.address, collateralInUsdBefore)

            // when
            const minAmountToRepayInUsd = await getMinLiquidationAmountInUsd(pool, alice.address, msdMET)
            const minAmountToRepay = minAmountToRepayInUsd.mul(parseEther('1')).div(ethPrice)
            const amountToRepay = minAmountToRepay.div('2')
            const tx = await pool
              .connect(liquidator)
              .liquidate(msEth.address, alice.address, amountToRepay, msdMET.address)
            const [PositionLiquidated] = (await tx.wait()).events!.filter(({event}) => event === 'PositionLiquidated')
            const [, , , , depositSeized] = PositionLiquidated.args!

            // then
            const {_isHealthy: isHealthyAfter} = await pool.debtPositionOf(alice.address)
            const collateralAfter = await msdMET.balanceOf(alice.address)
            const unlockedCollateralAfter = await msdMET.unlockedBalanceOf(alice.address)
            const lockedCollateralAfter = await msdMET.lockedBalanceOf(alice.address)

            expect(isHealthyAfter).false
            expect(collateralAfter).eq(collateralBefore.sub(depositSeized))
            expect(lockedCollateralAfter).gte(collateralAfter)
            expect(unlockedCollateralAfter).eq(0)
            expect(await msdMET.balanceOf(alice.address)).eq(collateralBefore.sub(depositSeized))
            expect(await msEth.balanceOf(alice.address)).eq(userMintAmount)
            expect(await msEthDebtToken.balanceOf(alice.address)).eq(userMintAmount.sub(amountToRepay))
            expect(await msdMET.balanceOf(liquidator.address)).eq(liquidatorDepositAmount.add(depositSeized))
            expect(await msEth.balanceOf(liquidator.address)).eq(liquidatorMintAmount.sub(amountToRepay))
            expect(await msEthDebtToken.balanceOf(liquidator.address)).eq(liquidatorMintAmount)
          })

          it('should liquidate by repaying < needed (protocolLiquidationFee > 0)', async function () {
            // given
            const protocolLiquidationFee = parseEther('0.01') // 1%
            await feeProvider.updateProtocolLiquidationFee(protocolLiquidationFee)
            const {_depositInUsd: collateralInUsdBefore} = await pool.debtPositionOf(alice.address)
            const collateralBefore = await masterOracle.quoteUsdToToken(met.address, collateralInUsdBefore)

            // when
            const amountToRepayInUsd = (await getMinLiquidationAmountInUsd(pool, alice.address, msdMET)).div('2')
            const amountToRepay = amountToRepayInUsd.mul(parseEther('1')).div(ethPrice)
            const tx = await pool
              .connect(liquidator)
              .liquidate(msEth.address, alice.address, amountToRepay, msdMET.address)
            const [PositionLiquidated] = (await tx.wait()).events!.filter(({event}) => event === 'PositionLiquidated')
            const [, , , , depositSeized] = PositionLiquidated.args!

            // then
            const {_isHealthy: isHealthyAfter} = await pool.debtPositionOf(alice.address)
            const collateralAfter = await msdMET.balanceOf(alice.address)
            const unlockedCollateralAfter = await msdMET.unlockedBalanceOf(alice.address)
            const lockedCollateralAfter = await msdMET.lockedBalanceOf(alice.address)

            const amountToRepayInMET = await masterOracle.quote(msEth.address, met.address, amountToRepay)

            const expectedDepositToLiquidator = amountToRepayInMET.add(
              amountToRepayInMET.mul(liquidatorIncentive).div(parseEther('1'))
            )

            expect(isHealthyAfter).false
            expect(collateralAfter).eq(collateralBefore.sub(depositSeized))
            expect(lockedCollateralAfter).gte(collateralAfter)
            expect(unlockedCollateralAfter).eq(0)
            expect(await msdMET.balanceOf(alice.address)).eq(collateralBefore.sub(depositSeized))
            expect(await msEth.balanceOf(alice.address)).eq(userMintAmount)
            expect(await msEthDebtToken.balanceOf(alice.address)).eq(userMintAmount.sub(amountToRepay))
            expect(await msdMET.balanceOf(liquidator.address)).eq(
              liquidatorDepositAmount.add(expectedDepositToLiquidator)
            )
            expect(await msEth.balanceOf(liquidator.address)).eq(liquidatorMintAmount.sub(amountToRepay))
            expect(await msEthDebtToken.balanceOf(liquidator.address)).eq(liquidatorMintAmount)
          })

          it('should liquidate by repaying the exact amount needed (protocolLiquidationFee == 0)', async function () {
            // given
            await feeProvider.updateProtocolLiquidationFee(0)
            const {_depositInUsd: depositInUsdBefore} = await pool.debtPositionOf(alice.address)
            const depositBefore = await masterOracle.quoteUsdToToken(met.address, depositInUsdBefore)

            // when
            const amountToRepayInUsd = await getMinLiquidationAmountInUsd(pool, alice.address, msdMET)
            const amountToRepay = amountToRepayInUsd.mul(parseEther('1')).div(ethPrice)
            const tx = await pool
              .connect(liquidator)
              .liquidate(msEth.address, alice.address, amountToRepay, msdMET.address)
            const [PositionLiquidated] = (await tx.wait()).events!.filter(({event}) => event === 'PositionLiquidated')
            const [, , , , depositSeized] = PositionLiquidated.args!

            // then
            const {_debtInUsd, _issuableLimitInUsd} = await pool.debtPositionOf(alice.address)
            const depositAfter = await msdMET.balanceOf(alice.address)
            const unlockedDepositAfter = await msdMET.unlockedBalanceOf(alice.address)
            const lockedDepositAfter = await msdMET.lockedBalanceOf(alice.address)

            // Note: The value returned by `getMinLiquidationAmountInUsd` is a few weis less than the needed
            expect(_debtInUsd).closeTo(_issuableLimitInUsd, 104)
            // expect(isHealthyAfter).true
            expect(depositAfter).eq(depositBefore.sub(depositSeized))
            expect(lockedDepositAfter).eq(depositAfter)
            expect(unlockedDepositAfter).eq(0)
            expect(await msdMET.balanceOf(alice.address)).eq(depositBefore.sub(depositSeized))
            expect(await msEth.balanceOf(alice.address)).eq(userMintAmount)
            expect(await msEthDebtToken.balanceOf(alice.address)).eq(userMintAmount.sub(amountToRepay))
            expect(await msdMET.balanceOf(liquidator.address)).eq(liquidatorDepositAmount.add(depositSeized))
            expect(await msEth.balanceOf(liquidator.address)).eq(liquidatorMintAmount.sub(amountToRepay))
            expect(await msEthDebtToken.balanceOf(liquidator.address)).eq(liquidatorMintAmount)
          })

          it('should liquidate by repaying the exact amount needed (protocolLiquidationFee > 0)', async function () {
            // given
            const protocolLiquidationFee = parseEther('0.01') // 1%
            await feeProvider.updateProtocolLiquidationFee(protocolLiquidationFee)
            const {_depositInUsd: depositBeforeInUsd} = await pool.debtPositionOf(alice.address)
            const depositBefore = await masterOracle.quoteUsdToToken(met.address, depositBeforeInUsd)

            // when
            const amountToRepayInUsd = await getMinLiquidationAmountInUsd(pool, alice.address, msdMET)
            const amountToRepay = await masterOracle.quoteUsdToToken(msEth.address, amountToRepayInUsd)

            const tx = await pool
              .connect(liquidator)
              .liquidate(msEth.address, alice.address, amountToRepay, msdMET.address)
            const [PositionLiquidated] = (await tx.wait()).events!.filter(({event}) => event === 'PositionLiquidated')
            const [, , , , depositSeized] = PositionLiquidated.args!

            // then
            const {_debtInUsd, _issuableLimitInUsd} = await pool.debtPositionOf(alice.address)
            const depositAfter = await msdMET.balanceOf(alice.address)
            const unlockedDepositAfter = await msdMET.unlockedBalanceOf(alice.address)
            const lockedDepositAfter = await msdMET.lockedBalanceOf(alice.address)

            const amountToRepayInMET = await masterOracle.quote(msEth.address, met.address, amountToRepay)

            const expectedDepositToLiquidator = amountToRepayInMET.add(
              amountToRepayInMET.mul(liquidatorIncentive).div(parseEther('1'))
            )

            // Note: The value returned by `getMinLiquidationAmountInUsd` is a few weis less than the needed
            expect(_debtInUsd).closeTo(_issuableLimitInUsd, 768)
            // expect(isHealthyAfter).true
            expect(depositAfter).eq(depositBefore.sub(depositSeized))
            expect(lockedDepositAfter).eq(depositAfter)
            expect(unlockedDepositAfter).eq(0)
            expect(await msdMET.balanceOf(alice.address)).eq(depositBefore.sub(depositSeized))
            expect(await msEth.balanceOf(alice.address)).eq(userMintAmount)
            expect(await msEthDebtToken.balanceOf(alice.address)).eq(userMintAmount.sub(amountToRepay))
            expect(await msdMET.balanceOf(liquidator.address)).closeTo(
              liquidatorDepositAmount.add(expectedDepositToLiquidator),
              1
            )
            expect(await msEth.balanceOf(liquidator.address)).eq(liquidatorMintAmount.sub(amountToRepay))
            expect(await msEthDebtToken.balanceOf(liquidator.address)).eq(liquidatorMintAmount)
          })
        })

        describe('when the position is unhealthy (collateral:debt < 1)', function () {
          const newMetPrice = toUSD('0.50')

          beforeEach(async function () {
            await masterOracle.updatePrice(met.address, newMetPrice)
            const _debtInUsd = await pool.debtOf(alice.address)
            const {_depositInUsd} = await pool.debtPositionOf(alice.address)
            expect(_debtInUsd).gt(_depositInUsd)
          })

          it('should revert if paying more than needed to seize all deposit', async function () {
            const amountToRepay = await msEthDebtToken.balanceOf(alice.address)
            const tx = pool.connect(liquidator).liquidate(msEth.address, alice.address, amountToRepay, msdMET.address)

            // then
            await expect(tx).revertedWithCustomError(pool, 'AmountIsTooHight')
          })

          it('should liquidate by repaying max possible amount (liquidateFee == 0)', async function () {
            // given
            await feeProvider.updateProtocolLiquidationFee(0)
            const depositBefore = await msdMET.balanceOf(alice.address)

            // when
            const amountToRepay = await pool.quoteLiquidateMax(msEth.address, alice.address, msdMET.address)

            const tx = await pool
              .connect(liquidator)
              .liquidate(msEth.address, alice.address, amountToRepay, msdMET.address)

            // then
            const [PositionLiquidated] = (await tx.wait()).events!.filter(({event}) => event === 'PositionLiquidated')
            const [, , , , depositSeized] = PositionLiquidated.args!

            const {_isHealthy} = await pool.debtPositionOf(alice.address)

            const remainder = 1600 // left over amount on user's deposit balance

            expect(_isHealthy).false
            expect(depositSeized).closeTo(depositBefore, remainder)
            expect(await msdMET.balanceOf(alice.address)).closeTo(BigNumber.from('0'), remainder)
            expect(await msEth.balanceOf(alice.address)).eq(userMintAmount)
            expect(await msEthDebtToken.balanceOf(alice.address)).gt(0)
            expect(await msdMET.balanceOf(liquidator.address)).eq(liquidatorDepositAmount.add(depositSeized))
            expect(await msEth.balanceOf(liquidator.address)).eq(liquidatorMintAmount.sub(amountToRepay))
            expect(await msEthDebtToken.balanceOf(liquidator.address)).eq(liquidatorMintAmount)
          })

          it('should liquidate by repaying max possible amount (liquidateFee > 0)', async function () {
            // given
            const protocolLiquidationFee = parseEther('0.01') // 1%
            await feeProvider.updateProtocolLiquidationFee(protocolLiquidationFee)
            const depositBefore = await msdMET.balanceOf(alice.address)

            // when
            const amountToRepay = await pool.quoteLiquidateMax(msEth.address, alice.address, msdMET.address)

            const tx = await pool
              .connect(liquidator)
              .liquidate(msEth.address, alice.address, amountToRepay, msdMET.address)

            // then
            const [PositionLiquidated] = (await tx.wait()).events!.filter(({event}) => event === 'PositionLiquidated')
            const [, , , , depositSeized, fee] = PositionLiquidated.args!

            const {_totalToSeize, _fee} = await pool.quoteLiquidateOut(msEth.address, amountToRepay, msdMET.address)
            expect(_totalToSeize).eq(depositSeized)
            expect(_fee).eq(fee)

            const {_amountToRepay, _fee: _fee2} = await pool.quoteLiquidateIn(
              msEth.address,
              _totalToSeize,
              msdMET.address
            )

            expect(_amountToRepay).eq(amountToRepay)
            expect(_fee2).eq(fee)

            const amountToRepayInMET = await masterOracle.quote(msEth.address, met.address, amountToRepay)

            const expectedDepositToLiquidator = amountToRepayInMET.add(
              amountToRepayInMET.mul(liquidatorIncentive).div(parseEther('1'))
            )

            const {_isHealthy} = await pool.debtPositionOf(alice.address)

            const remainder = 6000 // left over amount on user's deposit balance

            expect(_isHealthy).false
            expect(depositSeized).closeTo(depositBefore, remainder)
            expect(await msdMET.balanceOf(alice.address)).closeTo(BigNumber.from('0'), remainder)
            expect(await msEth.balanceOf(alice.address)).eq(userMintAmount)
            expect(await msEthDebtToken.balanceOf(alice.address)).gt(0)
            expect(await msdMET.balanceOf(liquidator.address)).eq(
              liquidatorDepositAmount.add(expectedDepositToLiquidator)
            )
            expect(await msEth.balanceOf(liquidator.address)).eq(liquidatorMintAmount.sub(amountToRepay))
            expect(await msEthDebtToken.balanceOf(liquidator.address)).eq(liquidatorMintAmount)
          })

          it('should liquidate by not repaying all debt (liquidateFee == 0)', async function () {
            // given
            await feeProvider.updateProtocolLiquidationFee(0)
            const {_depositInUsd: collateralInUsdBefore} = await pool.debtPositionOf(alice.address)
            const collateralBefore = await masterOracle.quoteUsdToToken(met.address, collateralInUsdBefore)

            // when
            const maxAmountToRepay = await pool.quoteLiquidateMax(msEth.address, alice.address, msdMET.address)
            const amountToRepay = maxAmountToRepay.div('2')
            const tx = await pool
              .connect(liquidator)
              .liquidate(msEth.address, alice.address, amountToRepay, msdMET.address)
            const [PositionLiquidated] = (await tx.wait()).events!.filter(({event}) => event === 'PositionLiquidated')
            const [, , , , depositSeized] = PositionLiquidated.args!

            // then
            const debtInUsdAfter = await pool.debtOf(alice.address)
            const {_isHealthy: isHealthyAfter, _depositInUsd: collateralInUsdAfter} = await pool.debtPositionOf(
              alice.address
            )
            const collateralAfter = await msdMET.balanceOf(alice.address)
            const unlockedCollateralAfter = await msdMET.unlockedBalanceOf(alice.address)
            const lockedCollateralAfter = await msdMET.lockedBalanceOf(alice.address)

            const currentCollateralFactor = collateralInUsdAfter.mul(parseEther('1')).div(debtInUsdAfter)

            expect(currentCollateralFactor).lt(metCF)
            expect(isHealthyAfter).false
            expect(collateralAfter).eq(collateralBefore.sub(depositSeized))
            expect(lockedCollateralAfter).gte(collateralInUsdAfter)
            expect(unlockedCollateralAfter).eq(0)
            expect(await msdMET.balanceOf(alice.address)).eq(collateralBefore.sub(depositSeized))
            expect(await msEth.balanceOf(alice.address)).eq(userMintAmount)
            expect(await msEthDebtToken.balanceOf(alice.address)).eq(userMintAmount.sub(amountToRepay))
            expect(await msdMET.balanceOf(liquidator.address)).eq(liquidatorDepositAmount.add(depositSeized))
            expect(await msEth.balanceOf(liquidator.address)).eq(liquidatorMintAmount.sub(amountToRepay))
            expect(await msEthDebtToken.balanceOf(liquidator.address)).eq(liquidatorMintAmount)
          })

          it('should liquidate by not repaying all debt (liquidateFee > 0)', async function () {
            // given
            const protocolLiquidationFee = parseEther('0.01') // 1%
            await feeProvider.updateProtocolLiquidationFee(protocolLiquidationFee)
            const {_depositInUsd: collateralInUsdBefore} = await pool.debtPositionOf(alice.address)
            const collateralBefore = await masterOracle.quoteUsdToToken(met.address, collateralInUsdBefore)

            // when
            const maxAmountToRepay = await pool.quoteLiquidateMax(msEth.address, alice.address, msdMET.address)
            const amountToRepay = maxAmountToRepay.div('2')
            const tx = await pool
              .connect(liquidator)
              .liquidate(msEth.address, alice.address, amountToRepay, msdMET.address)
            const [PositionLiquidated] = (await tx.wait()).events!.filter(({event}) => event === 'PositionLiquidated')
            const [, , , , depositSeized] = PositionLiquidated.args!

            // then
            const debtInUsdAfter = await pool.debtOf(alice.address)
            const {_isHealthy: isHealthyAfter, _depositInUsd: collateralInUsdAfter} = await pool.debtPositionOf(
              alice.address
            )
            const collateralAfter = await msdMET.balanceOf(alice.address)
            const unlockedCollateralAfter = await msdMET.unlockedBalanceOf(alice.address)
            const lockedCollateralAfter = await msdMET.lockedBalanceOf(alice.address)

            const amountToRepayInMET = await masterOracle.quote(msEth.address, met.address, amountToRepay)

            const expectedDepositToLiquidator = amountToRepayInMET.add(
              amountToRepayInMET.mul(liquidatorIncentive).div(parseEther('1'))
            )

            const currentCollateralFactor = collateralInUsdAfter.mul(parseEther('1')).div(debtInUsdAfter)

            expect(currentCollateralFactor).lt(metCF)
            expect(isHealthyAfter).false
            expect(collateralAfter).eq(collateralBefore.sub(depositSeized))
            expect(lockedCollateralAfter).gte(collateralInUsdAfter)
            expect(unlockedCollateralAfter).eq(0)
            expect(await msdMET.balanceOf(alice.address)).eq(collateralBefore.sub(depositSeized))
            expect(await msEth.balanceOf(alice.address)).eq(userMintAmount)
            expect(await msEthDebtToken.balanceOf(alice.address)).eq(userMintAmount.sub(amountToRepay))
            expect(await msdMET.balanceOf(liquidator.address)).eq(
              liquidatorDepositAmount.add(expectedDepositToLiquidator)
            )
            expect(await msEth.balanceOf(liquidator.address)).eq(liquidatorMintAmount.sub(amountToRepay))
            expect(await msEthDebtToken.balanceOf(liquidator.address)).eq(liquidatorMintAmount)
          })
        })

        describe('when user minted both msETH and msDOGE using all collateral', function () {
          beforeEach(async function () {
            await feeProvider.updateProtocolLiquidationFee(0)

            const {_issuableInUsd} = await pool.debtPositionOf(alice.address)
            const maxIssuableDoge = await masterOracle.quoteUsdToToken(msDoge.address, _issuableInUsd)

            await msDogeDebtToken.connect(alice).issue(maxIssuableDoge, alice.address)

            const {_isHealthy, _issuableInUsd: _mintableInUsdAfter} = await pool.debtPositionOf(alice.address)
            expect(_isHealthy).true
            expect(_mintableInUsdAfter).eq(0)

            const _unlockedDeposit = await msdMET.unlockedBalanceOf(alice.address)

            expect(_unlockedDeposit).eq(0)
          })

          it('should liquidate a position that have minted more than one msAsset', async function () {
            // given
            const newDogePrice = toUSD('0.5')
            await masterOracle.updatePrice(msDoge.address, newDogePrice) // $0.4 -> $0.5
            const {_isHealthy: isHealthyBefore} = await pool.debtPositionOf(alice.address)
            expect(isHealthyBefore).false

            // when
            const amountToRepay = await msDogeDebtToken.balanceOf(alice.address)
            await msDogeDebtToken.connect(liquidator).issue(amountToRepay, liquidator.address)
            await pool.connect(liquidator).liquidate(msDoge.address, alice.address, amountToRepay, msdMET.address)

            // then
            const {_isHealthy: isHealthyAfter} = await pool.debtPositionOf(alice.address)
            expect(isHealthyAfter).true
          })
        })
      })

      describe('swap', function () {
        it('should not revert if paused', async function () {
          // given
          await pool.pause()

          // when
          const amount = parseEther('0.1')
          const tx = pool.connect(alice).swap(msEth.address, msDoge.address, amount)

          // then
          await expect(tx).emit(pool, 'SyntheticTokenSwapped')
        })

        it('should revert if shutdown', async function () {
          // given
          await pool.shutdown()

          // when
          const amount = parseEther('0.1')
          const tx = pool.connect(alice).swap(msEth.address, msDoge.address, amount)

          // then
          await expect(tx).revertedWithCustomError(pool, 'IsShutdown')
        })

        it('should revert if swap is paused', async function () {
          // given
          await pool.toggleIsSwapActive()

          // when
          const amount = parseEther('0.1')
          const tx = pool.connect(alice).swap(msEth.address, msDoge.address, amount)

          // then
          await expect(tx).revertedWithCustomError(pool, 'SwapFeatureIsInactive')
        })

        it('should revert if amount == 0', async function () {
          // when
          const tx = pool.connect(alice).swap(msEth.address, msDoge.address, 0)

          // then
          await expect(tx).revertedWithCustomError(pool, 'AmountInIsInvalid')
        })

        it('should revert if synthetic out is not active', async function () {
          // given
          await msDoge.toggleIsActive()

          // when
          const amountIn = await msEth.balanceOf(alice.address)
          const tx = pool.connect(alice).swap(msEth.address, msDoge.address, amountIn)

          // then
          await expect(tx).revertedWithCustomError(msEth, 'SyntheticIsInactive')
        })

        it('should revert if user has not enough balance', async function () {
          // given
          const msAssetInBalance = await msEth.balanceOf(alice.address)

          // when
          const amountIn = msAssetInBalance.add('1')
          const tx = pool.connect(alice).swap(msEth.address, msDoge.address, amountIn)

          // then
          await expect(tx).revertedWithCustomError(pool, 'AmountInIsInvalid')
        })

        it('should swap synthetic tokens (swapFee == 0)', async function () {
          // given
          await feeProvider.updateSwapFee(0)
          const msAssetInBalanceBefore = await msEth.balanceOf(alice.address)
          const msAssetOutBalanceBefore = await msDoge.balanceOf(alice.address)
          expect(msAssetOutBalanceBefore).eq(0)

          // when
          const msAssetIn = msEth.address
          const msAssetOut = msDoge.address
          const amountIn = msAssetInBalanceBefore
          const amountInUsd = amountIn.mul(ethPrice).div(parseEther('1'))
          const tx = await pool.connect(alice).swap(msAssetIn, msAssetOut, amountIn)

          // then
          const expectedAmountOut = amountInUsd.mul(parseEther('1')).div(dogePrice)

          await expect(tx)
            .emit(pool, 'SyntheticTokenSwapped')
            .withArgs(alice.address, msAssetIn, msAssetOut, amountIn, expectedAmountOut, 0)

          const msAssetInBalanceAfter = await msEth.balanceOf(alice.address)
          const msAssetOutBalanceAfter = await msDoge.balanceOf(alice.address)

          expect(msAssetInBalanceAfter).eq(msAssetInBalanceBefore.sub(amountIn))
          expect(msAssetOutBalanceAfter).eq(msAssetOutBalanceBefore.add(expectedAmountOut))
        })

        it('should swap synthetic tokens (swapFee > 0)', async function () {
          // given
          const swapFee = parseEther('0.1') // 10%
          await feeProvider.updateSwapFee(swapFee)
          const msAssetInBalanceBefore = await msEth.balanceOf(alice.address)
          const msAssetOutBalanceBefore = await msDoge.balanceOf(alice.address)
          expect(msAssetOutBalanceBefore).eq(0)

          // when
          const msAssetIn = msEth.address
          const msAssetOut = msDoge.address
          const amountIn = msAssetInBalanceBefore
          const tx = await pool.connect(alice).swap(msAssetIn, msAssetOut, amountIn)

          // then
          const {_amountOut: expectedAmountOutAfterFee, _fee: expectedFee} = await pool.quoteSwapOut(
            msAssetIn,
            msAssetOut,
            amountIn
          )
          expect(amountIn).eq((await pool.quoteSwapIn(msAssetIn, msAssetOut, expectedAmountOutAfterFee))._amountIn)

          await expect(tx)
            .emit(pool, 'SyntheticTokenSwapped')
            .withArgs(alice.address, msAssetIn, msAssetOut, amountIn, expectedAmountOutAfterFee, expectedFee)

          const msAssetInBalanceAfter = await msEth.balanceOf(alice.address)
          const msAssetOutBalanceAfter = await msDoge.balanceOf(alice.address)

          expect(msAssetInBalanceAfter).eq(msAssetInBalanceBefore.sub(amountIn))
          expect(msAssetOutBalanceAfter).eq(msAssetOutBalanceBefore.add(expectedAmountOutAfterFee))
        })
      })
    })
  })

  describe('Pause/Shutdown via PoolRegistry', function () {
    it('should pause pool if poolRegistry is paused', async function () {
      // given is not paused
      expect(await pool.paused()).to.false

      // when poolRegistry is paused
      poolRegistryMock.paused.returns(true)

      // then pool is paused too
      expect(await pool.paused()).to.true

      // Reset mock
      poolRegistryMock.paused.returns(false)
    })

    it('should shutdown pool if poolRegistry is shutdown', async function () {
      // given is not shutdown
      expect(await pool.everythingStopped()).to.false

      // when poolRegistry is shutdown
      poolRegistryMock.everythingStopped.returns(true)

      // then pool is shutdown too
      expect(await pool.everythingStopped()).to.true

      // Reset mock
      poolRegistryMock.everythingStopped.returns(false)
    })
  })

  describe('whitelisting', function () {
    let syntheticToken: FakeContract
    let debtToken: FakeContract
    let depositToken: FakeContract

    beforeEach(async function () {
      syntheticToken = await smock.fake('SyntheticToken')
      debtToken = await smock.fake('DebtToken')
      depositToken = await smock.fake('DepositToken')
      syntheticToken.poolRegistry.returns(poolRegistryMock.address)
      debtToken.syntheticToken.returns(syntheticToken.address)
    })

    describe('addDebtToken', function () {
      it('should revert if not governor', async function () {
        const tx = pool.connect(alice).addDebtToken(msEthDebtToken.address)
        await expect(tx).revertedWithCustomError(pool, 'SenderIsNotGovernor')
      })

      it('should add debt token', async function () {
        const debtTokensBefore = await pool.getDebtTokens()
        await pool.addDebtToken(debtToken.address)
        const debtTokensAfter = await pool.getDebtTokens()
        expect(debtTokensAfter.length).eq(debtTokensBefore.length + 1)
      })
    })

    describe('removeDebtToken', function () {
      it('should remove debt token', async function () {
        // given
        await pool.addDebtToken(debtToken.address)
        const debtTokensBefore = await pool.getDebtTokens()

        // when
        await pool.removeDebtToken(debtToken.address)

        // then
        const debtTokensAfter = await pool.getDebtTokens()
        expect(debtTokensAfter.length).eq(debtTokensBefore.length - 1)
      })

      it('should revert if not governor', async function () {
        // when
        const tx = pool.connect(alice).removeDebtToken(debtToken.address)

        // then
        await expect(tx).revertedWithCustomError(pool, 'SenderIsNotGovernor')
      })

      it('should revert if debt token has any supply', async function () {
        // given
        await pool.addDebtToken(debtToken.address)
        debtToken.totalSupply.returns(1)
        expect(await debtToken.totalSupply()).gt(0)

        // when
        const tx = pool.removeDebtToken(debtToken.address)

        // then
        await expect(tx).revertedWithCustomError(pool, 'TotalSupplyIsNotZero')
      })
    })

    describe('removeDepositToken', function () {
      it('should remove deposit token', async function () {
        // given
        await pool.addDepositToken(depositToken.address)
        const depositTokensBefore = await pool.getDepositTokens()

        // when
        await pool.removeDepositToken(depositToken.address)

        // then
        const depositTokensAfter = await pool.getDepositTokens()
        expect(depositTokensAfter.length).eq(depositTokensBefore.length - 1)
      })

      it('should revert if not governor', async function () {
        // when
        const tx = pool.connect(alice).removeDepositToken(depositToken.address)

        // then
        await expect(tx).revertedWithCustomError(pool, 'SenderIsNotGovernor')
      })

      it('should revert if debt token has any supply', async function () {
        // given
        await pool.addDepositToken(depositToken.address)
        depositToken.totalSupply.returns(1)
        expect(await depositToken.totalSupply()).gt(0)

        // when
        const tx = pool.removeDepositToken(depositToken.address)

        // then
        await expect(tx).revertedWithCustomError(pool, 'TotalSupplyIsNotZero')
      })
    })
  })

  describe('updateTreasury', function () {
    it('should revert if using the same address', async function () {
      // given
      expect(await pool.treasury()).eq(treasury.address)

      // when
      const tx = pool.updateTreasury(treasury.address)

      // then
      await expect(tx).revertedWithCustomError(pool, 'NewValueIsSameAsCurrent')
    })

    it('should revert if caller is not governor', async function () {
      // when
      const tx = pool.connect(alice).updateTreasury(treasury.address)

      // then
      await expect(tx).revertedWithCustomError(pool, 'SenderIsNotGovernor')
    })

    it('should revert if address is zero', async function () {
      // when
      const tx = pool.updateTreasury(ethers.constants.AddressZero)

      // then
      await expect(tx).revertedWithCustomError(pool, 'AddressIsNull')
    })

    it('should migrate funds to the new treasury', async function () {
      const treasuryFactory = new Treasury__factory(deployer)
      const newTreasury = await treasuryFactory.deploy()
      await newTreasury.deployed()
      await newTreasury.initialize(pool.address)

      // given
      await met.mint(deployer.address, parseEther('10000'))
      await met.approve(msdMET.address, parseEther('10000'))
      await msdMET.deposit(parseEther('10000'), deployer.address)

      expect(await met.balanceOf(treasury.address)).gt(0)

      // when
      await pool.updateTreasury(newTreasury.address)

      // then
      expect(await met.balanceOf(treasury.address)).eq(0)
      expect(await met.balanceOf(newTreasury.address)).gt(0)
    })
  })

  describe('depositTokensOfAccount', function () {
    let msdTOKEN: FakeContract

    beforeEach(async function () {
      msdTOKEN = await smock.fake('DepositToken')
      await pool.addDepositToken(msdTOKEN.address)
      await setBalance(msdTOKEN.address, parseEther('1'))
    })

    describe('addToDepositTokensOfAccount', function () {
      it('should revert if caller is not a deposit token', async function () {
        const tx = pool.connect(alice).addToDepositTokensOfAccount(alice.address)
        await expect(tx).revertedWithCustomError(pool, 'SenderIsNotDepositToken')
      })

      // eslint-disable-next-line quotes
      it("should add deposit token to the account's array", async function () {
        // given
        expect(await pool.getDepositTokensOfAccount(alice.address)).deep.eq([])

        // then
        await pool.connect(msdTOKEN.wallet).addToDepositTokensOfAccount(alice.address)

        // when
        expect(await pool.getDepositTokensOfAccount(alice.address)).deep.eq([msdTOKEN.address])
      })

      it('should revert when trying to add same deposit token twice', async function () {
        // given
        expect(await pool.getDepositTokensOfAccount(alice.address)).deep.eq([])

        // then
        await pool.connect(msdTOKEN.wallet).addToDepositTokensOfAccount(alice.address)
        const tx = pool.connect(msdTOKEN.wallet).addToDepositTokensOfAccount(alice.address)

        // when
        await expect(tx).revertedWithCustomError(pool, 'DepositTokenAlreadyExists')
      })
    })

    describe('removeFromDepositTokensOfAccount', function () {
      beforeEach(async function () {
        await pool.connect(msdTOKEN.wallet).addToDepositTokensOfAccount(alice.address)
      })

      it('should revert if caller is not a deposit token', async function () {
        const tx = pool.connect(alice).removeFromDepositTokensOfAccount(alice.address)
        await expect(tx).revertedWithCustomError(pool, 'SenderIsNotDepositToken')
      })

      // eslint-disable-next-line quotes
      it("should remove deposit token to the account's array", async function () {
        // given
        expect(await pool.getDepositTokensOfAccount(alice.address)).deep.eq([msdTOKEN.address])

        // then
        await pool.connect(msdTOKEN.wallet).removeFromDepositTokensOfAccount(alice.address)

        // when
        expect(await pool.getDepositTokensOfAccount(alice.address)).deep.eq([])
      })
    })
  })

  describe('debtTokensOfAccount', function () {
    let syntheticToken: FakeContract
    let debtToken: FakeContract

    beforeEach(async function () {
      syntheticToken = await smock.fake('SyntheticToken')
      debtToken = await smock.fake('DebtToken')
      syntheticToken.poolRegistry.returns(poolRegistryMock.address)
      debtToken.syntheticToken.returns(syntheticToken.address)

      await pool.addDebtToken(debtToken.address)
      await setBalance(debtToken.address, parseEther('1'))
    })

    describe('addToDebtTokensOfAccount', function () {
      it('should revert if caller is not a debt token', async function () {
        const invalidDebtToken = await smock.fake('DebtToken')
        invalidDebtToken.syntheticToken.returns(syntheticToken.address)

        const tx = pool.connect(invalidDebtToken.wallet).addToDebtTokensOfAccount(alice.address)
        await expect(tx).revertedWithCustomError(pool, 'SenderIsNotDebtToken')
      })

      // eslint-disable-next-line quotes
      it("should add debt token to the account's array", async function () {
        // given
        expect(await pool.getDebtTokensOfAccount(alice.address)).deep.eq([])

        // then
        await pool.connect(debtToken.wallet).addToDebtTokensOfAccount(alice.address)

        // when
        expect(await pool.getDebtTokensOfAccount(alice.address)).deep.eq([debtToken.address])
      })

      it('should revert when trying to add same debt token twice', async function () {
        // given
        expect(await pool.getDebtTokensOfAccount(alice.address)).deep.eq([])

        // then
        await pool.connect(debtToken.wallet).addToDebtTokensOfAccount(alice.address)
        const tx = pool.connect(debtToken.wallet).addToDebtTokensOfAccount(alice.address)

        // when
        await expect(tx).revertedWithCustomError(pool, 'DebtTokenAlreadyExists')
      })
    })

    describe('removeFromDebtTokensOfAccount', function () {
      beforeEach(async function () {
        await pool.connect(debtToken.wallet).addToDebtTokensOfAccount(alice.address)
      })

      it('should revert if caller is not a debt token', async function () {
        const invalidDebtToken = await smock.fake('DebtToken')
        invalidDebtToken.syntheticToken.returns(syntheticToken.address)

        const tx = pool.connect(invalidDebtToken.wallet).removeFromDebtTokensOfAccount(alice.address)
        await expect(tx).revertedWithCustomError(pool, 'SenderIsNotDebtToken')
      })

      // eslint-disable-next-line quotes
      it("should remove debt token to the account's array", async function () {
        // given
        expect(await pool.getDebtTokensOfAccount(alice.address)).deep.eq([debtToken.address])

        // then
        await pool.connect(debtToken.wallet).removeFromDebtTokensOfAccount(alice.address)

        // when
        expect(await pool.getDebtTokensOfAccount(alice.address)).deep.eq([])
      })
    })
  })

  describe('updateMaxLiquidable', function () {
    it('should revert if caller is not governor', async function () {
      // when
      const tx = pool.connect(alice).updateMaxLiquidable(parseEther('1'))

      // then
      await expect(tx).revertedWithCustomError(pool, 'SenderIsNotGovernor')
    })

    it('should revert if using the current value', async function () {
      // when
      const maxLiquidable = await pool.maxLiquidable()
      const tx = pool.updateMaxLiquidable(maxLiquidable)

      // then
      await expect(tx).revertedWithCustomError(pool, 'NewValueIsSameAsCurrent')
    })

    it('should revert if max liquidable > 100%', async function () {
      // when
      const maxLiquidable = parseEther('1').add('1')
      const tx = pool.updateMaxLiquidable(maxLiquidable)

      // then
      await expect(tx).revertedWithCustomError(pool, 'MaxLiquidableTooHigh')
    })

    it('should update max liquidable param', async function () {
      // given
      const currentMaxLiquidable = await pool.maxLiquidable()
      const newMaxLiquidable = currentMaxLiquidable.div('2')

      // when
      const tx = pool.updateMaxLiquidable(newMaxLiquidable)

      // then
      await expect(tx).emit(pool, 'MaxLiquidableUpdated').withArgs(currentMaxLiquidable, newMaxLiquidable)
    })
  })

  describe('updateDebtFloor', function () {
    it('should revert if caller is not governor', async function () {
      // when
      const tx = pool.connect(alice).updateDebtFloor(parseEther('1'))

      // then
      await expect(tx).revertedWithCustomError(pool, 'SenderIsNotGovernor')
    })

    it('should revert if using the current value', async function () {
      // when
      const debtFloorInUsd = await pool.debtFloorInUsd()
      const tx = pool.updateDebtFloor(debtFloorInUsd)

      // then
      await expect(tx).revertedWithCustomError(pool, 'NewValueIsSameAsCurrent')
    })

    it('should update debt floor param', async function () {
      // given
      const currentDebtFloorInUsd = await pool.debtFloorInUsd()
      const newDebtFloorInUsd = parseEther('100')

      // when
      const tx = pool.updateDebtFloor(newDebtFloorInUsd)

      // then
      await expect(tx).emit(pool, 'DebtFloorUpdated').withArgs(currentDebtFloorInUsd, newDebtFloorInUsd)
    })
  })

  describe('addRewardsDistributor', function () {
    it('should revert if caller is not governor', async function () {
      // when
      const tx = pool.connect(alice).addRewardsDistributor(ethers.constants.AddressZero)

      // then
      await expect(tx).revertedWithCustomError(pool, 'SenderIsNotGovernor')
    })

    it('should revert if null', async function () {
      // when
      const tx = pool.addRewardsDistributor(ethers.constants.AddressZero)

      // then
      await expect(tx).revertedWithCustomError(pool, 'AddressIsNull')
    })

    it('should revert if already added', async function () {
      // given
      await pool.addRewardsDistributor(alice.address)

      // when
      const tx = pool.addRewardsDistributor(alice.address)

      // then
      await expect(tx).revertedWithCustomError(pool, 'RewardDistributorAlreadyExists')
    })

    it('should add a rewards distributor', async function () {
      // given
      const before = await pool.getRewardsDistributors()
      expect(before).deep.eq([])

      // when
      const tx = pool.addRewardsDistributor(alice.address)

      // then
      await expect(tx).emit(pool, 'RewardsDistributorAdded').withArgs(alice.address)
      const after = await pool.getRewardsDistributors()
      expect(after).deep.eq([alice.address])
    })
  })

  describe('removeRewardsDistributor', function () {
    it('should revert if caller is not governor', async function () {
      // when
      const tx = pool.connect(alice).removeRewardsDistributor(ethers.constants.AddressZero)

      // then
      await expect(tx).revertedWithCustomError(pool, 'SenderIsNotGovernor')
    })

    it('should revert if null', async function () {
      // when
      const tx = pool.removeRewardsDistributor(ethers.constants.AddressZero)

      // then
      await expect(tx).revertedWithCustomError(pool, 'AddressIsNull')
    })

    it('should revert if not ealready added', async function () {
      // given
      await pool.addRewardsDistributor(alice.address)

      // when
      const tx = pool.removeRewardsDistributor(bob.address)

      // then
      await expect(tx).revertedWithCustomError(pool, 'RewardDistributorDoesNotExist')
    })

    it('should remove a rewards distributor', async function () {
      // given
      await pool.addRewardsDistributor(alice.address)
      await pool.addRewardsDistributor(bob.address)

      const before = await pool.getRewardsDistributors()
      expect(before).deep.eq([alice.address, bob.address])

      // when
      const tx = pool.removeRewardsDistributor(alice.address)

      // then
      await expect(tx).emit(pool, 'RewardsDistributorRemoved').withArgs(alice.address)
      const after = await pool.getRewardsDistributors()
      expect(after).deep.eq([bob.address])
    })
  })

  describe('toggleIsSwapActive', function () {
    it('should toggle isSwapActive flag', async function () {
      const before = await pool.isSwapActive()
      const after = !before
      const tx = pool.toggleIsSwapActive()
      await expect(tx).emit(pool, 'SwapActiveUpdated').withArgs(after)
      expect(await pool.isSwapActive()).eq(after)
    })

    it('should revert if not governor', async function () {
      const tx = pool.connect(alice).toggleIsSwapActive()
      await expect(tx).revertedWithCustomError(pool, 'SenderIsNotGovernor')
    })
  })

  describe('updateSwapper', function () {
    it('should revert if using the same address', async function () {
      // given
      expect(await pool.swapper()).eq(swapper.address)

      // when
      const tx = pool.updateSwapper(swapper.address)

      // then
      await expect(tx).revertedWithCustomError(pool, 'NewValueIsSameAsCurrent')
    })

    it('should revert if caller is not governor', async function () {
      // when
      const tx = pool.connect(alice).updateSwapper(swapper.address)

      // then
      await expect(tx).revertedWithCustomError(pool, 'SenderIsNotGovernor')
    })

    it('should revert if address is zero', async function () {
      // when
      const tx = pool.updateSwapper(ethers.constants.AddressZero)

      // then
      await expect(tx).revertedWithCustomError(pool, 'AddressIsNull')
    })

    it('should update swapper', async function () {
      // given
      const before = await pool.swapper()
      const after = alice.address

      // when
      const tx = pool.updateSwapper(after)

      // then
      await expect(tx).emit(pool, 'SwapperUpdated').withArgs(before, after)
      expect(await pool.swapper()).eq(after)
    })
  })

  describe('updateFeeProvider', function () {
    it('should revert if using the same address', async function () {
      // given
      expect(await pool.feeProvider()).eq(feeProvider.address)

      // when
      const tx = pool.updateFeeProvider(feeProvider.address)

      // then
      await expect(tx).revertedWithCustomError(pool, 'NewValueIsSameAsCurrent')
    })

    it('should revert if caller is not governor', async function () {
      // when
      const tx = pool.connect(alice).updateFeeProvider(treasury.address)

      // then
      await expect(tx).revertedWithCustomError(pool, 'SenderIsNotGovernor')
    })

    it('should revert if address is zero', async function () {
      // when
      const tx = pool.updateFeeProvider(ethers.constants.AddressZero)

      // then
      await expect(tx).revertedWithCustomError(pool, 'AddressIsNull')
    })

    it('should update fee provider', async function () {
      // given
      const before = await pool.feeProvider()
      const after = bob.address
      expect(before).not.eq(after)

      // when
      const tx = pool.updateFeeProvider(after)

      // then
      await expect(tx).to.emit(pool, 'FeeProviderUpdated').withArgs(before, after)
    })
  })
})
