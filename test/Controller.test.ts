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
  OracleMock,
  OracleMock__factory,
  SyntheticToken,
  SyntheticToken__factory,
  Treasury,
  Treasury__factory,
  Controller__factory,
  Controller,
  DebtTokenMock,
  DebtTokenMock__factory,
} from '../typechain'
import {
  getMaxLiquidationAmountInUsd,
  getMinLiquidationAmountInUsd,
  HOUR,
  increaseTime,
  setEtherBalance,
} from './helpers'
import {FakeContract, smock} from '@defi-wonderland/smock'

chai.use(smock.matchers)

const liquidatorFee = parseEther('0.1') // 10%
const metCR = parseEther('0.67') // 67%
const daiCR = parseEther('0.5') // 50%
const ethRate = parseEther('4000') // 1 ETH = $4,000
const metRate = parseEther('4') // 1 MET = $4
const daiRate = parseEther('1') // 1 DAI = $1
const dogeRate = parseEther('0.4') // 1 DOGE = $0.4
const interestRate = parseEther('0')

async function fixture() {
  const [deployer, alice, , liquidator] = await ethers.getSigners()
  const oracleMock = new OracleMock__factory(deployer)
  const oracle = <OracleMock>await oracleMock.deploy()
  await oracle.deployed()

  const erc20MockFactory = new ERC20Mock__factory(deployer)

  const met = await erc20MockFactory.deploy('Metronome', 'MET', 18)
  await met.deployed()

  const dai = await erc20MockFactory.deploy('Dai Stablecoin', 'DAI', 8)
  await dai.deployed()

  const treasuryFactory = new Treasury__factory(deployer)
  const treasury = await treasuryFactory.deploy()
  await treasury.deployed()

  const depositTokenFactory = new DepositToken__factory(deployer)
  const metDepositToken = await depositTokenFactory.deploy()
  await metDepositToken.deployed()

  const daiDepositToken = await depositTokenFactory.deploy()
  await daiDepositToken.deployed()

  const debtTokenMockFactory = new DebtTokenMock__factory(deployer)

  const vsEthDebtToken = await debtTokenMockFactory.deploy()
  await vsEthDebtToken.deployed()

  const vsDogeDebtToken = await debtTokenMockFactory.deploy()
  await vsDogeDebtToken.deployed()

  const syntheticTokenFactory = new SyntheticToken__factory(deployer)

  const vsEth = await syntheticTokenFactory.deploy()
  await vsEth.deployed()

  const vsDoge = await syntheticTokenFactory.deploy()
  await vsDoge.deployed()

  const controllerFactory = new Controller__factory(deployer)
  const controller = await controllerFactory.deploy()
  await controller.deployed()

  // Deployment tasks
  await metDepositToken.initialize(met.address, controller.address, 'vSynth-MET', 18, metCR)

  await daiDepositToken.initialize(dai.address, controller.address, 'vSynth-DAI', 8, daiCR)

  await treasury.initialize(controller.address)

  await vsEthDebtToken.initialize('vsETH Debt', 'vsETH-Debt', 18, controller.address, vsEth.address)

  await vsEth.initialize('Vesper Synth ETH', 'vsETH', 18, controller.address, vsEthDebtToken.address, interestRate)

  await vsDogeDebtToken.initialize('vsDOGE Debt', 'vsDOGE-Debt', 18, controller.address, vsDoge.address)

  await vsDoge.initialize('Vesper Synth DOGE', 'vsDOGE', 18, controller.address, vsDogeDebtToken.address, interestRate)

  await controller.initialize(oracle.address, treasury.address)
  await controller.updateLiquidatorFee(liquidatorFee)
  await controller.addDepositToken(metDepositToken.address)
  await controller.addSyntheticToken(vsEth.address)
  await controller.addDepositToken(daiDepositToken.address)
  await controller.addSyntheticToken(vsDoge.address)

  // mint some collaterals to users
  await met.mint(alice.address, parseEther(`${1e6}`))
  await met.mint(liquidator.address, parseEther(`${1e6}`))
  await dai.mint(alice.address, parseEther(`${1e6}`))

  // initialize mocked oracle
  await oracle.updateRate(daiDepositToken.address, daiRate)
  await oracle.updateRate(metDepositToken.address, metRate)
  await oracle.updateRate(vsEth.address, ethRate)
  await oracle.updateRate(vsDoge.address, dogeRate)

  return {
    oracle,
    met,
    dai,
    treasury,
    metDepositToken,
    daiDepositToken,
    vsEthDebtToken,
    vsDogeDebtToken,
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
  let metDepositToken: DepositToken
  let daiDepositToken: DepositToken
  let oracle: OracleMock
  let controller: Controller

  beforeEach(async function () {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[deployer, alice, bob, liquidator] = await ethers.getSigners()
    ;({
      oracle,
      met,
      dai,
      treasury,
      metDepositToken,
      daiDepositToken,
      vsEthDebtToken,
      vsDogeDebtToken,
      vsEth,
      vsDoge,
      controller,
    } = await waffle.loadFixture(fixture))
  })

  describe('deposit', function () {
    beforeEach(async function () {
      await met.connect(alice).approve(controller.address, ethers.constants.MaxUint256)
    })

    it('should revert if paused', async function () {
      // given
      await controller.pause()

      // when
      const toDeposit = parseEther('10')
      const tx = controller.connect(alice).deposit(metDepositToken.address, toDeposit, alice.address)

      // then
      await expect(tx).revertedWith('paused')
    })

    it('should revert if shutdown', async function () {
      // given
      await controller.shutdown()

      // when
      const toDeposit = parseEther('10')
      const tx = controller.connect(alice).deposit(metDepositToken.address, toDeposit, alice.address)

      // then
      await expect(tx).revertedWith('paused')
    })

    it('should revert if collateral amount is 0', async function () {
      const toDeposit = 0
      const tx = controller.connect(alice).deposit(metDepositToken.address, toDeposit, alice.address)
      await expect(tx).revertedWith('amount-is-zero')
    })

    it('should revert if MET balance is not enough', async function () {
      const balance = await met.balanceOf(alice.address)
      const tooHigh = balance.add('1')
      const tx = controller.connect(alice).deposit(metDepositToken.address, tooHigh, alice.address)
      await expect(tx).reverted
    })

    it('should deposit MET and mint vSynth-MET (depositFee == 0)', async function () {
      // when
      const amount = parseEther('10')
      const tx = () => controller.connect(alice).deposit(metDepositToken.address, amount, alice.address)

      // then
      await expect(tx).changeTokenBalances(met, [alice, treasury], [amount.mul('-1'), amount])
      await expect(tx).changeTokenBalances(metDepositToken, [alice, controller], [amount, 0])
      await expect(tx())
        .emit(controller, 'CollateralDeposited')
        .withArgs(metDepositToken.address, alice.address, alice.address, amount, 0)
    })

    it('should deposit TOKEN and mint vSynth-TOKEN when TOKEN has transfer fee', async function () {
      // given
      const fee = parseEther('0.1') // 10%
      await met.updateFee(fee)

      // when
      const amount = parseEther('100')
      const tx = () => controller.connect(alice).deposit(metDepositToken.address, amount, alice.address)

      // then
      const amountAfterFee = amount.sub(amount.mul(fee).div(parseEther('1')))
      await expect(tx).changeTokenBalances(met, [alice, treasury], [amount.mul('-1'), amountAfterFee])
      await expect(tx).changeTokenBalances(metDepositToken, [alice, controller], [amountAfterFee, 0])
      await expect(tx())
        .emit(controller, 'CollateralDeposited')
        .withArgs(metDepositToken.address, alice.address, alice.address, amountAfterFee, 0)
    })

    it('should deposit MET and mint vSynth-MET (depositFee > 0)', async function () {
      // given
      const depositFee = parseEther('0.01') // 1%
      await controller.updateDepositFee(depositFee)

      // when
      const amount = parseEther('100')
      const tx = () => controller.connect(alice).deposit(metDepositToken.address, amount, alice.address)
      const expectedFeeAmount = parseEther('1')
      const expectedAmounAfterFee = parseEther('99') // -1% fee

      // then
      await expect(tx).changeTokenBalances(met, [alice, treasury], [amount.mul('-1'), amount])
      await expect(tx).changeTokenBalances(
        metDepositToken,
        [alice, controller, treasury],
        [expectedAmounAfterFee, 0, expectedFeeAmount]
      )
      await expect(tx())
        .emit(controller, 'CollateralDeposited')
        .withArgs(metDepositToken.address, alice.address, alice.address, amount, expectedFeeAmount)
    })

    it('should deposit on behalf of another user', async function () {
      // when
      const amount = parseEther('10')
      const tx = () => controller.connect(alice).deposit(metDepositToken.address, amount, bob.address)

      // then
      await expect(tx).changeTokenBalances(met, [alice, treasury], [amount.mul('-1'), amount])
      await expect(tx).changeTokenBalances(metDepositToken, [controller, bob], [0, amount])
      await expect(tx())
        .emit(controller, 'CollateralDeposited')
        .withArgs(metDepositToken.address, alice.address, bob.address, amount, 0)
    })

    describe('when user deposited multi-collateral', function () {
      const metDepositAmount = parseEther('6000') // ~$24,000
      const daiDepositAmount = parseEther('24000') // ~$24,000

      beforeEach(async function () {
        await met.connect(alice).approve(controller.address, ethers.constants.MaxUint256)
        await dai.connect(alice).approve(controller.address, ethers.constants.MaxUint256)

        await controller.connect(alice).deposit(metDepositToken.address, metDepositAmount, alice.address)
        await controller.connect(alice).deposit(daiDepositToken.address, daiDepositAmount, alice.address)
      })

      it('should calculate deposit correctly', async function () {
        const {_isHealthy, _depositInUsd, _debtInUsd, _mintableLimitInUsd, _mintableInUsd} =
          await controller.debtPositionOf(alice.address)

        const limitForMet = (await metDepositToken.balanceOf(alice.address)).mul(metCR).div(parseEther('1'))
        const limitForDai = (await daiDepositToken.balanceOf(alice.address)).mul(daiCR).div(parseEther('1'))
        const limitForMetInUsd = await oracle.convertToUsd(metDepositToken.address, limitForMet)
        const limitForDaiInUsd = await oracle.convertToUsd(daiDepositToken.address, limitForDai)
        const _expectedMintableLimitInUsd = limitForMetInUsd.add(limitForDaiInUsd)

        expect(_isHealthy).eq(true)
        expect(_depositInUsd).eq(parseEther('48000'))
        expect(_debtInUsd).eq(0)
        expect(_mintableLimitInUsd).eq(_expectedMintableLimitInUsd)
        expect(_mintableInUsd).eq(_mintableLimitInUsd.sub(_debtInUsd))
      })

      it('should be able to mint using position among multiple collaterals', async function () {
        const {_mintableInUsd: _mintableInUsdBefore} = await controller.debtPositionOf(alice.address)

        const amountToMint = await oracle.convertFromUsd(vsEth.address, _mintableInUsdBefore)
        await controller.connect(alice).mint(vsEth.address, amountToMint, alice.address)

        const {_isHealthy, _mintableInUsd, _depositInUsd} = await controller.debtPositionOf(alice.address)

        expect(_isHealthy).eq(true)
        expect(_depositInUsd).eq(parseEther('48000'))
        expect(_mintableInUsd).eq(0)
      })
    })

    describe('when user deposited some MET', function () {
      const userDepositAmount = parseEther('6000')

      beforeEach(async function () {
        await met.connect(alice).approve(controller.address, ethers.constants.MaxUint256)
        await controller.connect(alice).deposit(metDepositToken.address, userDepositAmount, alice.address)
      })

      it('should withdraw when collateral charges transfer fee', async function () {
        // given
        const fee = parseEther('0.1') // 10%
        await met.updateFee(fee)
        const metBalanceBefore = await met.balanceOf(alice.address)
        const amountToWithdraw = await metDepositToken.balanceOf(alice.address)

        // when
        const amountAfterFee = amountToWithdraw.sub(amountToWithdraw.mul(fee).div(parseEther('1')))
        const tx = controller.connect(alice).withdraw(metDepositToken.address, amountToWithdraw, alice.address)
        await expect(tx)
          .emit(controller, 'CollateralWithdrawn')
          .withArgs(metDepositToken.address, alice.address, alice.address, amountToWithdraw, 0)

        // then
        expect(await met.balanceOf(alice.address)).eq(metBalanceBefore.add(amountAfterFee))
      })

      describe('mint', function () {
        it('should not revert if paused', async function () {
          // given
          await controller.pause()

          // when
          const toMint = parseEther('0.1')
          const tx = controller.connect(alice).mint(vsEth.address, toMint, alice.address)

          // then
          await expect(tx).emit(controller, 'SyntheticTokenMinted')
        })

        it('should revert if shutdown', async function () {
          // given
          await controller.shutdown()

          // when
          const toMint = parseEther('0.1')
          const tx = controller.connect(alice).mint(vsEth.address, toMint, alice.address)

          // then
          await expect(tx).revertedWith('shutdown')
        })

        it('should revert if synthetic does not exist', async function () {
          // when
          const toIssue = parseEther('1')
          const invalidSynthetic = met
          const tx = controller.mint(invalidSynthetic.address, toIssue, alice.address)

          // then
          await expect(tx).revertedWith('synthetic-inexistent')
        })

        it('should revert if synthetic is not active', async function () {
          // given
          await vsEth.toggleIsActive()

          // when
          const amountToMint = parseEther('1')
          const tx = controller.connect(alice).mint(vsEth.address, amountToMint, alice.address)

          // then
          await expect(tx).revertedWith('synthetic-inactive')
        })

        it('should revert if user has not enough collateral deposited', async function () {
          // when
          const toIssue = parseEther('1000000000000000')
          const tx = controller.connect(alice).mint(vsEth.address, toIssue, alice.address)

          // then
          await expect(tx).revertedWith('not-enough-collateral')
        })

        it('should revert if amount to mint is 0', async function () {
          // when
          const toIssue = 0
          const tx = controller.connect(alice).mint(vsEth.address, toIssue, alice.address)

          // then
          await expect(tx).revertedWith('amount-is-zero')
        })

        it('should revert if new debt < debt floor', async function () {
          // given
          await controller.updateDebtFloor(parseEther('10000')) // $10,000

          // when
          const toMint = parseEther('1') // $4,000
          const tx = controller.connect(alice).mint(vsEth.address, toMint, alice.address)

          // then
          await expect(tx).revertedWith('debt-lt-floor')
        })

        it('should mint vsEth (mintFee == 0)', async function () {
          // given
          const depositInUsd = await oracle.convertToUsd(metDepositToken.address, userDepositAmount)
          const {
            _isHealthy: _isHealthyBefore,
            _debtInUsd: _debtInUsdBefore,
            _depositInUsd: _depositInUsdBefore,
            _mintableInUsd: _mintableInUsdBefore,
            _mintableLimitInUsd: _mintableLimitInUsdBefore,
          } = await controller.debtPositionOf(alice.address)
          expect(_isHealthyBefore).eq(true)
          expect(_debtInUsdBefore).eq(0)
          expect(_depositInUsdBefore).eq(depositInUsd)
          expect(_mintableInUsdBefore).eq(depositInUsd.mul(metCR).div(parseEther('1')))
          expect(_mintableLimitInUsdBefore).eq(_mintableInUsdBefore)

          // when
          const amountToMint = parseEther('1')
          const tx = () => controller.connect(alice).mint(vsEth.address, amountToMint, alice.address)

          // then
          await expect(tx).changeTokenBalances(vsEth, [alice], [amountToMint])

          const debtInUsdAfter = await controller.debtOf(alice.address)
          expect(debtInUsdAfter).eq(amountToMint.mul(ethRate).div(parseEther('1')))

          const {
            _isHealthy: _isHealthyAfter,
            _debtInUsd: _debtInUsdAfter,
            _depositInUsd: _depositInUsdAfter,
            _mintableInUsd: _mintableInUsdAfter,
            _mintableLimitInUsd: _mintableLimitInUsdAfter,
          } = await controller.debtPositionOf(alice.address)
          expect(_isHealthyAfter).eq(true)
          expect(_debtInUsdAfter).eq(debtInUsdAfter)
          expect(_depositInUsdAfter).eq(depositInUsd)
          expect(_mintableInUsdAfter).eq(_mintableInUsdBefore.sub(debtInUsdAfter))
          expect(_mintableLimitInUsdAfter).eq(_mintableLimitInUsdBefore)

          // Note: the calls below will make additional transfers
          await expect(tx).changeTokenBalances(vsEthDebtToken, [alice], [amountToMint])
          await expect(tx).changeTokenBalances(met, [controller], [0])
          await expect(tx())
            .emit(controller, 'SyntheticTokenMinted')
            .withArgs(alice.address, alice.address, vsEth.address, amountToMint, 0)
        })

        it('should mint vsEth (mintFee > 0)', async function () {
          // given
          const mintFee = parseEther('0.1') // 10%
          await controller.updateMintFee(mintFee)

          // when
          const amount = parseEther('1')
          const expectedFee = amount.mul(mintFee).div(parseEther('1'))
          const expectedAmountAfterFee = amount.sub(expectedFee)
          const tx = () => controller.connect(alice).mint(vsEth.address, amount, alice.address)
          await expect(tx).changeTokenBalances(vsEth, [alice, treasury], [expectedAmountAfterFee, expectedFee])

          // then
          // Note: the calls below will make additional transfers
          // See: https://github.com/EthWorks/Waffle/issues/569
          await expect(tx).changeTokenBalances(vsEthDebtToken, [alice], [amount])
          await expect(tx())
            .emit(controller, 'SyntheticTokenMinted')
            .withArgs(alice.address, alice.address, vsEth.address, amount, expectedFee)
        })

        it('should mint max issuable amount (mintFee == 0)', async function () {
          const {_mintableInUsd} = await controller.debtPositionOf(alice.address)
          const amount = await oracle.convertFromUsd(vsEth.address, _mintableInUsd)
          const tx = controller.connect(alice).mint(vsEth.address, amount, alice.address)
          await expect(tx)
            .emit(controller, 'SyntheticTokenMinted')
            .withArgs(alice.address, alice.address, vsEth.address, amount, 0)
        })

        it('should mint max issuable amount (mintFee > 0)', async function () {
          // given
          const mintFee = parseEther('0.1') // 10%
          await controller.updateMintFee(mintFee)

          const {_mintableInUsd} = await controller.debtPositionOf(alice.address)
          const amount = await oracle.convertFromUsd(vsEth.address, _mintableInUsd)
          const expectedFee = amount.mul(mintFee).div(parseEther('1'))
          const tx = controller.connect(alice).mint(vsEth.address, amount, alice.address)
          await expect(tx)
            .emit(controller, 'SyntheticTokenMinted')
            .withArgs(alice.address, alice.address, vsEth.address, amount, expectedFee)
        })
      })

      describe('when user minted some vsETH', function () {
        const userMintAmount = parseEther('1')

        beforeEach(async function () {
          await controller.connect(alice).mint(vsEth.address, userMintAmount, alice.address)
        })

        describe('withdraw', function () {
          describe('when minimum deposit time is > 0', function () {
            beforeEach(async function () {
              await metDepositToken.updateMinDepositTime(HOUR)
            })

            it('should revert if minimum deposit time have not passed', async function () {
              // when
              const tx = controller.connect(alice).withdraw(metDepositToken.address, '1', alice.address)

              // then
              await expect(tx).revertedWith('min-deposit-time-have-not-passed')
            })

            it('should withdraw after the minimum deposit period', async function () {
              // given
              await increaseTime(HOUR)

              // when
              const amount = '1'
              const tx = () => controller.connect(alice).withdraw(metDepositToken.address, amount, alice.address)

              // then
              await expect(tx).changeTokenBalances(met, [alice], [amount])
            })
          })

          describe('when minimum deposit time == 0', function () {
            it('should revert not if paused', async function () {
              // given
              await controller.pause()

              // when
              const amount = 1
              const tx = controller.connect(alice).withdraw(metDepositToken.address, amount, alice.address)

              // then
              await expect(tx).emit(controller, 'CollateralWithdrawn')
            })

            it('should revert if shutdown', async function () {
              // given
              await controller.shutdown()

              // when
              const amount = 1
              const tx = controller.connect(alice).withdraw(metDepositToken.address, amount, alice.address)

              // then
              await expect(tx).revertedWith('shutdown')
            })

            it('should revert if amount is 0', async function () {
              // when
              const tx = controller.connect(alice).withdraw(metDepositToken.address, 0, alice.address)

              // then
              await expect(tx).revertedWith('amount-is-zero')
            })

            it('should revert if amount > unlocked collateral amount', async function () {
              // when
              const unlockedDeposit = await metDepositToken.unlockedBalanceOf(alice.address)
              const tx = controller
                .connect(alice)
                .withdraw(metDepositToken.address, unlockedDeposit.add('1'), alice.address)

              // then
              await expect(tx).revertedWith('amount-gt-unlocked')
            })

            it('should withdraw if amount <= unlocked collateral amount (withdrawFee == 0)', async function () {
              // given
              const metBalanceBefore = await met.balanceOf(alice.address)
              const depositBefore = await metDepositToken.balanceOf(alice.address)

              // when
              const amountToWithdraw = await metDepositToken.unlockedBalanceOf(alice.address)
              const tx = controller.connect(alice).withdraw(metDepositToken.address, amountToWithdraw, alice.address)
              await expect(tx)
                .emit(controller, 'CollateralWithdrawn')
                .withArgs(metDepositToken.address, alice.address, alice.address, amountToWithdraw, 0)

              // then
              expect(await met.balanceOf(alice.address)).eq(metBalanceBefore.add(amountToWithdraw))
              expect(await metDepositToken.balanceOf(alice.address)).eq(depositBefore.sub(amountToWithdraw))
              expect(await metDepositToken.unlockedBalanceOf(alice.address)).eq(0)
            })

            it('should withdraw if amount <= unlocked collateral amount (withdrawFee > 0)', async function () {
              // given
              const withdrawFee = parseEther('0.1') // 10%
              await controller.updateWithdrawFee(withdrawFee)
              const metBalanceBefore = await met.balanceOf(alice.address)
              const depositBefore = await metDepositToken.balanceOf(alice.address)
              const amount = await metDepositToken.unlockedBalanceOf(alice.address)

              const expectedFee = amount.mul(withdrawFee).div(parseEther('1')).add(1)
              const expectedAmountAfterFee = amount.sub(expectedFee)

              // when
              const tx = controller.connect(alice).withdraw(metDepositToken.address, amount, alice.address)
              await expect(tx)
                .emit(controller, 'CollateralWithdrawn')
                .withArgs(metDepositToken.address, alice.address, alice.address, amount, expectedFee)

              // then
              expect(await met.balanceOf(alice.address)).eq(metBalanceBefore.add(expectedAmountAfterFee))
              expect(await metDepositToken.balanceOf(alice.address)).eq(depositBefore.sub(amount))
              expect(await metDepositToken.unlockedBalanceOf(alice.address)).eq(0)
            })

            it('should withdraw collateral to another user', async function () {
              // given
              const depositBefore = await metDepositToken.balanceOf(alice.address)

              // when
              const amountToWithdraw = await metDepositToken.unlockedBalanceOf(alice.address)
              const tx = controller.connect(alice).withdraw(metDepositToken.address, amountToWithdraw, bob.address)
              await expect(tx)
                .emit(controller, 'CollateralWithdrawn')
                .withArgs(metDepositToken.address, alice.address, bob.address, amountToWithdraw, 0)

              // then
              expect(await met.balanceOf(bob.address)).eq(amountToWithdraw)
              expect(await metDepositToken.balanceOf(alice.address)).eq(depositBefore.sub(amountToWithdraw))
              expect(await metDepositToken.unlockedBalanceOf(alice.address)).eq(0)
            })
          })
        })

        describe('repay', function () {
          it('should not revert if paused', async function () {
            // given
            await controller.pause()
            const amount = await vsEth.balanceOf(alice.address)

            // when
            const tx = controller.connect(alice).repay(vsEth.address, alice.address, amount)

            // then
            await expect(tx).emit(controller, 'DebtRepayed')
          })

          it('should revert if shutdown', async function () {
            // given
            await controller.shutdown()
            const amount = await vsEth.balanceOf(alice.address)

            // when
            const tx = controller.connect(alice).repay(vsEth.address, alice.address, amount)

            // then
            await expect(tx).revertedWith('shutdown')
          })

          it('should revert if amount is 0', async function () {
            // when
            const tx = controller.connect(alice).repay(vsEth.address, alice.address, 0)

            // then
            await expect(tx).revertedWith('amount-is-zero')
          })

          it('should revert if amount > unlocked collateral amount', async function () {
            // given
            const amount = await vsEth.balanceOf(alice.address)

            // when
            const tx = controller.connect(alice).repay(vsEth.address, alice.address, amount.add('1'))

            // then
            await expect(tx).revertedWith('burn-amount-exceeds-balance')
          })

          it('should revert if new debt < debt floor', async function () {
            // given
            await controller.updateDebtFloor(parseEther('3000')) // $3,000

            const amount = await vsEth.balanceOf(alice.address)
            expect(amount).eq(parseEther('1')) // $4,000

            // when
            const toRepay = amount.div('2') // $2,000
            const tx = controller.connect(alice).repay(vsEth.address, alice.address, toRepay)

            // then
            await expect(tx).revertedWith('debt-lt-floor')
          })

          it('should allow repay all when debt floor is set', async function () {
            // given
            await controller.updateRepayFee(0)
            await controller.updateDebtFloor(parseEther('3000')) // $3,000
            const amount = await vsEth.balanceOf(alice.address)

            // when
            await controller.connect(alice).repay(vsEth.address, alice.address, amount)

            // then
            const debtAfter = await controller.debtOf(alice.address)
            expect(debtAfter).eq(0)
          })

          it('should repay if amount == debt (repayFee == 0)', async function () {
            // given
            await controller.updateRepayFee(0)
            const lockedCollateralBefore = await metDepositToken.lockedBalanceOf(alice.address)
            expect(lockedCollateralBefore).gt(0)

            // when
            const amount = await vsEth.balanceOf(alice.address)
            const tx = controller.connect(alice).repay(vsEth.address, alice.address, amount)
            await expect(tx).emit(controller, 'DebtRepayed').withArgs(alice.address, vsEth.address, amount, 0)

            // then
            expect(await vsEth.balanceOf(alice.address)).eq(0)
            const lockedCollateralAfter = await metDepositToken.lockedBalanceOf(alice.address)
            expect(lockedCollateralAfter).eq(0)
          })

          it('should repay if amount < debt (repayFee == 0)', async function () {
            // given
            await controller.updateRepayFee(0)
            const lockedCollateralBefore = await metDepositToken.lockedBalanceOf(alice.address)
            expect(lockedCollateralBefore).gt(0)

            // when
            const amount = (await vsEth.balanceOf(alice.address)).div('2')
            const tx = controller.connect(alice).repay(vsEth.address, alice.address, amount)
            await expect(tx).emit(controller, 'DebtRepayed').withArgs(alice.address, vsEth.address, amount, 0)

            // then
            expect(await vsEth.balanceOf(alice.address)).eq(amount)
            const lockedDepositAfter = await metDepositToken.lockedBalanceOf(alice.address)
            expect(lockedDepositAfter).eq(lockedCollateralBefore.div('2').add(1))
          })

          it('should repay if amount == debt (repayFee > 0)', async function () {
            // given
            const repayFee = parseEther('0.1') // 10%
            await controller.updateRepayFee(repayFee)
            const {_depositInUsd: depositInUsdBefore} = await controller.debtPositionOf(alice.address)
            const lockedCollateralBefore = await metDepositToken.lockedBalanceOf(alice.address)
            expect(lockedCollateralBefore).gt(0)

            // when
            const amount = await vsEth.balanceOf(alice.address)
            const expectedFee = amount.mul(repayFee).div(parseEther('1'))
            const tx = controller.connect(alice).repay(vsEth.address, alice.address, amount)
            await expect(tx).emit(controller, 'DebtRepayed').withArgs(alice.address, vsEth.address, amount, expectedFee)

            // then
            expect(await vsEth.balanceOf(alice.address)).eq(0)
            const {_depositInUsd: depositInUsdAfter} = await controller.debtPositionOf(alice.address)
            const lockedCollateralAfter = await metDepositToken.lockedBalanceOf(alice.address)
            const expectedLockedCollateralAfter = lockedCollateralBefore.mul(repayFee).div(parseEther('1'))
            // @ts-ignore
            expect(lockedCollateralAfter).closeTo(expectedLockedCollateralAfter, parseEther('0.000000001'))
            expect(depositInUsdAfter).eq(depositInUsdBefore)
          })

          it('should repay if amount < debt (repayFee > 0)', async function () {
            // given
            const repayFee = parseEther('0.1') // 10%
            await controller.updateRepayFee(repayFee)
            const {_depositInUsd: depositInUsdBefore} = await controller.debtPositionOf(alice.address)
            const lockedDepositBefore = await metDepositToken.lockedBalanceOf(alice.address)
            expect(lockedDepositBefore).gt(0)
            expect(depositInUsdBefore).gt(0)

            // when
            const amount = (await vsEth.balanceOf(alice.address)).div('2')
            const expectedFee = amount.mul(repayFee).div(parseEther('1'))
            const tx = controller.connect(alice).repay(vsEth.address, alice.address, amount)
            await expect(tx).emit(controller, 'DebtRepayed').withArgs(alice.address, vsEth.address, amount, expectedFee)

            // then
            expect(await vsEth.balanceOf(alice.address)).eq(amount)
            const {_depositInUsd: depositInUsdAfter} = await controller.debtPositionOf(alice.address)
            const lockedDepositAfter = await metDepositToken.lockedBalanceOf(alice.address)
            const expectedlockedDepositAfter = lockedDepositBefore
              .div('2')
              .mul(parseEther('1').add(repayFee))
              .div(parseEther('1'))
            // @ts-ignore
            expect(lockedDepositAfter).closeTo(expectedlockedDepositAfter, parseEther('0.000000001'))
            expect(depositInUsdAfter).eq(depositInUsdBefore)
          })
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
            await expect(tx).revertedWith('amount-in-0-or-gt-balance')
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
            await expect(tx).revertedWith('amount-in-0-or-gt-balance')
          })

          describe('debt floor', function () {
            it('should revert if debt from assetIn becomes < debt floor', async function () {
              // given
              await controller.updateSwapFee(0)
              await controller.updateDebtFloor(parseEther('3000')) // $3,000

              const balance = await vsEth.balanceOf(alice.address)
              expect(balance).eq(parseEther('1')) // $4,000

              // when
              const amountIn = balance.div('2') // $2,000
              const tx = controller.connect(alice).swap(vsEth.address, vsDoge.address, amountIn)

              // then
              await expect(tx).revertedWith('synthetic-in-debt-lt-floor')
            })

            it('should revert if debt from assetOut becomes < debt floor', async function () {
              // given
              await controller.updateSwapFee(0)
              await controller.updateDebtFloor(parseEther('3000')) // $3,000

              const balance = await vsEth.balanceOf(alice.address)
              expect(balance).eq(parseEther('1')) // $4,000

              // when
              const amountIn = balance.div('4') // $1,000
              const tx = controller.connect(alice).swap(vsEth.address, vsDoge.address, amountIn)

              // then
              await expect(tx).revertedWith('synthetic-out-debt-lt-floor')
            })

            it('should allow swap if debt from assetIn becomes 0', async function () {
              // given
              await controller.updateSwapFee(0)
              await controller.updateDebtFloor(parseEther('3000')) // $3,000

              const balance = await vsEth.balanceOf(alice.address)
              expect(balance).eq(parseEther('1')) // $4,000

              // when
              const amountIn = balance
              await controller.connect(alice).swap(vsEth.address, vsDoge.address, amountIn)

              // then
              const vsAssetInDebt = await vsEthDebtToken.balanceOf(alice.address)
              expect(vsAssetInDebt).eq(0)
            })
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
            const amountInUsd = amountIn.mul(ethRate).div(parseEther('1'))
            const tx = await controller.connect(alice).swap(vsAssetIn, vsAssetOut, amountIn)

            // then
            const expectedAmountOut = amountInUsd.mul(parseEther('1')).div(dogeRate)

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
            expect(vsAssetInDebtBalanceAfter).eq(vsAssetInDebtBalanceBefore.sub(amountIn))
            expect(vsAssetOutBalanceAfter).eq(vsAssetOutBalanceBefore.add(expectedAmountOut))
            expect(vsAssetOutDebtBalanceAfter).eq(vsAssetOutDebtBalanceBefore.add(expectedAmountOut))
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
            const amountInUsd = amountIn.mul(ethRate).div(parseEther('1'))
            const tx = await controller.connect(alice).swap(vsAssetIn, vsAssetOut, amountIn)

            // then
            const expectedAmountOut = amountInUsd.mul(parseEther('1')).div(dogeRate)
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
            expect(vsAssetInDebtBalanceAfter).eq(vsAssetInDebtBalanceBefore.sub(amountIn))
            expect(vsAssetOutBalanceAfter).eq(vsAssetOutBalanceBefore.add(expectedAmountOutAfterFee))
            expect(vsAssetOutDebtBalanceAfter).eq(vsAssetOutDebtBalanceBefore.add(expectedAmountOut))
          })
        })

        describe('liquidate', function () {
          const liquidatorDepositAmount = parseEther('100000')
          const liquidatorMintAmount = parseEther('2')

          beforeEach(async function () {
            await met.connect(liquidator).approve(controller.address, ethers.constants.MaxUint256)
            await controller
              .connect(liquidator)
              .deposit(metDepositToken.address, liquidatorDepositAmount, liquidator.address)
            await controller.connect(liquidator).mint(vsEth.address, liquidatorMintAmount, liquidator.address)
          })

          it('should revert if amount to repay == 0', async function () {
            // when
            const tx = controller.liquidate(vsEth.address, alice.address, 0, metDepositToken.address)

            // then
            await expect(tx).revertedWith('amount-is-zero')
          })

          it('should revert if liquidator == account', async function () {
            // when
            const tx = controller.connect(alice).liquidate(vsEth.address, alice.address, 1, metDepositToken.address)

            // then
            await expect(tx).revertedWith('can-not-liquidate-own-position')
          })

          it('should revert if position is healty', async function () {
            // given
            const {_isHealthy} = await controller.debtPositionOf(alice.address)
            expect(_isHealthy).true

            // when
            const tx = controller.liquidate(vsEth.address, alice.address, parseEther('1'), metDepositToken.address)

            // then
            await expect(tx).revertedWith('position-is-healthy')
          })

          describe('when the position is unhealty (colalteral:debt >= 1)', function () {
            const newMetRate = parseEther('0.95')

            beforeEach(async function () {
              await oracle.updateRate(metDepositToken.address, newMetRate)

              const expectedDebtInUsd = userMintAmount.mul(ethRate).div(parseEther('1'))
              const expectedDepositInUsd = userDepositAmount.mul(newMetRate).div(parseEther('1'))
              const expectedMintableLimit = expectedDepositInUsd.mul(metCR).div(parseEther('1'))

              const {_isHealthy, _debtInUsd, _depositInUsd, _mintableInUsd, _mintableLimitInUsd} =
                await controller.debtPositionOf(alice.address)

              expect(_isHealthy).eq(false)
              expect(_debtInUsd).eq(expectedDebtInUsd)
              expect(_depositInUsd).eq(expectedDepositInUsd)
              expect(_mintableLimitInUsd).eq(expectedMintableLimit)
              expect(_mintableInUsd).eq(0)

              expect(await metDepositToken.balanceOf(alice.address)).eq(userDepositAmount)
              expect(await vsEth.balanceOf(alice.address)).eq(userMintAmount)
              expect(await vsEthDebtToken.balanceOf(alice.address)).eq(userMintAmount)
              expect(await metDepositToken.balanceOf(liquidator.address)).eq(liquidatorDepositAmount)
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
                .liquidate(vsEth.address, alice.address, amountToRepay, metDepositToken.address)

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
                .liquidate(vsEth.address, alice.address, amountToRepay, metDepositToken.address)

              // then
              await expect(tx).revertedWith('shutdown')
            })

            it('should revert if liquidator has not enough vsAsset to repay', async function () {
              // given
              const liquidatorVsEthBalanceBefore = await vsEth.balanceOf(liquidator.address)
              await controller
                .connect(liquidator)
                .repay(vsEth.address, liquidator.address, liquidatorVsEthBalanceBefore)
              const amountToRepayInUsd = await getMinLiquidationAmountInUsd(controller, alice.address, metDepositToken)
              const amountToRepayInVsEth = amountToRepayInUsd.mul(parseEther('1')).div(ethRate)
              expect(await vsEth.balanceOf(liquidator.address)).lt(amountToRepayInVsEth)

              // when
              const tx = controller
                .connect(liquidator)
                .liquidate(vsEth.address, alice.address, amountToRepayInVsEth, metDepositToken.address)

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
                .liquidate(vsEth.address, alice.address, amountToRepay, metDepositToken.address)

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
                  .liquidate(vsEth.address, alice.address, amountToRepay, metDepositToken.address)

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
                  .liquidate(vsEth.address, alice.address, amountToRepay, metDepositToken.address)

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
                .liquidate(vsEth.address, alice.address, amountToRepay, metDepositToken.address)

              // then
              await expect(tx).revertedWith('amount-gt-max-liquidable')
            })

            it('should liquidate by repaying all debt (liquidateFee == 0)', async function () {
              // given
              await controller.updateLiquidateFee(0)
              const debtInUsdBefore = await controller.debtOf(alice.address)
              const {_depositInUsd: collateralInUsdBefore} = await controller.debtPositionOf(alice.address)

              // when
              const amountToRepay = userMintAmount // repay all user's debt
              const tx = await controller
                .connect(liquidator)
                .liquidate(vsEth.address, alice.address, amountToRepay, metDepositToken.address)

              // then
              const [PositionLiquidated] = (await tx.wait()).events!.filter(({event}) => event === 'PositionLiquidated')
              const [, , , , depositSeized] = PositionLiquidated.args!

              const amountToSeizeInUsd = debtInUsdBefore.mul(parseEther('1').add(liquidatorFee)).div(parseEther('1'))
              const expectedDepositSeized = await oracle.convertFromUsd(metDepositToken.address, amountToSeizeInUsd)
              const expectedDepositAfter = collateralInUsdBefore
                .sub(amountToSeizeInUsd)
                .mul(parseEther('1'))
                .div(newMetRate)
              const {_isHealthy} = await controller.debtPositionOf(alice.address)

              expect(_isHealthy).true
              expect(depositSeized).eq(expectedDepositSeized)
              expect(await metDepositToken.balanceOf(alice.address)).eq(expectedDepositAfter)
              expect(await vsEth.balanceOf(alice.address)).eq(userMintAmount)
              expect(await vsEthDebtToken.balanceOf(alice.address)).eq(0)
              expect(await metDepositToken.balanceOf(liquidator.address)).eq(liquidatorDepositAmount.add(depositSeized))
              expect(await vsEth.balanceOf(liquidator.address)).eq(liquidatorMintAmount.sub(amountToRepay))
              expect(await vsEthDebtToken.balanceOf(liquidator.address)).eq(liquidatorMintAmount)
            })

            it('should liquidate by repaying all debt (liquidateFee > 0)', async function () {
              // given
              const liquidateFee = parseEther('0.01') // 1%
              await controller.updateLiquidateFee(liquidateFee)
              const debtInUsdBefore = await controller.debtOf(alice.address)
              const {_depositInUsd: depositInUsdBefore} = await controller.debtPositionOf(alice.address)
              const depositBefore = await oracle.convertFromUsd(metDepositToken.address, depositInUsdBefore)

              // when
              const amountToRepay = userMintAmount // repay all user's debt
              const tx = await controller
                .connect(liquidator)
                .liquidate(vsEth.address, alice.address, amountToRepay, metDepositToken.address)

              // then
              const [PositionLiquidated] = (await tx.wait()).events!.filter(({event}) => event === 'PositionLiquidated')
              const [, , , , depositSeized] = PositionLiquidated.args!

              const depositToSeizeInUsd = debtInUsdBefore
                .mul(parseEther('1').add(liquidatorFee.add(liquidateFee)))
                .div(parseEther('1'))

              const expectedDepositToLiquidator = debtInUsdBefore
                .mul(parseEther('1').add(liquidatorFee))
                .div(newMetRate)
              const expectedDepositSeized = await oracle.convertFromUsd(metDepositToken.address, depositToSeizeInUsd)
              const expectedDepositAfter = depositBefore.sub(expectedDepositSeized)

              const {_isHealthy} = await controller.debtPositionOf(alice.address)

              expect(_isHealthy).true
              expect(depositSeized).eq(expectedDepositSeized)
              expect(await metDepositToken.balanceOf(alice.address)).eq(expectedDepositAfter)
              expect(await vsEth.balanceOf(alice.address)).eq(userMintAmount)
              expect(await vsEthDebtToken.balanceOf(alice.address)).eq(0)
              expect(await metDepositToken.balanceOf(liquidator.address)).closeTo(
                liquidatorDepositAmount.add(expectedDepositToLiquidator),
                1
              )
              expect(await vsEth.balanceOf(liquidator.address)).eq(liquidatorMintAmount.sub(amountToRepay))
              expect(await vsEthDebtToken.balanceOf(liquidator.address)).eq(liquidatorMintAmount)
            })

            it('should liquidate by repaying > needed to make position healthy (liquidateFee == 0)', async function () {
              // given
              await controller.updateLiquidateFee(0)
              const debtInUsdBefore = await controller.debtOf(alice.address)
              const {_depositInUsd: collateralInUsdBefore} = await controller.debtPositionOf(alice.address)
              const collateralBefore = await oracle.convertFromUsd(metDepositToken.address, collateralInUsdBefore)
              const minAmountToRepayInUsd = await getMinLiquidationAmountInUsd(
                controller,
                alice.address,
                metDepositToken
              )

              // when
              const amountToRepayInUsd = minAmountToRepayInUsd.mul(parseEther('1.1')).div(parseEther('1')) // min + 10%
              expect(amountToRepayInUsd).lt(debtInUsdBefore) // ensure that isn't paying all debt
              const amountToRepay = amountToRepayInUsd.mul(parseEther('1')).div(ethRate)
              const tx = await controller
                .connect(liquidator)
                .liquidate(vsEth.address, alice.address, amountToRepay, metDepositToken.address)
              const [PositionLiquidated] = (await tx.wait()).events!.filter(({event}) => event === 'PositionLiquidated')
              const [, , , , depositSeized] = PositionLiquidated.args!
              const depositSeizedInUsd = await oracle.convertToUsd(metDepositToken.address, depositSeized)

              // then
              const {_isHealthy: isHealthyAfter, _depositInUsd: collateralInUsdAfter} = await controller.debtPositionOf(
                alice.address
              )
              const lockedCollateralAfter = await metDepositToken.lockedBalanceOf(alice.address)

              expect(isHealthyAfter).true
              expect(collateralInUsdAfter).eq(collateralInUsdBefore.sub(depositSeizedInUsd))
              expect(lockedCollateralAfter).gt(0)
              expect(await metDepositToken.balanceOf(alice.address)).eq(collateralBefore.sub(depositSeized))
              expect(await vsEth.balanceOf(alice.address)).eq(userMintAmount)
              expect(await vsEthDebtToken.balanceOf(alice.address)).eq(userMintAmount.sub(amountToRepay))
              expect(await metDepositToken.balanceOf(liquidator.address)).eq(liquidatorDepositAmount.add(depositSeized))
              expect(await vsEth.balanceOf(liquidator.address)).eq(liquidatorMintAmount.sub(amountToRepay))
              expect(await vsEthDebtToken.balanceOf(liquidator.address)).eq(liquidatorMintAmount)
            })

            it('should liquidate by repaying > needed to make position healthy (liquidateFee > 0)', async function () {
              // given
              const liquidateFee = parseEther('0.01') // 1%
              await controller.updateLiquidateFee(liquidateFee)
              const debtInUsdBefore = await controller.debtOf(alice.address)
              const {_depositInUsd: collateralInUsdBefore} = await controller.debtPositionOf(alice.address)
              const minAmountToRepayInUsd = await getMinLiquidationAmountInUsd(
                controller,
                alice.address,
                metDepositToken
              )
              const collateralBefore = await oracle.convertFromUsd(metDepositToken.address, collateralInUsdBefore)

              // when
              const amountToRepayInUsd = minAmountToRepayInUsd.mul(parseEther('1.1')).div(parseEther('1')) // min + 10%
              expect(amountToRepayInUsd).lt(debtInUsdBefore) // ensure that isn't paying all debt
              const amountToRepay = amountToRepayInUsd.mul(parseEther('1')).div(ethRate)
              const tx = await controller
                .connect(liquidator)
                .liquidate(vsEth.address, alice.address, amountToRepay, metDepositToken.address)
              const [PositionLiquidated] = (await tx.wait()).events!.filter(({event}) => event === 'PositionLiquidated')
              const [, , , , depositSeized] = PositionLiquidated.args!

              const amountToRepayInMET = await oracle.convert(vsEth.address, metDepositToken.address, amountToRepay)

              const expectedDepositToLiquidator = amountToRepayInMET
                .mul(parseEther('1').add(liquidatorFee))
                .div(parseEther('1'))

              // then
              const {_isHealthy: isHealthyAfter, _depositInUsd: collateralInUsdAfter} = await controller.debtPositionOf(
                alice.address
              )
              const collateralAfter = await oracle.convertFromUsd(metDepositToken.address, collateralInUsdAfter)
              const lockedCollateralAfter = await metDepositToken.lockedBalanceOf(alice.address)

              expect(isHealthyAfter).true
              expect(collateralAfter).eq(collateralBefore.sub(depositSeized))
              expect(lockedCollateralAfter).gt(0)
              expect(await metDepositToken.balanceOf(alice.address)).eq(collateralBefore.sub(depositSeized))
              expect(await vsEth.balanceOf(alice.address)).eq(userMintAmount)
              expect(await vsEthDebtToken.balanceOf(alice.address)).eq(userMintAmount.sub(amountToRepay))
              expect(await metDepositToken.balanceOf(liquidator.address)).closeTo(
                liquidatorDepositAmount.add(expectedDepositToLiquidator),
                1
              )
              expect(await vsEth.balanceOf(liquidator.address)).eq(liquidatorMintAmount.sub(amountToRepay))
              expect(await vsEthDebtToken.balanceOf(liquidator.address)).eq(liquidatorMintAmount)
            })

            it('should liquidate by repaying < needed to make position healthy (liquidateFee == 0)', async function () {
              // given
              await controller.updateLiquidateFee(0)
              const {_depositInUsd: collateralInUsdBefore} = await controller.debtPositionOf(alice.address)
              const collateralBefore = await oracle.convertFromUsd(metDepositToken.address, collateralInUsdBefore)

              // when
              const minAmountToRepayInUsd = await getMinLiquidationAmountInUsd(
                controller,
                alice.address,
                metDepositToken
              )
              const minAmountToRepay = minAmountToRepayInUsd.mul(parseEther('1')).div(ethRate)
              const amountToRepay = minAmountToRepay.div('2')
              const tx = await controller
                .connect(liquidator)
                .liquidate(vsEth.address, alice.address, amountToRepay, metDepositToken.address)
              const [PositionLiquidated] = (await tx.wait()).events!.filter(({event}) => event === 'PositionLiquidated')
              const [, , , , depositSeized] = PositionLiquidated.args!

              // then
              const {_isHealthy: isHealthyAfter} = await controller.debtPositionOf(alice.address)
              const collateralAfter = await metDepositToken.balanceOf(alice.address)
              const unlockedCollateralAfter = await metDepositToken.unlockedBalanceOf(alice.address)
              const lockedCollateralAfter = await metDepositToken.lockedBalanceOf(alice.address)

              expect(isHealthyAfter).false
              expect(collateralAfter).eq(collateralBefore.sub(depositSeized))
              expect(lockedCollateralAfter).gte(collateralAfter)
              expect(unlockedCollateralAfter).eq(0)
              expect(await metDepositToken.balanceOf(alice.address)).eq(collateralBefore.sub(depositSeized))
              expect(await vsEth.balanceOf(alice.address)).eq(userMintAmount)
              expect(await vsEthDebtToken.balanceOf(alice.address)).eq(userMintAmount.sub(amountToRepay))
              expect(await metDepositToken.balanceOf(liquidator.address)).eq(liquidatorDepositAmount.add(depositSeized))
              expect(await vsEth.balanceOf(liquidator.address)).eq(liquidatorMintAmount.sub(amountToRepay))
              expect(await vsEthDebtToken.balanceOf(liquidator.address)).eq(liquidatorMintAmount)
            })

            it('should liquidate by repaying < needed to make position healthy (liquidateFee > 0)', async function () {
              // given
              const liquidateFee = parseEther('0.01') // 1%
              await controller.updateLiquidateFee(liquidateFee)
              const {_depositInUsd: collateralInUsdBefore} = await controller.debtPositionOf(alice.address)
              const collateralBefore = await oracle.convertFromUsd(metDepositToken.address, collateralInUsdBefore)

              // when
              const amountToRepayInUsd = (
                await getMinLiquidationAmountInUsd(controller, alice.address, metDepositToken)
              ).div('2')
              const amountToRepay = amountToRepayInUsd.mul(parseEther('1')).div(ethRate)
              const tx = await controller
                .connect(liquidator)
                .liquidate(vsEth.address, alice.address, amountToRepay, metDepositToken.address)
              const [PositionLiquidated] = (await tx.wait()).events!.filter(({event}) => event === 'PositionLiquidated')
              const [, , , , depositSeized] = PositionLiquidated.args!

              // then
              const {_isHealthy: isHealthyAfter} = await controller.debtPositionOf(alice.address)
              const collateralAfter = await metDepositToken.balanceOf(alice.address)
              const unlockedCollateralAfter = await metDepositToken.unlockedBalanceOf(alice.address)
              const lockedCollateralAfter = await metDepositToken.lockedBalanceOf(alice.address)

              const amountToRepayInMET = await oracle.convert(vsEth.address, metDepositToken.address, amountToRepay)

              const expectedDepositToLiquidator = amountToRepayInMET.add(
                amountToRepayInMET.mul(liquidatorFee).div(parseEther('1'))
              )

              expect(isHealthyAfter).false
              expect(collateralAfter).eq(collateralBefore.sub(depositSeized))
              expect(lockedCollateralAfter).gte(collateralAfter)
              expect(unlockedCollateralAfter).eq(0)
              expect(await metDepositToken.balanceOf(alice.address)).eq(collateralBefore.sub(depositSeized))
              expect(await vsEth.balanceOf(alice.address)).eq(userMintAmount)
              expect(await vsEthDebtToken.balanceOf(alice.address)).eq(userMintAmount.sub(amountToRepay))
              expect(await metDepositToken.balanceOf(liquidator.address)).eq(
                liquidatorDepositAmount.add(expectedDepositToLiquidator)
              )
              expect(await vsEth.balanceOf(liquidator.address)).eq(liquidatorMintAmount.sub(amountToRepay))
              expect(await vsEthDebtToken.balanceOf(liquidator.address)).eq(liquidatorMintAmount)
            })

            it('should liquidate by repaying the exact amount to make healthy (liquidateFee == 0)', async function () {
              // given
              await controller.updateLiquidateFee(0)
              const {_depositInUsd: depositInUsdBefore} = await controller.debtPositionOf(alice.address)
              const depositBefore = await oracle.convertFromUsd(metDepositToken.address, depositInUsdBefore)

              // when
              const amountToRepayInUsd = await getMinLiquidationAmountInUsd(controller, alice.address, metDepositToken)
              const amountToRepay = amountToRepayInUsd.mul(parseEther('1')).div(ethRate)
              const tx = await controller
                .connect(liquidator)
                .liquidate(vsEth.address, alice.address, amountToRepay, metDepositToken.address)
              const [PositionLiquidated] = (await tx.wait()).events!.filter(({event}) => event === 'PositionLiquidated')
              const [, , , , depositSeized] = PositionLiquidated.args!

              // then
              const {_debtInUsd, _mintableLimitInUsd} = await controller.debtPositionOf(alice.address)
              const depositAfter = await metDepositToken.balanceOf(alice.address)
              const unlockedDepositAfter = await metDepositToken.unlockedBalanceOf(alice.address)
              const lockedDepositAfter = await metDepositToken.lockedBalanceOf(alice.address)

              // Note: The value returned by `getMinLiquidationAmountInUsd` is a few weis less than the needed
              // @ts-ignore
              expect(_debtInUsd).closeTo(_mintableLimitInUsd, parseEther('0.0000000001'))
              // expect(isHealthyAfter).true
              expect(depositAfter).eq(depositBefore.sub(depositSeized))
              expect(lockedDepositAfter).eq(depositAfter)
              expect(unlockedDepositAfter).eq(0)
              expect(await metDepositToken.balanceOf(alice.address)).eq(depositBefore.sub(depositSeized))
              expect(await vsEth.balanceOf(alice.address)).eq(userMintAmount)
              expect(await vsEthDebtToken.balanceOf(alice.address)).eq(userMintAmount.sub(amountToRepay))
              expect(await metDepositToken.balanceOf(liquidator.address)).eq(liquidatorDepositAmount.add(depositSeized))
              expect(await vsEth.balanceOf(liquidator.address)).eq(liquidatorMintAmount.sub(amountToRepay))
              expect(await vsEthDebtToken.balanceOf(liquidator.address)).eq(liquidatorMintAmount)
            })

            it('should liquidate by repaying the exact amount to make healthy (liquidateFee > 0)', async function () {
              // given
              const liquidateFee = parseEther('0.01') // 1%
              await controller.updateLiquidateFee(liquidateFee)
              const {_depositInUsd: depositBeforeInUsd} = await controller.debtPositionOf(alice.address)
              const depositBefore = await oracle.convertFromUsd(metDepositToken.address, depositBeforeInUsd)

              // when
              const amountToRepayInUsd = await getMinLiquidationAmountInUsd(controller, alice.address, metDepositToken)
              const amountToRepay = await oracle.convertFromUsd(vsEth.address, amountToRepayInUsd)

              const tx = await controller
                .connect(liquidator)
                .liquidate(vsEth.address, alice.address, amountToRepay, metDepositToken.address)
              const [PositionLiquidated] = (await tx.wait()).events!.filter(({event}) => event === 'PositionLiquidated')
              const [, , , , depositSeized] = PositionLiquidated.args!

              // then
              const {_isHealthy: isHealthyAfter} = await controller.debtPositionOf(alice.address)
              const depositAfter = await metDepositToken.balanceOf(alice.address)
              const unlockedDepositAfter = await metDepositToken.unlockedBalanceOf(alice.address)
              const lockedDepositAfter = await metDepositToken.lockedBalanceOf(alice.address)

              const amountToRepayInMET = await oracle.convert(vsEth.address, metDepositToken.address, amountToRepay)

              const expectedDepositToLiquidator = amountToRepayInMET.add(
                amountToRepayInMET.mul(liquidatorFee).div(parseEther('1'))
              )

              expect(isHealthyAfter).true
              expect(lockedDepositAfter).gt(0)
              expect(depositAfter).eq(depositBefore.sub(depositSeized))
              expect(unlockedDepositAfter).gt(0)
              expect(await metDepositToken.balanceOf(alice.address)).eq(depositBefore.sub(depositSeized))
              expect(await vsEth.balanceOf(alice.address)).eq(userMintAmount)
              expect(await vsEthDebtToken.balanceOf(alice.address)).eq(userMintAmount.sub(amountToRepay))
              expect(await metDepositToken.balanceOf(liquidator.address)).closeTo(
                liquidatorDepositAmount.add(expectedDepositToLiquidator),
                1
              )
              expect(await vsEth.balanceOf(liquidator.address)).eq(liquidatorMintAmount.sub(amountToRepay))
              expect(await vsEthDebtToken.balanceOf(liquidator.address)).eq(liquidatorMintAmount)
            })
          })

          describe('when the position is unhealty (collateral:debt < 1)', function () {
            const newMetRate = parseEther('0.50')

            beforeEach(async function () {
              await oracle.updateRate(metDepositToken.address, newMetRate)
              const _debtInUsd = await controller.debtOf(alice.address)
              const {_depositInUsd} = await controller.debtPositionOf(alice.address)
              expect(_debtInUsd).gt(_depositInUsd)
            })

            it('should revert if paying more than needed to seize all deposit', async function () {
              const amountToRepay = await vsEthDebtToken.balanceOf(alice.address)
              const tx = controller
                .connect(liquidator)
                .liquidate(vsEth.address, alice.address, amountToRepay, metDepositToken.address)

              // then
              await expect(tx).revertedWith('amount-too-high')
            })

            it('should liquidate by repaying max possible amount (liquidafeFee == 0)', async function () {
              // given
              await controller.updateLiquidateFee(0)
              const depositBefore = await metDepositToken.balanceOf(alice.address)

              // when
              const amountToRepayInUsd = await getMaxLiquidationAmountInUsd(controller, alice.address)
              const amountToRepay = amountToRepayInUsd.mul(parseEther('1')).div(ethRate)

              const tx = await controller
                .connect(liquidator)
                .liquidate(vsEth.address, alice.address, amountToRepay, metDepositToken.address)

              // then
              const [PositionLiquidated] = (await tx.wait()).events!.filter(({event}) => event === 'PositionLiquidated')
              const [, , , , depositSeized] = PositionLiquidated.args!

              const {_isHealthy} = await controller.debtPositionOf(alice.address)

              const remainder = 1600 // left over amount on user's deposit balance

              expect(_isHealthy).false
              expect(depositSeized).closeTo(depositBefore, remainder)
              expect(await metDepositToken.balanceOf(alice.address)).closeTo(BigNumber.from('0'), remainder)
              expect(await vsEth.balanceOf(alice.address)).eq(userMintAmount)
              expect(await vsEthDebtToken.balanceOf(alice.address)).gt(0)
              expect(await metDepositToken.balanceOf(liquidator.address)).eq(liquidatorDepositAmount.add(depositSeized))
              expect(await vsEth.balanceOf(liquidator.address)).eq(liquidatorMintAmount.sub(amountToRepay))
              expect(await vsEthDebtToken.balanceOf(liquidator.address)).eq(liquidatorMintAmount)
            })

            it('should liquidate by repaying max possible amount (liquidafeFee > 0)', async function () {
              // given
              const liquidateFee = parseEther('0.01') // 1%
              await controller.updateLiquidateFee(liquidateFee)
              const depositBefore = await metDepositToken.balanceOf(alice.address)

              // when
              const amountToRepayInUsd = await getMaxLiquidationAmountInUsd(controller, alice.address)
              const amountToRepay = amountToRepayInUsd.mul(parseEther('1')).div(ethRate)
              const tx = await controller
                .connect(liquidator)
                .liquidate(vsEth.address, alice.address, amountToRepay, metDepositToken.address)

              // then
              const [PositionLiquidated] = (await tx.wait()).events!.filter(({event}) => event === 'PositionLiquidated')
              const [, , , , depositSeized] = PositionLiquidated.args!

              const amountToRepayInMET = await oracle.convert(vsEth.address, metDepositToken.address, amountToRepay)

              const expectedDepositToLiquidator = amountToRepayInMET.add(
                amountToRepayInMET.mul(liquidatorFee).div(parseEther('1'))
              )

              const {_isHealthy} = await controller.debtPositionOf(alice.address)

              const remainder = 6000 // left over amount on user's deposit balance

              expect(_isHealthy).false
              expect(depositSeized).closeTo(depositBefore, remainder)
              expect(await metDepositToken.balanceOf(alice.address)).closeTo(BigNumber.from('0'), remainder)
              expect(await vsEth.balanceOf(alice.address)).eq(userMintAmount)
              expect(await vsEthDebtToken.balanceOf(alice.address)).gt(0)
              expect(await metDepositToken.balanceOf(liquidator.address)).eq(
                liquidatorDepositAmount.add(expectedDepositToLiquidator)
              )
              expect(await vsEth.balanceOf(liquidator.address)).eq(liquidatorMintAmount.sub(amountToRepay))
              expect(await vsEthDebtToken.balanceOf(liquidator.address)).eq(liquidatorMintAmount)
            })

            it('should liquidate by not repaying all debt (liquidaFee == 0)', async function () {
              // given
              await controller.updateLiquidateFee(0)
              const {_depositInUsd: collateralInUsdBefore} = await controller.debtPositionOf(alice.address)
              const collateralBefore = await oracle.convertFromUsd(metDepositToken.address, collateralInUsdBefore)

              // when
              const amountToRepayInUsd = await getMaxLiquidationAmountInUsd(controller, alice.address)
              const minAmountToRepay = amountToRepayInUsd.mul(parseEther('1')).div(ethRate)
              const amountToRepay = minAmountToRepay.div('2')
              const tx = await controller
                .connect(liquidator)
                .liquidate(vsEth.address, alice.address, amountToRepay, metDepositToken.address)
              const [PositionLiquidated] = (await tx.wait()).events!.filter(({event}) => event === 'PositionLiquidated')
              const [, , , , depositSeized] = PositionLiquidated.args!

              // then
              const debtInUsdAfter = await controller.debtOf(alice.address)
              const {_isHealthy: isHealthyAfter, _depositInUsd: collateralInUsdAfter} = await controller.debtPositionOf(
                alice.address
              )
              const collateralAfter = await metDepositToken.balanceOf(alice.address)
              const unlockedCollateralAfter = await metDepositToken.unlockedBalanceOf(alice.address)
              const lockedCollateralAfter = await metDepositToken.lockedBalanceOf(alice.address)

              const currentCollateralizationRatio = collateralInUsdAfter.mul(parseEther('1')).div(debtInUsdAfter)

              expect(currentCollateralizationRatio).lt(metCR)
              expect(isHealthyAfter).false
              expect(collateralAfter).eq(collateralBefore.sub(depositSeized))
              expect(lockedCollateralAfter).gte(collateralInUsdAfter)
              expect(unlockedCollateralAfter).eq(0)
              expect(await metDepositToken.balanceOf(alice.address)).eq(collateralBefore.sub(depositSeized))
              expect(await vsEth.balanceOf(alice.address)).eq(userMintAmount)
              expect(await vsEthDebtToken.balanceOf(alice.address)).eq(userMintAmount.sub(amountToRepay))
              expect(await metDepositToken.balanceOf(liquidator.address)).eq(liquidatorDepositAmount.add(depositSeized))
              expect(await vsEth.balanceOf(liquidator.address)).eq(liquidatorMintAmount.sub(amountToRepay))
              expect(await vsEthDebtToken.balanceOf(liquidator.address)).eq(liquidatorMintAmount)
            })

            it('should liquidate by not repaying all debt (liquidaFee > 0)', async function () {
              // given
              const liquidateFee = parseEther('0.01') // 1%
              await controller.updateLiquidateFee(liquidateFee)
              const {_depositInUsd: collateralInUsdBefore} = await controller.debtPositionOf(alice.address)
              const collateralBefore = await oracle.convertFromUsd(metDepositToken.address, collateralInUsdBefore)

              // when
              const amountToRepayInUsd = (await getMaxLiquidationAmountInUsd(controller, alice.address)).div('2')
              const amountToRepay = amountToRepayInUsd.mul(parseEther('1')).div(ethRate)
              const tx = await controller
                .connect(liquidator)
                .liquidate(vsEth.address, alice.address, amountToRepay, metDepositToken.address)
              const [PositionLiquidated] = (await tx.wait()).events!.filter(({event}) => event === 'PositionLiquidated')
              const [, , , , depositSeized] = PositionLiquidated.args!

              // then
              const debtInUsdAfter = await controller.debtOf(alice.address)
              const {_isHealthy: isHealthyAfter, _depositInUsd: collateralInUsdAfter} = await controller.debtPositionOf(
                alice.address
              )
              const collateralAfter = await metDepositToken.balanceOf(alice.address)
              const unlockedCollateralAfter = await metDepositToken.unlockedBalanceOf(alice.address)
              const lockedCollateralAfter = await metDepositToken.lockedBalanceOf(alice.address)

              const amountToRepayInMET = await oracle.convert(vsEth.address, metDepositToken.address, amountToRepay)

              const expectedDepositToLiquidator = amountToRepayInMET.add(
                amountToRepayInMET.mul(liquidatorFee).div(parseEther('1'))
              )

              const currentCollateralizationRatio = collateralInUsdAfter.mul(parseEther('1')).div(debtInUsdAfter)

              expect(currentCollateralizationRatio).lt(metCR)
              expect(isHealthyAfter).false
              expect(collateralAfter).eq(collateralBefore.sub(depositSeized))
              expect(lockedCollateralAfter).gte(collateralInUsdAfter)
              expect(unlockedCollateralAfter).eq(0)
              expect(await metDepositToken.balanceOf(alice.address)).eq(collateralBefore.sub(depositSeized))
              expect(await vsEth.balanceOf(alice.address)).eq(userMintAmount)
              expect(await vsEthDebtToken.balanceOf(alice.address)).eq(userMintAmount.sub(amountToRepay))
              expect(await metDepositToken.balanceOf(liquidator.address)).eq(
                liquidatorDepositAmount.add(expectedDepositToLiquidator)
              )
              expect(await vsEth.balanceOf(liquidator.address)).eq(liquidatorMintAmount.sub(amountToRepay))
              expect(await vsEthDebtToken.balanceOf(liquidator.address)).eq(liquidatorMintAmount)
            })
          })

          describe('when user minted both vsETH and vsDOGE using all collateral', function () {
            beforeEach(async function () {
              await controller.updateLiquidateFee(0)

              const {_mintableInUsd} = await controller.debtPositionOf(alice.address)
              const maxIssuableDoge = await oracle.convertFromUsd(vsDoge.address, _mintableInUsd)

              await controller.connect(alice).mint(vsDoge.address, maxIssuableDoge, alice.address)

              const {_isHealthy, _mintableInUsd: _mintableInUsdAfter} = await controller.debtPositionOf(alice.address)
              expect(_isHealthy).true
              expect(_mintableInUsdAfter).eq(0)

              const _unlockedDeposit = await metDepositToken.unlockedBalanceOf(alice.address)

              expect(_unlockedDeposit).eq(0)
            })

            it('should liquidate a position that have minted more than one vsAsset', async function () {
              // given
              const newDogeRate = parseEther('0.5')
              await oracle.updateRate(vsDoge.address, newDogeRate) // $0.4 -> $0.5
              const {_isHealthy: isHealthyBefore} = await controller.debtPositionOf(alice.address)
              expect(isHealthyBefore).false

              // when
              const amountToRepay = await vsDogeDebtToken.balanceOf(alice.address)
              await controller.connect(liquidator).mint(vsDoge.address, amountToRepay, liquidator.address)
              await controller
                .connect(liquidator)
                .liquidate(vsDoge.address, alice.address, amountToRepay, metDepositToken.address)

              // then
              const {_isHealthy: isHealthyAfter} = await controller.debtPositionOf(alice.address)
              expect(isHealthyAfter).true
            })
          })
        })
      })
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
      await expect(tx).revertedWith('new-is-same-as-current')
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

        await debtToken.initialize('Vesper Synth BTC debt', 'vsBTC-debt', 8, controller.address, vsAsset.address)
        await vsAsset.initialize('Vesper Synth BTC', 'vsBTC', 8, controller.address, debtToken.address, interestRate)

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

  describe('updateOracle', function () {
    it('should revert if not gorvernor', async function () {
      // when
      const tx = controller.connect(alice.address).updateOracle(ethers.constants.AddressZero)

      // then
      await expect(tx).revertedWith('not-governor')
    })

    it('should revert if using the same address', async function () {
      // given
      expect(await controller.oracle()).eq(oracle.address)

      // when
      const tx = controller.updateOracle(oracle.address)

      // then
      await expect(tx).revertedWith('new-is-same-as-current')
    })

    it('should revert if address is zero', async function () {
      // when
      const tx = controller.updateOracle(ethers.constants.AddressZero)

      // then
      await expect(tx).revertedWith('address-is-null')
    })

    it('should update oracle contract', async function () {
      // given
      const oldOracle = await controller.oracle()
      const newOracle = bob.address
      expect(oldOracle).not.eq(newOracle)

      // when
      const tx = controller.updateOracle(newOracle)

      // then
      await expect(tx).emit(controller, 'OracleUpdated').withArgs(oldOracle, newOracle)
      expect(await controller.oracle()).eq(newOracle)
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
      await met.approve(controller.address, parseEther('10000'))
      await controller.deposit(metDepositToken.address, parseEther('10000'), deployer.address)

      await metDepositToken.transfer(treasury.address, balance)
      await controller.mint(vsEth.address, balance, deployer.address)
      await vsEth.transfer(treasury.address, balance)

      expect(await met.balanceOf(treasury.address)).gt(0)
      expect(await vsEth.balanceOf(treasury.address)).gt(0)
      expect(await metDepositToken.balanceOf(treasury.address)).gt(0)

      // when
      await controller.updateTreasury(newTreasury.address, true)

      // then
      expect(await met.balanceOf(treasury.address)).eq(0)
      expect(await vsEth.balanceOf(treasury.address)).eq(0)
      expect(await metDepositToken.balanceOf(treasury.address)).eq(0)
    })
  })

  describe('depositTokensOfAccount', function () {
    let depositToken: FakeContract

    beforeEach(async function () {
      depositToken = await smock.fake('DepositToken')
      await controller.addDepositToken(depositToken.address)
      await setEtherBalance(depositToken.address, parseEther('1'))
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
        await controller.connect(depositToken.wallet).addToDepositTokensOfAccount(alice.address)

        // when
        expect(await controller.getDepositTokensOfAccount(alice.address)).deep.eq([depositToken.address])
      })

      it('should not add same deposit token twice', async function () {
        // given
        expect(await controller.getDepositTokensOfAccount(alice.address)).deep.eq([])

        // then
        await controller.connect(depositToken.wallet).addToDepositTokensOfAccount(alice.address)
        await controller.connect(depositToken.wallet).addToDepositTokensOfAccount(alice.address)

        // when
        expect(await controller.getDepositTokensOfAccount(alice.address)).deep.eq([depositToken.address])
      })
    })

    describe('removeFromDepositTokensOfAccount', function () {
      beforeEach(async function () {
        await controller.connect(depositToken.wallet).addToDepositTokensOfAccount(alice.address)
      })

      it('should revert if caller is not a deposit token', async function () {
        const tx = controller.connect(alice).removeFromDepositTokensOfAccount(alice.address)
        await expect(tx).revertedWith('caller-is-not-deposit-token')
      })

      // eslint-disable-next-line quotes
      it("should remove deposit token to the account's array", async function () {
        // given
        expect(await controller.getDepositTokensOfAccount(alice.address)).deep.eq([depositToken.address])

        // then
        await controller.connect(depositToken.wallet).removeFromDepositTokensOfAccount(alice.address)

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

      it('should not add same debt token twice', async function () {
        // given
        expect(await controller.getDebtTokensOfAccount(alice.address)).deep.eq([])

        // then
        await controller.connect(debtToken.wallet).addToDebtTokensOfAccount(alice.address)
        await controller.connect(debtToken.wallet).addToDebtTokensOfAccount(alice.address)

        // when
        expect(await controller.getDebtTokensOfAccount(alice.address)).deep.eq([debtToken.address])
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
})
