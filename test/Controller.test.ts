/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable camelcase */
import {BigNumber} from '@ethersproject/bignumber'
import {parseEther} from '@ethersproject/units'
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import chai, {expect} from 'chai'
import {ethers, waffle} from 'hardhat'
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
  Controller__factory,
  Controller,
  DebtTokenMock,
  DebtTokenMock__factory,
} from '../typechain'
import {getMaxLiquidationAmountInUsd, getMinLiquidationAmountInUsd, setEtherBalance} from './helpers'
import {FakeContract, smock} from '@defi-wonderland/smock'
import {toUSD} from '../helpers'

chai.use(smock.matchers)

const {MaxUint256} = ethers.constants

const liquidatorLiquidationFee = parseEther('0.1') // 10%
const metCR = parseEther('0.67') // 67%
const daiCR = parseEther('0.5') // 50%
const ethPrice = toUSD('4000') // 1 ETH = $4,000
const metPrice = toUSD('4') // 1 MET = $4
const daiPrice = toUSD('1') // 1 DAI = $1
const dogePrice = toUSD('0.4') // 1 DOGE = $0.4
const interestRate = parseEther('0')

async function fixture() {
  const [deployer, alice, , liquidator] = await ethers.getSigners()
  const masterOracleMockFactory = new MasterOracleMock__factory(deployer)
  const masterOracleMock = <MasterOracleMock>await masterOracleMockFactory.deploy()
  await masterOracleMock.deployed()

  const erc20MockFactory = new ERC20Mock__factory(deployer)

  const met = await erc20MockFactory.deploy('Metronome', 'MET', 18)
  await met.deployed()

  const dai = await erc20MockFactory.deploy('Dai Stablecoin', 'DAI', 18)
  await dai.deployed()

  const treasuryFactory = new Treasury__factory(deployer)
  const treasury = await treasuryFactory.deploy()
  await treasury.deployed()

  const depositTokenFactory = new DepositToken__factory(deployer)
  const vsdMET = await depositTokenFactory.deploy()
  await vsdMET.deployed()

  const vsdDAI = await depositTokenFactory.deploy()
  await vsdDAI.deployed()

  const debtTokenMockFactory = new DebtTokenMock__factory(deployer)

  const vsETHDebt = await debtTokenMockFactory.deploy()
  await vsETHDebt.deployed()

  const vsDOGEDebt = await debtTokenMockFactory.deploy()
  await vsDOGEDebt.deployed()

  const syntheticTokenFactory = new SyntheticToken__factory(deployer)

  const vsEth = await syntheticTokenFactory.deploy()
  await vsEth.deployed()

  const vsDoge = await syntheticTokenFactory.deploy()
  await vsDoge.deployed()

  const controllerFactory = new Controller__factory(deployer)
  const controller = await controllerFactory.deploy()
  await controller.deployed()

  // Deployment tasks
  await vsdMET.initialize(met.address, controller.address, 'vsdMET', 18, metCR, MaxUint256)

  await vsdDAI.initialize(dai.address, controller.address, 'vsdDAI', 18, daiCR, MaxUint256)

  await treasury.initialize(controller.address)

  await vsEth.initialize(
    'Vesper Synth ETH',
    'vsETH',
    18,
    controller.address,
    vsETHDebt.address,
    interestRate,
    MaxUint256
  )

  await vsETHDebt.initialize('vsETH Debt', 'vsETH-Debt', 18, controller.address)
  await vsETHDebt.setSyntheticToken(vsEth.address)

  await vsDoge.initialize(
    'Vesper Synth DOGE',
    'vsDOGE',
    18,
    controller.address,
    vsDOGEDebt.address,
    interestRate,
    MaxUint256
  )

  await vsDOGEDebt.initialize('vsDOGE Debt', 'vsDOGE-Debt', 18, controller.address)
  await vsDOGEDebt.setSyntheticToken(vsDoge.address)

  await controller.initialize(masterOracleMock.address)
  await controller.updateTreasury(treasury.address, false)
  expect(await controller.liquidatorLiquidationFee()).eq(liquidatorLiquidationFee)
  await controller.addDepositToken(vsdMET.address)
  await controller.addSyntheticToken(vsEth.address)
  await controller.addDepositToken(vsdDAI.address)
  await controller.addSyntheticToken(vsDoge.address)

  // mint some collaterals to users
  await met.mint(alice.address, parseEther(`${1e6}`))
  await met.mint(liquidator.address, parseEther(`${1e6}`))
  await dai.mint(alice.address, parseEther(`${1e6}`))

  // initialize mocked oracle
  await masterOracleMock.updatePrice(vsdDAI.address, daiPrice)
  await masterOracleMock.updatePrice(vsdMET.address, metPrice)
  await masterOracleMock.updatePrice(vsEth.address, ethPrice)
  await masterOracleMock.updatePrice(vsDoge.address, dogePrice)

  return {
    oracle: masterOracleMock,
    met,
    dai,
    treasury,
    metDepositToken: vsdMET,
    daiDepositToken: vsdDAI,
    vsEthDebtToken: vsETHDebt,
    vsDogeDebtToken: vsDOGEDebt,
    vsEth,
    vsDoge,
    controller,
  }
}

