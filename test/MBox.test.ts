/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable camelcase */
import {BigNumber} from '@ethersproject/bignumber'
import {formatUnits, parseEther, parseUnits} from '@ethersproject/units'
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {expect} from 'chai'
import {ethers} from 'hardhat'
import {
  DepositToken,
  DepositToken__factory,
  MBox,
  MBox__factory,
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

describe('MBox', function () {
  let deployer: SignerWithAddress
  let governor: SignerWithAddress
  let user: SignerWithAddress
  let liquidator: SignerWithAddress
  let met: ERC20Mock
  let dai: ERC20Mock
  let mEthDebtToken: DebtToken
  let mDogeDebtToken: DebtToken
  let mEth: SyntheticAsset
  let mDoge: SyntheticAsset
  let treasury: Treasury
  let metDepositToken: DepositToken
  let daiDepositToken: DepositToken
  let oracle: OracleMock
  let issuer: Issuer
  let mBOX: MBox

  const liquidatorFee = parseEther('0.1') // 10%
  const mEthCR = parseEther('1.5') // 150%
  const mDogeCR = parseEther('2') // 200%
  const ethRate = parseEther('4000') // 1 ETH = $4,000
  const metRate = parseEther('4') // 1 MET = $4
  const daiRate = parseEther('1') // 1 DAI = $1
  const dogeRate = parseEther('0.4') // 1 DOGE = $0.4

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

    mEthDebtToken = await debtTokenFactory.deploy()
    await mEthDebtToken.deployed()

    mDogeDebtToken = await debtTokenFactory.deploy()
    await mDogeDebtToken.deployed()

    const syntheticAssetFactory = new SyntheticAsset__factory(deployer)

    mEth = await syntheticAssetFactory.deploy()
    await mEth.deployed()

    mDoge = await syntheticAssetFactory.deploy()
    await mDoge.deployed()

    const issuerFactory = new Issuer__factory(deployer)
    issuer = await issuerFactory.deploy()
    await issuer.deployed()

    const mBoxFactory = new MBox__factory(deployer)
    mBOX = await mBoxFactory.deploy()
    await mBOX.deployed()

    // Deployment tasks
    await metDepositToken.initialize(met.address, issuer.address, oracle.address, 'mBOX-MET')
    await metDepositToken.transferGovernorship(governor.address)
    await metDepositToken.connect(governor).acceptGovernorship()

    await daiDepositToken.initialize(dai.address, issuer.address, oracle.address, 'mBOX-WBTC')
    await daiDepositToken.transferGovernorship(governor.address)
    await daiDepositToken.connect(governor).acceptGovernorship()

    await treasury.initialize(mBOX.address)
    await treasury.transferGovernorship(governor.address)
    await treasury.connect(governor).acceptGovernorship()

    await mEthDebtToken.initialize('mETH Debt', 'mETH-Debt', 18, issuer.address)
    await mEthDebtToken.transferGovernorship(governor.address)
    await mEthDebtToken.connect(governor).acceptGovernorship()

    await mEth.initialize('Metronome ETH', 'mETH', 18, issuer.address, mEthDebtToken.address, mEthCR, oracle.address)
    await mEth.transferGovernorship(governor.address)
    await mEth.connect(governor).acceptGovernorship()

    await mDogeDebtToken.initialize('mDOGE Debt', 'mDOGE-Debt', 18, issuer.address)
    await mDogeDebtToken.transferGovernorship(governor.address)
    await mDogeDebtToken.connect(governor).acceptGovernorship()

    await mDoge.initialize(
      'Metronome DOGE',
      'mDOGE',
      18,
      issuer.address,
      mDogeDebtToken.address,
      mDogeCR,
      oracle.address
    )
    await mDoge.transferGovernorship(governor.address)
    await mDoge.connect(governor).acceptGovernorship()

    await mBOX.initialize(treasury.address, metDepositToken.address, oracle.address, issuer.address)
    await mBOX.updateLiquidatorFee(liquidatorFee)

    await issuer.initialize(metDepositToken.address, mEth.address, oracle.address, mBOX.address)
    await issuer.addDepositToken(daiDepositToken.address)
    await issuer.addSyntheticAsset(mDoge.address)

    // mint some collaterals to users
    await met.mint(user.address, parseEther(`${1e6}`))
    await met.mint(liquidator.address, parseEther(`${1e6}`))
    await dai.mint(user.address, parseEther(`${1e6}`))

    // initialize mocked oracle
    await oracle.updateRate(dai.address, daiRate)
    await oracle.updateRate(met.address, metRate)
    await oracle.updateRate(mEth.address, ethRate)
    await oracle.updateRate(mDoge.address, dogeRate)
  })

  describe('deposit', function () {
    beforeEach(async function () {
      await met.connect(user).approve(mBOX.address, ethers.constants.MaxUint256)
    })

    it('should revert if paused', async function () {
      // given
      await mBOX.pause()

      // when
      const toDeposit = parseEther('10')
      const tx = mBOX.connect(user).deposit(metDepositToken.address, toDeposit)

      // then
      await expect(tx).to.revertedWith('paused')
    })

    it('should revert if shutdown', async function () {
      // given
      await mBOX.shutdown()

      // when
      const toDeposit = parseEther('10')
      const tx = mBOX.connect(user).deposit(metDepositToken.address, toDeposit)

      // then
      await expect(tx).to.revertedWith('paused')
    })

    it('should revert if collateral amount is 0', async function () {
      const toDeposit = 0
      const tx = mBOX.connect(user).deposit(metDepositToken.address, toDeposit)
      await expect(tx).to.revertedWith('zero-collateral-amount')
    })

    it('should revert if MET balance is not enough', async function () {
      const balance = await met.balanceOf(user.address)
      const tooHigh = balance.add('1')
      const tx = mBOX.connect(user).deposit(metDepositToken.address, tooHigh)
      await expect(tx).to.revertedWith('ERC20: transfer amount exceeds balance')
    })

    it('should deposit MET and mint mBOX-MET (depositFee == 0)', async function () {
      // when
      const amount = parseEther('10')
      const tx = () => mBOX.connect(user).deposit(metDepositToken.address, amount)

      // then
      await expect(tx).changeTokenBalances(met, [user, treasury], [amount.mul('-1'), amount])
      await expect(tx).changeTokenBalances(metDepositToken, [user, mBOX], [amount, 0])
      await expect(tx()).to.emit(mBOX, 'CollateralDeposited').withArgs(metDepositToken.address, user.address, amount)
    })

    it('should deposit MET and mint mBOX-MET (depositFee > 0)', async function () {
      // given
      const depositFee = parseEther('0.01') // 1%
      await mBOX.updateDepositFee(depositFee)

      // when
      const amount = parseEther('10')
      const tx = () => mBOX.connect(user).deposit(metDepositToken.address, amount)
      const expectedMintedAmount = amount.mul(parseEther('1').sub(depositFee)).div(parseEther('1')) // 10 * (1 - 0.01)

      // then
      await expect(tx).changeTokenBalances(met, [user, treasury], [amount.mul('-1'), amount])
      await expect(tx).changeTokenBalances(metDepositToken, [user, mBOX], [expectedMintedAmount, 0])
      await expect(tx())
        .to.emit(mBOX, 'CollateralDeposited')
        .withArgs(metDepositToken.address, user.address, expectedMintedAmount)
    })

    describe('when user deposited multi-collateral', function () {
      const metDepositAmount = parseEther('6000') // ~ $24,000
      const daiDepositAmount = parseEther('24000') // ~ $24,000

      beforeEach(async function () {
        await met.connect(user).approve(mBOX.address, ethers.constants.MaxUint256)
        await dai.connect(user).approve(mBOX.address, ethers.constants.MaxUint256)

        await mBOX.connect(user).deposit(metDepositToken.address, metDepositAmount)
        await mBOX.connect(user).deposit(daiDepositToken.address, daiDepositAmount)
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
        await mBOX.connect(user).mint(mEth.address, amountToMint)
        expect(await issuer.debtPositionOfUsingLatestPrices(user.address)).deep.eq([
          true, // _isHealthy
          parseEther('48000'), // _lockedDepositInUsd
          parseEther('48000'), // _depositInUsd
          parseEther('0'), // _unlockedDepositInUsd
          false, //_anyPriceInvalid
        ])
      })
    })

    describe('when user deposited some MET', function () {
      const userDepositAmount = parseEther('6000')

      beforeEach(async function () {
        await met.connect(user).approve(mBOX.address, ethers.constants.MaxUint256)
        await mBOX.connect(user).deposit(metDepositToken.address, userDepositAmount)
      })

      describe('mint', function () {
        let collateralInUsd: BigNumber
        let maxIssuableInUsd: BigNumber
        let maxIssuableInEth: BigNumber

        beforeEach(async function () {
          collateralInUsd = await oracle.convertToUsd(met.address, userDepositAmount)
          maxIssuableInUsd = collateralInUsd.mul(parseEther('1')).div(mEthCR)
          maxIssuableInEth = maxIssuableInUsd.mul(parseEther('1')).div(ethRate)
        })

        it('should not revert if paused', async function () {
          // given
          await mBOX.pause()

          // when
          const toMint = parseEther('0.1')
          const tx = mBOX.connect(user).mint(mEth.address, toMint)

          // then
          await expect(tx).to.emit(mBOX, 'SyntheticAssetMinted')
        })

        it('should revert if shutdown', async function () {
          // given
          await mBOX.shutdown()

          // when
          const toMint = parseEther('0.1')
          const tx = mBOX.connect(user).mint(mEth.address, toMint)

          // then
          await expect(tx).to.revertedWith('shutdown')
        })

        it('should revert if synthetic does not exist', async function () {
          // when
          const toIssue = maxIssuableInEth.add(parseEther('1'))
          const invalidSynthetic = met
          const tx = mBOX.mint(invalidSynthetic.address, toIssue)

          // then
          await expect(tx).to.revertedWith('synthetic-asset-does-not-exists')
        })

        it('should revert if synthetic is not active', async function () {
          // given
          await mEth.connect(governor).toggleIsActive()

          // when
          const amountToMint = parseEther('1')
          const tx = mBOX.connect(user).mint(mEth.address, amountToMint)

          // then
          await expect(tx).to.revertedWith('synthetic-asset-is-not-active')
        })

        it('should revert if user has not enough collateral deposited', async function () {
          // when
          const toIssue = maxIssuableInEth.add(parseEther('1'))
          const tx = mBOX.connect(user).mint(mEth.address, toIssue)

          // then
          await expect(tx).to.revertedWith('not-enough-collateral')
        })

        it('should revert if amount to mint is 0', async function () {
          // when
          const toIssue = 0
          const tx = mBOX.connect(user).mint(mEth.address, toIssue)

          // then
          await expect(tx).to.revertedWith('amount-to-mint-is-zero')
        })

        it('should mint mEth (mintFee == 0)', async function () {
          // given
          const {_maxIssuable: maxIssuableBefore} = await issuer.maxIssuableForUsingLatestPrices(
            user.address,
            mEth.address
          )

          expect(maxIssuableBefore).to.eq(
            userDepositAmount.mul(metRate).div(mEthCR).mul(parseEther('1')).div(ethRate) // 4 ETH
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
          const tx = () => mBOX.connect(user).mint(mEth.address, amountToMint)

          // then
          await expect(tx).changeTokenBalances(mEth, [user], [amountToMint])
          const {_maxIssuable: maxIssuableAfter} = await issuer.maxIssuableForUsingLatestPrices(
            user.address,
            mEth.address
          )
          expect(maxIssuableAfter).to.eq(maxIssuableBefore.sub(amountToMint)).and.to.eq(parseEther('3')) // 3 ETH = $12K

          const {_debtInUsd: debtInUsdAfter} = await issuer.debtOfUsingLatestPrices(user.address)
          expect(debtInUsdAfter).to.eq(amountToMint.mul(ethRate).div(parseEther('1')))

          const expectedLockedDepositInUsd = amountToMint
            .mul(ethRate)
            .div(parseEther('1'))
            .mul(mEthCR)
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
          await expect(tx).changeTokenBalances(mEthDebtToken, [user], [amountToMint])
          await expect(tx).changeTokenBalances(met, [mBOX], [0])
          await expect(tx()).to.emit(mBOX, 'SyntheticAssetMinted').withArgs(user.address, mEth.address, amountToMint)
        })

        it('should mint mEth (mintFee > 0)', async function () {
          // given
          const mintFee = parseEther('0.1') // 10%
          await mBOX.updateMintFee(mintFee)

          // when
          const amountToMint = parseEther('1')
          const expectedFeeInSynthetic = amountToMint.mul(mintFee).div(parseEther('1'))
          const expectedAmountToMint = amountToMint.sub(expectedFeeInSynthetic)
          const tx = () => mBOX.connect(user).mint(mEth.address, amountToMint)
          await expect(tx).changeTokenBalances(mEth, [user], [expectedAmountToMint])

          // then
          const expectedFeeInDeposit = await oracle.convert(mEth.address, met.address, expectedFeeInSynthetic)

          // Note: the calls below will make additional transfers
          // See: https://github.com/EthWorks/Waffle/issues/569
          await expect(tx).changeTokenBalances(metDepositToken, [user], [expectedFeeInDeposit.mul('-1')])
          await expect(tx).changeTokenBalances(mEthDebtToken, [user], [expectedAmountToMint])
          await expect(tx())
            .to.emit(mBOX, 'SyntheticAssetMinted')
            .withArgs(user.address, mEth.address, expectedAmountToMint)
        })

        it('should mint max issuable amount (mintFee == 0)', async function () {
          const amount = maxIssuableInEth
          const tx = mBOX.connect(user).mint(mEth.address, amount)
          await expect(tx).to.emit(mBOX, 'SyntheticAssetMinted').withArgs(user.address, mEth.address, amount)
        })

        it('should mint max issuable amount (mintFee > 0)', async function () {
          // given
          const mintFee = parseEther('0.1') // 10%
          await mBOX.updateMintFee(mintFee)

          const amountToMint = maxIssuableInEth
          const expectedFeeInSynthetic = amountToMint.mul(mintFee).div(parseEther('1'))
          const expectedAmountToMint = amountToMint.sub(expectedFeeInSynthetic)
          const tx = mBOX.connect(user).mint(mEth.address, amountToMint)
          await expect(tx)
            .to.emit(mBOX, 'SyntheticAssetMinted')
            .withArgs(user.address, mEth.address, expectedAmountToMint)
        })
      })

      describe('when user minted some mETH', function () {
        const userMintAmount = parseEther('1')

        beforeEach(async function () {
          await mBOX.connect(user).mint(mEth.address, userMintAmount)
        })

        describe('withdraw', function () {
          describe('when minimum deposit time is > 0', function () {
            beforeEach(async function () {
              await metDepositToken.connect(governor).updateMinDepositTime(HOUR)
            })

            it('should revert if minimum deposit time have not passed', async function () {
              // when
              const tx = mBOX.connect(user).withdraw(metDepositToken.address, '1')

              // then
              await expect(tx).to.revertedWith('min-deposit-time-have-not-passed')
            })

            it('should withdraw after the minimum deposit period', async function () {
              // given
              await increaseTime(HOUR)

              // when
              const amount = '1'
              const tx = () => mBOX.connect(user).withdraw(metDepositToken.address, amount)

              // then
              await expect(tx).to.changeTokenBalances(met, [user], [amount])
            })
          })

          describe('when minimum deposit time == 0', function () {
            it('should revert not if paused', async function () {
              // given
              await mBOX.pause()

              // when
              const amount = 1
              const tx = mBOX.connect(user).withdraw(metDepositToken.address, amount)

              // then
              await expect(tx).to.emit(mBOX, 'CollateralWithdrawn')
            })

            it('should revert if shutdown', async function () {
              // given
              await mBOX.shutdown()

              // when
              const amount = 1
              const tx = mBOX.connect(user).withdraw(metDepositToken.address, amount)

              // then
              await expect(tx).to.revertedWith('shutdown')
            })

            it('should revert if amount is 0', async function () {
              // when
              const tx = mBOX.connect(user).withdraw(metDepositToken.address, 0)

              // then
              await expect(tx).to.revertedWith('amount-to-withdraw-is-zero')
            })

            it('should revert if amount > unlocked collateral amount', async function () {
              // given
              const {_unlockedDepositInUsd} = await issuer.debtPositionOfUsingLatestPrices(user.address)

              // when
              const _unlockedDeposit = await oracle.convertFromUsd(met.address, _unlockedDepositInUsd)
              const tx = mBOX.connect(user).withdraw(metDepositToken.address, _unlockedDeposit.add('1'))

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
              const tx = mBOX.connect(user).withdraw(metDepositToken.address, amountToWithdraw)
              await expect(tx)
                .to.emit(mBOX, 'CollateralWithdrawn')
                .withArgs(metDepositToken.address, user.address, amountToWithdraw)

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
              await mBOX.updateWithdrawFee(withdrawFee)
              const metBalanceBefore = await met.balanceOf(user.address)
              const depositBefore = await metDepositToken.balanceOf(user.address)
              const {_unlockedDepositInUsd: amountToWithdrawInUsd} = await issuer.debtPositionOfUsingLatestPrices(
                user.address
              )
              const amountToWithdraw = await oracle.convertFromUsd(met.address, amountToWithdrawInUsd)
              const expectedWithdrawnAmount = amountToWithdraw
                .mul(parseEther('1').sub(withdrawFee))
                .div(parseEther('1'))

              // when
              const tx = mBOX.connect(user).withdraw(metDepositToken.address, amountToWithdraw)
              await expect(tx)
                .to.emit(mBOX, 'CollateralWithdrawn')
                .withArgs(metDepositToken.address, user.address, expectedWithdrawnAmount)

              // then
              expect(await met.balanceOf(user.address)).to.eq(metBalanceBefore.add(expectedWithdrawnAmount))
              expect(await metDepositToken.balanceOf(user.address)).to.eq(depositBefore.sub(amountToWithdraw))
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
            await mBOX.pause()
            const debtAmount = await mEthDebtToken.balanceOf(user.address)

            // when
            const tx = mBOX.connect(user).repay(mEth.address, user.address, debtAmount)

            // then
            await expect(tx).to.emit(mBOX, 'DebtRepayed')
          })

          it('should revert if shutdown', async function () {
            // given
            await mBOX.shutdown()
            const debtAmount = await mEthDebtToken.balanceOf(user.address)

            // when
            const tx = mBOX.connect(user).repay(mEth.address, user.address, debtAmount)

            // then
            await expect(tx).to.revertedWith('shutdown')
          })

          it('should revert if amount is 0', async function () {
            // when
            const tx = mBOX.connect(user).repay(mEth.address, user.address, 0)

            // then
            await expect(tx).to.revertedWith('amount-to-repay-is-zero')
          })

          it('should revert if amount > unlocked collateral amount', async function () {
            // given
            const debtAmount = await mEthDebtToken.balanceOf(user.address)

            // when
            const tx = mBOX.connect(user).repay(mEth.address, user.address, debtAmount.add('1'))

            // then
            await expect(tx).to.revertedWith('amount-gt-burnable-debt')
          })

          it('should repay if amount == debt (repayFee == 0)', async function () {
            // given
            const debtAmount = await mEthDebtToken.balanceOf(user.address)
            const {_lockedDepositInUsd: lockedCollateralBefore} = await issuer.debtPositionOfUsingLatestPrices(
              user.address
            )
            expect(lockedCollateralBefore).to.gt(0)

            // when
            const tx = mBOX.connect(user).repay(mEth.address, user.address, debtAmount)
            await expect(tx).to.emit(mBOX, 'DebtRepayed').withArgs(user.address, mEth.address, debtAmount)

            // then
            expect(await mEthDebtToken.balanceOf(user.address)).to.eq(0)
            const {_lockedDepositInUsd: lockedCollateralAfter} = await issuer.debtPositionOfUsingLatestPrices(
              user.address
            )
            expect(lockedCollateralAfter).to.eq(0)
          })

          it('should repay if amount < debt (repayFee == 0)', async function () {
            // given
            const debtAmount = (await mEthDebtToken.balanceOf(user.address)).div('2')
            const {_lockedDepositInUsd: lockedDepositBefore} = await issuer.debtPositionOfUsingLatestPrices(
              user.address
            )
            expect(lockedDepositBefore).to.gt(0)

            // when
            const tx = mBOX.connect(user).repay(mEth.address, user.address, debtAmount)
            await expect(tx).to.emit(mBOX, 'DebtRepayed').withArgs(user.address, mEth.address, debtAmount)

            // then
            expect(await mEthDebtToken.balanceOf(user.address)).to.eq(debtAmount)
            const {_lockedDepositInUsd: lockedDepositAfter} = await issuer.debtPositionOfUsingLatestPrices(user.address)
            expect(lockedDepositAfter).to.eq(lockedDepositBefore.div('2'))
          })

          it('should repay if amount == debt (repayFee > 0)', async function () {
            // given
            const repayFee = parseEther('0.1') // 10%
            await mBOX.updateRepayFee(repayFee)
            const amountToRepay = await mEthDebtToken.balanceOf(user.address)
            const {_lockedDepositInUsd: lockedDepositBefore, _depositInUsd: depositInUsdBefore} =
              await issuer.debtPositionOfUsingLatestPrices(user.address)
            expect(lockedDepositBefore).to.gt(0)
            const expectedFeeInUsd = await oracle.convertToUsd(
              mEth.address,
              amountToRepay.mul(repayFee).div(parseEther('1'))
            )

            // when
            const tx = mBOX.connect(user).repay(mEth.address, user.address, amountToRepay)
            await expect(tx).to.emit(mBOX, 'DebtRepayed').withArgs(user.address, mEth.address, amountToRepay)

            // then
            expect(await mEthDebtToken.balanceOf(user.address)).to.eq(0)
            const {_lockedDepositInUsd: lockedDepositAfter, _depositInUsd: depositInUsdAfter} =
              await issuer.debtPositionOfUsingLatestPrices(user.address)
            expect(lockedDepositAfter).to.eq(0)
            expect(depositInUsdAfter).to.eq(depositInUsdBefore.sub(expectedFeeInUsd))
          })

          it('should repay if amount < debt (repayFee > 0)', async function () {
            // given
            const repayFee = parseEther('0.1') // 10%
            await mBOX.updateRepayFee(repayFee)
            const amountToRepay = (await mEthDebtToken.balanceOf(user.address)).div('2')
            const {_lockedDepositInUsd: lockedDepositInUsdBefore, _depositInUsd: depositInUsdBefore} =
              await issuer.debtPositionOfUsingLatestPrices(user.address)
            expect(lockedDepositInUsdBefore).to.gt(0)
            expect(depositInUsdBefore).to.gt(0)
            const expectedFeeInUsd = await oracle.convertToUsd(
              mEth.address,
              amountToRepay.mul(repayFee).div(parseEther('1'))
            )

            // when
            const tx = mBOX.connect(user).repay(mEth.address, user.address, amountToRepay)
            await expect(tx).to.emit(mBOX, 'DebtRepayed').withArgs(user.address, mEth.address, amountToRepay)

            // then
            expect(await mEthDebtToken.balanceOf(user.address)).to.eq(amountToRepay)
            const {_lockedDepositInUsd: lockedDepositInUsdAfter, _depositInUsd: depositInUsdAfter} =
              await issuer.debtPositionOfUsingLatestPrices(user.address)
            expect(lockedDepositInUsdAfter).to.eq(lockedDepositInUsdBefore.div('2'))
            expect(depositInUsdAfter).to.eq(depositInUsdBefore.sub(expectedFeeInUsd))
          })
        })

        describe('swap', function () {
          it('should not revert if paused', async function () {
            // given
            await mBOX.pause()

            // when
            const amount = parseEther('0.1')
            const tx = mBOX.connect(user).swap(mEth.address, mDoge.address, amount)

            // then
            await expect(tx).to.emit(mBOX, 'SyntheticAssetSwapped')
          })

          it('should revert if shutdown', async function () {
            // given
            await mBOX.shutdown()

            // when
            const amount = parseEther('0.1')
            const tx = mBOX.connect(user).swap(mEth.address, mDoge.address, amount)

            // then
            await expect(tx).to.revertedWith('shutdown')
          })

          it('should revert if amount == 0', async function () {
            // when
            const tx = mBOX.connect(user).swap(mEth.address, mDoge.address, 0)

            // then
            await expect(tx).to.revertedWith('amount-in-is-zero')
          })

          it('should revert if synthetic out is not active', async function () {
            // given
            await mDoge.connect(governor).toggleIsActive()

            // when
            const amountIn = await mEth.balanceOf(user.address)
            const tx = mBOX.connect(user).swap(mEth.address, mDoge.address, amountIn)

            // then
            await expect(tx).to.revertedWith('synthetic-asset-is-not-active')
          })

          it('should revert if user has not enough balance', async function () {
            // given
            const mAssetInBalance = await mEth.balanceOf(user.address)

            // when
            const amountIn = mAssetInBalance.add('1')
            const tx = mBOX.connect(user).swap(mEth.address, mDoge.address, amountIn)

            // then
            await expect(tx).to.revertedWith('amount-in-gt-synthetic-balance')
          })

          it('should revert if debt position is unhealty', async function () {
            // given
            await oracle.updateRate(met.address, parseEther('0.0001'))

            const mAssetInBalance = await mEth.balanceOf(user.address)

            // when
            const amountIn = mAssetInBalance
            const tx = mBOX.connect(user).swap(mEth.address, mDoge.address, amountIn)

            // then
            await expect(tx).to.revertedWith('debt-position-is-unhealthy')
          })

          it('should revert if debt position becomes unhealty (swapFee == 0)', async function () {
            // Note: Using all MET collateral to mint max mETH possible (that has 150% CR)
            // and try to swap all balance for mDOGE that has 200% CR

            // given
            await mBOX.updateSwapFee(0)
            const {_maxIssuable} = await issuer.maxIssuableForUsingLatestPrices(user.address, mEth.address)
            await mBOX.connect(user).mint(mEth.address, _maxIssuable)
            const mAssetInBalance = await mEth.balanceOf(user.address)

            // when
            const amountIn = mAssetInBalance
            const tx = mBOX.connect(user).swap(mEth.address, mDoge.address, amountIn)

            // then
            await expect(tx).to.revertedWith('debt-position-ended-up-unhealthy')
          })

          it('should swap synthetic assets (swapFee == 0)', async function () {
            // given
            await mBOX.updateSwapFee(0)
            const mAssetInBalanceBefore = await mEth.balanceOf(user.address)
            const mAssetInDebtBalanceBefore = await mEthDebtToken.balanceOf(user.address)
            const mAssetOutBalanceBefore = await mDoge.balanceOf(user.address)
            const mAssetOutDebtBalanceBefore = await mDogeDebtToken.balanceOf(user.address)
            expect(mAssetOutBalanceBefore).to.eq(0)
            expect(mAssetOutDebtBalanceBefore).to.eq(0)
            const {_debtInUsd: debtInUsdBefore} = await issuer.debtOfUsingLatestPrices(user.address)

            // when
            const mAssetIn = mEth.address
            const mAssetOut = mDoge.address
            const amountIn = mAssetInBalanceBefore
            const amountInUsd = amountIn.mul(ethRate).div(parseEther('1'))
            const tx = await mBOX.connect(user).swap(mAssetIn, mAssetOut, amountIn)

            // then
            const expectedAmountOut = amountInUsd.mul(parseEther('1')).div(dogeRate)

            await expect(tx)
              .to.emit(mBOX, 'SyntheticAssetSwapped')
              .withArgs(user.address, mAssetIn, mAssetOut, amountIn, expectedAmountOut)

            const mAssetInBalanceAfter = await mEth.balanceOf(user.address)
            const mAssetInDebtBalanceAfter = await mEthDebtToken.balanceOf(user.address)
            const mAssetOutBalanceAfter = await mDoge.balanceOf(user.address)
            const mAssetOutDebtBalanceAfter = await mDogeDebtToken.balanceOf(user.address)
            const {_debtInUsd: debtInUsdAfter} = await issuer.debtOfUsingLatestPrices(user.address)

            expect(debtInUsdAfter).to.eq(debtInUsdBefore)
            expect(mAssetInBalanceAfter).to.eq(mAssetInBalanceBefore.sub(amountIn))
            expect(mAssetInDebtBalanceAfter).to.eq(mAssetInDebtBalanceBefore.sub(amountIn))
            expect(mAssetOutBalanceAfter).to.eq(mAssetOutBalanceBefore.add(expectedAmountOut))
            expect(mAssetOutDebtBalanceAfter).to.eq(mAssetOutDebtBalanceBefore.add(expectedAmountOut))
          })

          it('should swap synthetic assets (swapFee > 0)', async function () {
            // given
            const swapFee = parseEther('0.1') // 10%
            await mBOX.updateSwapFee(swapFee)
            const mAssetInBalanceBefore = await mEth.balanceOf(user.address)
            const mAssetInDebtBalanceBefore = await mEthDebtToken.balanceOf(user.address)
            const mAssetOutBalanceBefore = await mDoge.balanceOf(user.address)
            const mAssetOutDebtBalanceBefore = await mDogeDebtToken.balanceOf(user.address)
            expect(mAssetOutBalanceBefore).to.eq(0)
            expect(mAssetOutDebtBalanceBefore).to.eq(0)
            const {_debtInUsd: debtInUsdBefore} = await issuer.debtOfUsingLatestPrices(user.address)

            // when
            const mAssetIn = mEth.address
            const mAssetOut = mDoge.address
            const amountIn = mAssetInBalanceBefore
            const amountInUsd = amountIn.mul(ethRate).div(parseEther('1'))
            const tx = await mBOX.connect(user).swap(mAssetIn, mAssetOut, amountIn)

            // then
            const feeInUsd = amountInUsd.mul(swapFee).div(parseEther('1'))
            const expectedAmountOut = amountInUsd.sub(feeInUsd).mul(parseEther('1')).div(dogeRate)

            await expect(tx)
              .to.emit(mBOX, 'SyntheticAssetSwapped')
              .withArgs(user.address, mAssetIn, mAssetOut, amountIn, expectedAmountOut)

            const mAssetInBalanceAfter = await mEth.balanceOf(user.address)
            const mAssetInDebtBalanceAfter = await mEthDebtToken.balanceOf(user.address)
            const mAssetOutBalanceAfter = await mDoge.balanceOf(user.address)
            const mAssetOutDebtBalanceAfter = await mDogeDebtToken.balanceOf(user.address)
            const {_debtInUsd: debtInUsdAfter} = await issuer.debtOfUsingLatestPrices(user.address)

            expect(debtInUsdAfter).to.eq(debtInUsdBefore.sub(feeInUsd))
            expect(mAssetInBalanceAfter).to.eq(mAssetInBalanceBefore.sub(amountIn))
            expect(mAssetInDebtBalanceAfter).to.eq(mAssetInDebtBalanceBefore.sub(amountIn))
            expect(mAssetOutBalanceAfter).to.eq(mAssetOutBalanceBefore.add(expectedAmountOut))
            expect(mAssetOutDebtBalanceAfter).to.eq(mAssetOutDebtBalanceBefore.add(expectedAmountOut))
          })
        })

        describe('refinance', function () {
          describe('when the position is unhealty', function () {
            const newMetRate = parseEther('0.03')

            beforeEach(async function () {
              const {_maxIssuable} = await issuer.maxIssuableForUsingLatestPrices(user.address, mDoge.address)
              await mBOX.connect(user).mint(mDoge.address, _maxIssuable)

              await oracle.updateRate(met.address, newMetRate)
              const {_isHealthy} = await issuer.debtPositionOfUsingLatestPrices(user.address)
              expect(_isHealthy).to.be.false
            })

            it('should not revert if paused', async function () {
              // given
              await mBOX.pause()
              await oracle.updateRate(met.address, parseEther('3.5'))

              // when
              const amount = await mDoge.balanceOf(user.address)
              const tx = mBOX.connect(user).refinance(mDoge.address, amount)

              // then
              await expect(tx).to.emit(mBOX, 'DebtRefinancied')
            })

            it('should revert if shutdown', async function () {
              // given
              await mBOX.shutdown()

              // when
              const amount = await mDoge.balanceOf(user.address)
              const tx = mBOX.connect(user).refinance(mDoge.address, amount)

              // then
              await expect(tx).to.revertedWith('shutdown')
            })

            it('should revert if amount == 0', async function () {
              // when
              const tx = mBOX.connect(user).refinance(mDoge.address, 0)

              // then
              await expect(tx).to.revertedWith('amount-in-is-zero')
            })

            it('should revert if user has not enough balance', async function () {
              // given
              const mAssetInBalance = await mDoge.balanceOf(user.address)

              // when
              const amountIn = mAssetInBalance.add('1')
              const tx = mBOX.connect(user).refinance(mDoge.address, amountIn)

              // then
              await expect(tx).to.revertedWith('amount-in-gt-synthetic-balance')
            })

            it('should revert if debt position is healty', async function () {
              // given
              await oracle.updateRate(met.address, parseEther('10'))

              const mAssetInBalance = await mEth.balanceOf(user.address)

              // when
              const amountIn = mAssetInBalance
              const tx = mBOX.connect(user).refinance(mDoge.address, amountIn)

              // then
              await expect(tx).to.revertedWith('debt-position-is-healthy')
            })

            it('should revert if debt position stills unhealty (refinanceFee == 0)', async function () {
              // given
              await mBOX.updateRefinanceFee(0)

              // when
              const amountIn = await mDoge.balanceOf(user.address)
              const tx = mBOX.connect(user).refinance(mDoge.address, amountIn)

              // then
              await expect(tx).to.revertedWith('debt-position-ended-up-unhealthy')
            })

            it('should refinance debt (refinanceFee == 0)', async function () {
              // given
              await mBOX.updateRefinanceFee(0)
              await oracle.updateRate(met.address, parseEther('3.5')) // putting debt in a position that is able to save
              const mAssetInBalanceBefore = await mDoge.balanceOf(user.address)
              const mAssetInDebtBalanceBefore = await mDogeDebtToken.balanceOf(user.address)
              const mAssetOutBalanceBefore = await mEth.balanceOf(user.address)
              const mAssetOutDebtBalanceBefore = await mEthDebtToken.balanceOf(user.address)

              const {_debtInUsd: debtBefore} = await issuer.debtOfUsingLatestPrices(user.address)
              const {_unlockedDepositInUsd: unlockedInUsdBefore} = await issuer.debtPositionOfUsingLatestPrices(
                user.address
              )

              // when
              const mAssetIn = mDoge.address
              const amountToRefinance = mAssetInBalanceBefore
              const amountInUsd = amountToRefinance.mul(dogeRate).div(parseEther('1'))
              const tx = await mBOX.connect(user).refinance(mAssetIn, amountToRefinance)

              // then
              const expectedAmountOut = amountInUsd.mul(parseEther('1')).div(ethRate)

              await expect(tx)
                .to.emit(mBOX, 'DebtRefinancied')
                .withArgs(user.address, mAssetIn, amountToRefinance)
                .and.to.emit(mBOX, 'SyntheticAssetSwapped')
                .withArgs(user.address, mAssetIn, mEth.address, amountToRefinance, expectedAmountOut)

              const mAssetInBalanceAfter = await mDoge.balanceOf(user.address)
              const mAssetInDebtBalanceAfter = await mDogeDebtToken.balanceOf(user.address)
              const mAssetOutBalanceAfter = await mEth.balanceOf(user.address)
              const mAssetOutDebtBalanceAfter = await mEthDebtToken.balanceOf(user.address)
              const {_debtInUsd: debtAfter} = await issuer.debtOfUsingLatestPrices(user.address)
              const {_unlockedDepositInUsd: unlockedInUsdAfter} = await issuer.debtPositionOfUsingLatestPrices(
                user.address
              )

              expect(debtAfter).to.eq(debtBefore)
              expect(unlockedInUsdAfter).to.gt(unlockedInUsdBefore)
              expect(mAssetInBalanceAfter).to.eq(mAssetInBalanceBefore.sub(amountToRefinance))
              expect(mAssetInDebtBalanceAfter).to.eq(mAssetInDebtBalanceBefore.sub(amountToRefinance))
              expect(mAssetOutBalanceAfter).to.eq(mAssetOutBalanceBefore.add(expectedAmountOut))
              expect(mAssetOutDebtBalanceAfter).to.eq(mAssetOutDebtBalanceBefore.add(expectedAmountOut))
            })

            it('should refinance debt (refinanceFee > 0)', async function () {
              // given
              const refinanceFee = parseEther('0.1') // 10%
              await mBOX.updateRefinanceFee(refinanceFee)
              await oracle.updateRate(met.address, parseEther('3.5')) // putting debt in a position that is able to save
              const mAssetInBalanceBefore = await mDoge.balanceOf(user.address)
              const mAssetInDebtBalanceBefore = await mDogeDebtToken.balanceOf(user.address)
              const mAssetOutBalanceBefore = await mEth.balanceOf(user.address)
              const mAssetOutDebtBalanceBefore = await mEthDebtToken.balanceOf(user.address)

              const {_debtInUsd: debtBefore} = await issuer.debtOfUsingLatestPrices(user.address)
              const {_unlockedDepositInUsd: unlockedInUsdBefore} = await issuer.debtPositionOfUsingLatestPrices(
                user.address
              )

              // when
              const mAssetIn = mDoge.address
              const amountToRefinance = mAssetInBalanceBefore
              const amountInUsd = amountToRefinance.mul(dogeRate).div(parseEther('1'))
              const tx = await mBOX.connect(user).refinance(mAssetIn, amountToRefinance)

              // then
              const feeInUsd = amountInUsd.mul(refinanceFee).div(parseEther('1'))
              const expectedAmountOut = amountInUsd.sub(feeInUsd).mul(parseEther('1')).div(ethRate)

              await expect(tx)
                .to.emit(mBOX, 'DebtRefinancied')
                .withArgs(user.address, mAssetIn, amountToRefinance)
                .and.to.emit(mBOX, 'SyntheticAssetSwapped')
                .withArgs(user.address, mAssetIn, mEth.address, amountToRefinance, expectedAmountOut)

              const mAssetInBalanceAfter = await mDoge.balanceOf(user.address)
              const mAssetInDebtBalanceAfter = await mDogeDebtToken.balanceOf(user.address)
              const mAssetOutBalanceAfter = await mEth.balanceOf(user.address)
              const mAssetOutDebtBalanceAfter = await mEthDebtToken.balanceOf(user.address)
              const {_debtInUsd: debtAfter} = await issuer.debtOfUsingLatestPrices(user.address)
              const {_unlockedDepositInUsd: unlockedInUsdAfter} = await issuer.debtPositionOfUsingLatestPrices(
                user.address
              )

              expect(debtAfter).to.eq(debtBefore.sub(feeInUsd))
              expect(unlockedInUsdAfter).to.gt(unlockedInUsdBefore)
              expect(mAssetInBalanceAfter).to.eq(mAssetInBalanceBefore.sub(amountToRefinance))
              expect(mAssetInDebtBalanceAfter).to.eq(mAssetInDebtBalanceBefore.sub(amountToRefinance))
              expect(mAssetOutBalanceAfter).to.eq(mAssetOutBalanceBefore.add(expectedAmountOut))
              expect(mAssetOutDebtBalanceAfter).to.eq(mAssetOutDebtBalanceBefore.add(expectedAmountOut))
            })
          })
        })

        describe('liquidate', function () {
          const liquidatorDepositAmount = parseEther('100000')
          const liquidatorMintAmount = parseEther('2')

          beforeEach(async function () {
            await met.connect(liquidator).approve(mBOX.address, ethers.constants.MaxUint256)
            await mBOX.connect(liquidator).deposit(metDepositToken.address, liquidatorDepositAmount)
            await mBOX.connect(liquidator).mint(mEth.address, liquidatorMintAmount)
          })

          it('should revert if amount to repay == 0', async function () {
            // when
            const tx = mBOX.liquidate(mEth.address, user.address, 0, metDepositToken.address)

            // then
            await expect(tx).to.revertedWith('amount-to-repay-is-zero')
          })

          it('should revert if liquidator == account', async function () {
            // when
            const tx = mBOX.connect(user).liquidate(mEth.address, user.address, 1, metDepositToken.address)

            // then
            await expect(tx).to.revertedWith('can-not-liquidate-own-position')
          })

          it('should revert if position is healty', async function () {
            // given
            const {_debtInUsd} = await issuer.debtOfUsingLatestPrices(user.address)
            const {_depositInUsd} = await issuer.debtPositionOfUsingLatestPrices(user.address)
            const isHealthy = _depositInUsd.mul(parseEther('1')).div(_debtInUsd).gte(mEthCR)
            expect(isHealthy).to.true

            // when
            const tx = mBOX.liquidate(mEth.address, user.address, parseEther('1'), metDepositToken.address)

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
                userMintAmount.mul(ethRate).div(parseEther('1')).mul(mEthCR).div(parseEther('1')),
                userDepositAmount.mul(newMetRate).div(parseEther('1')), // _depositInUsd
                BigNumber.from(0), // _unlockedDepositInUsd
                false, //_anyPriceInvalid
              ])
              expect(await metDepositToken.balanceOf(user.address)).to.eq(userDepositAmount)
              expect(await mEth.balanceOf(user.address)).to.eq(userMintAmount)
              expect(await mEthDebtToken.balanceOf(user.address)).to.eq(userMintAmount)
              expect(await metDepositToken.balanceOf(liquidator.address)).to.eq(liquidatorDepositAmount)
              expect(await mEth.balanceOf(liquidator.address)).to.eq(liquidatorMintAmount)
              expect(await mEthDebtToken.balanceOf(liquidator.address)).to.eq(liquidatorMintAmount)
            })

            it('should not revert if paused', async function () {
              // given
              await mBOX.pause()

              // when
              const amountToRepay = userMintAmount // repay all user's debt
              const tx = await mBOX
                .connect(liquidator)
                .liquidate(mEth.address, user.address, amountToRepay, metDepositToken.address)

              // then
              await expect(tx).to.emit(mBOX, 'PositionLiquidated')
            })

            it('should revert if shutdown', async function () {
              // given
              await mBOX.shutdown()

              // when
              const amountToRepay = userMintAmount // repay all user's debt
              const tx = mBOX
                .connect(liquidator)
                .liquidate(mEth.address, user.address, amountToRepay, metDepositToken.address)

              // then
              await expect(tx).to.revertedWith('shutdown')
            })

            it('should revert if liquidator has not enough mAsset to repay', async function () {
              // given
              const liquidatorMEthBalanceBefore = await mEth.balanceOf(liquidator.address)
              await mBOX.connect(liquidator).repay(mEth.address, liquidator.address, liquidatorMEthBalanceBefore)
              const amountToRepayInUsd = await getMinLiquidationAmountInUsd(mBOX, issuer, user.address, mEth)
              const amountToRepayInMEth = amountToRepayInUsd.mul(parseEther('1')).div(ethRate)
              expect(await mEth.balanceOf(liquidator.address)).to.lt(amountToRepayInMEth)

              // when
              const tx = mBOX
                .connect(liquidator)
                .liquidate(mEth.address, user.address, amountToRepayInMEth, metDepositToken.address)

              // then
              await expect(tx).to.revertedWith('amount-gt-burnable-synthetic')
            })

            it('should revert if debt amount is < amount to repay', async function () {
              // given
              const mEthDebt = await mEthDebtToken.balanceOf(user.address)

              // when
              const amountToRepay = mEthDebt.add('1')
              const tx = mBOX
                .connect(liquidator)
                .liquidate(mEth.address, user.address, amountToRepay, metDepositToken.address)

              // then
              await expect(tx).to.revertedWith('amount-gt-max-liquidable')
            })

            it('should revert if repaying more than max allowed to liquidate', async function () {
              // given
              const maxLiquidable = parseEther('0.5') // 50%
              await mBOX.updateMaxLiquidable(maxLiquidable)
              const mEthDebt = await mEthDebtToken.balanceOf(user.address)

              // when
              const amountToRepay = mEthDebt.div('2').add('1')
              const tx = mBOX
                .connect(liquidator)
                .liquidate(mEth.address, user.address, amountToRepay, metDepositToken.address)

              // then
              await expect(tx).to.revertedWith('amount-gt-max-liquidable')
            })

            it('should liquidate by repaying all debt (liquidateFee == 0)', async function () {
              // given
              await mBOX.updateLiquidateFee(0)
              const {_debtInUsd: debtInUsdBefore} = await issuer.debtOfUsingLatestPrices(user.address)
              const {_depositInUsd: collateralInUsdBefore} = await issuer.debtPositionOfUsingLatestPrices(user.address)

              // when
              const amountToRepay = userMintAmount // repay all user's debt
              const tx = await mBOX
                .connect(liquidator)
                .liquidate(mEth.address, user.address, amountToRepay, metDepositToken.address)

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
              expect(await mEth.balanceOf(user.address)).to.eq(userMintAmount)
              expect(await mEthDebtToken.balanceOf(user.address)).to.eq(0)
              expect(await metDepositToken.balanceOf(liquidator.address)).to.eq(
                liquidatorDepositAmount.add(depositSeized)
              )
              expect(await mEth.balanceOf(liquidator.address)).to.eq(liquidatorMintAmount.sub(amountToRepay))
              expect(await mEthDebtToken.balanceOf(liquidator.address)).to.eq(liquidatorMintAmount)
            })

            it('should liquidate by repaying all debt (liquidateFee > 0)', async function () {
              // given
              const liquidateFee = parseEther('0.01') // 1%
              await mBOX.updateLiquidateFee(liquidateFee)
              const {_debtInUsd: debtInUsdBefore} = await issuer.debtOfUsingLatestPrices(user.address)
              const {_depositInUsd: depositInUsdBefore} = await issuer.debtPositionOfUsingLatestPrices(user.address)
              const depositBefore = await oracle.convertFromUsd(met.address, depositInUsdBefore)

              // when
              const amountToRepay = userMintAmount // repay all user's debt
              const tx = await mBOX
                .connect(liquidator)
                .liquidate(mEth.address, user.address, amountToRepay, metDepositToken.address)

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
              expect(await mEth.balanceOf(user.address)).to.eq(userMintAmount)
              expect(await mEthDebtToken.balanceOf(user.address)).to.eq(0)
              expect(await metDepositToken.balanceOf(liquidator.address)).to.closeTo(
                liquidatorDepositAmount.add(expectedDepositToLiquidator),
                1
              )
              expect(await mEth.balanceOf(liquidator.address)).to.eq(liquidatorMintAmount.sub(amountToRepay))
              expect(await mEthDebtToken.balanceOf(liquidator.address)).to.eq(liquidatorMintAmount)
            })

            it('should liquidate by repaying > needed to make position healthy (liquidateFee == 0)', async function () {
              // given
              await mBOX.updateLiquidateFee(0)
              const {_debtInUsd: debtInUsdBefore} = await issuer.debtOfUsingLatestPrices(user.address)
              const {_depositInUsd: collateralInUsdBefore} = await issuer.debtPositionOfUsingLatestPrices(user.address)
              const collateralBefore = await oracle.convertFromUsd(met.address, collateralInUsdBefore)
              const minAmountToRepayInUsd = await getMinLiquidationAmountInUsd(mBOX, issuer, user.address, mEth)

              // when
              const amountToRepayInUsd = minAmountToRepayInUsd.mul(parseEther('1.1')).div(parseEther('1')) // min + 10%
              expect(amountToRepayInUsd).to.lt(debtInUsdBefore) // ensure that isn't paying all debt
              const amountToRepay = amountToRepayInUsd.mul(parseEther('1')).div(ethRate)
              const tx = await mBOX
                .connect(liquidator)
                .liquidate(mEth.address, user.address, amountToRepay, metDepositToken.address)
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
                .mul(mEthCR)
                .div(parseEther('1'))
                .mul(parseEther('1'))
                .div(newMetRate)

              const currentCollateralizationRatio = collateralInUsdAfter.mul(parseEther('1')).div(debtInUsdAfter)

              expect(currentCollateralizationRatio).to.gt(mEthCR)
              expect(isHealthyAfter).to.true
              expect(collateralInUsdAfter).to.eq(collateralInUsdBefore.sub(depositSeizedInUsd))
              expect(lockedCollateralAfter).to.eq(expectedLocked)
              expect(unlockedCollateralInUsdAfter).to.eq(collateralInUsdAfter.sub(lockedCollateralInUsdAfter))
              expect(await metDepositToken.balanceOf(user.address)).to.eq(collateralBefore.sub(depositSeized))
              expect(await mEth.balanceOf(user.address)).to.eq(userMintAmount)
              expect(await mEthDebtToken.balanceOf(user.address)).to.eq(userMintAmount.sub(amountToRepay))
              expect(await metDepositToken.balanceOf(liquidator.address)).to.eq(
                liquidatorDepositAmount.add(depositSeized)
              )
              expect(await mEth.balanceOf(liquidator.address)).to.eq(liquidatorMintAmount.sub(amountToRepay))
              expect(await mEthDebtToken.balanceOf(liquidator.address)).to.eq(liquidatorMintAmount)
            })

            it('should liquidate by repaying > needed to make position healthy (liquidateFee > 0)', async function () {
              // given
              const liquidateFee = parseEther('0.01') // 1%
              await mBOX.updateLiquidateFee(liquidateFee)
              const {_debtInUsd: debtInUsdBefore} = await issuer.debtOfUsingLatestPrices(user.address)
              const {_depositInUsd: collateralInUsdBefore} = await issuer.debtPositionOfUsingLatestPrices(user.address)
              const minAmountToRepayInUsd = await getMinLiquidationAmountInUsd(mBOX, issuer, user.address, mEth)
              const collateralBefore = await oracle.convertFromUsd(met.address, collateralInUsdBefore)

              // when
              const amountToRepayInUsd = minAmountToRepayInUsd.mul(parseEther('1.1')).div(parseEther('1')) // min + 10%
              expect(amountToRepayInUsd).to.lt(debtInUsdBefore) // ensure that isn't paying all debt
              const amountToRepay = amountToRepayInUsd.mul(parseEther('1')).div(ethRate)
              const tx = await mBOX
                .connect(liquidator)
                .liquidate(mEth.address, user.address, amountToRepay, metDepositToken.address)
              const [PositionLiquidated] = (await tx.wait()).events!.filter(({event}) => event === 'PositionLiquidated')
              const [, , , , depositSeized] = PositionLiquidated.args!

              const amountToRepayInMET = await oracle.convert(mEth.address, met.address, amountToRepay)

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

              const expectedLocked = debtInUsdAfter.mul(mEthCR).div(newMetRate)

              const currentCollateralizationRatio = collateralInUsdAfter.mul(parseEther('1')).div(debtInUsdAfter)

              expect(currentCollateralizationRatio).to.gt(mEthCR)
              expect(isHealthyAfter).to.true
              expect(collateralAfter).to.eq(collateralBefore.sub(depositSeized))
              expect(lockedCollateralAfter).to.closeTo(expectedLocked, 1)
              expect(unlockedCollateralInUsdAfter).to.eq(collateralInUsdAfter.sub(lockedCollateralInUsdAfter))
              expect(await metDepositToken.balanceOf(user.address)).to.eq(collateralBefore.sub(depositSeized))
              expect(await mEth.balanceOf(user.address)).to.eq(userMintAmount)
              expect(await mEthDebtToken.balanceOf(user.address)).to.eq(userMintAmount.sub(amountToRepay))
              expect(await metDepositToken.balanceOf(liquidator.address)).to.closeTo(
                liquidatorDepositAmount.add(expectedDepositToLiquidator),
                1
              )
              expect(await mEth.balanceOf(liquidator.address)).to.eq(liquidatorMintAmount.sub(amountToRepay))
              expect(await mEthDebtToken.balanceOf(liquidator.address)).to.eq(liquidatorMintAmount)
            })

            it('should liquidate by repaying < needed to make position healthy (liquidateFee == 0)', async function () {
              // given
              await mBOX.updateLiquidateFee(0)
              const {_depositInUsd: collateralInUsdBefore} = await issuer.debtPositionOfUsingLatestPrices(user.address)
              const collateralBefore = await oracle.convertFromUsd(met.address, collateralInUsdBefore)

              // when
              const minAmountToRepayInUsd = await getMinLiquidationAmountInUsd(mBOX, issuer, user.address, mEth)
              const minAmountToRepay = minAmountToRepayInUsd.mul(parseEther('1')).div(ethRate)
              const amountToRepay = minAmountToRepay.div('2')
              const tx = await mBOX
                .connect(liquidator)
                .liquidate(mEth.address, user.address, amountToRepay, metDepositToken.address)
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

              expect(currentCollateralizationRatio).to.lt(mEthCR)
              expect(isHealthyAfter).to.false
              expect(collateralAfter).to.eq(collateralBefore.sub(depositSeized))
              expect(lockedCollateralInUsdAfter).to.gte(collateralInUsdAfter)
              expect(unlockedCollateraInUsdlAfter).to.eq(0)
              expect(await metDepositToken.balanceOf(user.address)).to.eq(collateralBefore.sub(depositSeized))
              expect(await mEth.balanceOf(user.address)).to.eq(userMintAmount)
              expect(await mEthDebtToken.balanceOf(user.address)).to.eq(userMintAmount.sub(amountToRepay))
              expect(await metDepositToken.balanceOf(liquidator.address)).to.eq(
                liquidatorDepositAmount.add(depositSeized)
              )
              expect(await mEth.balanceOf(liquidator.address)).to.eq(liquidatorMintAmount.sub(amountToRepay))
              expect(await mEthDebtToken.balanceOf(liquidator.address)).to.eq(liquidatorMintAmount)
            })

            it('should liquidate by repaying < needed to make position healthy (liquidateFee > 0)', async function () {
              // given
              const liquidateFee = parseEther('0.01') // 1%
              await mBOX.updateLiquidateFee(liquidateFee)
              const {_depositInUsd: collateralInUsdBefore} = await issuer.debtPositionOfUsingLatestPrices(user.address)
              const collateralBefore = await oracle.convertFromUsd(met.address, collateralInUsdBefore)

              // when
              const amountToRepayInUsd = (await getMinLiquidationAmountInUsd(mBOX, issuer, user.address, mEth)).div('2')
              const amountToRepay = amountToRepayInUsd.mul(parseEther('1')).div(ethRate)
              const tx = await mBOX
                .connect(liquidator)
                .liquidate(mEth.address, user.address, amountToRepay, metDepositToken.address)
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

              const amountToRepayInMET = await oracle.convert(mEth.address, met.address, amountToRepay)

              const expectedDepositToLiquidator = amountToRepayInMET.add(
                amountToRepayInMET.mul(liquidatorFee).div(parseEther('1'))
              )

              const currentCollateralizationRatio = collateralInUsdAfter.mul(parseEther('1')).div(debtInUsdAfter)

              expect(currentCollateralizationRatio).to.lt(mEthCR)
              expect(isHealthyAfter).to.false
              expect(collateralAfter).to.eq(collateralBefore.sub(depositSeized))
              expect(lockedCollateralInUsdAfter).gte(collateralInUsdAfter)
              expect(unlockedCollateralInUsdAfter).to.eq(0)
              expect(await metDepositToken.balanceOf(user.address)).to.eq(collateralBefore.sub(depositSeized))
              expect(await mEth.balanceOf(user.address)).to.eq(userMintAmount)
              expect(await mEthDebtToken.balanceOf(user.address)).to.eq(userMintAmount.sub(amountToRepay))
              expect(await metDepositToken.balanceOf(liquidator.address)).to.eq(
                liquidatorDepositAmount.add(expectedDepositToLiquidator)
              )
              expect(await mEth.balanceOf(liquidator.address)).to.eq(liquidatorMintAmount.sub(amountToRepay))
              expect(await mEthDebtToken.balanceOf(liquidator.address)).to.eq(liquidatorMintAmount)
            })

            it('should liquidate by repaying the exact amount to make healthy (liquidateFee == 0)', async function () {
              // given
              await mBOX.updateLiquidateFee(0)
              const {_depositInUsd: depositInUsdBefore} = await issuer.debtPositionOfUsingLatestPrices(user.address)
              const depositBefore = await oracle.convertFromUsd(met.address, depositInUsdBefore)

              // when
              const amountToRepayInUsd = await getMinLiquidationAmountInUsd(mBOX, issuer, user.address, mEth)
              const amountToRepay = amountToRepayInUsd.mul(parseEther('1')).div(ethRate)
              const tx = await mBOX
                .connect(liquidator)
                .liquidate(mEth.address, user.address, amountToRepay, metDepositToken.address)
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

              const expectedLocked = debtInUsdAfter.mul(mEthCR).div(newMetRate)

              const currentCollateralizationRatio = collateralInUsdAfter.mul(parseEther('1')).div(debtInUsdAfter)

              expect(currentCollateralizationRatio).to.eq(mEthCR)
              expect(isHealthyAfter).to.true
              expect(depositAfter).to.eq(depositBefore.sub(depositSeized))
              expect(lockedDepositAfter).to.closeTo(expectedLocked, 1)
              expect(unlockedCollateralInUsdAfter).to.eq(collateralInUsdAfter.sub(lockedDepositInUsdAfter))
              expect(await metDepositToken.balanceOf(user.address)).to.eq(depositBefore.sub(depositSeized))
              expect(await mEth.balanceOf(user.address)).to.eq(userMintAmount)
              expect(await mEthDebtToken.balanceOf(user.address)).to.eq(userMintAmount.sub(amountToRepay))
              expect(await metDepositToken.balanceOf(liquidator.address)).to.eq(
                liquidatorDepositAmount.add(depositSeized)
              )
              expect(await mEth.balanceOf(liquidator.address)).to.eq(liquidatorMintAmount.sub(amountToRepay))
              expect(await mEthDebtToken.balanceOf(liquidator.address)).to.eq(liquidatorMintAmount)
            })

            it('should liquidate by repaying the exact amount to make healthy (liquidateFee > 0)', async function () {
              // given
              const liquidateFee = parseEther('0.01') // 1%
              await mBOX.updateLiquidateFee(liquidateFee)
              const {_depositInUsd: depositBeforeInUsd} = await issuer.debtPositionOfUsingLatestPrices(user.address)
              const depositBefore = await oracle.convertFromUsd(met.address, depositBeforeInUsd)

              // when
              const amountToRepayInUsd = await getMinLiquidationAmountInUsd(mBOX, issuer, user.address, mEth)
              const amountToRepay = await oracle.convertFromUsd(mEth.address, amountToRepayInUsd)

              const tx = await mBOX
                .connect(liquidator)
                .liquidate(mEth.address, user.address, amountToRepay, metDepositToken.address)
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

              const expectedLocked = debtInUsdAfter.mul(mEthCR).div(newMetRate)

              const amountToRepayInMET = await oracle.convert(mEth.address, met.address, amountToRepay)

              const expectedDepositToLiquidator = amountToRepayInMET.add(
                amountToRepayInMET.mul(liquidatorFee).div(parseEther('1'))
              )

              const currentCollateralizationRatio = depositInUsdAfter.mul(parseEther('1')).div(debtInUsdAfter)

              expect(currentCollateralizationRatio).to.eq(mEthCR)
              expect(isHealthyAfter).to.true
              expect(lockedDepositAfter).to.closeTo(expectedLocked, 1)
              expect(depositAfter).to.eq(depositBefore.sub(depositSeized))
              expect(unlockedDepositInUsdAfter).to.eq(depositInUsdAfter.sub(lockedDepositInUsdAfter))
              expect(await metDepositToken.balanceOf(user.address)).to.eq(depositBefore.sub(depositSeized))
              expect(await mEth.balanceOf(user.address)).to.eq(userMintAmount)
              expect(await mEthDebtToken.balanceOf(user.address)).to.eq(userMintAmount.sub(amountToRepay))
              expect(await metDepositToken.balanceOf(liquidator.address)).to.closeTo(
                liquidatorDepositAmount.add(expectedDepositToLiquidator),
                1
              )
              expect(await mEth.balanceOf(liquidator.address)).to.eq(liquidatorMintAmount.sub(amountToRepay))
              expect(await mEthDebtToken.balanceOf(liquidator.address)).to.eq(liquidatorMintAmount)
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
              const amountToRepay = await mEthDebtToken.balanceOf(user.address)
              const tx = mBOX
                .connect(liquidator)
                .liquidate(mEth.address, user.address, amountToRepay, metDepositToken.address)

              // then
              await expect(tx).to.revertedWith('amount-to-repay-is-too-high')
            })

            it('should liquidate by repaying max possible amount (liquidafeFee == 0)', async function () {
              // given
              await mBOX.updateLiquidateFee(0)
              const depositBefore = await metDepositToken.balanceOf(user.address)

              // when
              const amountToRepayInUsd = await getMaxLiquidationAmountInUsd(mBOX, issuer, user.address)
              const amountToRepay = amountToRepayInUsd.mul(parseEther('1')).div(ethRate)

              const tx = await mBOX
                .connect(liquidator)
                .liquidate(mEth.address, user.address, amountToRepay, metDepositToken.address)

              // then
              const [PositionLiquidated] = (await tx.wait()).events!.filter(({event}) => event === 'PositionLiquidated')
              const [, , , , depositSeized] = PositionLiquidated.args!

              const {_isHealthy} = await issuer.debtPositionOfUsingLatestPrices(user.address)

              const remainder = 1600 // left over amount on user's deposit balance

              expect(_isHealthy).to.false
              expect(depositSeized).to.closeTo(depositBefore, remainder)
              expect(await metDepositToken.balanceOf(user.address)).to.closeTo(BigNumber.from('0'), remainder)
              expect(await mEth.balanceOf(user.address)).to.eq(userMintAmount)
              expect(await mEthDebtToken.balanceOf(user.address)).to.gt(0)
              expect(await metDepositToken.balanceOf(liquidator.address)).to.eq(
                liquidatorDepositAmount.add(depositSeized)
              )
              expect(await mEth.balanceOf(liquidator.address)).to.eq(liquidatorMintAmount.sub(amountToRepay))
              expect(await mEthDebtToken.balanceOf(liquidator.address)).to.eq(liquidatorMintAmount)
            })

            it('should liquidate by repaying max possible amount (liquidafeFee > 0)', async function () {
              // given
              const liquidateFee = parseEther('0.01') // 1%
              await mBOX.updateLiquidateFee(liquidateFee)
              const depositBefore = await metDepositToken.balanceOf(user.address)

              // when
              const amountToRepayInUsd = await getMaxLiquidationAmountInUsd(mBOX, issuer, user.address)
              const amountToRepay = amountToRepayInUsd.mul(parseEther('1')).div(ethRate)
              const tx = await mBOX
                .connect(liquidator)
                .liquidate(mEth.address, user.address, amountToRepay, metDepositToken.address)

              // then
              const [PositionLiquidated] = (await tx.wait()).events!.filter(({event}) => event === 'PositionLiquidated')
              const [, , , , depositSeized] = PositionLiquidated.args!

              const amountToRepayInMET = await oracle.convert(mEth.address, met.address, amountToRepay)

              const expectedDepositToLiquidator = amountToRepayInMET.add(
                amountToRepayInMET.mul(liquidatorFee).div(parseEther('1'))
              )

              const {_isHealthy} = await issuer.debtPositionOfUsingLatestPrices(user.address)

              const remainder = 6000 // left over amount on user's deposit balance

              expect(_isHealthy).to.false
              expect(depositSeized).to.closeTo(depositBefore, remainder)
              expect(await metDepositToken.balanceOf(user.address)).to.closeTo(BigNumber.from('0'), remainder)
              expect(await mEth.balanceOf(user.address)).to.eq(userMintAmount)
              expect(await mEthDebtToken.balanceOf(user.address)).to.gt(0)
              expect(await metDepositToken.balanceOf(liquidator.address)).to.eq(
                liquidatorDepositAmount.add(expectedDepositToLiquidator)
              )
              expect(await mEth.balanceOf(liquidator.address)).to.eq(liquidatorMintAmount.sub(amountToRepay))
              expect(await mEthDebtToken.balanceOf(liquidator.address)).to.eq(liquidatorMintAmount)
            })

            it('should liquidate by not repaying all debt (liquidaFee == 0)', async function () {
              // given
              await mBOX.updateLiquidateFee(0)
              const {_depositInUsd: collateralInUsdBefore} = await issuer.debtPositionOfUsingLatestPrices(user.address)
              const collateralBefore = await oracle.convertFromUsd(met.address, collateralInUsdBefore)

              // when
              const amountToRepayInUsd = await getMaxLiquidationAmountInUsd(mBOX, issuer, user.address)
              const minAmountToRepay = amountToRepayInUsd.mul(parseEther('1')).div(ethRate)
              const amountToRepay = minAmountToRepay.div('2')
              const tx = await mBOX
                .connect(liquidator)
                .liquidate(mEth.address, user.address, amountToRepay, metDepositToken.address)
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

              expect(currentCollateralizationRatio).to.lt(mEthCR)
              expect(isHealthyAfter).to.false
              expect(collateralAfter).to.eq(collateralBefore.sub(depositSeized))
              expect(lockedCollateralInUsdAfter).gte(collateralInUsdAfter)
              expect(unlockedCollateralInUsdAfter).to.eq(0)
              expect(await metDepositToken.balanceOf(user.address)).to.eq(collateralBefore.sub(depositSeized))
              expect(await mEth.balanceOf(user.address)).to.eq(userMintAmount)
              expect(await mEthDebtToken.balanceOf(user.address)).to.eq(userMintAmount.sub(amountToRepay))
              expect(await metDepositToken.balanceOf(liquidator.address)).to.eq(
                liquidatorDepositAmount.add(depositSeized)
              )
              expect(await mEth.balanceOf(liquidator.address)).to.eq(liquidatorMintAmount.sub(amountToRepay))
              expect(await mEthDebtToken.balanceOf(liquidator.address)).to.eq(liquidatorMintAmount)
            })

            it('should liquidate by not repaying all debt (liquidaFee > 0)', async function () {
              // given
              const liquidateFee = parseEther('0.01') // 1%
              await mBOX.updateLiquidateFee(liquidateFee)
              const {_depositInUsd: collateralInUsdBefore} = await issuer.debtPositionOfUsingLatestPrices(user.address)
              const collateralBefore = await oracle.convertFromUsd(met.address, collateralInUsdBefore)

              // when
              const amountToRepayInUsd = (await getMaxLiquidationAmountInUsd(mBOX, issuer, user.address)).div('2')
              const amountToRepay = amountToRepayInUsd.mul(parseEther('1')).div(ethRate)
              const tx = await mBOX
                .connect(liquidator)
                .liquidate(mEth.address, user.address, amountToRepay, metDepositToken.address)
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

              const amountToRepayInMET = await oracle.convert(mEth.address, met.address, amountToRepay)

              const expectedDepositToLiquidator = amountToRepayInMET.add(
                amountToRepayInMET.mul(liquidatorFee).div(parseEther('1'))
              )

              const currentCollateralizationRatio = collateralInUsdAfter.mul(parseEther('1')).div(debtInUsdAfter)

              expect(currentCollateralizationRatio).to.lt(mEthCR)
              expect(isHealthyAfter).to.false
              expect(collateralAfter).to.eq(collateralBefore.sub(depositSeized))
              expect(lockedCollateralInUsdAfter).gte(collateralInUsdAfter)
              expect(unlockedCollateralInUsdAfter).to.eq(0)
              expect(await metDepositToken.balanceOf(user.address)).to.eq(collateralBefore.sub(depositSeized))
              expect(await mEth.balanceOf(user.address)).to.eq(userMintAmount)
              expect(await mEthDebtToken.balanceOf(user.address)).to.eq(userMintAmount.sub(amountToRepay))
              expect(await metDepositToken.balanceOf(liquidator.address)).to.eq(
                liquidatorDepositAmount.add(expectedDepositToLiquidator)
              )
              expect(await mEth.balanceOf(liquidator.address)).to.eq(liquidatorMintAmount.sub(amountToRepay))
              expect(await mEthDebtToken.balanceOf(liquidator.address)).to.eq(liquidatorMintAmount)
            })
          })

          describe('when user minted both mETH and mDOGE using all collateral', function () {
            beforeEach(async function () {
              await mBOX.updateLiquidateFee(0)
              const {_maxIssuable: maxIssuableDoge} = await issuer.maxIssuableForUsingLatestPrices(
                user.address,
                mDoge.address
              )
              await mBOX.connect(user).mint(mDoge.address, maxIssuableDoge)
              const {_isHealthy, _unlockedDepositInUsd} = await issuer.debtPositionOfUsingLatestPrices(user.address)
              expect(_isHealthy).to.true
              expect(_unlockedDepositInUsd).to.eq(0)
            })

            it('should liquidate a position that have minted more than one mAsset', async function () {
              // given
              const newDogeRate = parseEther('0.5')
              await oracle.updateRate(mDoge.address, newDogeRate) // $0.4 -> $0.5
              const {_isHealthy: isHealthyBefore} = await issuer.debtPositionOfUsingLatestPrices(user.address)
              expect(isHealthyBefore).to.false

              // when
              const minRepayAmountInUsd = await getMinLiquidationAmountInUsd(mBOX, issuer, user.address, mDoge)
              const minRepayAmountInDoge = minRepayAmountInUsd.div(newDogeRate).mul(parseEther('1'))
              await mBOX.connect(liquidator).mint(mDoge.address, minRepayAmountInDoge)
              await mBOX
                .connect(liquidator)
                .liquidate(mDoge.address, user.address, minRepayAmountInDoge, metDepositToken.address)

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

  describe('updateTreasury', function () {
    it('should revert if using the same address', async function () {
      // given
      expect(await mBOX.treasury()).to.eq(treasury.address)

      // when
      const tx = mBOX.updateTreasury(treasury.address)

      // then
      await expect(tx).to.revertedWith('new-treasury-is-same-as-current')
    })

    it('should revert if caller is not governor', async function () {
      // when
      const tx = mBOX.connect(user.address).updateTreasury(treasury.address)

      // then
      await expect(tx).to.revertedWith('not-the-governor')
    })

    it('should revert if address is zero', async function () {
      // when
      const tx = mBOX.updateTreasury(ethers.constants.AddressZero)

      // then
      await expect(tx).to.revertedWith('treasury-address-is-null')
    })

    it('should migrate funds to the new treasury', async function () {
      // given
      const balance = parseEther('100')
      await met.mint(treasury.address, balance)

      const treasuryFactory = new Treasury__factory(deployer)
      const newTreasury = await treasuryFactory.deploy()
      await newTreasury.deployed()
      await newTreasury.initialize(mBOX.address)

      // when
      const tx = () => mBOX.updateTreasury(newTreasury.address)

      // then
      await expect(tx).changeTokenBalances(met, [treasury, newTreasury], [balance.mul('-1'), balance])
    })
  })

  describe('updateMaxLiquidable', function () {
    it('should revert if caller is not governor', async function () {
      // when
      const tx = mBOX.connect(user.address).updateMaxLiquidable(parseEther('1'))

      // then
      await expect(tx).to.revertedWith('not-the-governor')
    })

    it('should revert if using the current value', async function () {
      // when
      const maxLiquidable = await mBOX.maxLiquidable()
      const tx = mBOX.updateMaxLiquidable(maxLiquidable)

      // then
      await expect(tx).to.revertedWith('new-value-is-same-as-current')
    })

    it('should revert if max liquidable > 100%', async function () {
      // when
      const maxLiquidable = parseEther('1').add('1')
      const tx = mBOX.updateMaxLiquidable(maxLiquidable)

      // then
      await expect(tx).to.revertedWith('max-liquidable-gt-100%')
    })

    it('should update max liquidable param', async function () {
      // given
      const currentMaxLiquidable = await mBOX.maxLiquidable()
      const newMaxLiquidable = currentMaxLiquidable.div('2')

      // when
      const tx = mBOX.updateMaxLiquidable(newMaxLiquidable)

      // then
      await expect(tx).to.emit(mBOX, 'MaxLiquidableUpdated').withArgs(currentMaxLiquidable, newMaxLiquidable)
    })
  })
})
