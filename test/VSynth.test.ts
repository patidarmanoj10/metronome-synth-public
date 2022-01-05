/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable camelcase */
import {BigNumber} from '@ethersproject/bignumber'
import {parseEther} from '@ethersproject/units'
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {expect} from 'chai'
import {ethers} from 'hardhat'
import {
  DepositToken,
  DepositToken__factory,
  VSynth,
  VSynth__factory,
  ERC20Mock,
  ERC20Mock__factory,
  OracleMock,
  OracleMock__factory,
  SyntheticAsset,
  SyntheticAsset__factory,
  DebtToken,
  DebtToken__factory,
  Treasury,
  Treasury__factory,
  Issuer__factory,
  Issuer,
} from '../typechain'
import {getMaxLiquidationAmountInUsd, getMinLiquidationAmountInUsd, HOUR, increaseTime} from './helpers'

describe('VSynth', function () {
  let deployer: SignerWithAddress
  let governor: SignerWithAddress
  let user: SignerWithAddress
  let liquidator: SignerWithAddress
  let met: ERC20Mock
  let dai: ERC20Mock
  let vsEthDebtToken: DebtToken
  let vsDogeDebtToken: DebtToken
  let vsEth: SyntheticAsset
  let vsDoge: SyntheticAsset
  let treasury: Treasury
  let metDepositToken: DepositToken
  let daiDepositToken: DepositToken
  let oracle: OracleMock
  let issuer: Issuer
  let vSynth: VSynth

  const liquidatorFee = parseEther('0.1') // 10%
  const vsEthCR = parseEther('1.5') // 150%
  const vsDogeCR = parseEther('2') // 200%
  const ethRate = parseEther('4000') // 1 ETH = $4,000
  const metRate = parseEther('4') // 1 MET = $4
  const daiRate = parseEther('1') // 1 DAI = $1
  const dogeRate = parseEther('0.4') // 1 DOGE = $0.4
  const interestRate = parseEther('0')

  beforeEach(async function () {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[deployer, governor, user, liquidator] = await ethers.getSigners()

    const oracleMock = new OracleMock__factory(deployer)
    oracle = <OracleMock>await oracleMock.deploy()
    await oracle.deployed()

    const erc20MockFactory = new ERC20Mock__factory(deployer)

    met = await erc20MockFactory.deploy('Metronome', 'MET', 18)
    await met.deployed()

    dai = await erc20MockFactory.deploy('Dai Stablecoin', 'DAI', 8)
    await dai.deployed()

    const treasuryFactory = new Treasury__factory(deployer)
    treasury = await treasuryFactory.deploy()
    await treasury.deployed()

    const depositTokenFactory = new DepositToken__factory(deployer)
    metDepositToken = await depositTokenFactory.deploy()
    await metDepositToken.deployed()

    daiDepositToken = await depositTokenFactory.deploy()
    await daiDepositToken.deployed()

    const debtTokenFactory = new DebtToken__factory(deployer)

    vsEthDebtToken = await debtTokenFactory.deploy()
    await vsEthDebtToken.deployed()

    vsDogeDebtToken = await debtTokenFactory.deploy()
    await vsDogeDebtToken.deployed()

    const syntheticAssetFactory = new SyntheticAsset__factory(deployer)

    vsEth = await syntheticAssetFactory.deploy()
    await vsEth.deployed()

    vsDoge = await syntheticAssetFactory.deploy()
    await vsDoge.deployed()

    const issuerFactory = new Issuer__factory(deployer)
    issuer = await issuerFactory.deploy()
    await issuer.deployed()

    const vSynthFactory = new VSynth__factory(deployer)
    vSynth = await vSynthFactory.deploy()
    await vSynth.deployed()

    // Deployment tasks
    await metDepositToken.initialize(met.address, issuer.address, oracle.address, 'vSynths-MET', 18)
    await metDepositToken.transferGovernorship(governor.address)
    await metDepositToken.connect(governor).acceptGovernorship()

    await daiDepositToken.initialize(dai.address, issuer.address, oracle.address, 'vSynths-WBTC', 8)
    await daiDepositToken.transferGovernorship(governor.address)
    await daiDepositToken.connect(governor).acceptGovernorship()

    await treasury.initialize(issuer.address)
    await treasury.transferGovernorship(governor.address)
    await treasury.connect(governor).acceptGovernorship()

    await vsEthDebtToken.initialize('vsETH Debt', 'vsETH-Debt', 18, issuer.address, vsEth.address)
    await vsEthDebtToken.transferGovernorship(governor.address)
    await vsEthDebtToken.connect(governor).acceptGovernorship()

    await vsEth.initialize(
      'Vesper Synth ETH',
      'vsETH',
      18,
      issuer.address,
      vsEthDebtToken.address,
      vsEthCR,
      oracle.address,
      interestRate
    )
    await vsEth.transferGovernorship(governor.address)
    await vsEth.connect(governor).acceptGovernorship()

    await vsDogeDebtToken.initialize('vsDOGE Debt', 'vsDOGE-Debt', 18, issuer.address, vsDoge.address)
    await vsDogeDebtToken.transferGovernorship(governor.address)
    await vsDogeDebtToken.connect(governor).acceptGovernorship()

    await vsDoge.initialize(
      'Vesper Synth DOGE',
      'vsDOGE',
      18,
      issuer.address,
      vsDogeDebtToken.address,
      vsDogeCR,
      oracle.address,
      interestRate
    )
    await vsDoge.transferGovernorship(governor.address)
    await vsDoge.connect(governor).acceptGovernorship()

    await vSynth.initialize(metDepositToken.address, oracle.address, issuer.address)
    await vSynth.updateLiquidatorFee(liquidatorFee)

    await issuer.initialize(metDepositToken.address, vsEth.address, oracle.address, treasury.address, vSynth.address)
    await issuer.addDepositToken(daiDepositToken.address)
    await issuer.addSyntheticAsset(vsDoge.address)

    // mint some collaterals to users
    await met.mint(user.address, parseEther(`${1e6}`))
    await met.mint(liquidator.address, parseEther(`${1e6}`))
    await dai.mint(user.address, parseEther(`${1e6}`))

    // initialize mocked oracle
    await oracle.updateRate(dai.address, daiRate)
    await oracle.updateRate(met.address, metRate)
    await oracle.updateRate(vsEth.address, ethRate)
    await oracle.updateRate(vsDoge.address, dogeRate)
  })

  describe('deposit', function () {
    beforeEach(async function () {
      await met.connect(user).approve(vSynth.address, ethers.constants.MaxUint256)
    })

    it('should revert if paused', async function () {
      // given
      await vSynth.pause()

      // when
      const toDeposit = parseEther('10')
      const tx = vSynth.connect(user).deposit(metDepositToken.address, toDeposit)

      // then
      await expect(tx).to.revertedWith('paused')
    })

    it('should revert if shutdown', async function () {
      // given
      await vSynth.shutdown()

      // when
      const toDeposit = parseEther('10')
      const tx = vSynth.connect(user).deposit(metDepositToken.address, toDeposit)

      // then
      await expect(tx).to.revertedWith('paused')
    })

    it('should revert if collateral amount is 0', async function () {
      const toDeposit = 0
      const tx = vSynth.connect(user).deposit(metDepositToken.address, toDeposit)
      await expect(tx).to.revertedWith('zero-collateral-amount')
    })

    it('should revert if MET balance is not enough', async function () {
      const balance = await met.balanceOf(user.address)
      const tooHigh = balance.add('1')
      const tx = vSynth.connect(user).deposit(metDepositToken.address, tooHigh)
      await expect(tx).to.revertedWith('ERC20: transfer amount exceeds balance')
    })

    it('should deposit MET and mint vSynth-MET (depositFee == 0)', async function () {
      // when
      const amount = parseEther('10')
      const tx = () => vSynth.connect(user).deposit(metDepositToken.address, amount)

      // then
      await expect(tx).changeTokenBalances(met, [user, treasury], [amount.mul('-1'), amount])
      await expect(tx).changeTokenBalances(metDepositToken, [user, vSynth], [amount, 0])
      await expect(tx())
        .to.emit(vSynth, 'CollateralDeposited')
        .withArgs(metDepositToken.address, user.address, amount, 0)
    })

    it('should deposit MET and mint vSynth-MET (depositFee > 0)', async function () {
      // given
      const depositFee = parseEther('0.01') // 1%
      await vSynth.updateDepositFee(depositFee)

      // when
      const amount = parseEther('100')
      const tx = () => vSynth.connect(user).deposit(metDepositToken.address, amount)
      const expectedFeeAmount = parseEther('1')
      const expectedAmounAfterFee = parseEther('99') // -1% fee

      // then
      await expect(tx).changeTokenBalances(met, [user, treasury], [amount.mul('-1'), amount])
      await expect(tx).changeTokenBalances(
        metDepositToken,
        [user, vSynth, treasury],
        [expectedAmounAfterFee, 0, expectedFeeAmount]
      )
      await expect(tx())
        .to.emit(vSynth, 'CollateralDeposited')
        .withArgs(metDepositToken.address, user.address, amount, expectedFeeAmount)
    })

    describe('when user deposited multi-collateral', function () {
      const metDepositAmount = parseEther('6000') // ~$24,000
      const daiDepositAmount = parseEther('24000') // ~$24,000

      beforeEach(async function () {
        await met.connect(user).approve(vSynth.address, ethers.constants.MaxUint256)
        await dai.connect(user).approve(vSynth.address, ethers.constants.MaxUint256)

        await vSynth.connect(user).deposit(metDepositToken.address, metDepositAmount)
        await vSynth.connect(user).deposit(daiDepositToken.address, daiDepositAmount)
      })

      it('should calculate deposit correctly', async function () {
        expect(await issuer.debtPositionOfUsingLatestPrices(user.address)).deep.eq([
          true, // _isHealthy
          parseEther('0'), // _lockedDepositInUsd
          parseEther('48000'), // _depositInUsd
          parseEther('48000'), // _unlockedDepositInUsd
          false, //_anyPriceInvalid
        ])
      })

      it('should be able to mint using position among multiple collaterals', async function () {
        const amountToMint = parseEther('8') // ~$32,000
        await vSynth.connect(user).mint(vsEth.address, amountToMint)

        const {_isHealthy, _lockedDepositInUsd, _depositInUsd, _unlockedDepositInUsd, _anyPriceInvalid} =
          await issuer.debtPositionOfUsingLatestPrices(user.address)

        expect(_isHealthy).eq(true)
        expect(_lockedDepositInUsd).eq(parseEther('48000'))
        expect(_depositInUsd).eq(parseEther('48000'))
        expect(_unlockedDepositInUsd).eq(0)
        expect(_anyPriceInvalid).eq(false)
      })
    })

    describe('when user deposited some MET', function () {
      const userDepositAmount = parseEther('6000')

      beforeEach(async function () {
        await met.connect(user).approve(vSynth.address, ethers.constants.MaxUint256)
        await vSynth.connect(user).deposit(metDepositToken.address, userDepositAmount)
      })

      describe('mint', function () {
        let collateralInUsd: BigNumber
        let maxIssuableInUsd: BigNumber
        let maxIssuableInEth: BigNumber

        beforeEach(async function () {
          collateralInUsd = await oracle.convertToUsd(met.address, userDepositAmount)
          maxIssuableInUsd = collateralInUsd.mul(parseEther('1')).div(vsEthCR)
          maxIssuableInEth = maxIssuableInUsd.mul(parseEther('1')).div(ethRate)
        })

        it('should not revert if paused', async function () {
          // given
          await vSynth.pause()

          // when
          const toMint = parseEther('0.1')
          const tx = vSynth.connect(user).mint(vsEth.address, toMint)

          // then
          await expect(tx).to.emit(vSynth, 'SyntheticAssetMinted')
        })

        it('should revert if shutdown', async function () {
          // given
          await vSynth.shutdown()

          // when
          const toMint = parseEther('0.1')
          const tx = vSynth.connect(user).mint(vsEth.address, toMint)

          // then
          await expect(tx).to.revertedWith('shutdown')
        })

        it('should revert if synthetic does not exist', async function () {
          // when
          const toIssue = maxIssuableInEth.add(parseEther('1'))
          const invalidSynthetic = met
          const tx = vSynth.mint(invalidSynthetic.address, toIssue)

          // then
          await expect(tx).to.revertedWith('synthetic-asset-does-not-exists')
        })

        it('should revert if synthetic is not active', async function () {
          // given
          await vsEth.connect(governor).toggleIsActive()

          // when
          const amountToMint = parseEther('1')
          const tx = vSynth.connect(user).mint(vsEth.address, amountToMint)

          // then
          await expect(tx).to.revertedWith('synthetic-asset-is-not-active')
        })

        it('should revert if user has not enough collateral deposited', async function () {
          // when
          const toIssue = maxIssuableInEth.add(parseEther('1'))
          const tx = vSynth.connect(user).mint(vsEth.address, toIssue)

          // then
          await expect(tx).to.revertedWith('not-enough-collateral')
        })

        it('should revert if amount to mint is 0', async function () {
          // when
          const toIssue = 0
          const tx = vSynth.connect(user).mint(vsEth.address, toIssue)

          // then
          await expect(tx).to.revertedWith('amount-to-mint-is-zero')
        })

        it('should mint vsEth (mintFee == 0)', async function () {
          // given
          const {_maxIssuable: maxIssuableBefore} = await issuer.maxIssuableForUsingLatestPrices(
            user.address,
            vsEth.address
          )

          expect(maxIssuableBefore).to.eq(
            userDepositAmount.mul(metRate).div(vsEthCR).mul(parseEther('1')).div(ethRate) // 4 ETH
          )

          const {_debtInUsd: _debtInUsdBefore} = await issuer.debtOfUsingLatestPrices(user.address)
          expect(_debtInUsdBefore).to.eq(BigNumber.from(0))
          expect(await issuer.debtPositionOfUsingLatestPrices(user.address)).to.deep.eq([
            true, // _isHealthy
            BigNumber.from(0), // _lockedDepositInUsd
            userDepositAmount.mul(metRate).div(parseEther('1')), // _depositInUsd
            userDepositAmount.mul(metRate).div(parseEther('1')), // _unlockedDepositInUsd
            false, //_anyPriceInvalid
          ])

          // when
          const amountToMint = parseEther('1')
          const tx = () => vSynth.connect(user).mint(vsEth.address, amountToMint)

          // then
          await expect(tx).changeTokenBalances(vsEth, [user], [amountToMint])
          const {_maxIssuable: maxIssuableAfter} = await issuer.maxIssuableForUsingLatestPrices(
            user.address,
            vsEth.address
          )
          expect(maxIssuableAfter).to.eq(maxIssuableBefore.sub(amountToMint)).and.to.eq(parseEther('3')) // 3 ETH = $12K

          const {_debtInUsd: debtInUsdAfter} = await issuer.debtOfUsingLatestPrices(user.address)
          expect(debtInUsdAfter).to.eq(amountToMint.mul(ethRate).div(parseEther('1')))

          const expectedLockedDepositInUsd = amountToMint
            .mul(ethRate)
            .div(parseEther('1'))
            .mul(vsEthCR)
            .div(parseEther('1'))
          const expectedDepositInUsd = userDepositAmount.mul(metRate).div(parseEther('1'))
          const expectedUnlockedInUsd = expectedDepositInUsd.sub(expectedLockedDepositInUsd)

          expect(await issuer.debtPositionOfUsingLatestPrices(user.address)).to.deep.eq([
            true, // _isHealthy
            expectedLockedDepositInUsd,
            expectedDepositInUsd,
            expectedUnlockedInUsd,
            false, //_anyPriceInvalid
          ])

          // Note: the calls below will make additional transfers
          await expect(tx).changeTokenBalances(vsEthDebtToken, [user], [amountToMint])
          await expect(tx).changeTokenBalances(met, [vSynth], [0])
          await expect(tx())
            .to.emit(vSynth, 'SyntheticAssetMinted')
            .withArgs(user.address, vsEth.address, amountToMint, 0)
        })

        it('should mint vsEth (mintFee > 0)', async function () {
          // given
          const mintFee = parseEther('0.1') // 10%
          await vSynth.updateMintFee(mintFee)

          // when
          const amount = parseEther('1')
          const expectedFee = amount.mul(mintFee).div(parseEther('1'))
          const expectedAmountAfterFee = amount.sub(expectedFee)
          const tx = () => vSynth.connect(user).mint(vsEth.address, amount)
          await expect(tx).changeTokenBalances(vsEth, [user, treasury], [expectedAmountAfterFee, expectedFee])

          // then
          // Note: the calls below will make additional transfers
          // See: https://github.com/EthWorks/Waffle/issues/569
          await expect(tx).changeTokenBalances(vsEthDebtToken, [user], [amount])
          await expect(tx())
            .to.emit(vSynth, 'SyntheticAssetMinted')
            .withArgs(user.address, vsEth.address, amount, expectedFee)
        })

        it('should mint max issuable amount (mintFee == 0)', async function () {
          const amount = maxIssuableInEth
          const tx = vSynth.connect(user).mint(vsEth.address, amount)
          await expect(tx).to.emit(vSynth, 'SyntheticAssetMinted').withArgs(user.address, vsEth.address, amount, 0)
        })

        it('should mint max issuable amount (mintFee > 0)', async function () {
          // given
          const mintFee = parseEther('0.1') // 10%
          await vSynth.updateMintFee(mintFee)

          const amount = maxIssuableInEth
          const expectedFee = amount.mul(mintFee).div(parseEther('1'))
          const tx = vSynth.connect(user).mint(vsEth.address, amount)
          await expect(tx)
            .to.emit(vSynth, 'SyntheticAssetMinted')
            .withArgs(user.address, vsEth.address, amount, expectedFee)
        })
      })

      describe('when user minted some vsETH', function () {
        const userMintAmount = parseEther('1')

        beforeEach(async function () {
          await vSynth.connect(user).mint(vsEth.address, userMintAmount)
        })

        describe('withdraw', function () {
          describe('when minimum deposit time is > 0', function () {
            beforeEach(async function () {
              await metDepositToken.connect(governor).updateMinDepositTime(HOUR)
            })

            it('should revert if minimum deposit time have not passed', async function () {
              // when
              const tx = vSynth.connect(user).withdraw(metDepositToken.address, '1')

              // then
              await expect(tx).to.revertedWith('min-deposit-time-have-not-passed')
            })

            it('should withdraw after the minimum deposit period', async function () {
              // given
              await increaseTime(HOUR)

              // when
              const amount = '1'
              const tx = () => vSynth.connect(user).withdraw(metDepositToken.address, amount)

              // then
              await expect(tx).to.changeTokenBalances(met, [user], [amount])
            })
          })

          describe('when minimum deposit time == 0', function () {
            it('should revert not if paused', async function () {
              // given
              await vSynth.pause()

              // when
              const amount = 1
              const tx = vSynth.connect(user).withdraw(metDepositToken.address, amount)

              // then
              await expect(tx).to.emit(vSynth, 'CollateralWithdrawn')
            })

            it('should revert if shutdown', async function () {
              // given
              await vSynth.shutdown()

              // when
              const amount = 1
              const tx = vSynth.connect(user).withdraw(metDepositToken.address, amount)

              // then
              await expect(tx).to.revertedWith('shutdown')
            })

            it('should revert if amount is 0', async function () {
              // when
              const tx = vSynth.connect(user).withdraw(metDepositToken.address, 0)

              // then
              await expect(tx).to.revertedWith('amount-to-withdraw-is-zero')
            })

            it('should revert if amount > unlocked collateral amount', async function () {
              // given
              const {_unlockedDepositInUsd} = await issuer.debtPositionOfUsingLatestPrices(user.address)

              // when
              const _unlockedDeposit = await oracle.convertFromUsd(met.address, _unlockedDepositInUsd)
              const tx = vSynth.connect(user).withdraw(metDepositToken.address, _unlockedDeposit.add('1'))

              // then
              await expect(tx).to.revertedWith('amount-to-withdraw-gt-unlocked')
            })

            it('should withdraw if amount <= unlocked collateral amount (withdrawFee == 0)', async function () {
              // given
              const {_unlockedDepositInUsd: amountToWithdrawInUsd} = await issuer.debtPositionOfUsingLatestPrices(
                user.address
              )
              const metBalanceBefore = await met.balanceOf(user.address)
              const depositBefore = await metDepositToken.balanceOf(user.address)

              // when
              const amountToWithdraw = await oracle.convertFromUsd(met.address, amountToWithdrawInUsd)
              const tx = vSynth.connect(user).withdraw(metDepositToken.address, amountToWithdraw)
              await expect(tx)
                .to.emit(vSynth, 'CollateralWithdrawn')
                .withArgs(metDepositToken.address, user.address, amountToWithdraw, 0)

              // then
              expect(await met.balanceOf(user.address)).to.eq(metBalanceBefore.add(amountToWithdraw))
              expect(await metDepositToken.balanceOf(user.address)).to.eq(depositBefore.sub(amountToWithdraw))
              const {_unlockedDepositInUsd: unlockedCollateralAfter} = await issuer.debtPositionOfUsingLatestPrices(
                user.address
              )
              expect(unlockedCollateralAfter).to.eq(0)
            })

            it('should withdraw if amount <= unlocked collateral amount (withdrawFee > 0)', async function () {
              // given
              const withdrawFee = parseEther('0.1') // 10%
              await vSynth.updateWithdrawFee(withdrawFee)
              const metBalanceBefore = await met.balanceOf(user.address)
              const depositBefore = await metDepositToken.balanceOf(user.address)
              const {_unlockedDepositInUsd: amountToWithdrawInUsd} = await issuer.debtPositionOfUsingLatestPrices(
                user.address
              )
              const amount = await oracle.convertFromUsd(met.address, amountToWithdrawInUsd)
              const expectedFee = amount.mul(withdrawFee).div(parseEther('1'))
              const expectedAmountAfterFee = amount.sub(expectedFee)

              // when
              const tx = vSynth.connect(user).withdraw(metDepositToken.address, amount)
              await expect(tx)
                .to.emit(vSynth, 'CollateralWithdrawn')
                .withArgs(metDepositToken.address, user.address, amount, expectedFee)

              // then
              expect(await met.balanceOf(user.address)).to.eq(metBalanceBefore.add(expectedAmountAfterFee))
              expect(await metDepositToken.balanceOf(user.address)).to.eq(depositBefore.sub(amount))
              const {_unlockedDepositInUsd: unlockedCollateralAfter} = await issuer.debtPositionOfUsingLatestPrices(
                user.address
              )
              expect(unlockedCollateralAfter).to.eq(0)
            })
          })
        })

        describe('repay', function () {
          it('should not revert if paused', async function () {
            // given
            await vSynth.pause()
            const amount = await vsEth.balanceOf(user.address)

            // when
            const tx = vSynth.connect(user).repay(vsEth.address, user.address, amount)

            // then
            await expect(tx).to.emit(vSynth, 'DebtRepayed')
          })

          it('should revert if shutdown', async function () {
            // given
            await vSynth.shutdown()
            const amount = await vsEth.balanceOf(user.address)

            // when
            const tx = vSynth.connect(user).repay(vsEth.address, user.address, amount)

            // then
            await expect(tx).to.revertedWith('shutdown')
          })

          it('should revert if amount is 0', async function () {
            // when
            const tx = vSynth.connect(user).repay(vsEth.address, user.address, 0)

            // then
            await expect(tx).to.revertedWith('amount-to-repay-is-zero')
          })

          it('should revert if amount > unlocked collateral amount', async function () {
            // given
            const amount = await vsEth.balanceOf(user.address)

            // when
            const tx = vSynth.connect(user).repay(vsEth.address, user.address, amount.add('1'))

            // then
            await expect(tx).to.revertedWith('amount-gt-burnable-synthetic')
          })

          it('should repay if amount == debt (repayFee == 0)', async function () {
            // given
            await vSynth.updateRepayFee(0)
            const {_lockedDepositInUsd: lockedCollateralBefore} = await issuer.debtPositionOfUsingLatestPrices(
              user.address
            )
            expect(lockedCollateralBefore).to.gt(0)

            // when
            const amount = await vsEth.balanceOf(user.address)
            const tx = vSynth.connect(user).repay(vsEth.address, user.address, amount)
            await expect(tx).to.emit(vSynth, 'DebtRepayed').withArgs(user.address, vsEth.address, amount, 0)

            // then
            expect(await vsEth.balanceOf(user.address)).to.eq(0)
            const {_lockedDepositInUsd: lockedCollateralAfter} = await issuer.debtPositionOfUsingLatestPrices(
              user.address
            )
            expect(lockedCollateralAfter).to.eq(0)
          })

          it('should repay if amount < debt (repayFee == 0)', async function () {
            // given
            await vSynth.updateRepayFee(0)
            const {_lockedDepositInUsd: lockedDepositBefore} = await issuer.debtPositionOfUsingLatestPrices(
              user.address
            )
            expect(lockedDepositBefore).to.gt(0)

            // when
            const amount = (await vsEth.balanceOf(user.address)).div('2')
            const tx = vSynth.connect(user).repay(vsEth.address, user.address, amount)
            await expect(tx).to.emit(vSynth, 'DebtRepayed').withArgs(user.address, vsEth.address, amount, 0)

            // then
            expect(await vsEth.balanceOf(user.address)).eq(amount)
            const {_lockedDepositInUsd: lockedDepositAfter} = await issuer.debtPositionOfUsingLatestPrices(user.address)
            expect(lockedDepositAfter).to.eq(lockedDepositBefore.div('2'))
          })

          it('should repay if amount == debt (repayFee > 0)', async function () {
            // given
            const repayFee = parseEther('0.1') // 10%
            await vSynth.updateRepayFee(repayFee)
            const {_lockedDepositInUsd: lockedDepositBefore, _depositInUsd: depositInUsdBefore} =
              await issuer.debtPositionOfUsingLatestPrices(user.address)
            expect(lockedDepositBefore).to.gt(0)

            // when
            const amount = await vsEth.balanceOf(user.address)
            const expectedFee = amount.mul(repayFee).div(parseEther('1'))
            const tx = vSynth.connect(user).repay(vsEth.address, user.address, amount)
            await expect(tx).to.emit(vSynth, 'DebtRepayed').withArgs(user.address, vsEth.address, amount, expectedFee)

            // then
            expect(await vsEth.balanceOf(user.address)).to.eq(0)
            const {_lockedDepositInUsd: lockedDepositAfter, _depositInUsd: depositInUsdAfter} =
              await issuer.debtPositionOfUsingLatestPrices(user.address)
            const expectedlockedDepositAfter = lockedDepositBefore.mul(repayFee).div(parseEther('1'))
            expect(lockedDepositAfter).eq(expectedlockedDepositAfter)
            expect(depositInUsdAfter).eq(depositInUsdBefore)
          })

          it('should repay if amount < debt (repayFee > 0)', async function () {
            // given
            const repayFee = parseEther('0.1') // 10%
            await vSynth.updateRepayFee(repayFee)
            const {_lockedDepositInUsd: lockedDepositInUsdBefore, _depositInUsd: depositInUsdBefore} =
              await issuer.debtPositionOfUsingLatestPrices(user.address)
            expect(lockedDepositInUsdBefore).to.gt(0)
            expect(depositInUsdBefore).to.gt(0)

            // when
            const amount = (await vsEth.balanceOf(user.address)).div('2')
            const expectedFee = amount.mul(repayFee).div(parseEther('1'))
            const tx = vSynth.connect(user).repay(vsEth.address, user.address, amount)
            await expect(tx).to.emit(vSynth, 'DebtRepayed').withArgs(user.address, vsEth.address, amount, expectedFee)

            // then
            expect(await vsEth.balanceOf(user.address)).to.eq(amount)
            const {_lockedDepositInUsd: lockedDepositInUsdAfter, _depositInUsd: depositInUsdAfter} =
              await issuer.debtPositionOfUsingLatestPrices(user.address)
            const expectedlockedDepositAfter = lockedDepositInUsdBefore
              .div('2')
              .mul(parseEther('1').add(repayFee))
              .div(parseEther('1'))
            expect(lockedDepositInUsdAfter).to.eq(expectedlockedDepositAfter)
            expect(depositInUsdAfter).to.eq(depositInUsdBefore)
          })
        })

        describe('swap', function () {
          it('should not revert if paused', async function () {
            // given
            await vSynth.pause()

            // when
            const amount = parseEther('0.1')
            const tx = vSynth.connect(user).swap(vsEth.address, vsDoge.address, amount)

            // then
            await expect(tx).to.emit(vSynth, 'SyntheticAssetSwapped')
          })

          it('should revert if shutdown', async function () {
            // given
            await vSynth.shutdown()

            // when
            const amount = parseEther('0.1')
            const tx = vSynth.connect(user).swap(vsEth.address, vsDoge.address, amount)

            // then
            await expect(tx).to.revertedWith('shutdown')
          })

          it('should revert if amount == 0', async function () {
            // when
            const tx = vSynth.connect(user).swap(vsEth.address, vsDoge.address, 0)

            // then
            await expect(tx).to.revertedWith('amount-in-is-zero')
          })

          it('should revert if synthetic out is not active', async function () {
            // given
            await vsDoge.connect(governor).toggleIsActive()

            // when
            const amountIn = await vsEth.balanceOf(user.address)
            const tx = vSynth.connect(user).swap(vsEth.address, vsDoge.address, amountIn)

            // then
            await expect(tx).to.revertedWith('synthetic-asset-is-not-active')
          })

          it('should revert if user has not enough balance', async function () {
            // given
            const vsAssetInBalance = await vsEth.balanceOf(user.address)

            // when
            const amountIn = vsAssetInBalance.add('1')
            const tx = vSynth.connect(user).swap(vsEth.address, vsDoge.address, amountIn)

            // then
            await expect(tx).to.revertedWith('amount-in-gt-synthetic-balance')
          })

          it('should revert if debt position is unhealty', async function () {
            // given
            await oracle.updateRate(met.address, parseEther('0.0001'))

            const vsAssetInBalance = await vsEth.balanceOf(user.address)

            // when
            const amountIn = vsAssetInBalance
            const tx = vSynth.connect(user).swap(vsEth.address, vsDoge.address, amountIn)

            // then
            await expect(tx).to.revertedWith('debt-position-is-unhealthy')
          })

          it('should revert if debt position becomes unhealty (swapFee == 0)', async function () {
            // Note: Using all MET collateral to mint max vsETH possible (that has 150% CR)
            // and try to swap all balance for vsDOGE that has 200% CR

            // given
            await vSynth.updateSwapFee(0)
            const {_maxIssuable} = await issuer.maxIssuableForUsingLatestPrices(user.address, vsEth.address)
            await vSynth.connect(user).mint(vsEth.address, _maxIssuable)
            const vsAssetInBalance = await vsEth.balanceOf(user.address)

            // when
            const amountIn = vsAssetInBalance
            const tx = vSynth.connect(user).swap(vsEth.address, vsDoge.address, amountIn)

            // then
            await expect(tx).to.revertedWith('debt-position-ended-up-unhealthy')
          })

          it('should swap synthetic assets (swapFee == 0)', async function () {
            // given
            await vSynth.updateSwapFee(0)
            const vsAssetInBalanceBefore = await vsEth.balanceOf(user.address)
            const vsAssetInDebtBalanceBefore = await vsEthDebtToken.balanceOf(user.address)
            const vsAssetOutBalanceBefore = await vsDoge.balanceOf(user.address)
            const vsAssetOutDebtBalanceBefore = await vsDogeDebtToken.balanceOf(user.address)
            expect(vsAssetOutBalanceBefore).to.eq(0)
            expect(vsAssetOutDebtBalanceBefore).to.eq(0)
            const {_debtInUsd: debtInUsdBefore} = await issuer.debtOfUsingLatestPrices(user.address)

            // when
            const vsAssetIn = vsEth.address
            const vsAssetOut = vsDoge.address
            const amountIn = vsAssetInBalanceBefore
            const amountInUsd = amountIn.mul(ethRate).div(parseEther('1'))
            const tx = await vSynth.connect(user).swap(vsAssetIn, vsAssetOut, amountIn)

            // then
            const expectedAmountOut = amountInUsd.mul(parseEther('1')).div(dogeRate)

            await expect(tx)
              .to.emit(vSynth, 'SyntheticAssetSwapped')
              .withArgs(user.address, vsAssetIn, vsAssetOut, amountIn, expectedAmountOut, 0)

            const vsAssetInBalanceAfter = await vsEth.balanceOf(user.address)
            const vsAssetInDebtBalanceAfter = await vsEthDebtToken.balanceOf(user.address)
            const vsAssetOutBalanceAfter = await vsDoge.balanceOf(user.address)
            const vsAssetOutDebtBalanceAfter = await vsDogeDebtToken.balanceOf(user.address)
            const {_debtInUsd: debtInUsdAfter} = await issuer.debtOfUsingLatestPrices(user.address)

            expect(debtInUsdAfter).to.eq(debtInUsdBefore)
            expect(vsAssetInBalanceAfter).to.eq(vsAssetInBalanceBefore.sub(amountIn))
            expect(vsAssetInDebtBalanceAfter).to.eq(vsAssetInDebtBalanceBefore.sub(amountIn))
            expect(vsAssetOutBalanceAfter).to.eq(vsAssetOutBalanceBefore.add(expectedAmountOut))
            expect(vsAssetOutDebtBalanceAfter).to.eq(vsAssetOutDebtBalanceBefore.add(expectedAmountOut))
          })

          it('should swap synthetic assets (swapFee > 0)', async function () {
            // given
            const swapFee = parseEther('0.1') // 10%
            await vSynth.updateSwapFee(swapFee)
            const vsAssetInBalanceBefore = await vsEth.balanceOf(user.address)
            const vsAssetInDebtBalanceBefore = await vsEthDebtToken.balanceOf(user.address)
            const vsAssetOutBalanceBefore = await vsDoge.balanceOf(user.address)
            const vsAssetOutDebtBalanceBefore = await vsDogeDebtToken.balanceOf(user.address)
            expect(vsAssetOutBalanceBefore).to.eq(0)
            expect(vsAssetOutDebtBalanceBefore).to.eq(0)
            const {_debtInUsd: debtInUsdBefore} = await issuer.debtOfUsingLatestPrices(user.address)

            // when
            const vsAssetIn = vsEth.address
            const vsAssetOut = vsDoge.address
            const amountIn = vsAssetInBalanceBefore
            const amountInUsd = amountIn.mul(ethRate).div(parseEther('1'))
            const tx = await vSynth.connect(user).swap(vsAssetIn, vsAssetOut, amountIn)

            // then
            const expectedAmountOut = amountInUsd.mul(parseEther('1')).div(dogeRate)
            const expectedFee = expectedAmountOut.mul(swapFee).div(parseEther('1'))
            const expectedAmountOutAfterFee = expectedAmountOut.sub(expectedFee)

            await expect(tx)
              .to.emit(vSynth, 'SyntheticAssetSwapped')
              .withArgs(user.address, vsAssetIn, vsAssetOut, amountIn, expectedAmountOutAfterFee, expectedFee)

            const vsAssetInBalanceAfter = await vsEth.balanceOf(user.address)
            const vsAssetInDebtBalanceAfter = await vsEthDebtToken.balanceOf(user.address)
            const vsAssetOutBalanceAfter = await vsDoge.balanceOf(user.address)
            const vsAssetOutDebtBalanceAfter = await vsDogeDebtToken.balanceOf(user.address)
            const {_debtInUsd: debtInUsdAfter} = await issuer.debtOfUsingLatestPrices(user.address)

            expect(debtInUsdAfter).to.eq(debtInUsdBefore)
            expect(vsAssetInBalanceAfter).to.eq(vsAssetInBalanceBefore.sub(amountIn))
            expect(vsAssetInDebtBalanceAfter).to.eq(vsAssetInDebtBalanceBefore.sub(amountIn))
            expect(vsAssetOutBalanceAfter).to.eq(vsAssetOutBalanceBefore.add(expectedAmountOutAfterFee))
            expect(vsAssetOutDebtBalanceAfter).to.eq(vsAssetOutDebtBalanceBefore.add(expectedAmountOut))
          })
        })

        describe('refinance', function () {
          describe('when the position is unhealty', function () {
            const newMetRate = parseEther('0.03')

            beforeEach(async function () {
              const {_maxIssuable} = await issuer.maxIssuableForUsingLatestPrices(user.address, vsDoge.address)
              await vSynth.connect(user).mint(vsDoge.address, _maxIssuable)

              await oracle.updateRate(met.address, newMetRate)
              const {_isHealthy} = await issuer.debtPositionOfUsingLatestPrices(user.address)
              expect(_isHealthy).to.be.false
            })

            it('should not revert if paused', async function () {
              // given
              await vSynth.pause()
              await oracle.updateRate(met.address, parseEther('3.5'))

              // when
              const amount = await vsDoge.balanceOf(user.address)
              const tx = vSynth.connect(user).refinance(vsDoge.address, amount)

              // then
              await expect(tx).to.emit(vSynth, 'DebtRefinancied')
            })

            it('should revert if shutdown', async function () {
              // given
              await vSynth.shutdown()

              // when
              const amount = await vsDoge.balanceOf(user.address)
              const tx = vSynth.connect(user).refinance(vsDoge.address, amount)

              // then
              await expect(tx).to.revertedWith('shutdown')
            })

            it('should revert if amount == 0', async function () {
              // when
              const tx = vSynth.connect(user).refinance(vsDoge.address, 0)

              // then
              await expect(tx).to.revertedWith('amount-in-is-zero')
            })

            it('should revert if user has not enough balance', async function () {
              // given
              const vsAssetInBalance = await vsDoge.balanceOf(user.address)

              // when
              const amountIn = vsAssetInBalance.add('1')
              const tx = vSynth.connect(user).refinance(vsDoge.address, amountIn)

              // then
              await expect(tx).to.revertedWith('amount-in-gt-synthetic-balance')
            })

            it('should revert if debt position is healty', async function () {
              // given
              await oracle.updateRate(met.address, parseEther('10'))

              const vsAssetInBalance = await vsEth.balanceOf(user.address)

              // when
              const amountIn = vsAssetInBalance
              const tx = vSynth.connect(user).refinance(vsDoge.address, amountIn)

              // then
              await expect(tx).to.revertedWith('debt-position-is-healthy')
            })

            it('should revert if debt position stills unhealty (refinanceFee == 0)', async function () {
              // given
              await vSynth.updateRefinanceFee(0)

              // when
              const amountIn = await vsDoge.balanceOf(user.address)
              const tx = vSynth.connect(user).refinance(vsDoge.address, amountIn)

              // then
              await expect(tx).to.revertedWith('debt-position-ended-up-unhealthy')
            })

            it('should refinance debt (refinanceFee == 0)', async function () {
              // given
              await vSynth.updateRefinanceFee(0)
              await oracle.updateRate(met.address, parseEther('3.5')) // putting debt in a position that is able to save
              const vsAssetInBalanceBefore = await vsDoge.balanceOf(user.address)
              const vsAssetInDebtBalanceBefore = await vsDogeDebtToken.balanceOf(user.address)
              const vsAssetOutBalanceBefore = await vsEth.balanceOf(user.address)
              const vsAssetOutDebtBalanceBefore = await vsEthDebtToken.balanceOf(user.address)

              const {_debtInUsd: debtBefore} = await issuer.debtOfUsingLatestPrices(user.address)
              const {_unlockedDepositInUsd: unlockedInUsdBefore} = await issuer.debtPositionOfUsingLatestPrices(
                user.address
              )

              // when
              const vsAssetIn = vsDoge.address
              const amountToRefinance = vsAssetInBalanceBefore
              const amountInUsd = amountToRefinance.mul(dogeRate).div(parseEther('1'))
              const tx = vSynth.connect(user).refinance(vsAssetIn, amountToRefinance)

              // then
              const expectedAmountOut = amountInUsd.mul(parseEther('1')).div(ethRate)

              await expect(tx)
                .to.emit(vSynth, 'DebtRefinancied')
                .withArgs(user.address, vsAssetIn, amountToRefinance, expectedAmountOut, 0)
                .and.to.emit(vSynth, 'SyntheticAssetSwapped')
                .withArgs(user.address, vsAssetIn, vsEth.address, amountToRefinance, expectedAmountOut, 0)

              const vsAssetInBalanceAfter = await vsDoge.balanceOf(user.address)
              const vsAssetInDebtBalanceAfter = await vsDogeDebtToken.balanceOf(user.address)
              const vsAssetOutBalanceAfter = await vsEth.balanceOf(user.address)
              const vsAssetOutDebtBalanceAfter = await vsEthDebtToken.balanceOf(user.address)
              const {_debtInUsd: debtAfter} = await issuer.debtOfUsingLatestPrices(user.address)
              const {_unlockedDepositInUsd: unlockedInUsdAfter} = await issuer.debtPositionOfUsingLatestPrices(
                user.address
              )

              expect(debtAfter).to.eq(debtBefore)
              expect(unlockedInUsdAfter).to.gt(unlockedInUsdBefore)
              expect(vsAssetInBalanceAfter).to.eq(vsAssetInBalanceBefore.sub(amountToRefinance))
              expect(vsAssetInDebtBalanceAfter).to.eq(vsAssetInDebtBalanceBefore.sub(amountToRefinance))
              expect(vsAssetOutBalanceAfter).to.eq(vsAssetOutBalanceBefore.add(expectedAmountOut))
              expect(vsAssetOutDebtBalanceAfter).to.eq(vsAssetOutDebtBalanceBefore.add(expectedAmountOut))
            })

            it('should refinance debt (refinanceFee > 0)', async function () {
              // given
              const refinanceFee = parseEther('0.1') // 10%
              await vSynth.updateRefinanceFee(refinanceFee)
              await oracle.updateRate(met.address, parseEther('3.5')) // putting debt in a position that is able to save
              const vsAssetInBalanceBefore = await vsDoge.balanceOf(user.address)
              const vsAssetInDebtBalanceBefore = await vsDogeDebtToken.balanceOf(user.address)
              const vsAssetOutBalanceBefore = await vsEth.balanceOf(user.address)
              const vsAssetOutDebtBalanceBefore = await vsEthDebtToken.balanceOf(user.address)

              const {_debtInUsd: debtBefore} = await issuer.debtOfUsingLatestPrices(user.address)
              const {_unlockedDepositInUsd: unlockedInUsdBefore} = await issuer.debtPositionOfUsingLatestPrices(
                user.address
              )

              // when
              const vsAssetIn = vsDoge.address
              const amountToRefinance = vsAssetInBalanceBefore
              const amountInUsd = amountToRefinance.mul(dogeRate).div(parseEther('1'))
              const tx = vSynth.connect(user).refinance(vsAssetIn, amountToRefinance)

              // then
              const expectedAmountOut = amountInUsd.mul(parseEther('1')).div(ethRate)
              const expectedFee = expectedAmountOut.mul(refinanceFee).div(parseEther('1'))
              const expectedAmountOutAfterFee = expectedAmountOut.sub(expectedFee)

              await expect(tx)
                .to.emit(vSynth, 'DebtRefinancied')
                .withArgs(user.address, vsAssetIn, amountToRefinance, expectedAmountOutAfterFee, expectedFee)
                .and.to.emit(vSynth, 'SyntheticAssetSwapped')
                .withArgs(
                  user.address,
                  vsAssetIn,
                  vsEth.address,
                  amountToRefinance,
                  expectedAmountOutAfterFee,
                  expectedFee
                )

              const vsAssetInBalanceAfter = await vsDoge.balanceOf(user.address)
              const vsAssetInDebtBalanceAfter = await vsDogeDebtToken.balanceOf(user.address)
              const vsAssetOutBalanceAfter = await vsEth.balanceOf(user.address)
              const vsAssetOutDebtBalanceAfter = await vsEthDebtToken.balanceOf(user.address)
              const {_debtInUsd: debtAfter} = await issuer.debtOfUsingLatestPrices(user.address)
              const {_unlockedDepositInUsd: unlockedInUsdAfter} = await issuer.debtPositionOfUsingLatestPrices(
                user.address
              )

              expect(debtAfter).to.eq(debtBefore)
              expect(unlockedInUsdAfter).to.gt(unlockedInUsdBefore)
              expect(vsAssetInBalanceAfter).to.eq(vsAssetInBalanceBefore.sub(amountToRefinance))
              expect(vsAssetInDebtBalanceAfter).to.eq(vsAssetInDebtBalanceBefore.sub(amountToRefinance))
              expect(vsAssetOutBalanceAfter).to.eq(vsAssetOutBalanceBefore.add(expectedAmountOutAfterFee))
              expect(vsAssetOutDebtBalanceAfter).to.eq(vsAssetOutDebtBalanceBefore.add(expectedAmountOut))
            })
          })
        })

        describe('liquidate', function () {
          const liquidatorDepositAmount = parseEther('100000')
          const liquidatorMintAmount = parseEther('2')

          beforeEach(async function () {
            await met.connect(liquidator).approve(vSynth.address, ethers.constants.MaxUint256)
            await vSynth.connect(liquidator).deposit(metDepositToken.address, liquidatorDepositAmount)
            await vSynth.connect(liquidator).mint(vsEth.address, liquidatorMintAmount)
          })

          it('should revert if amount to repay == 0', async function () {
            // when
            const tx = vSynth.liquidate(vsEth.address, user.address, 0, metDepositToken.address)

            // then
            await expect(tx).to.revertedWith('amount-to-repay-is-zero')
          })

          it('should revert if liquidator == account', async function () {
            // when
            const tx = vSynth.connect(user).liquidate(vsEth.address, user.address, 1, metDepositToken.address)

            // then
            await expect(tx).to.revertedWith('can-not-liquidate-own-position')
          })

          it('should revert if position is healty', async function () {
            // given
            const {_debtInUsd} = await issuer.debtOfUsingLatestPrices(user.address)
            const {_depositInUsd} = await issuer.debtPositionOfUsingLatestPrices(user.address)
            const isHealthy = _depositInUsd.mul(parseEther('1')).div(_debtInUsd).gte(vsEthCR)
            expect(isHealthy).to.true

            // when
            const tx = vSynth.liquidate(vsEth.address, user.address, parseEther('1'), metDepositToken.address)

            // then
            await expect(tx).to.revertedWith('position-is-healthy')
          })

          describe('when the position is unhealty (colalteral:debt >= 1)', function () {
            const newMetRate = parseEther('0.95')

            beforeEach(async function () {
              await oracle.updateRate(met.address, newMetRate)

              const {_debtInUsd} = await issuer.debtOfUsingLatestPrices(user.address)
              expect(_debtInUsd).to.eq(userMintAmount.mul(ethRate).div(parseEther('1')))

              expect(await issuer.debtPositionOfUsingLatestPrices(user.address)).to.deep.eq([
                false, // _isHealthy
                // _lockedDepositInUsd
                userMintAmount.mul(ethRate).div(parseEther('1')).mul(vsEthCR).div(parseEther('1')),
                userDepositAmount.mul(newMetRate).div(parseEther('1')), // _depositInUsd
                BigNumber.from(0), // _unlockedDepositInUsd
                false, //_anyPriceInvalid
              ])
              expect(await metDepositToken.balanceOf(user.address)).to.eq(userDepositAmount)
              expect(await vsEth.balanceOf(user.address)).to.eq(userMintAmount)
              expect(await vsEthDebtToken.balanceOf(user.address)).to.eq(userMintAmount)
              expect(await metDepositToken.balanceOf(liquidator.address)).to.eq(liquidatorDepositAmount)
              expect(await vsEth.balanceOf(liquidator.address)).to.eq(liquidatorMintAmount)
              expect(await vsEthDebtToken.balanceOf(liquidator.address)).to.eq(liquidatorMintAmount)
            })

            it('should not revert if paused', async function () {
              // given
              await vSynth.pause()

              // when
              const amountToRepay = userMintAmount // repay all user's debt
              const tx = await vSynth
                .connect(liquidator)
                .liquidate(vsEth.address, user.address, amountToRepay, metDepositToken.address)

              // then
              await expect(tx).to.emit(vSynth, 'PositionLiquidated')
            })

            it('should revert if shutdown', async function () {
              // given
              await vSynth.shutdown()

              // when
              const amountToRepay = userMintAmount // repay all user's debt
              const tx = vSynth
                .connect(liquidator)
                .liquidate(vsEth.address, user.address, amountToRepay, metDepositToken.address)

              // then
              await expect(tx).to.revertedWith('shutdown')
            })

            it('should revert if liquidator has not enough vsAsset to repay', async function () {
              // given
              const liquidatorVsEthBalanceBefore = await vsEth.balanceOf(liquidator.address)
              await vSynth.connect(liquidator).repay(vsEth.address, liquidator.address, liquidatorVsEthBalanceBefore)
              const amountToRepayInUsd = await getMinLiquidationAmountInUsd(vSynth, issuer, user.address, vsEth)
              const amountToRepayInVsEth = amountToRepayInUsd.mul(parseEther('1')).div(ethRate)
              expect(await vsEth.balanceOf(liquidator.address)).to.lt(amountToRepayInVsEth)

              // when
              const tx = vSynth
                .connect(liquidator)
                .liquidate(vsEth.address, user.address, amountToRepayInVsEth, metDepositToken.address)

              // then
              await expect(tx).to.revertedWith('amount-gt-burnable-synthetic')
            })

            it('should revert if debt amount is < amount to repay', async function () {
              // given
              const vsEthDebt = await vsEthDebtToken.balanceOf(user.address)

              // when
              const amountToRepay = vsEthDebt.add('1')
              const tx = vSynth
                .connect(liquidator)
                .liquidate(vsEth.address, user.address, amountToRepay, metDepositToken.address)

              // then
              await expect(tx).to.revertedWith('amount-gt-max-liquidable')
            })

            it('should revert if repaying more than max allowed to liquidate', async function () {
              // given
              const maxLiquidable = parseEther('0.5') // 50%
              await vSynth.updateMaxLiquidable(maxLiquidable)
              const vsEthDebt = await vsEthDebtToken.balanceOf(user.address)

              // when
              const amountToRepay = vsEthDebt.div('2').add('1')
              const tx = vSynth
                .connect(liquidator)
                .liquidate(vsEth.address, user.address, amountToRepay, metDepositToken.address)

              // then
              await expect(tx).to.revertedWith('amount-gt-max-liquidable')
            })

            it('should liquidate by repaying all debt (liquidateFee == 0)', async function () {
              // given
              await vSynth.updateLiquidateFee(0)
              const {_debtInUsd: debtInUsdBefore} = await issuer.debtOfUsingLatestPrices(user.address)
              const {_depositInUsd: collateralInUsdBefore} = await issuer.debtPositionOfUsingLatestPrices(user.address)

              // when
              const amountToRepay = userMintAmount // repay all user's debt
              const tx = await vSynth
                .connect(liquidator)
                .liquidate(vsEth.address, user.address, amountToRepay, metDepositToken.address)

              // then
              const [PositionLiquidated] = (await tx.wait()).events!.filter(({event}) => event === 'PositionLiquidated')
              const [, , , , depositSeized] = PositionLiquidated.args!

              const amountToSeizeInUsd = debtInUsdBefore.mul(parseEther('1').add(liquidatorFee)).div(parseEther('1'))
              const expectedDepositSeized = await oracle.convertFromUsd(met.address, amountToSeizeInUsd)
              const expectedDepositAfter = collateralInUsdBefore
                .sub(amountToSeizeInUsd)
                .mul(parseEther('1'))
                .div(newMetRate)
              const {_isHealthy} = await issuer.debtPositionOfUsingLatestPrices(user.address)

              expect(_isHealthy).to.true
              expect(depositSeized).to.eq(expectedDepositSeized)
              expect(await metDepositToken.balanceOf(user.address)).to.eq(expectedDepositAfter)
              expect(await vsEth.balanceOf(user.address)).to.eq(userMintAmount)
              expect(await vsEthDebtToken.balanceOf(user.address)).to.eq(0)
              expect(await metDepositToken.balanceOf(liquidator.address)).to.eq(
                liquidatorDepositAmount.add(depositSeized)
              )
              expect(await vsEth.balanceOf(liquidator.address)).to.eq(liquidatorMintAmount.sub(amountToRepay))
              expect(await vsEthDebtToken.balanceOf(liquidator.address)).to.eq(liquidatorMintAmount)
            })

            it('should liquidate by repaying all debt (liquidateFee > 0)', async function () {
              // given
              const liquidateFee = parseEther('0.01') // 1%
              await vSynth.updateLiquidateFee(liquidateFee)
              const {_debtInUsd: debtInUsdBefore} = await issuer.debtOfUsingLatestPrices(user.address)
              const {_depositInUsd: depositInUsdBefore} = await issuer.debtPositionOfUsingLatestPrices(user.address)
              const depositBefore = await oracle.convertFromUsd(met.address, depositInUsdBefore)

              // when
              const amountToRepay = userMintAmount // repay all user's debt
              const tx = await vSynth
                .connect(liquidator)
                .liquidate(vsEth.address, user.address, amountToRepay, metDepositToken.address)

              // then
              const [PositionLiquidated] = (await tx.wait()).events!.filter(({event}) => event === 'PositionLiquidated')
              const [, , , , depositSeized] = PositionLiquidated.args!

              const depositToSeizeInUsd = debtInUsdBefore
                .mul(parseEther('1').add(liquidatorFee.add(liquidateFee)))
                .div(parseEther('1'))

              const expectedDepositToLiquidator = debtInUsdBefore
                .mul(parseEther('1').add(liquidatorFee))
                .div(newMetRate)
              const expectedDepositSeized = await oracle.convertFromUsd(met.address, depositToSeizeInUsd)
              const expectedDepositAfter = depositBefore.sub(expectedDepositSeized)

              const {_isHealthy} = await issuer.debtPositionOfUsingLatestPrices(user.address)

              expect(_isHealthy).to.true
              expect(depositSeized).to.eq(expectedDepositSeized)
              expect(await metDepositToken.balanceOf(user.address)).to.eq(expectedDepositAfter)
              expect(await vsEth.balanceOf(user.address)).to.eq(userMintAmount)
              expect(await vsEthDebtToken.balanceOf(user.address)).to.eq(0)
              expect(await metDepositToken.balanceOf(liquidator.address)).to.closeTo(
                liquidatorDepositAmount.add(expectedDepositToLiquidator),
                1
              )
              expect(await vsEth.balanceOf(liquidator.address)).to.eq(liquidatorMintAmount.sub(amountToRepay))
              expect(await vsEthDebtToken.balanceOf(liquidator.address)).to.eq(liquidatorMintAmount)
            })

            it('should liquidate by repaying > needed to make position healthy (liquidateFee == 0)', async function () {
              // given
              await vSynth.updateLiquidateFee(0)
              const {_debtInUsd: debtInUsdBefore} = await issuer.debtOfUsingLatestPrices(user.address)
              const {_depositInUsd: collateralInUsdBefore} = await issuer.debtPositionOfUsingLatestPrices(user.address)
              const collateralBefore = await oracle.convertFromUsd(met.address, collateralInUsdBefore)
              const minAmountToRepayInUsd = await getMinLiquidationAmountInUsd(vSynth, issuer, user.address, vsEth)

              // when
              const amountToRepayInUsd = minAmountToRepayInUsd.mul(parseEther('1.1')).div(parseEther('1')) // min + 10%
              expect(amountToRepayInUsd).to.lt(debtInUsdBefore) // ensure that isn't paying all debt
              const amountToRepay = amountToRepayInUsd.mul(parseEther('1')).div(ethRate)
              const tx = await vSynth
                .connect(liquidator)
                .liquidate(vsEth.address, user.address, amountToRepay, metDepositToken.address)
              const [PositionLiquidated] = (await tx.wait()).events!.filter(({event}) => event === 'PositionLiquidated')
              const [, , , , depositSeized] = PositionLiquidated.args!
              const depositSeizedInUsd = await oracle.convertToUsd(met.address, depositSeized)

              // then
              const {_debtInUsd: debtInUsdAfter} = await issuer.debtOfUsingLatestPrices(user.address)
              const {
                _isHealthy: isHealthyAfter,
                _depositInUsd: collateralInUsdAfter,
                _unlockedDepositInUsd: unlockedCollateralInUsdAfter,
                _lockedDepositInUsd: lockedCollateralInUsdAfter,
              } = await issuer.debtPositionOfUsingLatestPrices(user.address)
              const lockedCollateralAfter = await oracle.convertFromUsd(met.address, lockedCollateralInUsdAfter)

              const expectedLocked = debtInUsdAfter
                .mul(vsEthCR)
                .div(parseEther('1'))
                .mul(parseEther('1'))
                .div(newMetRate)

              const currentCollateralizationRatio = collateralInUsdAfter.mul(parseEther('1')).div(debtInUsdAfter)

              expect(currentCollateralizationRatio).to.gt(vsEthCR)
              expect(isHealthyAfter).to.true
              expect(collateralInUsdAfter).to.eq(collateralInUsdBefore.sub(depositSeizedInUsd))
              expect(lockedCollateralAfter).to.eq(expectedLocked)
              expect(unlockedCollateralInUsdAfter).to.eq(collateralInUsdAfter.sub(lockedCollateralInUsdAfter))
              expect(await metDepositToken.balanceOf(user.address)).to.eq(collateralBefore.sub(depositSeized))
              expect(await vsEth.balanceOf(user.address)).to.eq(userMintAmount)
              expect(await vsEthDebtToken.balanceOf(user.address)).to.eq(userMintAmount.sub(amountToRepay))
              expect(await metDepositToken.balanceOf(liquidator.address)).to.eq(
                liquidatorDepositAmount.add(depositSeized)
              )
              expect(await vsEth.balanceOf(liquidator.address)).to.eq(liquidatorMintAmount.sub(amountToRepay))
              expect(await vsEthDebtToken.balanceOf(liquidator.address)).to.eq(liquidatorMintAmount)
            })

            it('should liquidate by repaying > needed to make position healthy (liquidateFee > 0)', async function () {
              // given
              const liquidateFee = parseEther('0.01') // 1%
              await vSynth.updateLiquidateFee(liquidateFee)
              const {_debtInUsd: debtInUsdBefore} = await issuer.debtOfUsingLatestPrices(user.address)
              const {_depositInUsd: collateralInUsdBefore} = await issuer.debtPositionOfUsingLatestPrices(user.address)
              const minAmountToRepayInUsd = await getMinLiquidationAmountInUsd(vSynth, issuer, user.address, vsEth)
              const collateralBefore = await oracle.convertFromUsd(met.address, collateralInUsdBefore)

              // when
              const amountToRepayInUsd = minAmountToRepayInUsd.mul(parseEther('1.1')).div(parseEther('1')) // min + 10%
              expect(amountToRepayInUsd).to.lt(debtInUsdBefore) // ensure that isn't paying all debt
              const amountToRepay = amountToRepayInUsd.mul(parseEther('1')).div(ethRate)
              const tx = await vSynth
                .connect(liquidator)
                .liquidate(vsEth.address, user.address, amountToRepay, metDepositToken.address)
              const [PositionLiquidated] = (await tx.wait()).events!.filter(({event}) => event === 'PositionLiquidated')
              const [, , , , depositSeized] = PositionLiquidated.args!

              const amountToRepayInMET = await oracle.convert(vsEth.address, met.address, amountToRepay)

              const expectedDepositToLiquidator = amountToRepayInMET
                .mul(parseEther('1').add(liquidatorFee))
                .div(parseEther('1'))

              // then
              const {_debtInUsd: debtInUsdAfter} = await issuer.debtOfUsingLatestPrices(user.address)
              const {
                _isHealthy: isHealthyAfter,
                _depositInUsd: collateralInUsdAfter,
                _unlockedDepositInUsd: unlockedCollateralInUsdAfter,
                _lockedDepositInUsd: lockedCollateralInUsdAfter,
              } = await issuer.debtPositionOfUsingLatestPrices(user.address)
              const collateralAfter = await oracle.convertFromUsd(met.address, collateralInUsdAfter)
              const lockedCollateralAfter = await oracle.convertFromUsd(met.address, lockedCollateralInUsdAfter)

              const expectedLocked = debtInUsdAfter.mul(vsEthCR).div(newMetRate)

              const currentCollateralizationRatio = collateralInUsdAfter.mul(parseEther('1')).div(debtInUsdAfter)

              expect(currentCollateralizationRatio).to.gt(vsEthCR)
              expect(isHealthyAfter).to.true
              expect(collateralAfter).to.eq(collateralBefore.sub(depositSeized))
              expect(lockedCollateralAfter).to.closeTo(expectedLocked, 1)
              expect(unlockedCollateralInUsdAfter).to.eq(collateralInUsdAfter.sub(lockedCollateralInUsdAfter))
              expect(await metDepositToken.balanceOf(user.address)).to.eq(collateralBefore.sub(depositSeized))
              expect(await vsEth.balanceOf(user.address)).to.eq(userMintAmount)
              expect(await vsEthDebtToken.balanceOf(user.address)).to.eq(userMintAmount.sub(amountToRepay))
              expect(await metDepositToken.balanceOf(liquidator.address)).to.closeTo(
                liquidatorDepositAmount.add(expectedDepositToLiquidator),
                1
              )
              expect(await vsEth.balanceOf(liquidator.address)).to.eq(liquidatorMintAmount.sub(amountToRepay))
              expect(await vsEthDebtToken.balanceOf(liquidator.address)).to.eq(liquidatorMintAmount)
            })

            it('should liquidate by repaying < needed to make position healthy (liquidateFee == 0)', async function () {
              // given
              await vSynth.updateLiquidateFee(0)
              const {_depositInUsd: collateralInUsdBefore} = await issuer.debtPositionOfUsingLatestPrices(user.address)
              const collateralBefore = await oracle.convertFromUsd(met.address, collateralInUsdBefore)

              // when
              const minAmountToRepayInUsd = await getMinLiquidationAmountInUsd(vSynth, issuer, user.address, vsEth)
              const minAmountToRepay = minAmountToRepayInUsd.mul(parseEther('1')).div(ethRate)
              const amountToRepay = minAmountToRepay.div('2')
              const tx = await vSynth
                .connect(liquidator)
                .liquidate(vsEth.address, user.address, amountToRepay, metDepositToken.address)
              const [PositionLiquidated] = (await tx.wait()).events!.filter(({event}) => event === 'PositionLiquidated')
              const [, , , , depositSeized] = PositionLiquidated.args!

              // then
              const {_debtInUsd: debtInUsdAfter} = await issuer.debtOfUsingLatestPrices(user.address)
              const {
                _isHealthy: isHealthyAfter,
                _depositInUsd: collateralInUsdAfter,
                _unlockedDepositInUsd: unlockedCollateraInUsdlAfter,
                _lockedDepositInUsd: lockedCollateralInUsdAfter,
              } = await issuer.debtPositionOfUsingLatestPrices(user.address)
              const collateralAfter = await oracle.convertFromUsd(met.address, collateralInUsdAfter)

              const currentCollateralizationRatio = collateralInUsdAfter.mul(parseEther('1')).div(debtInUsdAfter)

              expect(currentCollateralizationRatio).to.lt(vsEthCR)
              expect(isHealthyAfter).to.false
              expect(collateralAfter).to.eq(collateralBefore.sub(depositSeized))
              expect(lockedCollateralInUsdAfter).to.gte(collateralInUsdAfter)
              expect(unlockedCollateraInUsdlAfter).to.eq(0)
              expect(await metDepositToken.balanceOf(user.address)).to.eq(collateralBefore.sub(depositSeized))
              expect(await vsEth.balanceOf(user.address)).to.eq(userMintAmount)
              expect(await vsEthDebtToken.balanceOf(user.address)).to.eq(userMintAmount.sub(amountToRepay))
              expect(await metDepositToken.balanceOf(liquidator.address)).to.eq(
                liquidatorDepositAmount.add(depositSeized)
              )
              expect(await vsEth.balanceOf(liquidator.address)).to.eq(liquidatorMintAmount.sub(amountToRepay))
              expect(await vsEthDebtToken.balanceOf(liquidator.address)).to.eq(liquidatorMintAmount)
            })

            it('should liquidate by repaying < needed to make position healthy (liquidateFee > 0)', async function () {
              // given
              const liquidateFee = parseEther('0.01') // 1%
              await vSynth.updateLiquidateFee(liquidateFee)
              const {_depositInUsd: collateralInUsdBefore} = await issuer.debtPositionOfUsingLatestPrices(user.address)
              const collateralBefore = await oracle.convertFromUsd(met.address, collateralInUsdBefore)

              // when
              const amountToRepayInUsd = (await getMinLiquidationAmountInUsd(vSynth, issuer, user.address, vsEth)).div(
                '2'
              )
              const amountToRepay = amountToRepayInUsd.mul(parseEther('1')).div(ethRate)
              const tx = await vSynth
                .connect(liquidator)
                .liquidate(vsEth.address, user.address, amountToRepay, metDepositToken.address)
              const [PositionLiquidated] = (await tx.wait()).events!.filter(({event}) => event === 'PositionLiquidated')
              const [, , , , depositSeized] = PositionLiquidated.args!

              // then
              const {_debtInUsd: debtInUsdAfter} = await issuer.debtOfUsingLatestPrices(user.address)
              const {
                _isHealthy: isHealthyAfter,
                _depositInUsd: collateralInUsdAfter,
                _unlockedDepositInUsd: unlockedCollateralInUsdAfter,
                _lockedDepositInUsd: lockedCollateralInUsdAfter,
              } = await issuer.debtPositionOfUsingLatestPrices(user.address)
              const collateralAfter = await oracle.convertFromUsd(met.address, collateralInUsdAfter)

              const amountToRepayInMET = await oracle.convert(vsEth.address, met.address, amountToRepay)

              const expectedDepositToLiquidator = amountToRepayInMET.add(
                amountToRepayInMET.mul(liquidatorFee).div(parseEther('1'))
              )

              const currentCollateralizationRatio = collateralInUsdAfter.mul(parseEther('1')).div(debtInUsdAfter)

              expect(currentCollateralizationRatio).to.lt(vsEthCR)
              expect(isHealthyAfter).to.false
              expect(collateralAfter).to.eq(collateralBefore.sub(depositSeized))
              expect(lockedCollateralInUsdAfter).gte(collateralInUsdAfter)
              expect(unlockedCollateralInUsdAfter).to.eq(0)
              expect(await metDepositToken.balanceOf(user.address)).to.eq(collateralBefore.sub(depositSeized))
              expect(await vsEth.balanceOf(user.address)).to.eq(userMintAmount)
              expect(await vsEthDebtToken.balanceOf(user.address)).to.eq(userMintAmount.sub(amountToRepay))
              expect(await metDepositToken.balanceOf(liquidator.address)).to.eq(
                liquidatorDepositAmount.add(expectedDepositToLiquidator)
              )
              expect(await vsEth.balanceOf(liquidator.address)).to.eq(liquidatorMintAmount.sub(amountToRepay))
              expect(await vsEthDebtToken.balanceOf(liquidator.address)).to.eq(liquidatorMintAmount)
            })

            it('should liquidate by repaying the exact amount to make healthy (liquidateFee == 0)', async function () {
              // given
              await vSynth.updateLiquidateFee(0)
              const {_depositInUsd: depositInUsdBefore} = await issuer.debtPositionOfUsingLatestPrices(user.address)
              const depositBefore = await oracle.convertFromUsd(met.address, depositInUsdBefore)

              // when
              const amountToRepayInUsd = await getMinLiquidationAmountInUsd(vSynth, issuer, user.address, vsEth)
              const amountToRepay = amountToRepayInUsd.mul(parseEther('1')).div(ethRate)
              const tx = await vSynth
                .connect(liquidator)
                .liquidate(vsEth.address, user.address, amountToRepay, metDepositToken.address)
              const [PositionLiquidated] = (await tx.wait()).events!.filter(({event}) => event === 'PositionLiquidated')
              const [, , , , depositSeized] = PositionLiquidated.args!

              // then
              const {_debtInUsd: debtInUsdAfter} = await issuer.debtOfUsingLatestPrices(user.address)
              const {
                _isHealthy: isHealthyAfter,
                _depositInUsd: collateralInUsdAfter,
                _unlockedDepositInUsd: unlockedCollateralInUsdAfter,
                _lockedDepositInUsd: lockedDepositInUsdAfter,
              } = await issuer.debtPositionOfUsingLatestPrices(user.address)
              const depositAfter = await oracle.convertFromUsd(met.address, collateralInUsdAfter)
              const lockedDepositAfter = await oracle.convertFromUsd(met.address, lockedDepositInUsdAfter)

              const expectedLocked = debtInUsdAfter.mul(vsEthCR).div(newMetRate)

              const currentCollateralizationRatio = collateralInUsdAfter.mul(parseEther('1')).div(debtInUsdAfter)

              expect(currentCollateralizationRatio).to.eq(vsEthCR)
              expect(isHealthyAfter).to.true
              expect(depositAfter).to.eq(depositBefore.sub(depositSeized))
              expect(lockedDepositAfter).to.closeTo(expectedLocked, 1)
              expect(unlockedCollateralInUsdAfter).to.eq(collateralInUsdAfter.sub(lockedDepositInUsdAfter))
              expect(await metDepositToken.balanceOf(user.address)).to.eq(depositBefore.sub(depositSeized))
              expect(await vsEth.balanceOf(user.address)).to.eq(userMintAmount)
              expect(await vsEthDebtToken.balanceOf(user.address)).to.eq(userMintAmount.sub(amountToRepay))
              expect(await metDepositToken.balanceOf(liquidator.address)).to.eq(
                liquidatorDepositAmount.add(depositSeized)
              )
              expect(await vsEth.balanceOf(liquidator.address)).to.eq(liquidatorMintAmount.sub(amountToRepay))
              expect(await vsEthDebtToken.balanceOf(liquidator.address)).to.eq(liquidatorMintAmount)
            })

            it('should liquidate by repaying the exact amount to make healthy (liquidateFee > 0)', async function () {
              // given
              const liquidateFee = parseEther('0.01') // 1%
              await vSynth.updateLiquidateFee(liquidateFee)
              const {_depositInUsd: depositBeforeInUsd} = await issuer.debtPositionOfUsingLatestPrices(user.address)
              const depositBefore = await oracle.convertFromUsd(met.address, depositBeforeInUsd)

              // when
              const amountToRepayInUsd = await getMinLiquidationAmountInUsd(vSynth, issuer, user.address, vsEth)
              const amountToRepay = await oracle.convertFromUsd(vsEth.address, amountToRepayInUsd)

              const tx = await vSynth
                .connect(liquidator)
                .liquidate(vsEth.address, user.address, amountToRepay, metDepositToken.address)
              const [PositionLiquidated] = (await tx.wait()).events!.filter(({event}) => event === 'PositionLiquidated')
              const [, , , , depositSeized] = PositionLiquidated.args!

              // then
              const {_debtInUsd: debtInUsdAfter} = await issuer.debtOfUsingLatestPrices(user.address)
              const {
                _isHealthy: isHealthyAfter,
                _depositInUsd: depositInUsdAfter,
                _unlockedDepositInUsd: unlockedDepositInUsdAfter,
                _lockedDepositInUsd: lockedDepositInUsdAfter,
              } = await issuer.debtPositionOfUsingLatestPrices(user.address)
              const depositAfter = await oracle.convertFromUsd(met.address, depositInUsdAfter)
              const lockedDepositAfter = await oracle.convertFromUsd(met.address, lockedDepositInUsdAfter)

              const expectedLocked = debtInUsdAfter.mul(vsEthCR).div(newMetRate)

              const amountToRepayInMET = await oracle.convert(vsEth.address, met.address, amountToRepay)

              const expectedDepositToLiquidator = amountToRepayInMET.add(
                amountToRepayInMET.mul(liquidatorFee).div(parseEther('1'))
              )

              const currentCollateralizationRatio = depositInUsdAfter.mul(parseEther('1')).div(debtInUsdAfter)

              expect(currentCollateralizationRatio).to.eq(vsEthCR)
              expect(isHealthyAfter).to.true
              expect(lockedDepositAfter).to.closeTo(expectedLocked, 1)
              expect(depositAfter).to.eq(depositBefore.sub(depositSeized))
              expect(unlockedDepositInUsdAfter).to.eq(depositInUsdAfter.sub(lockedDepositInUsdAfter))
              expect(await metDepositToken.balanceOf(user.address)).to.eq(depositBefore.sub(depositSeized))
              expect(await vsEth.balanceOf(user.address)).to.eq(userMintAmount)
              expect(await vsEthDebtToken.balanceOf(user.address)).to.eq(userMintAmount.sub(amountToRepay))
              expect(await metDepositToken.balanceOf(liquidator.address)).to.closeTo(
                liquidatorDepositAmount.add(expectedDepositToLiquidator),
                1
              )
              expect(await vsEth.balanceOf(liquidator.address)).to.eq(liquidatorMintAmount.sub(amountToRepay))
              expect(await vsEthDebtToken.balanceOf(liquidator.address)).to.eq(liquidatorMintAmount)
            })
          })

          describe('when the position is unhealty (collateral:debt < 1)', function () {
            const newMetRate = parseEther('0.50')

            beforeEach(async function () {
              await oracle.updateRate(met.address, newMetRate)
              const {_debtInUsd} = await issuer.debtOfUsingLatestPrices(user.address)
              const {_depositInUsd} = await issuer.debtPositionOfUsingLatestPrices(user.address)
              expect(_debtInUsd).gt(_depositInUsd)
            })

            it('should revert if paying more than needed to seize all deposit', async function () {
              const amountToRepay = await vsEthDebtToken.balanceOf(user.address)
              const tx = vSynth
                .connect(liquidator)
                .liquidate(vsEth.address, user.address, amountToRepay, metDepositToken.address)

              // then
              await expect(tx).to.revertedWith('amount-to-repay-is-too-high')
            })

            it('should liquidate by repaying max possible amount (liquidafeFee == 0)', async function () {
              // given
              await vSynth.updateLiquidateFee(0)
              const depositBefore = await metDepositToken.balanceOf(user.address)

              // when
              const amountToRepayInUsd = await getMaxLiquidationAmountInUsd(vSynth, issuer, user.address)
              const amountToRepay = amountToRepayInUsd.mul(parseEther('1')).div(ethRate)

              const tx = await vSynth
                .connect(liquidator)
                .liquidate(vsEth.address, user.address, amountToRepay, metDepositToken.address)

              // then
              const [PositionLiquidated] = (await tx.wait()).events!.filter(({event}) => event === 'PositionLiquidated')
              const [, , , , depositSeized] = PositionLiquidated.args!

              const {_isHealthy} = await issuer.debtPositionOfUsingLatestPrices(user.address)

              const remainder = 1600 // left over amount on user's deposit balance

              expect(_isHealthy).to.false
              expect(depositSeized).to.closeTo(depositBefore, remainder)
              expect(await metDepositToken.balanceOf(user.address)).to.closeTo(BigNumber.from('0'), remainder)
              expect(await vsEth.balanceOf(user.address)).to.eq(userMintAmount)
              expect(await vsEthDebtToken.balanceOf(user.address)).to.gt(0)
              expect(await metDepositToken.balanceOf(liquidator.address)).to.eq(
                liquidatorDepositAmount.add(depositSeized)
              )
              expect(await vsEth.balanceOf(liquidator.address)).to.eq(liquidatorMintAmount.sub(amountToRepay))
              expect(await vsEthDebtToken.balanceOf(liquidator.address)).to.eq(liquidatorMintAmount)
            })

            it('should liquidate by repaying max possible amount (liquidafeFee > 0)', async function () {
              // given
              const liquidateFee = parseEther('0.01') // 1%
              await vSynth.updateLiquidateFee(liquidateFee)
              const depositBefore = await metDepositToken.balanceOf(user.address)

              // when
              const amountToRepayInUsd = await getMaxLiquidationAmountInUsd(vSynth, issuer, user.address)
              const amountToRepay = amountToRepayInUsd.mul(parseEther('1')).div(ethRate)
              const tx = await vSynth
                .connect(liquidator)
                .liquidate(vsEth.address, user.address, amountToRepay, metDepositToken.address)

              // then
              const [PositionLiquidated] = (await tx.wait()).events!.filter(({event}) => event === 'PositionLiquidated')
              const [, , , , depositSeized] = PositionLiquidated.args!

              const amountToRepayInMET = await oracle.convert(vsEth.address, met.address, amountToRepay)

              const expectedDepositToLiquidator = amountToRepayInMET.add(
                amountToRepayInMET.mul(liquidatorFee).div(parseEther('1'))
              )

              const {_isHealthy} = await issuer.debtPositionOfUsingLatestPrices(user.address)

              const remainder = 6000 // left over amount on user's deposit balance

              expect(_isHealthy).to.false
              expect(depositSeized).to.closeTo(depositBefore, remainder)
              expect(await metDepositToken.balanceOf(user.address)).to.closeTo(BigNumber.from('0'), remainder)
              expect(await vsEth.balanceOf(user.address)).to.eq(userMintAmount)
              expect(await vsEthDebtToken.balanceOf(user.address)).to.gt(0)
              expect(await metDepositToken.balanceOf(liquidator.address)).to.eq(
                liquidatorDepositAmount.add(expectedDepositToLiquidator)
              )
              expect(await vsEth.balanceOf(liquidator.address)).to.eq(liquidatorMintAmount.sub(amountToRepay))
              expect(await vsEthDebtToken.balanceOf(liquidator.address)).to.eq(liquidatorMintAmount)
            })

            it('should liquidate by not repaying all debt (liquidaFee == 0)', async function () {
              // given
              await vSynth.updateLiquidateFee(0)
              const {_depositInUsd: collateralInUsdBefore} = await issuer.debtPositionOfUsingLatestPrices(user.address)
              const collateralBefore = await oracle.convertFromUsd(met.address, collateralInUsdBefore)

              // when
              const amountToRepayInUsd = await getMaxLiquidationAmountInUsd(vSynth, issuer, user.address)
              const minAmountToRepay = amountToRepayInUsd.mul(parseEther('1')).div(ethRate)
              const amountToRepay = minAmountToRepay.div('2')
              const tx = await vSynth
                .connect(liquidator)
                .liquidate(vsEth.address, user.address, amountToRepay, metDepositToken.address)
              const [PositionLiquidated] = (await tx.wait()).events!.filter(({event}) => event === 'PositionLiquidated')
              const [, , , , depositSeized] = PositionLiquidated.args!

              // then
              const {_debtInUsd: debtInUsdAfter} = await issuer.debtOfUsingLatestPrices(user.address)
              const {
                _isHealthy: isHealthyAfter,
                _depositInUsd: collateralInUsdAfter,
                _unlockedDepositInUsd: unlockedCollateralInUsdAfter,
                _lockedDepositInUsd: lockedCollateralInUsdAfter,
              } = await issuer.debtPositionOfUsingLatestPrices(user.address)
              const collateralAfter = await oracle.convertFromUsd(met.address, collateralInUsdAfter)

              const currentCollateralizationRatio = collateralInUsdAfter.mul(parseEther('1')).div(debtInUsdAfter)

              expect(currentCollateralizationRatio).to.lt(vsEthCR)
              expect(isHealthyAfter).to.false
              expect(collateralAfter).to.eq(collateralBefore.sub(depositSeized))
              expect(lockedCollateralInUsdAfter).gte(collateralInUsdAfter)
              expect(unlockedCollateralInUsdAfter).to.eq(0)
              expect(await metDepositToken.balanceOf(user.address)).to.eq(collateralBefore.sub(depositSeized))
              expect(await vsEth.balanceOf(user.address)).to.eq(userMintAmount)
              expect(await vsEthDebtToken.balanceOf(user.address)).to.eq(userMintAmount.sub(amountToRepay))
              expect(await metDepositToken.balanceOf(liquidator.address)).to.eq(
                liquidatorDepositAmount.add(depositSeized)
              )
              expect(await vsEth.balanceOf(liquidator.address)).to.eq(liquidatorMintAmount.sub(amountToRepay))
              expect(await vsEthDebtToken.balanceOf(liquidator.address)).to.eq(liquidatorMintAmount)
            })

            it('should liquidate by not repaying all debt (liquidaFee > 0)', async function () {
              // given
              const liquidateFee = parseEther('0.01') // 1%
              await vSynth.updateLiquidateFee(liquidateFee)
              const {_depositInUsd: collateralInUsdBefore} = await issuer.debtPositionOfUsingLatestPrices(user.address)
              const collateralBefore = await oracle.convertFromUsd(met.address, collateralInUsdBefore)

              // when
              const amountToRepayInUsd = (await getMaxLiquidationAmountInUsd(vSynth, issuer, user.address)).div('2')
              const amountToRepay = amountToRepayInUsd.mul(parseEther('1')).div(ethRate)
              const tx = await vSynth
                .connect(liquidator)
                .liquidate(vsEth.address, user.address, amountToRepay, metDepositToken.address)
              const [PositionLiquidated] = (await tx.wait()).events!.filter(({event}) => event === 'PositionLiquidated')
              const [, , , , depositSeized] = PositionLiquidated.args!

              // then
              const {_debtInUsd: debtInUsdAfter} = await issuer.debtOfUsingLatestPrices(user.address)
              const {
                _isHealthy: isHealthyAfter,
                _depositInUsd: collateralInUsdAfter,
                _unlockedDepositInUsd: unlockedCollateralInUsdAfter,
                _lockedDepositInUsd: lockedCollateralInUsdAfter,
              } = await issuer.debtPositionOfUsingLatestPrices(user.address)
              const collateralAfter = await oracle.convertFromUsd(met.address, collateralInUsdAfter)

              const amountToRepayInMET = await oracle.convert(vsEth.address, met.address, amountToRepay)

              const expectedDepositToLiquidator = amountToRepayInMET.add(
                amountToRepayInMET.mul(liquidatorFee).div(parseEther('1'))
              )

              const currentCollateralizationRatio = collateralInUsdAfter.mul(parseEther('1')).div(debtInUsdAfter)

              expect(currentCollateralizationRatio).to.lt(vsEthCR)
              expect(isHealthyAfter).to.false
              expect(collateralAfter).to.eq(collateralBefore.sub(depositSeized))
              expect(lockedCollateralInUsdAfter).gte(collateralInUsdAfter)
              expect(unlockedCollateralInUsdAfter).to.eq(0)
              expect(await metDepositToken.balanceOf(user.address)).to.eq(collateralBefore.sub(depositSeized))
              expect(await vsEth.balanceOf(user.address)).to.eq(userMintAmount)
              expect(await vsEthDebtToken.balanceOf(user.address)).to.eq(userMintAmount.sub(amountToRepay))
              expect(await metDepositToken.balanceOf(liquidator.address)).to.eq(
                liquidatorDepositAmount.add(expectedDepositToLiquidator)
              )
              expect(await vsEth.balanceOf(liquidator.address)).to.eq(liquidatorMintAmount.sub(amountToRepay))
              expect(await vsEthDebtToken.balanceOf(liquidator.address)).to.eq(liquidatorMintAmount)
            })
          })

          describe('when user minted both vsETH and vsDOGE using all collateral', function () {
            beforeEach(async function () {
              await vSynth.updateLiquidateFee(0)
              const {_maxIssuable: maxIssuableDoge} = await issuer.maxIssuableForUsingLatestPrices(
                user.address,
                vsDoge.address
              )
              await vSynth.connect(user).mint(vsDoge.address, maxIssuableDoge)
              const {_isHealthy, _unlockedDepositInUsd} = await issuer.debtPositionOfUsingLatestPrices(user.address)
              expect(_isHealthy).to.true
              expect(_unlockedDepositInUsd).to.eq(0)
            })

            it('should liquidate a position that have minted more than one vsAsset', async function () {
              // given
              const newDogeRate = parseEther('0.5')
              await oracle.updateRate(vsDoge.address, newDogeRate) // $0.4 -> $0.5
              const {_isHealthy: isHealthyBefore} = await issuer.debtPositionOfUsingLatestPrices(user.address)
              expect(isHealthyBefore).to.false

              // when
              const minRepayAmountInUsd = await getMinLiquidationAmountInUsd(vSynth, issuer, user.address, vsDoge)
              const minRepayAmountInDoge = minRepayAmountInUsd.div(newDogeRate).mul(parseEther('1'))
              await vSynth.connect(liquidator).mint(vsDoge.address, minRepayAmountInDoge)
              await vSynth
                .connect(liquidator)
                .liquidate(vsDoge.address, user.address, minRepayAmountInDoge, metDepositToken.address)

              // then
              const {
                _isHealthy: isHealthyAfter,
                _lockedDepositInUsd: lockedDepositInUsdAfter,
                _depositInUsd: _depositInUsdAfter,
              } = await issuer.debtPositionOfUsingLatestPrices(user.address)
              expect(lockedDepositInUsdAfter).to.eq(_depositInUsdAfter)
              expect(isHealthyAfter).to.true
            })
          })
        })
      })
    })
  })

  describe('updateMaxLiquidable', function () {
    it('should revert if caller is not governor', async function () {
      // when
      const tx = vSynth.connect(user.address).updateMaxLiquidable(parseEther('1'))

      // then
      await expect(tx).to.revertedWith('not-the-governor')
    })

    it('should revert if using the current value', async function () {
      // when
      const maxLiquidable = await vSynth.maxLiquidable()
      const tx = vSynth.updateMaxLiquidable(maxLiquidable)

      // then
      await expect(tx).to.revertedWith('new-value-is-same-as-current')
    })

    it('should revert if max liquidable > 100%', async function () {
      // when
      const maxLiquidable = parseEther('1').add('1')
      const tx = vSynth.updateMaxLiquidable(maxLiquidable)

      // then
      await expect(tx).to.revertedWith('max-liquidable-gt-100%')
    })

    it('should update max liquidable param', async function () {
      // given
      const currentMaxLiquidable = await vSynth.maxLiquidable()
      const newMaxLiquidable = currentMaxLiquidable.div('2')

      // when
      const tx = vSynth.updateMaxLiquidable(newMaxLiquidable)

      // then
      await expect(tx).to.emit(vSynth, 'MaxLiquidableUpdated').withArgs(currentMaxLiquidable, newMaxLiquidable)
    })
  })
})