describe('Controller', function () {
  let deployer: SignerWithAddress
  let alice: SignerWithAddress
  let bob: SignerWithAddress
  let liquidator: SignerWithAddress
  let met: ERC20Mock
  let dai: ERC20Mock
  let vsEthDebtToken: DebtTokenMock
  let vsDogeDebtToken: DebtTokenMock
  let vsEth: SyntheticToken
  let vsDoge: SyntheticToken
  let treasury: Treasury
  let vsdMET: DepositToken
  let vsdDAI: DepositToken
  let masterOracle: MasterOracleMock
  let controller: Controller

  beforeEach(async function () {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[deployer, alice, bob, liquidator] = await ethers.getSigners()
    ;({
      oracle: masterOracle,
      met,
      dai,
      treasury,
      metDepositToken: vsdMET,
      daiDepositToken: vsdDAI,
      vsEthDebtToken,
      vsDogeDebtToken,
      vsEth,
      vsDoge,
      controller,
    } = await waffle.loadFixture(fixture))
  })

  describe('when user deposited multi-collateral', function () {
    const metDepositAmount = parseEther('6000') // ~$24,000
    const daiDepositAmount = parseEther('24000') // ~$24,000

    beforeEach(async function () {
      await met.connect(alice).approve(vsdMET.address, ethers.constants.MaxUint256)
      await dai.connect(alice).approve(vsdDAI.address, ethers.constants.MaxUint256)

      await vsdMET.connect(alice).deposit(metDepositAmount, alice.address)
      await vsdDAI.connect(alice).deposit(daiDepositAmount, alice.address)
    })

    it('should calculate deposit correctly', async function () {
      const {_isHealthy, _depositInUsd, _debtInUsd, _issuableLimitInUsd, _issuableInUsd} =
        await controller.debtPositionOf(alice.address)

      const limitForMet = (await vsdMET.balanceOf(alice.address)).mul(metCR).div(parseEther('1'))
      const limitForDai = (await vsdDAI.balanceOf(alice.address)).mul(daiCR).div(parseEther('1'))
      const limitForMetInUsd = await masterOracle.convertToUsd(vsdMET.address, limitForMet)
      const limitForDaiInUsd = await masterOracle.convertToUsd(vsdDAI.address, limitForDai)
      const _expectedMintableLimitInUsd = limitForMetInUsd.add(limitForDaiInUsd)

      expect(_isHealthy).eq(true)
      expect(_depositInUsd).eq(toUSD('48000'))
      expect(_debtInUsd).eq(0)
      expect(_issuableLimitInUsd).eq(_expectedMintableLimitInUsd)
      expect(_issuableInUsd).eq(_issuableLimitInUsd.sub(_debtInUsd))
    })

    it('should be able to issue using position among multiple collaterals', async function () {
      const {_issuableInUsd: _issuableInUsdBefore} = await controller.debtPositionOf(alice.address)

      const amountToIssue = await masterOracle.convertFromUsd(vsEth.address, _issuableInUsdBefore)
      await vsEth.connect(alice).issue(amountToIssue, alice.address)

      const {_isHealthy, _issuableInUsd, _depositInUsd} = await controller.debtPositionOf(alice.address)

      expect(_isHealthy).eq(true)
      expect(_depositInUsd).eq(toUSD('48000'))
      expect(_issuableInUsd).eq(0)
    })
  })

  describe('when user deposited some MET', function () {
    const userDepositAmount = parseEther('6000')

    beforeEach(async function () {
      await met.connect(alice).approve(vsdMET.address, ethers.constants.MaxUint256)
      await vsdMET.connect(alice).deposit(userDepositAmount, alice.address)
    })

    it('should withdraw when collateral charges transfer fee', async function () {
      // given
      const fee = parseEther('0.1') // 10%
      await met.updateFee(fee)
      const metBalanceBefore = await met.balanceOf(alice.address)
      const amountToWithdraw = await vsdMET.balanceOf(alice.address)

      // when
      const amountAfterFee = amountToWithdraw.sub(amountToWithdraw.mul(fee).div(parseEther('1')))
      const tx = vsdMET.connect(alice).withdraw(amountToWithdraw, alice.address)
      await expect(tx).emit(vsdMET, 'CollateralWithdrawn').withArgs(alice.address, alice.address, amountToWithdraw, 0)

      // then
      expect(await met.balanceOf(alice.address)).eq(metBalanceBefore.add(amountAfterFee))
    })

    describe('when user minted some vsETH', function () {
      const userMintAmount = parseEther('1')

      beforeEach(async function () {
        await vsEth.connect(alice).issue(userMintAmount, alice.address)
      })

      describe('swap', function () {
        it('should not revert if paused', async function () {
          // given
          await controller.pause()

          // when
          const amount = parseEther('0.1')
          const tx = controller.connect(alice).swap(vsEth.address, vsDoge.address, amount)

          // then
          await expect(tx).emit(controller, 'SyntheticTokenSwapped')
        })

        it('should revert if shutdown', async function () {
          // given
          await controller.shutdown()

          // when
          const amount = parseEther('0.1')
          const tx = controller.connect(alice).swap(vsEth.address, vsDoge.address, amount)

          // then
          await expect(tx).revertedWith('shutdown')
        })

        it('should revert if amount == 0', async function () {
          // when
          const tx = controller.connect(alice).swap(vsEth.address, vsDoge.address, 0)

          // then
          await expect(tx).revertedWith('amount-in-is-0')
        })

        it('should revert if synthetic out is not active', async function () {
          // given
          await vsDoge.toggleIsActive()

          // when
          const amountIn = await vsEth.balanceOf(alice.address)
          const tx = controller.connect(alice).swap(vsEth.address, vsDoge.address, amountIn)

          // then
          await expect(tx).revertedWith('synthetic-inactive')
        })

        it('should revert if user has not enough balance', async function () {
          // given
          const vsAssetInBalance = await vsEth.balanceOf(alice.address)

          // when
          const amountIn = vsAssetInBalance.add('1')
          const tx = controller.connect(alice).swap(vsEth.address, vsDoge.address, amountIn)

          // then
          await expect(tx).revertedWith('amount-in-gt-balance')
        })

        it('should swap synthetic tokens (swapFee == 0)', async function () {
          // given
          await controller.updateSwapFee(0)
          const vsAssetInBalanceBefore = await vsEth.balanceOf(alice.address)
          const vsAssetInDebtBalanceBefore = await vsEthDebtToken.balanceOf(alice.address)
          const vsAssetOutBalanceBefore = await vsDoge.balanceOf(alice.address)
          const vsAssetOutDebtBalanceBefore = await vsDogeDebtToken.balanceOf(alice.address)
          expect(vsAssetOutBalanceBefore).eq(0)
          expect(vsAssetOutDebtBalanceBefore).eq(0)
          const debtInUsdBefore = await controller.debtOf(alice.address)

          // when
          const vsAssetIn = vsEth.address
          const vsAssetOut = vsDoge.address
          const amountIn = vsAssetInBalanceBefore
          const amountInUsd = amountIn.mul(ethPrice).div(parseEther('1'))
          const tx = await controller.connect(alice).swap(vsAssetIn, vsAssetOut, amountIn)

          // then
          const expectedAmountOut = amountInUsd.mul(parseEther('1')).div(dogePrice)

          await expect(tx)
            .emit(controller, 'SyntheticTokenSwapped')
            .withArgs(alice.address, vsAssetIn, vsAssetOut, amountIn, expectedAmountOut, 0)

          const vsAssetInBalanceAfter = await vsEth.balanceOf(alice.address)
          const vsAssetInDebtBalanceAfter = await vsEthDebtToken.balanceOf(alice.address)
          const vsAssetOutBalanceAfter = await vsDoge.balanceOf(alice.address)
          const vsAssetOutDebtBalanceAfter = await vsDogeDebtToken.balanceOf(alice.address)
          const debtInUsdAfter = await controller.debtOf(alice.address)

          expect(debtInUsdAfter).eq(debtInUsdBefore)
          expect(vsAssetInBalanceAfter).eq(vsAssetInBalanceBefore.sub(amountIn))
          expect(vsAssetInDebtBalanceAfter).eq(vsAssetInDebtBalanceBefore)
          expect(vsAssetOutBalanceAfter).eq(vsAssetOutBalanceBefore.add(expectedAmountOut))
          expect(vsAssetOutDebtBalanceAfter).eq(vsAssetOutDebtBalanceBefore)
        })

        it('should swap synthetic tokens (swapFee > 0)', async function () {
          // given
          const swapFee = parseEther('0.1') // 10%
          await controller.updateSwapFee(swapFee)
          const vsAssetInBalanceBefore = await vsEth.balanceOf(alice.address)
          const vsAssetInDebtBalanceBefore = await vsEthDebtToken.balanceOf(alice.address)
          const vsAssetOutBalanceBefore = await vsDoge.balanceOf(alice.address)
          const vsAssetOutDebtBalanceBefore = await vsDogeDebtToken.balanceOf(alice.address)
          expect(vsAssetOutBalanceBefore).eq(0)
          expect(vsAssetOutDebtBalanceBefore).eq(0)
          const debtInUsdBefore = await controller.debtOf(alice.address)

          // when
          const vsAssetIn = vsEth.address
          const vsAssetOut = vsDoge.address
          const amountIn = vsAssetInBalanceBefore
          const amountInUsd = amountIn.mul(ethPrice).div(parseEther('1'))
          const tx = await controller.connect(alice).swap(vsAssetIn, vsAssetOut, amountIn)

          // then
          const expectedAmountOut = amountInUsd.mul(parseEther('1')).div(dogePrice)
          const expectedFee = expectedAmountOut.mul(swapFee).div(parseEther('1'))
          const expectedAmountOutAfterFee = expectedAmountOut.sub(expectedFee)

          await expect(tx)
            .emit(controller, 'SyntheticTokenSwapped')
            .withArgs(alice.address, vsAssetIn, vsAssetOut, amountIn, expectedAmountOutAfterFee, expectedFee)

          const vsAssetInBalanceAfter = await vsEth.balanceOf(alice.address)
          const vsAssetInDebtBalanceAfter = await vsEthDebtToken.balanceOf(alice.address)
          const vsAssetOutBalanceAfter = await vsDoge.balanceOf(alice.address)
          const vsAssetOutDebtBalanceAfter = await vsDogeDebtToken.balanceOf(alice.address)
          const debtInUsdAfter = await controller.debtOf(alice.address)

          expect(debtInUsdAfter).eq(debtInUsdBefore)
          expect(vsAssetInBalanceAfter).eq(vsAssetInBalanceBefore.sub(amountIn))
          expect(vsAssetInDebtBalanceAfter).eq(vsAssetInDebtBalanceBefore)
          expect(vsAssetOutBalanceAfter).eq(vsAssetOutBalanceBefore.add(expectedAmountOutAfterFee))
          expect(vsAssetOutDebtBalanceAfter).eq(vsAssetOutDebtBalanceBefore)
        })

        it('should allow user without debt to swap', async function () {
          // given
          const amountIn = parseEther('1')
          await vsEth.connect(alice).transfer(bob.address, amountIn)
          expect(await vsEthDebtToken.balanceOf(bob.address)).eq(0)
          expect(await vsDoge.balanceOf(bob.address)).eq(0)

          // when
          await controller.connect(bob).swap(vsEth.address, vsDoge.address, amountIn)

          // then
          expect(await vsEth.balanceOf(bob.address)).eq(0)
          expect(await vsDoge.balanceOf(bob.address)).gt(0)
        })
      })

      describe('liquidate', function () {
        const liquidatorDepositAmount = parseEther('100000')
        const liquidatorMintAmount = parseEther('2')

        beforeEach(async function () {
          await met.connect(liquidator).approve(vsdMET.address, ethers.constants.MaxUint256)
          await vsdMET.connect(liquidator).deposit(liquidatorDepositAmount, liquidator.address)
          await vsEth.connect(liquidator).issue(liquidatorMintAmount, liquidator.address)
        })

        it('should revert if amount to repay == 0', async function () {
          // when
          const tx = controller.liquidate(vsEth.address, alice.address, 0, vsdMET.address)

          // then
          await expect(tx).revertedWith('amount-is-zero')
        })

        it('should revert if liquidator == account', async function () {
          // when
          const tx = controller.connect(alice).liquidate(vsEth.address, alice.address, 1, vsdMET.address)

          // then
          await expect(tx).revertedWith('can-not-liquidate-own-position')
        })

        it('should revert if position is healty', async function () {
          // given
          const {_isHealthy} = await controller.debtPositionOf(alice.address)
          expect(_isHealthy).true

          // when
          const tx = controller.liquidate(vsEth.address, alice.address, parseEther('1'), vsdMET.address)

          // then
          await expect(tx).revertedWith('position-is-healthy')
        })

        describe('when the position is unhealty (colalteral:debt >= 1)', function () {
          const newMetPrice = toUSD('0.95')

          beforeEach(async function () {
            await masterOracle.updatePrice(vsdMET.address, newMetPrice)

            const expectedDebtInUsd = userMintAmount.mul(ethPrice).div(parseEther('1'))
            const expectedDepositInUsd = userDepositAmount.mul(newMetPrice).div(parseEther('1'))
            const expectedMintableLimit = expectedDepositInUsd.mul(metCR).div(parseEther('1'))

            const {_isHealthy, _debtInUsd, _depositInUsd, _issuableInUsd, _issuableLimitInUsd} =
              await controller.debtPositionOf(alice.address)

            expect(_isHealthy).eq(false)
            expect(_debtInUsd).eq(expectedDebtInUsd)
            expect(_depositInUsd).eq(expectedDepositInUsd)
            expect(_issuableLimitInUsd).eq(expectedMintableLimit)
            expect(_issuableInUsd).eq(0)

            expect(await vsdMET.balanceOf(alice.address)).eq(userDepositAmount)
            expect(await vsEth.balanceOf(alice.address)).eq(userMintAmount)
            expect(await vsEthDebtToken.balanceOf(alice.address)).eq(userMintAmount)
            expect(await vsdMET.balanceOf(liquidator.address)).eq(liquidatorDepositAmount)
            expect(await vsEth.balanceOf(liquidator.address)).eq(liquidatorMintAmount)
            expect(await vsEthDebtToken.balanceOf(liquidator.address)).eq(liquidatorMintAmount)
          })

          it('should not revert if paused', async function () {
            // given
            await controller.pause()

            // when
            const amountToRepay = userMintAmount // repay all user's debt
            const tx = await controller
              .connect(liquidator)
              .liquidate(vsEth.address, alice.address, amountToRepay, vsdMET.address)

            // then
            await expect(tx).emit(controller, 'PositionLiquidated')
          })

          it('should revert if shutdown', async function () {
            // given
            await controller.shutdown()

            // when
            const amountToRepay = userMintAmount // repay all user's debt
            const tx = controller
              .connect(liquidator)
              .liquidate(vsEth.address, alice.address, amountToRepay, vsdMET.address)

            // then
            await expect(tx).revertedWith('shutdown')
          })

          it('should revert if liquidator has not enough vsAsset to repay', async function () {
            // given
            const liquidatorVsEthBalanceBefore = await vsEth.balanceOf(liquidator.address)
            await vsEth.connect(liquidator).repay(liquidator.address, liquidatorVsEthBalanceBefore)
            const amountToRepayInUsd = await getMinLiquidationAmountInUsd(controller, alice.address, vsdMET)
            const amountToRepayInVsEth = amountToRepayInUsd.mul(parseEther('1')).div(ethPrice)
            expect(await vsEth.balanceOf(liquidator.address)).lt(amountToRepayInVsEth)

            // when
            const tx = controller
              .connect(liquidator)
              .liquidate(vsEth.address, alice.address, amountToRepayInVsEth, vsdMET.address)

            // then
            await expect(tx).revertedWith('burn-amount-exceeds-balance')
          })

          it('should revert if debt amount is < amount to repay', async function () {
            // given
            const vsEthDebt = await vsEthDebtToken.balanceOf(alice.address)

            // when
            const amountToRepay = vsEthDebt.add('1')
            const tx = controller
              .connect(liquidator)
              .liquidate(vsEth.address, alice.address, amountToRepay, vsdMET.address)

            // then
            await expect(tx).revertedWith('amount-gt-max-liquidable')
          })

          describe('debt floor', function () {
            it('should revert if debt becomes < debt floor', async function () {
              // given
              await controller.updateDebtFloor(parseEther('3000')) // $3,000
              const debtBefore = await vsEthDebtToken.balanceOf(alice.address)
              expect(debtBefore).eq(parseEther('1')) // $4,000

              // when
              const amountToRepay = debtBefore.div('2') // $2,0000
              const tx = controller
                .connect(liquidator)
                .liquidate(vsEth.address, alice.address, amountToRepay, vsdMET.address)

              // then
              await expect(tx).revertedWith('debt-lt-floor')
            })

            it('should allow erase debt when debt floor set', async function () {
              // given
              await controller.updateDebtFloor(parseEther('3000')) // $3,000
              const debtBefore = await vsEthDebtToken.balanceOf(alice.address)
              expect(debtBefore).eq(parseEther('1')) // $4,000

              // when
              const amountToRepay = debtBefore
              await controller
                .connect(liquidator)
                .liquidate(vsEth.address, alice.address, amountToRepay, vsdMET.address)

              // then
              const debtAfter = await vsEthDebtToken.balanceOf(alice.address)
              expect(debtAfter).eq(0)
            })
          })

          it('should revert if repaying more than max allowed to liquidate', async function () {
            // given
            const maxLiquidable = parseEther('0.5') // 50%
            await controller.updateMaxLiquidable(maxLiquidable)
            const vsEthDebt = await vsEthDebtToken.balanceOf(alice.address)

            // when
            const amountToRepay = vsEthDebt.div('2').add('1')
            const tx = controller
              .connect(liquidator)
              .liquidate(vsEth.address, alice.address, amountToRepay, vsdMET.address)

            // then
            await expect(tx).revertedWith('amount-gt-max-liquidable')
          })

          it('should liquidate by repaying all debt (protocolLiquidationFee == 0)', async function () {
            // given
            await controller.updateProtocolLiquidationFee(0)
            const debtInUsdBefore = await controller.debtOf(alice.address)
            const {_depositInUsd: collateralInUsdBefore} = await controller.debtPositionOf(alice.address)

            // when
            const amountToRepay = userMintAmount // repay all user's debt
            const tx = await controller
              .connect(liquidator)
              .liquidate(vsEth.address, alice.address, amountToRepay, vsdMET.address)

            // then
            const [PositionLiquidated] = (await tx.wait()).events!.filter(({event}) => event === 'PositionLiquidated')
            const [, , , , depositSeized] = PositionLiquidated.args!

            const amountToSeizeInUsd = debtInUsdBefore
              .mul(parseEther('1').add(liquidatorLiquidationFee))
              .div(parseEther('1'))
            const expectedDepositSeized = await masterOracle.convertFromUsd(vsdMET.address, amountToSeizeInUsd)
            const expectedDepositAfter = collateralInUsdBefore
              .sub(amountToSeizeInUsd)
              .mul(parseEther('1'))
              .div(newMetPrice)
            const {_isHealthy} = await controller.debtPositionOf(alice.address)

            expect(_isHealthy).true
            expect(depositSeized).eq(expectedDepositSeized)
            expect(await vsdMET.balanceOf(alice.address)).closeTo(expectedDepositAfter, '1')
            expect(await vsEth.balanceOf(alice.address)).eq(userMintAmount)
            expect(await vsEthDebtToken.balanceOf(alice.address)).eq(0)
            expect(await vsdMET.balanceOf(liquidator.address)).eq(liquidatorDepositAmount.add(depositSeized))
            expect(await vsEth.balanceOf(liquidator.address)).eq(liquidatorMintAmount.sub(amountToRepay))
            expect(await vsEthDebtToken.balanceOf(liquidator.address)).eq(liquidatorMintAmount)
          })

          it('should liquidate by repaying all debt (protocolLiquidationFee > 0)', async function () {
            // given
            const protocolLiquidationFee = parseEther('0.01') // 1%
            await controller.updateProtocolLiquidationFee(protocolLiquidationFee)
            const debtInUsdBefore = await controller.debtOf(alice.address)
            const {_depositInUsd: depositInUsdBefore} = await controller.debtPositionOf(alice.address)
            const depositBefore = await masterOracle.convertFromUsd(vsdMET.address, depositInUsdBefore)

            // when
            const amountToRepay = userMintAmount // repay all user's debt
            const tx = await controller
              .connect(liquidator)
              .liquidate(vsEth.address, alice.address, amountToRepay, vsdMET.address)

            // then
            const [PositionLiquidated] = (await tx.wait()).events!.filter(({event}) => event === 'PositionLiquidated')
            const [, , , , depositSeized] = PositionLiquidated.args!

            const depositToSeizeInUsd = debtInUsdBefore
              .mul(parseEther('1').add(liquidatorLiquidationFee.add(protocolLiquidationFee)))
              .div(parseEther('1'))

            const expectedDepositToLiquidator = debtInUsdBefore
              .mul(parseEther('1').add(liquidatorLiquidationFee))
              .div(newMetPrice)
            const expectedDepositSeized = await masterOracle.convertFromUsd(vsdMET.address, depositToSeizeInUsd)
            const expectedDepositAfter = depositBefore.sub(expectedDepositSeized)

            const {_isHealthy} = await controller.debtPositionOf(alice.address)

            expect(_isHealthy).true
            expect(depositSeized).eq(expectedDepositSeized)
            expect(await vsdMET.balanceOf(alice.address)).eq(expectedDepositAfter)
            expect(await vsEth.balanceOf(alice.address)).eq(userMintAmount)
            expect(await vsEthDebtToken.balanceOf(alice.address)).eq(0)
            expect(await vsdMET.balanceOf(liquidator.address)).closeTo(
              liquidatorDepositAmount.add(expectedDepositToLiquidator),
              1
            )
            expect(await vsEth.balanceOf(liquidator.address)).eq(liquidatorMintAmount.sub(amountToRepay))
            expect(await vsEthDebtToken.balanceOf(liquidator.address)).eq(liquidatorMintAmount)
          })

          it('should liquidate by repaying > needed (protocolLiquidationFee == 0)', async function () {
            // given
            await controller.updateProtocolLiquidationFee(0)
            const debtInUsdBefore = await controller.debtOf(alice.address)
            const {_depositInUsd: collateralInUsdBefore} = await controller.debtPositionOf(alice.address)
            const collateralBefore = await masterOracle.convertFromUsd(vsdMET.address, collateralInUsdBefore)
            const minAmountToRepayInUsd = await getMinLiquidationAmountInUsd(controller, alice.address, vsdMET)

            // when
            const amountToRepayInUsd = minAmountToRepayInUsd.mul(parseEther('1.1')).div(parseEther('1')) // min + 10%
            expect(amountToRepayInUsd).lt(debtInUsdBefore) // ensure that isn't paying all debt
            const amountToRepay = amountToRepayInUsd.mul(parseEther('1')).div(ethPrice)
            const tx = await controller
              .connect(liquidator)
              .liquidate(vsEth.address, alice.address, amountToRepay, vsdMET.address)
            const [PositionLiquidated] = (await tx.wait()).events!.filter(({event}) => event === 'PositionLiquidated')
            const [, , , , depositSeized] = PositionLiquidated.args!
            const depositSeizedInUsd = await masterOracle.convertToUsd(vsdMET.address, depositSeized)

            // then
            const {_isHealthy: isHealthyAfter, _depositInUsd: collateralInUsdAfter} = await controller.debtPositionOf(
              alice.address
            )
            const lockedCollateralAfter = await vsdMET.lockedBalanceOf(alice.address)

            expect(isHealthyAfter).true
            expect(collateralInUsdAfter).closeTo(collateralInUsdBefore.sub(depositSeizedInUsd), 1)
            expect(lockedCollateralAfter).gt(0)
            expect(await vsdMET.balanceOf(alice.address)).eq(collateralBefore.sub(depositSeized))
            expect(await vsEth.balanceOf(alice.address)).eq(userMintAmount)
            expect(await vsEthDebtToken.balanceOf(alice.address)).eq(userMintAmount.sub(amountToRepay))
            expect(await vsdMET.balanceOf(liquidator.address)).eq(liquidatorDepositAmount.add(depositSeized))
            expect(await vsEth.balanceOf(liquidator.address)).eq(liquidatorMintAmount.sub(amountToRepay))
            expect(await vsEthDebtToken.balanceOf(liquidator.address)).eq(liquidatorMintAmount)
          })

          it('should liquidate by repaying > needed (protocolLiquidationFee > 0)', async function () {
            // given
            const protocolLiquidationFee = parseEther('0.01') // 1%
            await controller.updateProtocolLiquidationFee(protocolLiquidationFee)
            const debtInUsdBefore = await controller.debtOf(alice.address)
            const {_depositInUsd: collateralInUsdBefore} = await controller.debtPositionOf(alice.address)
            const minAmountToRepayInUsd = await getMinLiquidationAmountInUsd(controller, alice.address, vsdMET)
            const collateralBefore = await masterOracle.convertFromUsd(vsdMET.address, collateralInUsdBefore)

            // when
            const amountToRepayInUsd = minAmountToRepayInUsd.mul(parseEther('1.1')).div(parseEther('1')) // min + 10%
            expect(amountToRepayInUsd).lt(debtInUsdBefore) // ensure that isn't paying all debt
            const amountToRepay = amountToRepayInUsd.mul(parseEther('1')).div(ethPrice)
            const tx = await controller
              .connect(liquidator)
              .liquidate(vsEth.address, alice.address, amountToRepay, vsdMET.address)
            const [PositionLiquidated] = (await tx.wait()).events!.filter(({event}) => event === 'PositionLiquidated')
            const [, , , , depositSeized] = PositionLiquidated.args!

            const amountToRepayInMET = await masterOracle.convert(vsEth.address, vsdMET.address, amountToRepay)

            const expectedDepositToLiquidator = amountToRepayInMET
              .mul(parseEther('1').add(liquidatorLiquidationFee))
              .div(parseEther('1'))

            // then
            const {_isHealthy: isHealthyAfter, _depositInUsd: collateralInUsdAfter} = await controller.debtPositionOf(
              alice.address
            )
            const collateralAfter = await masterOracle.convertFromUsd(vsdMET.address, collateralInUsdAfter)
            const lockedCollateralAfter = await vsdMET.lockedBalanceOf(alice.address)

            expect(isHealthyAfter).true
            expect(collateralAfter).closeTo(collateralBefore.sub(depositSeized), 1)
            expect(lockedCollateralAfter).gt(0)
            expect(await vsdMET.balanceOf(alice.address)).eq(collateralBefore.sub(depositSeized))
            expect(await vsEth.balanceOf(alice.address)).eq(userMintAmount)
            expect(await vsEthDebtToken.balanceOf(alice.address)).eq(userMintAmount.sub(amountToRepay))
            expect(await vsdMET.balanceOf(liquidator.address)).closeTo(
              liquidatorDepositAmount.add(expectedDepositToLiquidator),
              0
            )
            expect(await vsEth.balanceOf(liquidator.address)).eq(liquidatorMintAmount.sub(amountToRepay))
            expect(await vsEthDebtToken.balanceOf(liquidator.address)).eq(liquidatorMintAmount)
          })

          it('should liquidate by repaying < needed (protocolLiquidationFee == 0)', async function () {
            // given
            await controller.updateProtocolLiquidationFee(0)
            const {_depositInUsd: collateralInUsdBefore} = await controller.debtPositionOf(alice.address)
            const collateralBefore = await masterOracle.convertFromUsd(vsdMET.address, collateralInUsdBefore)

            // when
            const minAmountToRepayInUsd = await getMinLiquidationAmountInUsd(controller, alice.address, vsdMET)
            const minAmountToRepay = minAmountToRepayInUsd.mul(parseEther('1')).div(ethPrice)
            const amountToRepay = minAmountToRepay.div('2')
            const tx = await controller
              .connect(liquidator)
              .liquidate(vsEth.address, alice.address, amountToRepay, vsdMET.address)
            const [PositionLiquidated] = (await tx.wait()).events!.filter(({event}) => event === 'PositionLiquidated')
            const [, , , , depositSeized] = PositionLiquidated.args!

            // then
            const {_isHealthy: isHealthyAfter} = await controller.debtPositionOf(alice.address)
            const collateralAfter = await vsdMET.balanceOf(alice.address)
            const unlockedCollateralAfter = await vsdMET.unlockedBalanceOf(alice.address)
            const lockedCollateralAfter = await vsdMET.lockedBalanceOf(alice.address)

            expect(isHealthyAfter).false
            expect(collateralAfter).eq(collateralBefore.sub(depositSeized))
            expect(lockedCollateralAfter).gte(collateralAfter)
            expect(unlockedCollateralAfter).eq(0)
            expect(await vsdMET.balanceOf(alice.address)).eq(collateralBefore.sub(depositSeized))
            expect(await vsEth.balanceOf(alice.address)).eq(userMintAmount)
            expect(await vsEthDebtToken.balanceOf(alice.address)).eq(userMintAmount.sub(amountToRepay))
            expect(await vsdMET.balanceOf(liquidator.address)).eq(liquidatorDepositAmount.add(depositSeized))
            expect(await vsEth.balanceOf(liquidator.address)).eq(liquidatorMintAmount.sub(amountToRepay))
            expect(await vsEthDebtToken.balanceOf(liquidator.address)).eq(liquidatorMintAmount)
          })

          it('should liquidate by repaying < needed (protocolLiquidationFee > 0)', async function () {
            // given
            const protocolLiquidationFee = parseEther('0.01') // 1%
            await controller.updateProtocolLiquidationFee(protocolLiquidationFee)
            const {_depositInUsd: collateralInUsdBefore} = await controller.debtPositionOf(alice.address)
            const collateralBefore = await masterOracle.convertFromUsd(vsdMET.address, collateralInUsdBefore)

            // when
            const amountToRepayInUsd = (await getMinLiquidationAmountInUsd(controller, alice.address, vsdMET)).div('2')
            const amountToRepay = amountToRepayInUsd.mul(parseEther('1')).div(ethPrice)
            const tx = await controller
              .connect(liquidator)
              .liquidate(vsEth.address, alice.address, amountToRepay, vsdMET.address)
            const [PositionLiquidated] = (await tx.wait()).events!.filter(({event}) => event === 'PositionLiquidated')
            const [, , , , depositSeized] = PositionLiquidated.args!

            // then
            const {_isHealthy: isHealthyAfter} = await controller.debtPositionOf(alice.address)
            const collateralAfter = await vsdMET.balanceOf(alice.address)
            const unlockedCollateralAfter = await vsdMET.unlockedBalanceOf(alice.address)
            const lockedCollateralAfter = await vsdMET.lockedBalanceOf(alice.address)

            const amountToRepayInMET = await masterOracle.convert(vsEth.address, vsdMET.address, amountToRepay)

            const expectedDepositToLiquidator = amountToRepayInMET.add(
              amountToRepayInMET.mul(liquidatorLiquidationFee).div(parseEther('1'))
            )

            expect(isHealthyAfter).false
            expect(collateralAfter).eq(collateralBefore.sub(depositSeized))
            expect(lockedCollateralAfter).gte(collateralAfter)
            expect(unlockedCollateralAfter).eq(0)
            expect(await vsdMET.balanceOf(alice.address)).eq(collateralBefore.sub(depositSeized))
            expect(await vsEth.balanceOf(alice.address)).eq(userMintAmount)
            expect(await vsEthDebtToken.balanceOf(alice.address)).eq(userMintAmount.sub(amountToRepay))
            expect(await vsdMET.balanceOf(liquidator.address)).eq(
              liquidatorDepositAmount.add(expectedDepositToLiquidator)
            )
            expect(await vsEth.balanceOf(liquidator.address)).eq(liquidatorMintAmount.sub(amountToRepay))
            expect(await vsEthDebtToken.balanceOf(liquidator.address)).eq(liquidatorMintAmount)
          })

          it('should liquidate by repaying the exact amount needed (protocolLiquidationFee == 0)', async function () {
            // given
            await controller.updateProtocolLiquidationFee(0)
            const {_depositInUsd: depositInUsdBefore} = await controller.debtPositionOf(alice.address)
            const depositBefore = await masterOracle.convertFromUsd(vsdMET.address, depositInUsdBefore)

            // when
            const amountToRepayInUsd = await getMinLiquidationAmountInUsd(controller, alice.address, vsdMET)
            const amountToRepay = amountToRepayInUsd.mul(parseEther('1')).div(ethPrice)
            const tx = await controller
              .connect(liquidator)
              .liquidate(vsEth.address, alice.address, amountToRepay, vsdMET.address)
            const [PositionLiquidated] = (await tx.wait()).events!.filter(({event}) => event === 'PositionLiquidated')
            const [, , , , depositSeized] = PositionLiquidated.args!

            // then
            const {_debtInUsd, _issuableLimitInUsd} = await controller.debtPositionOf(alice.address)
            const depositAfter = await vsdMET.balanceOf(alice.address)
            const unlockedDepositAfter = await vsdMET.unlockedBalanceOf(alice.address)
            const lockedDepositAfter = await vsdMET.lockedBalanceOf(alice.address)

            // Note: The value returned by `getMinLiquidationAmountInUsd` is a few weis less than the needed
            expect(_debtInUsd).closeTo(_issuableLimitInUsd, 104)
            // expect(isHealthyAfter).true
            expect(depositAfter).eq(depositBefore.sub(depositSeized))
            expect(lockedDepositAfter).eq(depositAfter)
            expect(unlockedDepositAfter).eq(0)
            expect(await vsdMET.balanceOf(alice.address)).eq(depositBefore.sub(depositSeized))
            expect(await vsEth.balanceOf(alice.address)).eq(userMintAmount)
            expect(await vsEthDebtToken.balanceOf(alice.address)).eq(userMintAmount.sub(amountToRepay))
            expect(await vsdMET.balanceOf(liquidator.address)).eq(liquidatorDepositAmount.add(depositSeized))
            expect(await vsEth.balanceOf(liquidator.address)).eq(liquidatorMintAmount.sub(amountToRepay))
            expect(await vsEthDebtToken.balanceOf(liquidator.address)).eq(liquidatorMintAmount)
          })

          it('should liquidate by repaying the exact amount needed (protocolLiquidationFee > 0)', async function () {
            // given
            const protocolLiquidationFee = parseEther('0.01') // 1%
            await controller.updateProtocolLiquidationFee(protocolLiquidationFee)
            const {_depositInUsd: depositBeforeInUsd} = await controller.debtPositionOf(alice.address)
            const depositBefore = await masterOracle.convertFromUsd(vsdMET.address, depositBeforeInUsd)

            // when
            const amountToRepayInUsd = await getMinLiquidationAmountInUsd(controller, alice.address, vsdMET)
            const amountToRepay = await masterOracle.convertFromUsd(vsEth.address, amountToRepayInUsd)

            const tx = await controller
              .connect(liquidator)
              .liquidate(vsEth.address, alice.address, amountToRepay, vsdMET.address)
            const [PositionLiquidated] = (await tx.wait()).events!.filter(({event}) => event === 'PositionLiquidated')
            const [, , , , depositSeized] = PositionLiquidated.args!

            // then
            const {_debtInUsd, _issuableLimitInUsd} = await controller.debtPositionOf(alice.address)
            const depositAfter = await vsdMET.balanceOf(alice.address)
            const unlockedDepositAfter = await vsdMET.unlockedBalanceOf(alice.address)
            const lockedDepositAfter = await vsdMET.lockedBalanceOf(alice.address)

            const amountToRepayInMET = await masterOracle.convert(vsEth.address, vsdMET.address, amountToRepay)

            const expectedDepositToLiquidator = amountToRepayInMET.add(
              amountToRepayInMET.mul(liquidatorLiquidationFee).div(parseEther('1'))
            )

            // Note: The value returned by `getMinLiquidationAmountInUsd` is a few weis less than the needed
            expect(_debtInUsd).closeTo(_issuableLimitInUsd, 768)
            // expect(isHealthyAfter).true
            expect(depositAfter).eq(depositBefore.sub(depositSeized))
            expect(lockedDepositAfter).eq(depositAfter)
            expect(unlockedDepositAfter).eq(0)
            expect(await vsdMET.balanceOf(alice.address)).eq(depositBefore.sub(depositSeized))
            expect(await vsEth.balanceOf(alice.address)).eq(userMintAmount)
            expect(await vsEthDebtToken.balanceOf(alice.address)).eq(userMintAmount.sub(amountToRepay))
            expect(await vsdMET.balanceOf(liquidator.address)).closeTo(
              liquidatorDepositAmount.add(expectedDepositToLiquidator),
              1
            )
            expect(await vsEth.balanceOf(liquidator.address)).eq(liquidatorMintAmount.sub(amountToRepay))
            expect(await vsEthDebtToken.balanceOf(liquidator.address)).eq(liquidatorMintAmount)
          })
        })

        describe('when the position is unhealty (collateral:debt < 1)', function () {
          const newMetPrice = toUSD('0.50')

          beforeEach(async function () {
            await masterOracle.updatePrice(vsdMET.address, newMetPrice)
            const _debtInUsd = await controller.debtOf(alice.address)
            const {_depositInUsd} = await controller.debtPositionOf(alice.address)
            expect(_debtInUsd).gt(_depositInUsd)
          })

          it('should revert if paying more than needed to seize all deposit', async function () {
            const amountToRepay = await vsEthDebtToken.balanceOf(alice.address)
            const tx = controller
              .connect(liquidator)
              .liquidate(vsEth.address, alice.address, amountToRepay, vsdMET.address)

            // then
            await expect(tx).revertedWith('amount-too-high')
          })

          it('should liquidate by repaying max possible amount (liquidafeFee == 0)', async function () {
            // given
            await controller.updateProtocolLiquidationFee(0)
            const depositBefore = await vsdMET.balanceOf(alice.address)

            // when
            const amountToRepayInUsd = await getMaxLiquidationAmountInUsd(controller, alice.address)
            const amountToRepay = amountToRepayInUsd.mul(parseEther('1')).div(ethPrice)

            const tx = await controller
              .connect(liquidator)
              .liquidate(vsEth.address, alice.address, amountToRepay, vsdMET.address)

            // then
            const [PositionLiquidated] = (await tx.wait()).events!.filter(({event}) => event === 'PositionLiquidated')
            const [, , , , depositSeized] = PositionLiquidated.args!

            const {_isHealthy} = await controller.debtPositionOf(alice.address)

            const remainder = 1600 // left over amount on user's deposit balance

            expect(_isHealthy).false
            expect(depositSeized).closeTo(depositBefore, remainder)
            expect(await vsdMET.balanceOf(alice.address)).closeTo(BigNumber.from('0'), remainder)
            expect(await vsEth.balanceOf(alice.address)).eq(userMintAmount)
            expect(await vsEthDebtToken.balanceOf(alice.address)).gt(0)
            expect(await vsdMET.balanceOf(liquidator.address)).eq(liquidatorDepositAmount.add(depositSeized))
            expect(await vsEth.balanceOf(liquidator.address)).eq(liquidatorMintAmount.sub(amountToRepay))
            expect(await vsEthDebtToken.balanceOf(liquidator.address)).eq(liquidatorMintAmount)
          })

          it('should liquidate by repaying max possible amount (liquidafeFee > 0)', async function () {
            // given
            const protocolLiquidationFee = parseEther('0.01') // 1%
            await controller.updateProtocolLiquidationFee(protocolLiquidationFee)
            const depositBefore = await vsdMET.balanceOf(alice.address)

            // when
            const amountToRepayInUsd = await getMaxLiquidationAmountInUsd(controller, alice.address)
            const amountToRepay = amountToRepayInUsd.mul(parseEther('1')).div(ethPrice)
            const tx = await controller
              .connect(liquidator)
              .liquidate(vsEth.address, alice.address, amountToRepay, vsdMET.address)

            // then
            const [PositionLiquidated] = (await tx.wait()).events!.filter(({event}) => event === 'PositionLiquidated')
            const [, , , , depositSeized] = PositionLiquidated.args!

            const amountToRepayInMET = await masterOracle.convert(vsEth.address, vsdMET.address, amountToRepay)

            const expectedDepositToLiquidator = amountToRepayInMET.add(
              amountToRepayInMET.mul(liquidatorLiquidationFee).div(parseEther('1'))
            )

            const {_isHealthy} = await controller.debtPositionOf(alice.address)

            const remainder = 6000 // left over amount on user's deposit balance

            expect(_isHealthy).false
            expect(depositSeized).closeTo(depositBefore, remainder)
            expect(await vsdMET.balanceOf(alice.address)).closeTo(BigNumber.from('0'), remainder)
            expect(await vsEth.balanceOf(alice.address)).eq(userMintAmount)
            expect(await vsEthDebtToken.balanceOf(alice.address)).gt(0)
            expect(await vsdMET.balanceOf(liquidator.address)).eq(
              liquidatorDepositAmount.add(expectedDepositToLiquidator)
            )
            expect(await vsEth.balanceOf(liquidator.address)).eq(liquidatorMintAmount.sub(amountToRepay))
            expect(await vsEthDebtToken.balanceOf(liquidator.address)).eq(liquidatorMintAmount)
          })

          it('should liquidate by not repaying all debt (liquidaFee == 0)', async function () {
            // given
            await controller.updateProtocolLiquidationFee(0)
            const {_depositInUsd: collateralInUsdBefore} = await controller.debtPositionOf(alice.address)
            const collateralBefore = await masterOracle.convertFromUsd(vsdMET.address, collateralInUsdBefore)

            // when
            const amountToRepayInUsd = await getMaxLiquidationAmountInUsd(controller, alice.address)
            const minAmountToRepay = amountToRepayInUsd.mul(parseEther('1')).div(ethPrice)
            const amountToRepay = minAmountToRepay.div('2')
            const tx = await controller
              .connect(liquidator)
              .liquidate(vsEth.address, alice.address, amountToRepay, vsdMET.address)
            const [PositionLiquidated] = (await tx.wait()).events!.filter(({event}) => event === 'PositionLiquidated')
            const [, , , , depositSeized] = PositionLiquidated.args!

            // then
            const debtInUsdAfter = await controller.debtOf(alice.address)
            const {_isHealthy: isHealthyAfter, _depositInUsd: collateralInUsdAfter} = await controller.debtPositionOf(
              alice.address
            )
            const collateralAfter = await vsdMET.balanceOf(alice.address)
            const unlockedCollateralAfter = await vsdMET.unlockedBalanceOf(alice.address)
            const lockedCollateralAfter = await vsdMET.lockedBalanceOf(alice.address)

            const currentCollateralizationRatio = collateralInUsdAfter.mul(parseEther('1')).div(debtInUsdAfter)

            expect(currentCollateralizationRatio).lt(metCR)
            expect(isHealthyAfter).false
            expect(collateralAfter).eq(collateralBefore.sub(depositSeized))
            expect(lockedCollateralAfter).gte(collateralInUsdAfter)
            expect(unlockedCollateralAfter).eq(0)
            expect(await vsdMET.balanceOf(alice.address)).eq(collateralBefore.sub(depositSeized))
            expect(await vsEth.balanceOf(alice.address)).eq(userMintAmount)
            expect(await vsEthDebtToken.balanceOf(alice.address)).eq(userMintAmount.sub(amountToRepay))
            expect(await vsdMET.balanceOf(liquidator.address)).eq(liquidatorDepositAmount.add(depositSeized))
            expect(await vsEth.balanceOf(liquidator.address)).eq(liquidatorMintAmount.sub(amountToRepay))
            expect(await vsEthDebtToken.balanceOf(liquidator.address)).eq(liquidatorMintAmount)
          })

          it('should liquidate by not repaying all debt (liquidaFee > 0)', async function () {
            // given
            const protocolLiquidationFee = parseEther('0.01') // 1%
            await controller.updateProtocolLiquidationFee(protocolLiquidationFee)
            const {_depositInUsd: collateralInUsdBefore} = await controller.debtPositionOf(alice.address)
            const collateralBefore = await masterOracle.convertFromUsd(vsdMET.address, collateralInUsdBefore)

            // when
            const amountToRepayInUsd = (await getMaxLiquidationAmountInUsd(controller, alice.address)).div('2')
            const amountToRepay = amountToRepayInUsd.mul(parseEther('1')).div(ethPrice)
            const tx = await controller
              .connect(liquidator)
              .liquidate(vsEth.address, alice.address, amountToRepay, vsdMET.address)
            const [PositionLiquidated] = (await tx.wait()).events!.filter(({event}) => event === 'PositionLiquidated')
            const [, , , , depositSeized] = PositionLiquidated.args!

            // then
            const debtInUsdAfter = await controller.debtOf(alice.address)
            const {_isHealthy: isHealthyAfter, _depositInUsd: collateralInUsdAfter} = await controller.debtPositionOf(
              alice.address
            )
            const collateralAfter = await vsdMET.balanceOf(alice.address)
            const unlockedCollateralAfter = await vsdMET.unlockedBalanceOf(alice.address)
            const lockedCollateralAfter = await vsdMET.lockedBalanceOf(alice.address)

            const amountToRepayInMET = await masterOracle.convert(vsEth.address, vsdMET.address, amountToRepay)

            const expectedDepositToLiquidator = amountToRepayInMET.add(
              amountToRepayInMET.mul(liquidatorLiquidationFee).div(parseEther('1'))
            )

            const currentCollateralizationRatio = collateralInUsdAfter.mul(parseEther('1')).div(debtInUsdAfter)

            expect(currentCollateralizationRatio).lt(metCR)
            expect(isHealthyAfter).false
            expect(collateralAfter).eq(collateralBefore.sub(depositSeized))
            expect(lockedCollateralAfter).gte(collateralInUsdAfter)
            expect(unlockedCollateralAfter).eq(0)
            expect(await vsdMET.balanceOf(alice.address)).eq(collateralBefore.sub(depositSeized))
            expect(await vsEth.balanceOf(alice.address)).eq(userMintAmount)
            expect(await vsEthDebtToken.balanceOf(alice.address)).eq(userMintAmount.sub(amountToRepay))
            expect(await vsdMET.balanceOf(liquidator.address)).eq(
              liquidatorDepositAmount.add(expectedDepositToLiquidator)
            )
            expect(await vsEth.balanceOf(liquidator.address)).eq(liquidatorMintAmount.sub(amountToRepay))
            expect(await vsEthDebtToken.balanceOf(liquidator.address)).eq(liquidatorMintAmount)
          })
        })

        describe('when user minted both vsETH and vsDOGE using all collateral', function () {
          beforeEach(async function () {
            await controller.updateProtocolLiquidationFee(0)

            const {_issuableInUsd} = await controller.debtPositionOf(alice.address)
            const maxIssuableDoge = await masterOracle.convertFromUsd(vsDoge.address, _issuableInUsd)

            await vsDoge.connect(alice).issue(maxIssuableDoge, alice.address)

            const {_isHealthy, _issuableInUsd: _mintableInUsdAfter} = await controller.debtPositionOf(alice.address)
            expect(_isHealthy).true
            expect(_mintableInUsdAfter).eq(0)

            const _unlockedDeposit = await vsdMET.unlockedBalanceOf(alice.address)

            expect(_unlockedDeposit).eq(0)
          })

          it('should liquidate a position that have minted more than one vsAsset', async function () {
            // given
            const newDogePrice = toUSD('0.5')
            await masterOracle.updatePrice(vsDoge.address, newDogePrice) // $0.4 -> $0.5
            const {_isHealthy: isHealthyBefore} = await controller.debtPositionOf(alice.address)
            expect(isHealthyBefore).false

            // when
            const amountToRepay = await vsDogeDebtToken.balanceOf(alice.address)
            await vsDoge.connect(liquidator).issue(amountToRepay, liquidator.address)
            await controller.connect(liquidator).liquidate(vsDoge.address, alice.address, amountToRepay, vsdMET.address)

            // then
            const {_isHealthy: isHealthyAfter} = await controller.debtPositionOf(alice.address)
            expect(isHealthyAfter).true
          })
        })
      })
    })
  })

  describe('whitelisting', function () {
    describe('addSyntheticToken', function () {
      it('should revert if not governor', async function () {
        const tx = controller.connect(alice).addSyntheticToken(vsEth.address)
        await expect(tx).revertedWith('not-governor')
      })

      it('should add synthetic token', async function () {
        const someTokenAddress = met.address
        const syntheticTokensBefore = await controller.getSyntheticTokens()
        await controller.addSyntheticToken(someTokenAddress)
        const syntheticTokensAfter = await controller.getSyntheticTokens()
        expect(syntheticTokensAfter.length).eq(syntheticTokensBefore.length + 1)
      })
    })

    describe('removeSyntheticToken', function () {
      it('should remove synthetic token', async function () {
        // given
        const debtTokenMockFactory = new DebtTokenMock__factory(deployer)
        const debtToken = await debtTokenMockFactory.deploy()

        const syntheticTokenFactory = new SyntheticToken__factory(deployer)
        const vsAsset = await syntheticTokenFactory.deploy()
        await vsAsset.initialize(
          'Vesper Synth BTC',
          'vsBTC',
          8,
          controller.address,
          debtToken.address,
          interestRate,
          MaxUint256
        )

        await debtToken.initialize('Vesper Synth BTC debt', 'vsBTC-Debt', 8, controller.address)
        await debtToken.setSyntheticToken(vsAsset.address)

        expect(await vsAsset.totalSupply()).eq(0)
        await controller.addSyntheticToken(vsAsset.address)
        const syntheticTokensBefore = await controller.getSyntheticTokens()

        // when
        await controller.removeSyntheticToken(vsAsset.address)

        // then
        const syntheticTokensAfter = await controller.getSyntheticTokens()
        expect(syntheticTokensAfter.length).eq(syntheticTokensBefore.length - 1)
      })

      it('should revert if not governor', async function () {
        // when
        const tx = controller.connect(alice).removeSyntheticToken(vsEth.address)

        // then
        await expect(tx).revertedWith('not-governor')
      })

      it('should revert if vsAsset has any supply', async function () {
        // given
        const ERC20MockFactory = new ERC20Mock__factory(deployer)
        const vsAsset = await ERC20MockFactory.deploy('Vesper Synth BTC', 'vsBTC', 8)
        await vsAsset.deployed()
        await controller.addSyntheticToken(vsAsset.address)
        await vsAsset.mint(deployer.address, parseEther('100'))
        expect(await vsAsset.totalSupply()).gt(0)

        // when
        const tx = controller.removeSyntheticToken(vsAsset.address)

        // then
        await expect(tx).revertedWith('supply-gt-0')
      })
    })
  })

  describe('updateMasterOracle', function () {
    it('should revert if not gorvernor', async function () {
      // when
      const tx = controller.connect(alice.address).updateMasterOracle(ethers.constants.AddressZero)

      // then
      await expect(tx).revertedWith('not-governor')
    })

    it('should revert if using the same address', async function () {
      // given
      expect(await controller.masterOracle()).eq(masterOracle.address)

      // when
      const tx = controller.updateMasterOracle(masterOracle.address)

      // then
      await expect(tx).revertedWith('new-same-as-current')
    })

    it('should revert if address is zero', async function () {
      // when
      const tx = controller.updateMasterOracle(ethers.constants.AddressZero)

      // then
      await expect(tx).revertedWith('address-is-null')
    })

    it('should update master oracle contract', async function () {
      // given
      const currentMasterOracle = await controller.masterOracle()
      const newMasterOracle = bob.address
      expect(currentMasterOracle).not.eq(newMasterOracle)

      // when
      const tx = controller.updateMasterOracle(newMasterOracle)

      // then
      await expect(tx).emit(controller, 'MasterOracleUpdated').withArgs(currentMasterOracle, newMasterOracle)
      expect(await controller.masterOracle()).eq(newMasterOracle)
    })
  })

  describe('updateTreasury', function () {
    it('should revert if using the same address', async function () {
      // given
      expect(await controller.treasury()).eq(treasury.address)

      // when
      const tx = controller.updateTreasury(treasury.address, true)

      // then
      await expect(tx).revertedWith('new-same-as-current')
    })

    it('should revert if caller is not governor', async function () {
      // when
      const tx = controller.connect(alice.address).updateTreasury(treasury.address, true)

      // then
      await expect(tx).revertedWith('not-governor')
    })

    it('should revert if address is zero', async function () {
      // when
      const tx = controller.updateTreasury(ethers.constants.AddressZero, true)

      // then
      await expect(tx).revertedWith('address-is-null')
    })

    it('should migrate funds to the new treasury', async function () {
      const treasuryFactory = new Treasury__factory(deployer)
      const newTreasury = await treasuryFactory.deploy()
      await newTreasury.deployed()
      await newTreasury.initialize(controller.address)

      // given
      const balance = parseEther('1')
      await met.mint(deployer.address, parseEther('10000'))
      await met.approve(vsdMET.address, parseEther('10000'))
      await vsdMET.deposit(parseEther('10000'), deployer.address)

      await vsdMET.transfer(treasury.address, balance)
      await vsEth.issue(balance, deployer.address)
      await vsEth.transfer(treasury.address, balance)

      expect(await met.balanceOf(treasury.address)).gt(0)
      expect(await vsEth.balanceOf(treasury.address)).gt(0)
      expect(await vsdMET.balanceOf(treasury.address)).gt(0)

      // when
      await controller.updateTreasury(newTreasury.address, true)

      // then
      expect(await met.balanceOf(treasury.address)).eq(0)
      expect(await vsEth.balanceOf(treasury.address)).eq(0)
      expect(await vsdMET.balanceOf(treasury.address)).eq(0)
    })
  })

  describe('depositTokensOfAccount', function () {
    let vsdTOKEN: FakeContract

    beforeEach(async function () {
      vsdTOKEN = await smock.fake('DepositToken')
      await controller.addDepositToken(vsdTOKEN.address)
      await setEtherBalance(vsdTOKEN.address, parseEther('1'))
    })

    describe('addToDepositTokensOfAccount', function () {
      it('should revert if caller is not a deposit token', async function () {
        const tx = controller.connect(alice).addToDepositTokensOfAccount(alice.address)
        await expect(tx).revertedWith('caller-is-not-deposit-token')
      })

      // eslint-disable-next-line quotes
      it("should add deposit token to the account's array", async function () {
        // given
        expect(await controller.getDepositTokensOfAccount(alice.address)).deep.eq([])

        // then
        await controller.connect(vsdTOKEN.wallet).addToDepositTokensOfAccount(alice.address)

        // when
        expect(await controller.getDepositTokensOfAccount(alice.address)).deep.eq([vsdTOKEN.address])
      })

      it('should revert when trying to add same deposit token twice', async function () {
        // given
        expect(await controller.getDepositTokensOfAccount(alice.address)).deep.eq([])

        // then
        await controller.connect(vsdTOKEN.wallet).addToDepositTokensOfAccount(alice.address)
        const tx = controller.connect(vsdTOKEN.wallet).addToDepositTokensOfAccount(alice.address)

        // when
        await expect(tx).revertedWith('deposit-token-exists')
      })
    })

    describe('removeFromDepositTokensOfAccount', function () {
      beforeEach(async function () {
        await controller.connect(vsdTOKEN.wallet).addToDepositTokensOfAccount(alice.address)
      })

      it('should revert if caller is not a deposit token', async function () {
        const tx = controller.connect(alice).removeFromDepositTokensOfAccount(alice.address)
        await expect(tx).revertedWith('caller-is-not-deposit-token')
      })

      // eslint-disable-next-line quotes
      it("should remove deposit token to the account's array", async function () {
        // given
        expect(await controller.getDepositTokensOfAccount(alice.address)).deep.eq([vsdTOKEN.address])

        // then
        await controller.connect(vsdTOKEN.wallet).removeFromDepositTokensOfAccount(alice.address)

        // when
        expect(await controller.getDepositTokensOfAccount(alice.address)).deep.eq([])
      })
    })
  })

  describe('debtTokensOfAccount', function () {
    let syntheticToken: FakeContract
    let debtToken: FakeContract

    beforeEach(async function () {
      syntheticToken = await smock.fake('SyntheticToken')
      debtToken = await smock.fake('DebtToken')
      syntheticToken.debtToken.returns(debtToken.address)
      debtToken.syntheticToken.returns(syntheticToken.address)

      await controller.addSyntheticToken(syntheticToken.address)
      await setEtherBalance(debtToken.address, parseEther('1'))
    })

    describe('addToDebtTokensOfAccount', function () {
      it('should revert if caller is not a debt token', async function () {
        const invalidDebtToken = await smock.fake('DebtToken')
        invalidDebtToken.syntheticToken.returns(syntheticToken.address)

        const tx = controller.connect(invalidDebtToken.wallet).addToDebtTokensOfAccount(alice.address)
        await expect(tx).revertedWith('caller-is-not-debt-token')
      })

      // eslint-disable-next-line quotes
      it("should add debt token to the account's array", async function () {
        // given
        expect(await controller.getDebtTokensOfAccount(alice.address)).deep.eq([])

        // then
        await controller.connect(debtToken.wallet).addToDebtTokensOfAccount(alice.address)

        // when
        expect(await controller.getDebtTokensOfAccount(alice.address)).deep.eq([debtToken.address])
      })

      it('should revert when trying to add same debt token twice', async function () {
        // given
        expect(await controller.getDebtTokensOfAccount(alice.address)).deep.eq([])

        // then
        await controller.connect(debtToken.wallet).addToDebtTokensOfAccount(alice.address)
        const tx = controller.connect(debtToken.wallet).addToDebtTokensOfAccount(alice.address)

        // when
        await expect(tx).revertedWith('debt-token-exists')
      })
    })

    describe('removeFromDebtTokensOfAccount', function () {
      beforeEach(async function () {
        await controller.connect(debtToken.wallet).addToDebtTokensOfAccount(alice.address)
      })

      it('should revert if caller is not a debt token', async function () {
        const invalidDebtToken = await smock.fake('DebtToken')
        invalidDebtToken.syntheticToken.returns(syntheticToken.address)

        const tx = controller.connect(invalidDebtToken.wallet).removeFromDebtTokensOfAccount(alice.address)
        await expect(tx).revertedWith('caller-is-not-debt-token')
      })

      // eslint-disable-next-line quotes
      it("should remove debt token to the account's array", async function () {
        // given
        expect(await controller.getDebtTokensOfAccount(alice.address)).deep.eq([debtToken.address])

        // then
        await controller.connect(debtToken.wallet).removeFromDebtTokensOfAccount(alice.address)

        // when
        expect(await controller.getDebtTokensOfAccount(alice.address)).deep.eq([])
      })
    })
  })

  describe('updateDepositFee', function () {
    it('should revert if caller is not governor', async function () {
      // when
      const tx = controller.connect(alice.address).updateDepositFee(parseEther('1'))

      // then
      await expect(tx).revertedWith('not-governor')
    })

    it('should revert if using the current value', async function () {
      // when
      const depositFee = await controller.depositFee()
      const tx = controller.updateDepositFee(depositFee)

      // then
      await expect(tx).revertedWith('new-same-as-current')
    })

    it('should revert if deposit fee > 100%', async function () {
      // when
      const newDepositFee = parseEther('1').add('1')
      const tx = controller.updateDepositFee(newDepositFee)

      // then
      await expect(tx).revertedWith('max-is-100%')
    })

    it('should update deposit fee param', async function () {
      // given
      const currentDepositFee = await controller.depositFee()
      const newDepositFee = parseEther('0.01')
      expect(newDepositFee).not.eq(currentDepositFee)

      // when
      const tx = controller.updateDepositFee(newDepositFee)

      // then
      await expect(tx).emit(controller, 'DepositFeeUpdated').withArgs(currentDepositFee, newDepositFee)
    })
  })

  describe('updateIssueFee', function () {
    it('should revert if caller is not governor', async function () {
      // when
      const tx = controller.connect(alice.address).updateIssueFee(parseEther('1'))

      // then
      await expect(tx).revertedWith('not-governor')
    })

    it('should revert if using the current value', async function () {
      // when
      const issueFee = await controller.issueFee()
      const tx = controller.updateIssueFee(issueFee)

      // then
      await expect(tx).revertedWith('new-same-as-current')
    })

    it('should revert if issue fee > 100%', async function () {
      // when
      const newIssueFee = parseEther('1').add('1')
      const tx = controller.updateIssueFee(newIssueFee)

      // then
      await expect(tx).revertedWith('max-is-100%')
    })

    it('should update issue fee param', async function () {
      // given
      const currentIssueFee = await controller.issueFee()
      const newIssueFee = parseEther('0.01')
      expect(newIssueFee).not.eq(currentIssueFee)

      // when
      const tx = controller.updateIssueFee(newIssueFee)

      // then
      await expect(tx).emit(controller, 'IssueFeeUpdated').withArgs(currentIssueFee, newIssueFee)
    })
  })

  describe('updateWithdrawFee', function () {
    it('should revert if caller is not governor', async function () {
      // when
      const tx = controller.connect(alice.address).updateWithdrawFee(parseEther('1'))

      // then
      await expect(tx).revertedWith('not-governor')
    })

    it('should revert if using the current value', async function () {
      // when
      const withdrawFee = await controller.withdrawFee()
      const tx = controller.updateWithdrawFee(withdrawFee)

      // then
      await expect(tx).revertedWith('new-same-as-current')
    })

    it('should revert if withdraw fee > 100%', async function () {
      // when
      const newWithdrawFee = parseEther('1').add('1')
      const tx = controller.updateWithdrawFee(newWithdrawFee)

      // then
      await expect(tx).revertedWith('max-is-100%')
    })

    it('should update withdraw fee param', async function () {
      // given
      const currentWithdrawFee = await controller.withdrawFee()
      const newWithdrawFee = parseEther('0.01')
      expect(newWithdrawFee).not.eq(currentWithdrawFee)

      // when
      const tx = controller.updateWithdrawFee(newWithdrawFee)

      // then
      await expect(tx).emit(controller, 'WithdrawFeeUpdated').withArgs(currentWithdrawFee, newWithdrawFee)
    })
  })

  describe('updateRepayFee', function () {
    it('should revert if caller is not governor', async function () {
      // when
      const tx = controller.connect(alice.address).updateRepayFee(parseEther('1'))

      // then
      await expect(tx).revertedWith('not-governor')
    })

    it('should revert if using the current value', async function () {
      // when
      const repayFee = await controller.repayFee()
      const tx = controller.updateRepayFee(repayFee)

      // then
      await expect(tx).revertedWith('new-same-as-current')
    })

    it('should revert if repay fee > 100%', async function () {
      // when
      const newRepayFee = parseEther('1').add('1')
      const tx = controller.updateRepayFee(newRepayFee)

      // then
      await expect(tx).revertedWith('max-is-100%')
    })

    it('should update repay fee param', async function () {
      // given
      const currentRepayFee = await controller.repayFee()
      const newRepayFee = parseEther('0.01')
      expect(newRepayFee).not.eq(currentRepayFee)

      // when
      const tx = controller.updateRepayFee(newRepayFee)

      // then
      await expect(tx).emit(controller, 'RepayFeeUpdated').withArgs(currentRepayFee, newRepayFee)
    })
  })

  describe('updateSwapFee', function () {
    it('should revert if caller is not governor', async function () {
      // when
      const tx = controller.connect(alice.address).updateSwapFee(parseEther('1'))

      // then
      await expect(tx).revertedWith('not-governor')
    })

    it('should revert if using the current value', async function () {
      // when
      const swapFee = await controller.swapFee()
      const tx = controller.updateSwapFee(swapFee)

      // then
      await expect(tx).revertedWith('new-same-as-current')
    })

    it('should revert if swap fee > 100%', async function () {
      // when
      const newSwapFee = parseEther('1').add('1')
      const tx = controller.updateSwapFee(newSwapFee)

      // then
      await expect(tx).revertedWith('max-is-100%')
    })

    it('should update swap fee param', async function () {
      // given
      const currentSwapFee = await controller.swapFee()
      const newSwapFee = parseEther('0.01')
      expect(newSwapFee).not.eq(currentSwapFee)

      // when
      const tx = controller.updateSwapFee(newSwapFee)

      // then
      await expect(tx).emit(controller, 'SwapFeeUpdated').withArgs(currentSwapFee, newSwapFee)
    })
  })

  describe('updateLiquidatorLiquidationFee', function () {
    it('should revert if caller is not governor', async function () {
      // when
      const tx = controller.connect(alice.address).updateLiquidatorLiquidationFee(parseEther('1'))

      // then
      await expect(tx).revertedWith('not-governor')
    })

    it('should revert if using the current value', async function () {
      // when
      const newLiquidatorLiquidationFee = await controller.liquidatorLiquidationFee()
      const tx = controller.updateLiquidatorLiquidationFee(newLiquidatorLiquidationFee)

      // then
      await expect(tx).revertedWith('new-same-as-current')
    })

    it('should revert if liquidator liquidation fee > 100%', async function () {
      // when
      const newLiquidatorLiquidationFee = parseEther('1').add('1')
      const tx = controller.updateLiquidatorLiquidationFee(newLiquidatorLiquidationFee)

      // then
      await expect(tx).revertedWith('max-is-100%')
    })

    it('should update liquidator liquidation fee param', async function () {
      // given
      const currentLiquidatorLiquidationFee = await controller.liquidatorLiquidationFee()
      const newLiquidatorLiquidationFee = parseEther('0.01')
      expect(newLiquidatorLiquidationFee).not.eq(currentLiquidatorLiquidationFee)

      // when
      const tx = controller.updateLiquidatorLiquidationFee(newLiquidatorLiquidationFee)

      // then
      await expect(tx)
        .emit(controller, 'LiquidatorLiquidationFeeUpdated')
        .withArgs(currentLiquidatorLiquidationFee, newLiquidatorLiquidationFee)
    })
  })

  describe('updateProtocolLiquidationFee', function () {
    it('should revert if caller is not governor', async function () {
      // when
      const tx = controller.connect(alice.address).updateProtocolLiquidationFee(parseEther('1'))

      // then
      await expect(tx).revertedWith('not-governor')
    })

    it('should revert if using the current value', async function () {
      // when
      const newProtocolLiquidationFee = await controller.protocolLiquidationFee()
      const tx = controller.updateProtocolLiquidationFee(newProtocolLiquidationFee)

      // then
      await expect(tx).revertedWith('new-same-as-current')
    })

    it('should revert if protocol liquidation fee > 100%', async function () {
      // when
      const newProtocolLiquidationFee = parseEther('1').add('1')
      const tx = controller.updateProtocolLiquidationFee(newProtocolLiquidationFee)

      // then
      await expect(tx).revertedWith('max-is-100%')
    })

    it('should update protocol liquidation fee param', async function () {
      // given
      const currentProtocolLiquidationFee = await controller.protocolLiquidationFee()
      const newProtocolLiquidationFee = parseEther('0.01')
      expect(newProtocolLiquidationFee).not.eq(currentProtocolLiquidationFee)

      // when
      const tx = controller.updateProtocolLiquidationFee(newProtocolLiquidationFee)

      // then
      await expect(tx)
        .emit(controller, 'ProtocolLiquidationFeeUpdated')
        .withArgs(currentProtocolLiquidationFee, newProtocolLiquidationFee)
    })
  })

  describe('updateMaxLiquidable', function () {
    it('should revert if caller is not governor', async function () {
      // when
      const tx = controller.connect(alice.address).updateMaxLiquidable(parseEther('1'))

      // then
      await expect(tx).revertedWith('not-governor')
    })

    it('should revert if using the current value', async function () {
      // when
      const maxLiquidable = await controller.maxLiquidable()
      const tx = controller.updateMaxLiquidable(maxLiquidable)

      // then
      await expect(tx).revertedWith('new-same-as-current')
    })

    it('should revert if max liquidable > 100%', async function () {
      // when
      const maxLiquidable = parseEther('1').add('1')
      const tx = controller.updateMaxLiquidable(maxLiquidable)

      // then
      await expect(tx).revertedWith('max-is-100%')
    })

    it('should update max liquidable param', async function () {
      // given
      const currentMaxLiquidable = await controller.maxLiquidable()
      const newMaxLiquidable = currentMaxLiquidable.div('2')

      // when
      const tx = controller.updateMaxLiquidable(newMaxLiquidable)

      // then
      await expect(tx).emit(controller, 'MaxLiquidableUpdated').withArgs(currentMaxLiquidable, newMaxLiquidable)
    })
  })

  describe('updateDebtFloor', function () {
    it('should revert if caller is not governor', async function () {
      // when
      const tx = controller.connect(alice.address).updateDebtFloor(parseEther('1'))

      // then
      await expect(tx).revertedWith('not-governor')
    })

    it('should revert if using the current value', async function () {
      // when
      const debtFloorInUsd = await controller.debtFloorInUsd()
      const tx = controller.updateDebtFloor(debtFloorInUsd)

      // then
      await expect(tx).revertedWith('new-same-as-current')
    })

    it('should update debt floor param', async function () {
      // given
      const currentDebtFloorInUsd = await controller.debtFloorInUsd()
      const newDebtFloorInUsd = parseEther('100')

      // when
      const tx = controller.updateDebtFloor(newDebtFloorInUsd)

      // then
      await expect(tx).emit(controller, 'DebtFloorUpdated').withArgs(currentDebtFloorInUsd, newDebtFloorInUsd)
    })
  })

  describe('addRewardsDistributor', function () {
    it('should revert if caller is not governor', async function () {
      // when
      const tx = controller.connect(alice.address).addRewardsDistributor(ethers.constants.AddressZero)

      // then
      await expect(tx).revertedWith('not-governor')
    })

    it('should revert if null', async function () {
      // when
      const tx = controller.addRewardsDistributor(ethers.constants.AddressZero)

      // then
      await expect(tx).revertedWith('address-is-null')
    })

    it('should revert if already added', async function () {
      // given
      await controller.addRewardsDistributor(alice.address)

      // when
      const tx = controller.addRewardsDistributor(alice.address)

      // then
      await expect(tx).revertedWith('contract-already-added')
    })

    it('should add a rewards distributor', async function () {
      // given
      const before = await controller.getRewardsDistributors()
      expect(before).deep.eq([])

      // when
      const tx = controller.addRewardsDistributor(alice.address)

      // then
      await expect(tx).emit(controller, 'RewardsDistributorAdded').withArgs(alice.address)
      const after = await controller.getRewardsDistributors()
      expect(after).deep.eq([alice.address])
    })
  })
})
