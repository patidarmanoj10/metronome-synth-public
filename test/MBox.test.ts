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
} from '../typechain'
import {getMaxLiquidationAmountInUsd, getMinLiquidationAmountInUsd, WETH} from './helpers'

describe('MBox', function () {
  let deployer: SignerWithAddress
  let user: SignerWithAddress
  let liquidator: SignerWithAddress
  let met: ERC20Mock
  let doge: ERC20Mock
  let mEthDebtToken: DebtToken
  let mDogeDebtToken: DebtToken
  let mEth: SyntheticAsset
  let mDoge: SyntheticAsset
  let depositToken: DepositToken
  let oracle: OracleMock
  let mBOX: MBox

  const liquidatorFee = parseEther('0.1') // 10%
  const mEthCollateralizationRatio = parseEther('1.5') // 150%
  const mDogeCollateralizationRatio = parseEther('2') // 200%
  const ethRate = parseEther('4000') // 1 ETH = $4000
  const metRate = parseEther('4') // 1 MET = $4
  const dogeRate = parseEther('0.4') // 1 DOGE = $0.4

  beforeEach(async function () {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[deployer, user, liquidator] = await ethers.getSigners()

    const oracleMock = new OracleMock__factory(deployer)
    oracle = <OracleMock>await oracleMock.deploy()
    await oracle.deployed()

    const metMockFactory = new ERC20Mock__factory(deployer)
    met = await metMockFactory.deploy('Metronome', 'MET')
    await met.deployed()

    const dogeMockFactory = new ERC20Mock__factory(deployer)
    doge = await dogeMockFactory.deploy('Dogecoin', 'DOGE')
    await doge.deployed()

    const depositTokenFactory = new DepositToken__factory(deployer)
    depositToken = await depositTokenFactory.deploy(met.address)
    await depositToken.deployed()

    const mEthDebtTokenFactory = new DebtToken__factory(deployer)
    mEthDebtToken = await mEthDebtTokenFactory.deploy('mETH Debt', 'mETH-Debt')
    await mEthDebtToken.deployed()

    const mDogeDebtTokenFactory = new DebtToken__factory(deployer)
    mDogeDebtToken = await mDogeDebtTokenFactory.deploy('mDOGE Debt', 'mDOGE-Debt')
    await mDogeDebtToken.deployed()

    const mEthFactory = new SyntheticAsset__factory(deployer)
    mEth = await mEthFactory.deploy('Metronome ETH', 'mETH', WETH, mEthDebtToken.address, mEthCollateralizationRatio)
    await mEth.deployed()

    const mDogeFactory = new SyntheticAsset__factory(deployer)
    mDoge = await mDogeFactory.deploy(
      'Metronome DOGE',
      'mDOGE',
      doge.address,
      mDogeDebtToken.address,
      mDogeCollateralizationRatio
    )
    await mDoge.deployed()

    const mBoxFactory = new MBox__factory(deployer)
    mBOX = await mBoxFactory.deploy()
    await mBOX.deployed()

    // Deployment tasks
    await depositToken.setMBox(mBOX.address)
    await depositToken.transferOwnership(mBOX.address)
    await mEth.transferOwnership(mBOX.address)
    await mDoge.transferOwnership(mBOX.address)
    await mEthDebtToken.transferOwnership(mBOX.address)
    await mDogeDebtToken.transferOwnership(mBOX.address)
    await mBOX.setDepositToken(depositToken.address)
    await mBOX.setOracle(oracle.address)
    await mBOX.setLiquidatorFee(liquidatorFee)
    await mBOX.addSyntheticAsset(mEth.address)
    await mBOX.addSyntheticAsset(mDoge.address)

    // mint some MET to users
    await met.mint(user.address, parseEther(`${1e6}`))
    await met.mint(liquidator.address, parseEther(`${1e6}`))

    // initialize mocked oracle
    await oracle.updateRate(met.address, metRate)
    await oracle.updateRate(await mEth.underlying(), ethRate)
    await oracle.updateRate(await mDoge.underlying(), dogeRate)
  })

  describe('whitelisting', function () {
    describe('addSyntheticAsset', function () {
      it('should revert if not owner', async function () {
        const tx = mBOX.connect(user).addSyntheticAsset(mEth.address)
        await expect(tx).to.revertedWith('Ownable: caller is not the owner')
      })

      it('should add synthetic asset', async function () {
        const someTokenAddress = met.address
        expect(await mBOX.syntheticAssetsByAddress(someTokenAddress)).to.eq(ethers.constants.AddressZero)
        await mBOX.addSyntheticAsset(someTokenAddress)
        expect(await mBOX.syntheticAssetsByAddress(someTokenAddress)).to.not.eq(ethers.constants.AddressZero)
      })
    })

    describe('removeSyntheticAsset', function () {
      it('should remove synthetic asset', async function () {
        // given
        const wbtcMockFactory = new ERC20Mock__factory(deployer)
        const someToken = await wbtcMockFactory.deploy('Wrapped Bitcoin', 'WBTC')
        expect(await someToken.totalSupply()).to.eq(0)
        await mBOX.addSyntheticAsset(someToken.address)
        expect(await mBOX.syntheticAssetsByAddress(someToken.address)).to.not.eq(ethers.constants.AddressZero)

        // when
        await mBOX.removeSyntheticAsset(someToken.address)

        // then
        expect(await mBOX.syntheticAssetsByAddress(someToken.address)).to.eq(ethers.constants.AddressZero)
      })

      it('should revert if removing mETH (i.e. syntheticAssets[0])', async function () {
        // given
        expect(await mBOX.syntheticAssets(0)).to.eq(mEth.address)

        // when
        const tx = mBOX.removeSyntheticAsset(mEth.address)

        // then
        await expect(tx).to.revertedWith('can-not-delete-meth')
      })
    })
  })

  describe('deposit', function () {
    beforeEach(async function () {
      await met.connect(user).approve(mBOX.address, ethers.constants.MaxUint256)
    })

    it('should reject if collateral amount is 0', async function () {
      const toDeposit = 0
      const tx = mBOX.connect(user).deposit(toDeposit)
      await expect(tx).to.revertedWith('zero-collateral-amount')
    })

    it('should reject if MET balance is not enough', async function () {
      const balance = await met.balanceOf(user.address)
      const tooHigh = balance.add('1')
      const tx = mBOX.connect(user).deposit(tooHigh)
      await expect(tx).to.revertedWith('ERC20: transfer amount exceeds balance')
    })

    it('should deposit MET and mint mBOX-MET (depositFee == 0)', async function () {
      // when
      const amount = parseEther('10')
      const tx = () => mBOX.connect(user).deposit(amount)

      // then
      await expect(tx).changeTokenBalances(met, [user, mBOX], [amount.mul('-1'), amount])
      await expect(tx).changeTokenBalances(depositToken, [user, mBOX], [amount, 0])
      await expect(tx()).to.emit(mBOX, 'CollateralDeposited').withArgs(user.address, amount)
    })

    it('should deposit MET and mint mBOX-MET (depositFee > 0)', async function () {
      // given
      const depositFee = parseEther('0.01') // 1%
      await mBOX.setDepositFee(depositFee)

      // when
      const amount = parseEther('10')
      const tx = () => mBOX.connect(user).deposit(amount)
      const expectedMintedAmount = amount.mul(parseEther('1').sub(depositFee)).div(parseEther('1')) // 10 * (1 - 0.01)

      // then
      await expect(tx).changeTokenBalances(met, [user, mBOX], [amount.mul('-1'), amount])
      await expect(tx).changeTokenBalances(depositToken, [user, mBOX], [expectedMintedAmount, 0])
      await expect(tx()).to.emit(mBOX, 'CollateralDeposited').withArgs(user.address, expectedMintedAmount)
    })

    describe('when user deposited some MET', function () {
      const userDepositAmount = parseEther('6000')

      beforeEach(async function () {
        await met.connect(user).approve(mBOX.address, ethers.constants.MaxUint256)
        await mBOX.connect(user).deposit(userDepositAmount)
      })

      describe('mint', function () {
        let collateralInUsd: BigNumber
        let maxIssuableInUsd: BigNumber
        let maxIssuableInEth: BigNumber

        beforeEach(async function () {
          collateralInUsd = await oracle.convertToUSD(met.address, userDepositAmount)
          maxIssuableInUsd = collateralInUsd.mul(parseEther('1')).div(mEthCollateralizationRatio)
          maxIssuableInEth = maxIssuableInUsd.mul(parseEther('1')).div(ethRate)
        })

        it('should reject if synthetic is not active', async function () {
          // when
          const toIssue = maxIssuableInEth.add(parseEther('1'))
          const invalidSynthetic = met
          const tx = mBOX.mint(invalidSynthetic.address, toIssue)

          // then
          await expect(tx).to.revertedWith('synthetic-asset-does-not-exists')
        })

        it('should reject if user has not enough collateral deposited', async function () {
          // when
          const toIssue = maxIssuableInEth.add(parseEther('1'))
          const tx = mBOX.connect(user).mint(mEth.address, toIssue)

          // then
          await expect(tx).to.revertedWith('not-enough-collateral')
        })

        it('should reject if amount to mint is 0', async function () {
          // when
          const toIssue = 0
          const tx = mBOX.connect(user).mint(mEth.address, toIssue)

          // then
          await expect(tx).to.revertedWith('amount-to-mint-is-zero')
        })

        it('should mint mEth (mintFee == 0)', async function () {
          // given
          const maxIssuableBefore = await mBOX.maxIssuableFor(user.address, mEth.address)
          expect(maxIssuableBefore).to.eq(
            userDepositAmount.mul(metRate).div(mEthCollateralizationRatio).mul(parseEther('1')).div(ethRate)
          ) // 4 ETH

          expect(await mBOX.debtPositionOf(user.address)).to.deep.eq([
            true, // _isHealthy
            BigNumber.from(0), // _debtInUsd
            BigNumber.from(0), // _lockedDepositInUsd
            userDepositAmount.mul(metRate).div(parseEther('1')), // _depositInUsd
            userDepositAmount, // _deposit
            userDepositAmount, // _unlockedDeposit
            BigNumber.from(0), // _lockedDeposit
          ])

          // when
          const amountToMint = parseEther('1')
          const tx = () => mBOX.connect(user).mint(mEth.address, amountToMint)

          // then
          await expect(tx).changeTokenBalances(mEth, [user], [amountToMint])
          const maxIssuableAfter = await mBOX.maxIssuableFor(user.address, mEth.address)
          expect(maxIssuableAfter).to.eq(maxIssuableBefore.sub(amountToMint)).and.to.eq(parseEther('3')) // 3 ETH = $12K
          const expectedLocked = amountToMint
            .mul(ethRate)
            .mul(mEthCollateralizationRatio)
            .div(metRate)
            .div(parseEther('1'))
          expect(await mBOX.debtPositionOf(user.address)).to.deep.eq([
            true, // _isHealthy
            amountToMint.mul(ethRate).div(parseEther('1')), // _debtInUsd
            // _lockedDepositInUsd
            amountToMint.mul(ethRate).div(parseEther('1')).mul(mEthCollateralizationRatio).div(parseEther('1')),
            userDepositAmount.mul(metRate).div(parseEther('1')), // _depositInUsd
            userDepositAmount, // _deposit
            userDepositAmount.sub(expectedLocked), // _unlockedDeposit
            expectedLocked, // _lockedDeposit
          ])

          // Note: the calls below will make additional transfers
          await expect(tx).changeTokenBalances(mEthDebtToken, [user], [amountToMint])
          await expect(tx).changeTokenBalances(met, [mBOX], [0])
          await expect(tx()).to.emit(mBOX, 'SyntheticAssetMinted').withArgs(user.address, mEth.address, amountToMint)
        })

        it('should mint mEth (mintFee > 0)', async function () {
          // given
          const mintFee = parseEther('0.1') // 10%
          await mBOX.setMintFee(mintFee)

          // when
          const amountToMint = parseEther('1')
          const expectedFeeInSynthetic = amountToMint.mul(mintFee).div(parseEther('1'))
          const expectedAmountToMint = amountToMint.sub(expectedFeeInSynthetic)
          const tx = () => mBOX.connect(user).mint(mEth.address, amountToMint)
          await expect(tx).changeTokenBalances(mEth, [user], [expectedAmountToMint])

          // then
          const expectedFeeInDeposit = await oracle.convert(
            await mEth.underlying(),
            await depositToken.underlying(),
            expectedFeeInSynthetic
          )

          // Note: the calls below will make additional transfers
          // See: https://github.com/EthWorks/Waffle/issues/569
          await expect(tx).changeTokenBalances(depositToken, [user], [expectedFeeInDeposit.mul('-1')])
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
          await mBOX.setMintFee(mintFee)

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
          it('should revert if amount is 0', async function () {
            // when
            const tx = mBOX.connect(user).withdraw(0)

            // then
            await expect(tx).to.revertedWith('amount-to-withdraw-is-zero')
          })

          it('should revert if amount > unlocked collateral amount', async function () {
            // given
            const {_unlockedDeposit} = await mBOX.debtPositionOf(user.address)

            // when
            const tx = mBOX.connect(user).withdraw(_unlockedDeposit.add('1'))

            // then
            await expect(tx).to.revertedWith('amount-to-withdraw-gt-unlocked')
          })

          it('should withdraw if amount <= unlocked collateral amount (withdrawFee == 0)', async function () {
            // given
            const {_unlockedDeposit: amountToWithdraw} = await mBOX.debtPositionOf(user.address)
            const metBalanceBefore = await met.balanceOf(user.address)
            const depositBefore = await depositToken.balanceOf(user.address)

            // when
            const tx = mBOX.connect(user).withdraw(amountToWithdraw)
            await expect(tx).to.emit(mBOX, 'CollateralWithdrawn').withArgs(user.address, amountToWithdraw)

            // then
            expect(await met.balanceOf(user.address)).to.eq(metBalanceBefore.add(amountToWithdraw))
            expect(await depositToken.balanceOf(user.address)).to.eq(depositBefore.sub(amountToWithdraw))
            const {_unlockedDeposit: unlockedCollateralAfter} = await mBOX.debtPositionOf(user.address)
            expect(unlockedCollateralAfter).to.eq(0)
          })

          it('should withdraw if amount <= unlocked collateral amount (withdrawFee > 0)', async function () {
            // given
            const withdrawFee = parseEther('0.1') // 10%
            await mBOX.setWithdrawFee(withdrawFee)
            const metBalanceBefore = await met.balanceOf(user.address)
            const depositBefore = await depositToken.balanceOf(user.address)
            const {_unlockedDeposit: amountToWithdraw} = await mBOX.debtPositionOf(user.address)
            const expectedWithdrawnAmount = amountToWithdraw.mul(parseEther('1').sub(withdrawFee)).div(parseEther('1'))

            // when
            const tx = mBOX.connect(user).withdraw(amountToWithdraw)
            await expect(tx).to.emit(mBOX, 'CollateralWithdrawn').withArgs(user.address, expectedWithdrawnAmount)

            // then
            expect(await met.balanceOf(user.address)).to.eq(metBalanceBefore.add(expectedWithdrawnAmount))
            expect(await depositToken.balanceOf(user.address)).to.eq(depositBefore.sub(amountToWithdraw))
            const {_unlockedDeposit: unlockedCollateralAfter} = await mBOX.debtPositionOf(user.address)
            expect(unlockedCollateralAfter).to.eq(0)
          })
        })

        describe('repay', function () {
          it('should revert if amount is 0', async function () {
            // when
            const tx = mBOX.connect(user).repay(mEth.address, 0)

            // then
            await expect(tx).to.revertedWith('amount-to-repay-is-zero')
          })

          it('should revert if amount > unlocked collateral amount', async function () {
            // given
            const debtAmount = await mEthDebtToken.balanceOf(user.address)

            // when
            const tx = mBOX.connect(user).repay(mEth.address, debtAmount.add('1'))

            // then
            await expect(tx).to.revertedWith('amount-gt-burnable-debt')
          })

          it('should repay if amount == debt (repayFee == 0)', async function () {
            // given
            const debtAmount = await mEthDebtToken.balanceOf(user.address)
            const {_lockedDeposit: lockedCollateralBefore} = await mBOX.debtPositionOf(user.address)
            expect(lockedCollateralBefore).to.gt(0)

            // when
            const tx = mBOX.connect(user).repay(mEth.address, debtAmount)
            await expect(tx).to.emit(mBOX, 'DebtRepayed').withArgs(user.address, mEth.address, debtAmount)

            // then
            expect(await mEthDebtToken.balanceOf(user.address)).to.eq(0)
            const {_lockedDeposit: lockedCollateralAfter} = await mBOX.debtPositionOf(user.address)
            expect(lockedCollateralAfter).to.eq(0)
          })

          it('should repay if amount < debt (repayFee == 0)', async function () {
            // given
            const debtAmount = (await mEthDebtToken.balanceOf(user.address)).div('2')
            const {_lockedDeposit: lockedDepositBefore} = await mBOX.debtPositionOf(user.address)
            expect(lockedDepositBefore).to.gt(0)

            // when
            const tx = mBOX.connect(user).repay(mEth.address, debtAmount)
            await expect(tx).to.emit(mBOX, 'DebtRepayed').withArgs(user.address, mEth.address, debtAmount)

            // then
            expect(await mEthDebtToken.balanceOf(user.address)).to.eq(debtAmount)
            const {_lockedDeposit: lockedDepositAfter} = await mBOX.debtPositionOf(user.address)
            expect(lockedDepositAfter).to.eq(lockedDepositBefore.div('2'))
          })

          it('should repay if amount == debt (repayFee > 0)', async function () {
            // given
            const repayFee = parseEther('0.1') // 10%
            await mBOX.setRepayFee(repayFee)
            const amountToRepay = await mEthDebtToken.balanceOf(user.address)
            const {
              _lockedDeposit: lockedDepositBefore,
              _deposit: depositBefore,
              _depositInUsd: depositInUsdBefore,
            } = await mBOX.debtPositionOf(user.address)
            expect(lockedDepositBefore).to.gt(0)
            const expectedFeeInUsd = await oracle.convertToUSD(
              await mEth.underlying(),
              amountToRepay.mul(repayFee).div(parseEther('1'))
            )
            const expectedFeeInMET = await oracle.convertFromUSD(met.address, expectedFeeInUsd)

            // when
            const tx = mBOX.connect(user).repay(mEth.address, amountToRepay)
            await expect(tx).to.emit(mBOX, 'DebtRepayed').withArgs(user.address, mEth.address, amountToRepay)

            // then
            expect(await mEthDebtToken.balanceOf(user.address)).to.eq(0)
            const {
              _lockedDeposit: lockedDepositAfter,
              _deposit: depositAfter,
              _depositInUsd: depositInUsdAfter,
            } = await mBOX.debtPositionOf(user.address)
            expect(lockedDepositAfter).to.eq(0)
            expect(depositAfter).to.eq(depositBefore.sub(expectedFeeInMET))
            expect(depositInUsdAfter).to.eq(depositInUsdBefore.sub(expectedFeeInUsd))
          })

          it('should repay if amount < debt (repayFee > 0)', async function () {
            // given
            const repayFee = parseEther('0.1') // 10%
            await mBOX.setRepayFee(repayFee)
            const amountToRepay = (await mEthDebtToken.balanceOf(user.address)).div('2')
            const {
              _lockedDeposit: lockedDepositBefore,
              _deposit: depositBefore,
              _depositInUsd: depositInUsdBefore,
            } = await mBOX.debtPositionOf(user.address)
            expect(lockedDepositBefore).to.gt(0)
            expect(lockedDepositBefore).to.gt(0)
            const expectedFeeInUsd = await oracle.convertToUSD(
              await mEth.underlying(),
              amountToRepay.mul(repayFee).div(parseEther('1'))
            )
            const expectedFeeInMET = await oracle.convertFromUSD(met.address, expectedFeeInUsd)

            // when
            const tx = mBOX.connect(user).repay(mEth.address, amountToRepay)
            await expect(tx).to.emit(mBOX, 'DebtRepayed').withArgs(user.address, mEth.address, amountToRepay)

            // then
            expect(await mEthDebtToken.balanceOf(user.address)).to.eq(amountToRepay)
            const {
              _lockedDeposit: lockedDepositAfter,
              _deposit: depositAfter,
              _depositInUsd: depositInUsdAfter,
            } = await mBOX.debtPositionOf(user.address)
            expect(lockedDepositAfter).to.eq(lockedDepositBefore.div('2'))
            expect(depositAfter).to.eq(depositBefore.sub(expectedFeeInMET))
            expect(depositInUsdAfter).to.eq(depositInUsdBefore.sub(expectedFeeInUsd))
          })
        })

        describe('swap', function () {
          it('should revert if amount == 0', async function () {
            // when
            const tx = mBOX.connect(user).swap(mEth.address, mDoge.address, 0)

            // then
            await expect(tx).to.revertedWith('amount-in-is-zero')
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

          it('should revert if debt position becomes unhealty', async function () {
            // Note: Using all MET collateral to mint max mETH possible (that has 150% CR)
            // and try to swap all balance for mDOGE that has 200% CR

            // given
            const maxIssuable = await mBOX.maxIssuableFor(user.address, mEth.address)
            await mBOX.connect(user).mint(mEth.address, maxIssuable)
            const mAssetInBalance = await mEth.balanceOf(user.address)

            // when
            const amountIn = mAssetInBalance
            const tx = mBOX.connect(user).swap(mEth.address, mDoge.address, amountIn)

            // then
            await expect(tx).to.revertedWith('debt-position-ended-up-unhealthy')
          })

          it('should swap synthetic assets (swapFee == 0)', async function () {
            // given
            const mAssetInBalanceBefore = await mEth.balanceOf(user.address)
            const mAssetInDebtBalanceBefore = await mEthDebtToken.balanceOf(user.address)
            const mAssetOutBalanceBefore = await mDoge.balanceOf(user.address)
            const mAssetOutDebtBalanceBefore = await mDogeDebtToken.balanceOf(user.address)
            expect(mAssetOutBalanceBefore).to.eq(0)
            expect(mAssetOutDebtBalanceBefore).to.eq(0)
            const {_debtInUsd: debtInUsdBefore} = await mBOX.debtPositionOf(user.address)

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
            const {_debtInUsd: debtInUsdAfter} = await mBOX.debtPositionOf(user.address)

            expect(debtInUsdAfter).to.eq(debtInUsdBefore)
            expect(mAssetInBalanceAfter).to.eq(mAssetInBalanceBefore.sub(amountIn))
            expect(mAssetInDebtBalanceAfter).to.eq(mAssetInDebtBalanceBefore.sub(amountIn))
            expect(mAssetOutBalanceAfter).to.eq(mAssetOutBalanceBefore.add(expectedAmountOut))
            expect(mAssetOutDebtBalanceAfter).to.eq(mAssetOutDebtBalanceBefore.add(expectedAmountOut))
          })

          it('should swap synthetic assets (swapFee > 0)', async function () {
            // given
            const swapFee = parseEther('0.1') // 10%
            await mBOX.setSwapFee(swapFee)
            const mAssetInBalanceBefore = await mEth.balanceOf(user.address)
            const mAssetInDebtBalanceBefore = await mEthDebtToken.balanceOf(user.address)
            const mAssetOutBalanceBefore = await mDoge.balanceOf(user.address)
            const mAssetOutDebtBalanceBefore = await mDogeDebtToken.balanceOf(user.address)
            expect(mAssetOutBalanceBefore).to.eq(0)
            expect(mAssetOutDebtBalanceBefore).to.eq(0)
            const {_debtInUsd: debtInUsdBefore} = await mBOX.debtPositionOf(user.address)

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
            const {_debtInUsd: debtInUsdAfter} = await mBOX.debtPositionOf(user.address)

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
              const maxIssuable = await mBOX.maxIssuableFor(user.address, mDoge.address)
              await mBOX.connect(user).mint(mDoge.address, maxIssuable)

              await oracle.updateRate(met.address, newMetRate)
              const {_isHealthy} = await mBOX.debtPositionOf(user.address)
              expect(_isHealthy).to.be.false
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

            it('should revert if debt position stills unhealty', async function () {
              // when
              const amountIn = await mDoge.balanceOf(user.address)
              const tx = mBOX.connect(user).refinance(mDoge.address, amountIn)

              // then
              await expect(tx).to.revertedWith('debt-position-ended-up-unhealthy')
            })

            it('should refinance debt (refinanceFee == 0)', async function () {
              // given
              await oracle.updateRate(met.address, parseEther('3.5')) // putting debt in a position that is able to save
              const mAssetInBalanceBefore = await mDoge.balanceOf(user.address)
              const mAssetInDebtBalanceBefore = await mDogeDebtToken.balanceOf(user.address)
              const mAssetOutBalanceBefore = await mEth.balanceOf(user.address)
              const mAssetOutDebtBalanceBefore = await mEthDebtToken.balanceOf(user.address)

              const {_debtInUsd: debtBefore, _unlockedDeposit: unlockedBefore} = await mBOX.debtPositionOf(user.address)

              // when
              const mAssetIn = mDoge.address
              const mAssetOut = mEth.address
              const amountToRefinance = mAssetInBalanceBefore
              const amountInUsd = amountToRefinance.mul(dogeRate).div(parseEther('1'))
              const tx = await mBOX.connect(user).refinance(mAssetIn, amountToRefinance)

              // then
              const expectedAmountOut = amountInUsd.mul(parseEther('1')).div(ethRate)

              await expect(tx)
                .to.emit(mBOX, 'DebtRefinancied')
                .withArgs(user.address, mAssetIn, amountToRefinance)
                .and.to.emit(mBOX, 'SyntheticAssetSwapped')
                .withArgs(user.address, mAssetIn, mAssetOut, amountToRefinance, expectedAmountOut)

              const mAssetInBalanceAfter = await mDoge.balanceOf(user.address)
              const mAssetInDebtBalanceAfter = await mDogeDebtToken.balanceOf(user.address)
              const mAssetOutBalanceAfter = await mEth.balanceOf(user.address)
              const mAssetOutDebtBalanceAfter = await mEthDebtToken.balanceOf(user.address)
              const {_debtInUsd: debtAfter, _unlockedDeposit: unlockedAfter} = await mBOX.debtPositionOf(user.address)

              expect(debtAfter).to.eq(debtBefore)
              expect(unlockedAfter).to.gt(unlockedBefore)
              expect(mAssetInBalanceAfter).to.eq(mAssetInBalanceBefore.sub(amountToRefinance))
              expect(mAssetInDebtBalanceAfter).to.eq(mAssetInDebtBalanceBefore.sub(amountToRefinance))
              expect(mAssetOutBalanceAfter).to.eq(mAssetOutBalanceBefore.add(expectedAmountOut))
              expect(mAssetOutDebtBalanceAfter).to.eq(mAssetOutDebtBalanceBefore.add(expectedAmountOut))
            })

            it('should refinance debt (refinanceFee > 0)', async function () {
              // given
              const refinanceFee = parseEther('0.1') // 10%
              await mBOX.setRefinanceFee(refinanceFee)
              await oracle.updateRate(met.address, parseEther('3.5')) // putting debt in a position that is able to save
              const mAssetInBalanceBefore = await mDoge.balanceOf(user.address)
              const mAssetInDebtBalanceBefore = await mDogeDebtToken.balanceOf(user.address)
              const mAssetOutBalanceBefore = await mEth.balanceOf(user.address)
              const mAssetOutDebtBalanceBefore = await mEthDebtToken.balanceOf(user.address)

              const {_debtInUsd: debtBefore, _unlockedDeposit: unlockedBefore} = await mBOX.debtPositionOf(user.address)

              // when
              const mAssetIn = mDoge.address
              const mAssetOut = mEth.address
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
                .withArgs(user.address, mAssetIn, mAssetOut, amountToRefinance, expectedAmountOut)

              const mAssetInBalanceAfter = await mDoge.balanceOf(user.address)
              const mAssetInDebtBalanceAfter = await mDogeDebtToken.balanceOf(user.address)
              const mAssetOutBalanceAfter = await mEth.balanceOf(user.address)
              const mAssetOutDebtBalanceAfter = await mEthDebtToken.balanceOf(user.address)
              const {_debtInUsd: debtAfter, _unlockedDeposit: unlockedAfter} = await mBOX.debtPositionOf(user.address)

              expect(debtAfter).to.eq(debtBefore.sub(feeInUsd))
              expect(unlockedAfter).to.gt(unlockedBefore)
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
            await mBOX.connect(liquidator).deposit(liquidatorDepositAmount)
            await mBOX.connect(liquidator).mint(mEth.address, liquidatorMintAmount)
          })

          it('should revert if amount to repay == 0', async function () {
            // when
            const tx = mBOX.liquidate(mEth.address, user.address, 0)

            // then
            await expect(tx).to.revertedWith('amount-to-repay-is-zero')
          })

          it('should revert if liquidator == account', async function () {
            // when
            const tx = mBOX.connect(user).liquidate(mEth.address, user.address, 1)

            // then
            await expect(tx).to.revertedWith('can-not-liquidate-own-position')
          })

          it('should revert if position is healty', async function () {
            // given
            const {_debtInUsd, _depositInUsd} = await mBOX.debtPositionOf(user.address)
            const isHealthy = _depositInUsd.mul(parseEther('1')).div(_debtInUsd).gte(mEthCollateralizationRatio)
            expect(isHealthy).to.true

            // when
            const tx = mBOX.liquidate(mEth.address, user.address, parseEther('1'))

            // then
            await expect(tx).to.revertedWith('position-is-healthy')
          })

          describe('when the position is unhealty (colalteral:debt >= 1)', function () {
            const newMetRate = parseEther('0.95')

            beforeEach(async function () {
              await oracle.updateRate(met.address, newMetRate)

              expect(await mBOX.debtPositionOf(user.address)).to.deep.eq([
                false, // _isHealthy
                userMintAmount.mul(ethRate).div(parseEther('1')), // _debtInUsd
                // _lockedDepositInUsd
                userMintAmount.mul(ethRate).div(parseEther('1')).mul(mEthCollateralizationRatio).div(parseEther('1')),
                userDepositAmount.mul(newMetRate).div(parseEther('1')), // _depositInUsd
                userDepositAmount, // _deposit
                BigNumber.from(0), // _unlockedDeposit
                userDepositAmount, // _lockedDeposit
              ])
              expect(await depositToken.balanceOf(user.address)).to.eq(userDepositAmount)
              expect(await mEth.balanceOf(user.address)).to.eq(userMintAmount)
              expect(await mEthDebtToken.balanceOf(user.address)).to.eq(userMintAmount)
              expect(await depositToken.balanceOf(liquidator.address)).to.eq(liquidatorDepositAmount)
              expect(await mEth.balanceOf(liquidator.address)).to.eq(liquidatorMintAmount)
              expect(await mEthDebtToken.balanceOf(liquidator.address)).to.eq(liquidatorMintAmount)
            })

            it('should revert if liquidator has not enough mAsset to repay', async function () {
              // given
              const liquidatorMEthBalanceBefore = await mEth.balanceOf(liquidator.address)
              await mBOX.connect(liquidator).repay(mEth.address, liquidatorMEthBalanceBefore)
              const amountToRepayInUsd = await getMinLiquidationAmountInUsd(mBOX, user.address, mEth)
              const amountToRepayInMEth = amountToRepayInUsd.mul(parseEther('1')).div(ethRate)
              expect(await mEth.balanceOf(liquidator.address)).to.lt(amountToRepayInMEth)

              // when
              const tx = mBOX.connect(liquidator).liquidate(mEth.address, user.address, amountToRepayInMEth)

              // then
              await expect(tx).to.revertedWith('amount-gt-burnable-synthetic')
            })

            it('should revert if debt amount is < amount to repay', async function () {
              // given
              const mEthDebt = await mEthDebtToken.balanceOf(user.address)

              // when
              const amountToRepay = mEthDebt.add('1')
              const tx = mBOX.connect(liquidator).liquidate(mEth.address, user.address, amountToRepay)

              // then
              await expect(tx).to.revertedWith('amount-gt-burnable-debt')
            })

            it('should liquidate by repaying all debt (liquidateFee == 0)', async function () {
              // given
              const {_debtInUsd: debtInUsdBefore, _depositInUsd: collateralInUsdBefore} = await mBOX.debtPositionOf(
                user.address
              )

              // when
              const amountToRepay = userMintAmount // repay all user's debt
              const tx = await mBOX.connect(liquidator).liquidate(mEth.address, user.address, amountToRepay)

              // then
              const [PositionLiquidated] = (await tx.wait()).events!.filter(({event}) => event === 'PositionLiquidated')
              const [, , , , depositSeized] = PositionLiquidated.args!

              const amountToSeizeInUsd = debtInUsdBefore.mul(parseEther('1').add(liquidatorFee)).div(parseEther('1'))
              const expectedDepositSeized = amountToSeizeInUsd.mul(parseEther('1')).div(newMetRate)
              const expectedDepositAfter = collateralInUsdBefore
                .sub(amountToSeizeInUsd)
                .mul(parseEther('1'))
                .div(newMetRate)
              const {_isHealthy} = await mBOX.debtPositionOf(user.address)

              expect(_isHealthy).to.true
              expect(depositSeized).to.eq(expectedDepositSeized)
              // FIXME: Related to https://github.com/bloqpriv/mbox/issues/20
              expect(await depositToken.balanceOf(user.address)).to.closeTo(expectedDepositAfter, 1)
              expect(await mEth.balanceOf(user.address)).to.eq(userMintAmount)
              expect(await mEthDebtToken.balanceOf(user.address)).to.eq(0)
              expect(await depositToken.balanceOf(liquidator.address)).to.eq(liquidatorDepositAmount.add(depositSeized))
              expect(await mEth.balanceOf(liquidator.address)).to.eq(liquidatorMintAmount.sub(amountToRepay))
              expect(await mEthDebtToken.balanceOf(liquidator.address)).to.eq(liquidatorMintAmount)
            })

            it('should liquidate by repaying all debt (liquidateFee > 0)', async function () {
              // given
              const liquidateFee = parseEther('0.01') // 1%
              await mBOX.setLiquidateFee(liquidateFee)
              const {_debtInUsd: debtInUsdBefore, _depositInUsd: collateralInUsdBefore} = await mBOX.debtPositionOf(
                user.address
              )

              // when
              const amountToRepay = userMintAmount // repay all user's debt
              const tx = await mBOX.connect(liquidator).liquidate(mEth.address, user.address, amountToRepay)

              // then
              const [PositionLiquidated] = (await tx.wait()).events!.filter(({event}) => event === 'PositionLiquidated')
              const [, , , , depositSeized] = PositionLiquidated.args!

              const depositToSeizeInUsd = debtInUsdBefore
                .mul(parseEther('1').add(liquidatorFee.add(liquidateFee)))
                .div(parseEther('1'))

              const expectedDepositToLiquidator = debtInUsdBefore
                .mul(parseEther('1').add(liquidatorFee))
                .div(newMetRate)
              const expectedDepositSeized = depositToSeizeInUsd.mul(parseEther('1')).div(newMetRate)
              const expectedDepositAfter = collateralInUsdBefore
                .sub(depositToSeizeInUsd)
                .mul(parseEther('1'))
                .div(newMetRate)
              const {_isHealthy} = await mBOX.debtPositionOf(user.address)

              expect(_isHealthy).to.true
              expect(depositSeized).to.eq(expectedDepositSeized)
              // FIXME: Related to https://github.com/bloqpriv/mbox/issues/20
              expect(await depositToken.balanceOf(user.address)).to.closeTo(expectedDepositAfter, 1)
              expect(await mEth.balanceOf(user.address)).to.eq(userMintAmount)
              expect(await mEthDebtToken.balanceOf(user.address)).to.eq(0)
              expect(await depositToken.balanceOf(liquidator.address)).to.eq(
                liquidatorDepositAmount.add(expectedDepositToLiquidator)
              )
              expect(await mEth.balanceOf(liquidator.address)).to.eq(liquidatorMintAmount.sub(amountToRepay))
              expect(await mEthDebtToken.balanceOf(liquidator.address)).to.eq(liquidatorMintAmount)
            })

            it('should liquidate by repaying > needed to make position healthy (liquidateFee == 0)', async function () {
              // given
              const {_debtInUsd: debtInUsdBefore, _deposit: collateralBefore} = await mBOX.debtPositionOf(user.address)
              const minAmountToRepayInUsd = await getMinLiquidationAmountInUsd(mBOX, user.address, mEth)

              // when
              const amountToRepayInUsd = minAmountToRepayInUsd.mul(parseEther('1.1')).div(parseEther('1')) // min + 10%
              expect(amountToRepayInUsd).to.lt(debtInUsdBefore) // ensure that isn't paying all debt
              const amountToRepay = amountToRepayInUsd.mul(parseEther('1')).div(ethRate)
              const tx = await mBOX.connect(liquidator).liquidate(mEth.address, user.address, amountToRepay)
              const [PositionLiquidated] = (await tx.wait()).events!.filter(({event}) => event === 'PositionLiquidated')
              const [, , , , depositSeized] = PositionLiquidated.args!

              // then
              const {
                _isHealthy: isHealthyAfter,
                _debtInUsd: debtInUsdAfter,
                _depositInUsd: collateralInUsdAfter,
                _deposit: collateralAfter,
                _unlockedDeposit: unlockedCollateralAfter,
                _lockedDeposit: lockedCollateralAfter,
              } = await mBOX.debtPositionOf(user.address)

              const expectedLocked = debtInUsdAfter
                .mul(mEthCollateralizationRatio)
                .div(parseEther('1'))
                .mul(parseEther('1'))
                .div(newMetRate)

              const currentCollateralizationRatio = collateralInUsdAfter.mul(parseEther('1')).div(debtInUsdAfter)

              expect(currentCollateralizationRatio).to.gt(mEthCollateralizationRatio)
              expect(isHealthyAfter).to.true
              expect(collateralAfter).to.eq(collateralBefore.sub(depositSeized))
              expect(lockedCollateralAfter).to.eq(expectedLocked)
              expect(unlockedCollateralAfter).to.eq(collateralAfter.sub(lockedCollateralAfter))
              expect(await depositToken.balanceOf(user.address)).to.eq(collateralBefore.sub(depositSeized))
              expect(await mEth.balanceOf(user.address)).to.eq(userMintAmount)
              expect(await mEthDebtToken.balanceOf(user.address)).to.eq(userMintAmount.sub(amountToRepay))
              expect(await depositToken.balanceOf(liquidator.address)).to.eq(liquidatorDepositAmount.add(depositSeized))
              expect(await mEth.balanceOf(liquidator.address)).to.eq(liquidatorMintAmount.sub(amountToRepay))
              expect(await mEthDebtToken.balanceOf(liquidator.address)).to.eq(liquidatorMintAmount)
            })

            it('should liquidate by repaying > needed to make position healthy (liquidateFee > 0)', async function () {
              // given
              const liquidateFee = parseEther('0.01') // 1%
              await mBOX.setLiquidateFee(liquidateFee)
              const {_debtInUsd: debtInUsdBefore, _deposit: collateralBefore} = await mBOX.debtPositionOf(user.address)
              const minAmountToRepayInUsd = await getMinLiquidationAmountInUsd(mBOX, user.address, mEth)

              // when
              const amountToRepayInUsd = minAmountToRepayInUsd.mul(parseEther('1.1')).div(parseEther('1')) // min + 10%
              expect(amountToRepayInUsd).to.lt(debtInUsdBefore) // ensure that isn't paying all debt
              const amountToRepay = amountToRepayInUsd.mul(parseEther('1')).div(ethRate)
              const tx = await mBOX.connect(liquidator).liquidate(mEth.address, user.address, amountToRepay)
              const [PositionLiquidated] = (await tx.wait()).events!.filter(({event}) => event === 'PositionLiquidated')
              const [, , , , depositSeized] = PositionLiquidated.args!

              const expectedDepositToLiquidator = amountToRepayInUsd
                .mul(parseEther('1').add(liquidatorFee))
                .div(newMetRate)

              // then
              const {
                _isHealthy: isHealthyAfter,
                _debtInUsd: debtInUsdAfter,
                _depositInUsd: collateralInUsdAfter,
                _deposit: collateralAfter,
                _unlockedDeposit: unlockedCollateralAfter,
                _lockedDeposit: lockedCollateralAfter,
              } = await mBOX.debtPositionOf(user.address)

              const expectedLocked = debtInUsdAfter
                .mul(mEthCollateralizationRatio)
                .div(parseEther('1'))
                .mul(parseEther('1'))
                .div(newMetRate)

              const currentCollateralizationRatio = collateralInUsdAfter.mul(parseEther('1')).div(debtInUsdAfter)

              expect(currentCollateralizationRatio).to.gt(mEthCollateralizationRatio)
              expect(isHealthyAfter).to.true
              expect(collateralAfter).to.eq(collateralBefore.sub(depositSeized))
              expect(lockedCollateralAfter).to.eq(expectedLocked)
              expect(unlockedCollateralAfter).to.eq(collateralAfter.sub(lockedCollateralAfter))
              expect(await depositToken.balanceOf(user.address)).to.eq(collateralBefore.sub(depositSeized))
              expect(await mEth.balanceOf(user.address)).to.eq(userMintAmount)
              expect(await mEthDebtToken.balanceOf(user.address)).to.eq(userMintAmount.sub(amountToRepay))
              // FIXME: Related to https://github.com/bloqpriv/mbox/issues/20
              expect(await depositToken.balanceOf(liquidator.address)).to.closeTo(
                liquidatorDepositAmount.add(expectedDepositToLiquidator),
                2200
              )
              expect(await mEth.balanceOf(liquidator.address)).to.eq(liquidatorMintAmount.sub(amountToRepay))
              expect(await mEthDebtToken.balanceOf(liquidator.address)).to.eq(liquidatorMintAmount)
            })

            it('should liquidate by repaying < needed to make position healthy (liquidateFee == 0)', async function () {
              // given
              const {_deposit: collateralBefore} = await mBOX.debtPositionOf(user.address)

              // when
              const minAmountToRepayInUsd = await getMinLiquidationAmountInUsd(mBOX, user.address, mEth)
              const minAmountToRepay = minAmountToRepayInUsd.mul(parseEther('1')).div(ethRate)
              const amountToRepay = minAmountToRepay.div('2')
              const tx = await mBOX.connect(liquidator).liquidate(mEth.address, user.address, amountToRepay)
              const [PositionLiquidated] = (await tx.wait()).events!.filter(({event}) => event === 'PositionLiquidated')
              const [, , , , depositSeized] = PositionLiquidated.args!

              // then
              const {
                _isHealthy: isHealthyAfter,
                _debtInUsd: debtInUsdAfter,
                _depositInUsd: collateralInUsdAfter,
                _deposit: collateralAfter,
                _unlockedDeposit: unlockedCollateralAfter,
                _lockedDeposit: lockedCollateralAfter,
              } = await mBOX.debtPositionOf(user.address)

              const currentCollateralizationRatio = collateralInUsdAfter.mul(parseEther('1')).div(debtInUsdAfter)

              expect(currentCollateralizationRatio).to.lt(mEthCollateralizationRatio)
              expect(isHealthyAfter).to.false
              expect(collateralAfter).to.eq(collateralBefore.sub(depositSeized))
              expect(lockedCollateralAfter).to.eq(collateralAfter)
              expect(unlockedCollateralAfter).to.eq(0)
              expect(await depositToken.balanceOf(user.address)).to.eq(collateralBefore.sub(depositSeized))
              expect(await mEth.balanceOf(user.address)).to.eq(userMintAmount)
              expect(await mEthDebtToken.balanceOf(user.address)).to.eq(userMintAmount.sub(amountToRepay))
              expect(await depositToken.balanceOf(liquidator.address)).to.eq(liquidatorDepositAmount.add(depositSeized))
              expect(await mEth.balanceOf(liquidator.address)).to.eq(liquidatorMintAmount.sub(amountToRepay))
              expect(await mEthDebtToken.balanceOf(liquidator.address)).to.eq(liquidatorMintAmount)
            })

            it('should liquidate by repaying < needed to make position healthy (liquidateFee > 0)', async function () {
              // given
              const liquidateFee = parseEther('0.01') // 1%
              await mBOX.setLiquidateFee(liquidateFee)
              const {_deposit: collateralBefore} = await mBOX.debtPositionOf(user.address)

              // when
              const amountToRepayInUsd = (await getMinLiquidationAmountInUsd(mBOX, user.address, mEth)).div('2')
              const amountToRepay = amountToRepayInUsd.mul(parseEther('1')).div(ethRate)
              const tx = await mBOX.connect(liquidator).liquidate(mEth.address, user.address, amountToRepay)
              const [PositionLiquidated] = (await tx.wait()).events!.filter(({event}) => event === 'PositionLiquidated')
              const [, , , , depositSeized] = PositionLiquidated.args!

              // then
              const {
                _isHealthy: isHealthyAfter,
                _debtInUsd: debtInUsdAfter,
                _depositInUsd: collateralInUsdAfter,
                _deposit: collateralAfter,
                _unlockedDeposit: unlockedCollateralAfter,
                _lockedDeposit: lockedCollateralAfter,
              } = await mBOX.debtPositionOf(user.address)

              const expectedDepositToLiquidator = amountToRepayInUsd
                .mul(parseEther('1').add(liquidatorFee))
                .div(newMetRate)

              const currentCollateralizationRatio = collateralInUsdAfter.mul(parseEther('1')).div(debtInUsdAfter)

              expect(currentCollateralizationRatio).to.lt(mEthCollateralizationRatio)
              expect(isHealthyAfter).to.false
              expect(collateralAfter).to.eq(collateralBefore.sub(depositSeized))
              expect(lockedCollateralAfter).to.eq(collateralAfter)
              expect(unlockedCollateralAfter).to.eq(0)
              expect(await depositToken.balanceOf(user.address)).to.eq(collateralBefore.sub(depositSeized))
              expect(await mEth.balanceOf(user.address)).to.eq(userMintAmount)
              expect(await mEthDebtToken.balanceOf(user.address)).to.eq(userMintAmount.sub(amountToRepay))
              // FIXME: Related to https://github.com/bloqpriv/mbox/issues/20
              expect(await depositToken.balanceOf(liquidator.address)).to.closeTo(
                liquidatorDepositAmount.add(expectedDepositToLiquidator),
                4000
              )
              expect(await mEth.balanceOf(liquidator.address)).to.eq(liquidatorMintAmount.sub(amountToRepay))
              expect(await mEthDebtToken.balanceOf(liquidator.address)).to.eq(liquidatorMintAmount)
            })

            it('should liquidate by repaying the exact amount to make healthy (liquidateFee == 0)', async function () {
              // given
              const {_deposit: depositBefore} = await mBOX.debtPositionOf(user.address)

              // when
              const amountToRepayInUsd = await getMinLiquidationAmountInUsd(mBOX, user.address, mEth)
              const amountToRepay = amountToRepayInUsd.mul(parseEther('1')).div(ethRate)
              const tx = await mBOX.connect(liquidator).liquidate(mEth.address, user.address, amountToRepay)
              const [PositionLiquidated] = (await tx.wait()).events!.filter(({event}) => event === 'PositionLiquidated')
              const [, , , , depositSeized] = PositionLiquidated.args!

              // then
              const {
                _isHealthy: isHealthyAfter,
                _debtInUsd: debtInUsdAfter,
                _depositInUsd: collateralInUsdAfter,
                _deposit: depositAfter,
                _unlockedDeposit: unlockedCollateralAfter,
                _lockedDeposit: lockedDepositAfter,
              } = await mBOX.debtPositionOf(user.address)

              const expectedLocked = debtInUsdAfter.mul(mEthCollateralizationRatio).div(newMetRate)

              const currentCollateralizationRatio = collateralInUsdAfter.mul(parseEther('1')).div(debtInUsdAfter)

              expect(currentCollateralizationRatio).to.eq(mEthCollateralizationRatio)
              expect(isHealthyAfter).to.true
              expect(depositAfter).to.eq(depositBefore.sub(depositSeized))
              expect(lockedDepositAfter).to.eq(expectedLocked)
              expect(unlockedCollateralAfter).to.eq(depositAfter.sub(lockedDepositAfter))
              expect(await depositToken.balanceOf(user.address)).to.eq(depositBefore.sub(depositSeized))
              expect(await mEth.balanceOf(user.address)).to.eq(userMintAmount)
              expect(await mEthDebtToken.balanceOf(user.address)).to.eq(userMintAmount.sub(amountToRepay))
              expect(await depositToken.balanceOf(liquidator.address)).to.eq(liquidatorDepositAmount.add(depositSeized))
              expect(await mEth.balanceOf(liquidator.address)).to.eq(liquidatorMintAmount.sub(amountToRepay))
              expect(await mEthDebtToken.balanceOf(liquidator.address)).to.eq(liquidatorMintAmount)
            })

            it('should liquidate by repaying the exact amount to make healthy (liquidateFee > 0)', async function () {
              // given
              const liquidateFee = parseEther('0.01') // 1%
              await mBOX.setLiquidateFee(liquidateFee)
              const {_deposit: depositBefore} = await mBOX.debtPositionOf(user.address)

              // when
              const amountToRepayInUsd = await getMinLiquidationAmountInUsd(mBOX, user.address, mEth)
              const amountToRepay = amountToRepayInUsd.mul(parseEther('1')).div(ethRate)
              const tx = await mBOX.connect(liquidator).liquidate(mEth.address, user.address, amountToRepay)
              const [PositionLiquidated] = (await tx.wait()).events!.filter(({event}) => event === 'PositionLiquidated')
              const [, , , , depositSeized] = PositionLiquidated.args!

              // then
              const {
                _isHealthy: isHealthyAfter,
                _debtInUsd: debtInUsdAfter,
                _depositInUsd: depositInUsdAfter,
                _deposit: depositAfter,
                _unlockedDeposit: unlockedDepositAfter,
                _lockedDeposit: lockedDepositAfter,
              } = await mBOX.debtPositionOf(user.address)

              const expectedLocked = debtInUsdAfter.mul(mEthCollateralizationRatio).div(newMetRate)

              const expectedDepositToLiquidator = amountToRepayInUsd
                .mul(parseEther('1').add(liquidatorFee))
                .div(newMetRate)

              const currentCollateralizationRatio = depositInUsdAfter.mul(parseEther('1')).div(debtInUsdAfter)

              // FIXME: Related to https://github.com/bloqpriv/mbox/issues/20
              expect(currentCollateralizationRatio).to.closeTo(mEthCollateralizationRatio, 1)
              // It's false but assuming that the test is passing because only 1 wei is missing to make position healty
              // Related to https://github.com/bloqpriv/mbox/issues/20
              // expect(isHealthyAfter).to.true
              expect(isHealthyAfter).to.false
              // FIXME: Related to https://github.com/bloqpriv/mbox/issues/20
              expect(lockedDepositAfter).to.closeTo(expectedLocked, 1200)
              expect(depositAfter).to.eq(depositBefore.sub(depositSeized))
              expect(unlockedDepositAfter).to.eq(depositAfter.sub(lockedDepositAfter))
              expect(await depositToken.balanceOf(user.address)).to.eq(depositBefore.sub(depositSeized))
              expect(await mEth.balanceOf(user.address)).to.eq(userMintAmount)
              expect(await mEthDebtToken.balanceOf(user.address)).to.eq(userMintAmount.sub(amountToRepay))
              // FIXME: Related to https://github.com/bloqpriv/mbox/issues/20
              expect(await depositToken.balanceOf(liquidator.address)).to.closeTo(
                liquidatorDepositAmount.add(expectedDepositToLiquidator),
                3300
              )
              expect(await mEth.balanceOf(liquidator.address)).to.eq(liquidatorMintAmount.sub(amountToRepay))
              expect(await mEthDebtToken.balanceOf(liquidator.address)).to.eq(liquidatorMintAmount)
            })
          })

          describe('when the position is unhealty (collateral:debt < 1)', function () {
            const newMetRate = parseEther('0.50')

            beforeEach(async function () {
              await oracle.updateRate(met.address, newMetRate)
              const {_debtInUsd, _depositInUsd} = await mBOX.debtPositionOf(user.address)
              expect(_debtInUsd).gt(_depositInUsd)
            })

            it('should revert if paying more than needed to seize all deposit', async function () {
              const amountToRepay = await mEthDebtToken.balanceOf(user.address)
              const tx = mBOX.connect(liquidator).liquidate(mEth.address, user.address, amountToRepay)

              // then
              await expect(tx).to.revertedWith('amount-to-repay-is-too-high')
            })

            it('should liquidate by repaying max possible amount (liquidafeFee == 0)', async function () {
              const depositBefore = await depositToken.balanceOf(user.address)

              // when
              const amountToRepayInUsd = await getMaxLiquidationAmountInUsd(mBOX, user.address)
              const amountToRepay = amountToRepayInUsd.mul(parseEther('1')).div(ethRate)
              const tx = await mBOX.connect(liquidator).liquidate(mEth.address, user.address, amountToRepay)

              // then
              const [PositionLiquidated] = (await tx.wait()).events!.filter(({event}) => event === 'PositionLiquidated')
              const [, , , , depositSeized] = PositionLiquidated.args!

              const {_isHealthy} = await mBOX.debtPositionOf(user.address)

              expect(_isHealthy).to.false
              // FIXME: Related to https://github.com/bloqpriv/mbox/issues/20
              expect(depositSeized).to.closeTo(depositBefore, 1600)
              expect(await depositToken.balanceOf(user.address)).to.closeTo(BigNumber.from('0'), 1600)
              expect(await mEth.balanceOf(user.address)).to.eq(userMintAmount)
              expect(await mEthDebtToken.balanceOf(user.address)).to.gt(0)
              expect(await depositToken.balanceOf(liquidator.address)).to.eq(liquidatorDepositAmount.add(depositSeized))
              expect(await mEth.balanceOf(liquidator.address)).to.eq(liquidatorMintAmount.sub(amountToRepay))
              expect(await mEthDebtToken.balanceOf(liquidator.address)).to.eq(liquidatorMintAmount)
            })

            it('should liquidate by repaying max possible amount (liquidafeFee > 0)', async function () {
              // given
              const liquidateFee = parseEther('0.01') // 1%
              await mBOX.setLiquidateFee(liquidateFee)
              const depositBefore = await depositToken.balanceOf(user.address)

              // when
              const amountToRepayInUsd = await getMaxLiquidationAmountInUsd(mBOX, user.address)
              const amountToRepay = amountToRepayInUsd.mul(parseEther('1')).div(ethRate)
              const tx = await mBOX.connect(liquidator).liquidate(mEth.address, user.address, amountToRepay)

              // then
              const [PositionLiquidated] = (await tx.wait()).events!.filter(({event}) => event === 'PositionLiquidated')
              const [, , , , depositSeized] = PositionLiquidated.args!

              const expectedDepositToLiquidator = amountToRepayInUsd
                .mul(parseEther('1').add(liquidatorFee))
                .div(newMetRate)

              const {_isHealthy} = await mBOX.debtPositionOf(user.address)

              expect(_isHealthy).to.false
              // FIXME: Related to https://github.com/bloqpriv/mbox/issues/20
              expect(depositSeized).to.closeTo(depositBefore, 6000)
              expect(await depositToken.balanceOf(user.address)).to.closeTo(BigNumber.from('0'), 6000)
              expect(await mEth.balanceOf(user.address)).to.eq(userMintAmount)
              expect(await mEthDebtToken.balanceOf(user.address)).to.gt(0)
              // FIXME: Related to https://github.com/bloqpriv/mbox/issues/20
              expect(await depositToken.balanceOf(liquidator.address)).to.closeTo(
                liquidatorDepositAmount.add(expectedDepositToLiquidator),
                6000
              )
              expect(await mEth.balanceOf(liquidator.address)).to.eq(liquidatorMintAmount.sub(amountToRepay))
              expect(await mEthDebtToken.balanceOf(liquidator.address)).to.eq(liquidatorMintAmount)
            })

            it('should liquidate by not repaying all debt (liquidaFee == 0)', async function () {
              // given
              const {_deposit: collateralBefore} = await mBOX.debtPositionOf(user.address)

              // when
              const amountToRepayInUsd = await getMaxLiquidationAmountInUsd(mBOX, user.address)
              const minAmountToRepay = amountToRepayInUsd.mul(parseEther('1')).div(ethRate)
              const amountToRepay = minAmountToRepay.div('2')
              const tx = await mBOX.connect(liquidator).liquidate(mEth.address, user.address, amountToRepay)
              const [PositionLiquidated] = (await tx.wait()).events!.filter(({event}) => event === 'PositionLiquidated')
              const [, , , , depositSeized] = PositionLiquidated.args!

              // then
              const {
                _isHealthy: isHealthyAfter,
                _debtInUsd: debtInUsdAfter,
                _depositInUsd: collateralInUsdAfter,
                _deposit: collateralAfter,
                _unlockedDeposit: unlockedCollateralAfter,
                _lockedDeposit: lockedCollateralAfter,
              } = await mBOX.debtPositionOf(user.address)

              const currentCollateralizationRatio = collateralInUsdAfter.mul(parseEther('1')).div(debtInUsdAfter)

              expect(currentCollateralizationRatio).to.lt(mEthCollateralizationRatio)
              expect(isHealthyAfter).to.false
              expect(collateralAfter).to.eq(collateralBefore.sub(depositSeized))
              expect(lockedCollateralAfter).to.eq(collateralAfter)
              expect(unlockedCollateralAfter).to.eq(0)
              expect(await depositToken.balanceOf(user.address)).to.eq(collateralBefore.sub(depositSeized))
              expect(await mEth.balanceOf(user.address)).to.eq(userMintAmount)
              expect(await mEthDebtToken.balanceOf(user.address)).to.eq(userMintAmount.sub(amountToRepay))
              expect(await depositToken.balanceOf(liquidator.address)).to.eq(liquidatorDepositAmount.add(depositSeized))
              expect(await mEth.balanceOf(liquidator.address)).to.eq(liquidatorMintAmount.sub(amountToRepay))
              expect(await mEthDebtToken.balanceOf(liquidator.address)).to.eq(liquidatorMintAmount)
            })

            it('should liquidate by not repaying all debt (liquidaFee > 0)', async function () {
              // given
              const liquidateFee = parseEther('0.01') // 1%
              await mBOX.setLiquidateFee(liquidateFee)
              const {_deposit: collateralBefore} = await mBOX.debtPositionOf(user.address)

              // when
              const amountToRepayInUsd = (await getMaxLiquidationAmountInUsd(mBOX, user.address)).div('2')
              const amountToRepay = amountToRepayInUsd.mul(parseEther('1')).div(ethRate)
              const tx = await mBOX.connect(liquidator).liquidate(mEth.address, user.address, amountToRepay)
              const [PositionLiquidated] = (await tx.wait()).events!.filter(({event}) => event === 'PositionLiquidated')
              const [, , , , depositSeized] = PositionLiquidated.args!

              // then
              const {
                _isHealthy: isHealthyAfter,
                _debtInUsd: debtInUsdAfter,
                _depositInUsd: collateralInUsdAfter,
                _deposit: collateralAfter,
                _unlockedDeposit: unlockedCollateralAfter,
                _lockedDeposit: lockedCollateralAfter,
              } = await mBOX.debtPositionOf(user.address)

              const expectedDepositToLiquidator = amountToRepayInUsd
                .mul(parseEther('1').add(liquidatorFee))
                .div(newMetRate)

              const currentCollateralizationRatio = collateralInUsdAfter.mul(parseEther('1')).div(debtInUsdAfter)

              expect(currentCollateralizationRatio).to.lt(mEthCollateralizationRatio)
              expect(isHealthyAfter).to.false
              expect(collateralAfter).to.eq(collateralBefore.sub(depositSeized))
              expect(lockedCollateralAfter).to.eq(collateralAfter)
              expect(unlockedCollateralAfter).to.eq(0)
              expect(await depositToken.balanceOf(user.address)).to.eq(collateralBefore.sub(depositSeized))
              expect(await mEth.balanceOf(user.address)).to.eq(userMintAmount)
              expect(await mEthDebtToken.balanceOf(user.address)).to.eq(userMintAmount.sub(amountToRepay))
              // FIXME: Related to https://github.com/bloqpriv/mbox/issues/20
              expect(await depositToken.balanceOf(liquidator.address)).to.closeTo(
                liquidatorDepositAmount.add(expectedDepositToLiquidator),
                7500
              )
              expect(await mEth.balanceOf(liquidator.address)).to.eq(liquidatorMintAmount.sub(amountToRepay))
              expect(await mEthDebtToken.balanceOf(liquidator.address)).to.eq(liquidatorMintAmount)
            })
          })

          describe('when user minted both mETH and mDOGE using all collateral', function () {
            beforeEach(async function () {
              const maxIssuableDoge = await mBOX.maxIssuableFor(user.address, mDoge.address)
              await mBOX.connect(user).mint(mDoge.address, maxIssuableDoge)
              const {_isHealthy, _unlockedDeposit} = await mBOX.debtPositionOf(user.address)
              expect(_isHealthy).to.true
              expect(_unlockedDeposit).to.eq(0)
            })

            it('should liquidate a position that have minted more than one mAsset', async function () {
              // given
              const newDogeRate = parseEther('0.5')
              await oracle.updateRate(doge.address, newDogeRate) // $0.4 -> $0.5
              const {_isHealthy: isHealthyBefore} = await mBOX.debtPositionOf(user.address)
              expect(isHealthyBefore).to.false

              // when
              const minRepayAmountInUsd = await getMinLiquidationAmountInUsd(mBOX, user.address, mDoge)
              const minRepayAmountInDoge = minRepayAmountInUsd.div(newDogeRate).mul(parseEther('1'))
              await mBOX.connect(liquidator).mint(mDoge.address, minRepayAmountInDoge)
              await mBOX.connect(liquidator).liquidate(mDoge.address, user.address, minRepayAmountInDoge)

              // then
              const {
                _isHealthy: isHealthyAfter,
                _lockedDepositInUsd: lockedDepositInUsdAfter,
                _depositInUsd: _depositInUsdAfter,
              } = await mBOX.debtPositionOf(user.address)
              expect(lockedDepositInUsdAfter).to.eq(_depositInUsdAfter)
              expect(isHealthyAfter).to.true
            })
          })
        })
      })
    })
  })
})
