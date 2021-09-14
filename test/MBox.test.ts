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
  METMock,
  METMock__factory,
  OracleMock,
  OracleMock__factory,
  SyntheticAsset,
  SyntheticAsset__factory,
  DebtToken,
  DebtToken__factory,
} from '../typechain'
import {WETH} from './helpers'

describe('MBox', function () {
  let deployer: SignerWithAddress
  let user1: SignerWithAddress
  let user2: SignerWithAddress
  let met: METMock
  let depositToken: DepositToken
  let oracle: OracleMock
  let debtToken: DebtToken
  let mEth: SyntheticAsset
  let mBOX: MBox

  beforeEach(async function () {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[deployer, user1, user2] = await ethers.getSigners()

    const oracleMock = new OracleMock__factory(deployer)
    oracle = <OracleMock>await oracleMock.deploy()
    await oracle.deployed()

    const metMockFactory = new METMock__factory(deployer)
    met = await metMockFactory.deploy()
    await met.deployed()

    const depositTokenFactory = new DepositToken__factory(deployer)
    depositToken = await depositTokenFactory.deploy(met.address)
    await depositToken.deployed()

    const debtTokenFactory = new DebtToken__factory(deployer)
    debtToken = await debtTokenFactory.deploy('mETH Debt', 'mEth-Debt')
    await debtToken.deployed()

    const mETHFactory = new SyntheticAsset__factory(deployer)
    const underlying = WETH
    const collateralizationRatio = parseEther('1.5')
    mEth = await mETHFactory.deploy('Metronome ETH', 'mEth', underlying, debtToken.address, collateralizationRatio)
    await mEth.deployed()

    const mBoxFactory = new MBox__factory(deployer)
    mBOX = await mBoxFactory.deploy()
    await mBOX.deployed()

    // Deployment tasks
    await mEth.transferOwnership(mBOX.address)
    await depositToken.setMBox(mBOX.address)
    await depositToken.transferOwnership(mBOX.address)
    await debtToken.transferOwnership(mBOX.address)
    await mBOX.setDepositToken(depositToken.address)
    await mBOX.setOracle(oracle.address)
    await mBOX.addSyntheticAsset(mEth.address)

    // mint some MET to users
    await met.mint(user1.address, parseEther(`${1e6}`))
    await met.mint(user2.address, parseEther(`${1e6}`))

    // initialize mocked oracle
    await oracle.updateRate(await mEth.underlying(), parseEther('4000')) // 1 ETH = $4000
    await oracle.updateRate(met.address, parseEther('4')) // 1 MET = $4
  })

  describe('whitelisting', function () {
    describe('addSyntheticAsset', function () {
      it('should revert if not owner', async function () {
        const tx = mBOX.connect(user1).addSyntheticAsset(mEth.address)
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
        const metMockFactory = new METMock__factory(deployer)
        const someToken = await metMockFactory.deploy()
        expect(await someToken.totalSupply()).to.eq(0)
        await mBOX.addSyntheticAsset(someToken.address)
        expect(await mBOX.syntheticAssetsByAddress(someToken.address)).to.not.eq(ethers.constants.AddressZero)

        // when
        await mBOX.removeSyntheticAsset(someToken.address)

        // then
        expect(await mBOX.syntheticAssetsByAddress(someToken.address)).to.eq(ethers.constants.AddressZero)
      })
    })
  })

  describe('deposit', function () {
    beforeEach(async function () {
      await met.connect(user1).approve(mBOX.address, ethers.constants.MaxUint256)
    })

    it('should reject if collateral amount is 0', async function () {
      const toDeposit = 0
      const tx = mBOX.connect(user1).deposit(toDeposit)
      await expect(tx).to.revertedWith('zero-collateral-amount')
    })

    it('should reject if MET balance is not enough', async function () {
      const balance = await met.balanceOf(user1.address)
      const tooHigh = balance.add('1')
      const tx = mBOX.connect(user1).deposit(tooHigh)
      await expect(tx).to.revertedWith('ERC20: transfer amount exceeds balance')
    })

    it('should deposit MET and mint mBOX-MET', async function () {
      // when
      const amount = parseEther('10')
      const tx = () => mBOX.connect(user1).deposit(amount)

      // then
      await expect(tx).changeTokenBalances(met, [user1, mBOX], [amount.mul('-1'), amount])
      await expect(tx).changeTokenBalances(depositToken, [user1, mBOX], [amount, 0])
      await expect(tx()).to.emit(mBOX, 'CollateralDeposited').withArgs(user1.address, amount)
    })

    describe('when user deposited some MET', function () {
      const depositAmount = parseEther('6000')

      beforeEach(async function () {
        await met.connect(user1).approve(mBOX.address, ethers.constants.MaxUint256)
        await mBOX.connect(user1).deposit(depositAmount)
      })

      describe('mint', function () {
        let ethRate: BigNumber
        let metRate: BigNumber
        let collateralizationRatio: BigNumber
        let collateralInUsd: BigNumber
        let maxIssuableInUsd: BigNumber
        let maxIssuableInEth: BigNumber

        beforeEach(async function () {
          ethRate = await oracle.rateOf(WETH)
          metRate = await oracle.rateOf(met.address)
          collateralizationRatio = await mEth.collateralizationRatio()
          collateralInUsd = await oracle.convertToUSD(met.address, depositAmount)
          maxIssuableInUsd = collateralInUsd.mul(parseEther('1')).div(collateralizationRatio)
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
          const tx = mBOX.connect(user1).mint(mEth.address, toIssue)

          // then
          await expect(tx).to.revertedWith('not-enough-collateral')
        })

        it('should reject if amount to mint is 0', async function () {
          // when
          const toIssue = 0
          const tx = mBOX.connect(user1).mint(mEth.address, toIssue)

          // then
          await expect(tx).to.revertedWith('amount-to-mint-is-zero')
        })

        it('should mint mEth', async function () {
          // given
          const maxIssuableBefore = await mBOX.maxIssuableFor(user1.address, mEth.address)
          expect(maxIssuableBefore).to.eq(
            depositAmount.mul(metRate).div(collateralizationRatio).mul(parseEther('1')).div(ethRate)
          ) // 4 ETH

          expect(await mBOX.debtPositionOf(user1.address)).to.deep.eq([
            BigNumber.from(0), // _debtInUsd
            depositAmount.mul(metRate).div(parseEther('1')), // _collateralInUsd
            depositAmount, // _collateral
            depositAmount, // _unlockedCollateral
            BigNumber.from(0), // _lockedCollateral
          ])

          // when
          const amountToMint = parseEther('1')
          const tx = () => mBOX.connect(user1).mint(mEth.address, amountToMint)

          // then
          await expect(tx).changeTokenBalances(mEth, [user1], [amountToMint])
          const maxIssuableAfter = await mBOX.maxIssuableFor(user1.address, mEth.address)
          expect(maxIssuableAfter).to.eq(maxIssuableBefore.sub(amountToMint)).and.to.eq(parseEther('3')) // 3 ETH = $12K
          const expectedLocked = amountToMint.mul(ethRate).mul(collateralizationRatio).div(metRate).div(parseEther('1'))
          expect(await mBOX.debtPositionOf(user1.address)).to.deep.eq([
            amountToMint.mul(ethRate).div(parseEther('1')), // _debtInUsd
            depositAmount.mul(metRate).div(parseEther('1')), // _collateralInUsd
            depositAmount, // _collateral
            depositAmount.sub(expectedLocked), // _unlockedCollateral
            expectedLocked, // _lockedCollateral
          ])

          // Note: the calls below will make additional transfers
          await expect(tx).changeTokenBalances(debtToken, [user1], [amountToMint])
          await expect(tx).changeTokenBalances(met, [mBOX], [0])
          await expect(tx()).to.emit(mBOX, 'SyntheticAssetMinted').withArgs(user1.address, mEth.address, amountToMint)
        })

        it('should mint max issuable amount', async function () {
          const amount = maxIssuableInEth
          const tx = mBOX.connect(user1).mint(mEth.address, amount)
          await expect(tx).to.emit(mBOX, 'SyntheticAssetMinted').withArgs(user1.address, mEth.address, amount)
        })
      })

      describe('when user minted some mETH', function () {
        beforeEach(async function () {
          await mBOX.connect(user1).mint(mEth.address, parseEther('1'))
        })

        describe('withdraw', function () {
          it('should revert if amount is 0', async function () {
            // when
            const tx = mBOX.connect(user1).withdraw(0)

            // then
            await expect(tx).to.revertedWith('amount-to-withdraw-is-zero')
          })

          it('should revert if amount > unlocked collateral amount', async function () {
            // given
            const {_unlockedCollateral} = await mBOX.debtPositionOf(user1.address)

            // when
            const tx = mBOX.connect(user1).withdraw(_unlockedCollateral.add('1'))

            // then
            await expect(tx).to.revertedWith('amount-to-withdraw-gt-unlocked')
          })

          it('should withdraw if amount <= unlocked collateral amount', async function () {
            // given
            const {_unlockedCollateral: amountToWithdraw} = await mBOX.debtPositionOf(user1.address)
            const metBalanceBefore = await met.balanceOf(user1.address)
            const depositBefore = await depositToken.balanceOf(user1.address)

            // when
            const tx = mBOX.connect(user1).withdraw(amountToWithdraw)
            await expect(tx).to.emit(mBOX, 'CollateralWithdrawn').withArgs(user1.address, amountToWithdraw)

            // then
            expect(await met.balanceOf(user1.address)).to.eq(metBalanceBefore.add(amountToWithdraw))
            expect(await depositToken.balanceOf(user1.address)).to.eq(depositBefore.sub(amountToWithdraw))
            const {_unlockedCollateral: unlockedCollateralAfter} = await mBOX.debtPositionOf(user1.address)
            expect(unlockedCollateralAfter).to.eq(0)
          })
        })

        describe('repay', function () {
          it('should revert if amount is 0', async function () {
            // when
            const tx = mBOX.connect(user1).repay(mEth.address, 0)

            // then
            await expect(tx).to.revertedWith('amount-to-repay-is-zero')
          })

          it('should revert if amount > unlocked collateral amount', async function () {
            // given
            const debtAmount = await debtToken.balanceOf(user1.address)

            // when
            const tx = mBOX.connect(user1).repay(mEth.address, debtAmount.add('1'))

            // then
            await expect(tx).to.revertedWith('amount-to-repay-gt-debt')
          })

          it('should repay if amount <= debt', async function () {
            // given
            const debtAmount = await debtToken.balanceOf(user1.address)
            const {_lockedCollateral: lockedCollateralBefore} = await mBOX.debtPositionOf(user1.address)
            expect(lockedCollateralBefore).to.gt(0)

            // when
            const tx = mBOX.connect(user1).repay(mEth.address, debtAmount)
            await expect(tx).to.emit(mBOX, 'DebtRepayed').withArgs(user1.address, mEth.address, debtAmount)

            // then
            expect(await debtToken.balanceOf(user1.address)).to.eq(0)
            const {_lockedCollateral: lockedCollateralAfter} = await mBOX.debtPositionOf(user1.address)
            expect(lockedCollateralAfter).to.eq(0)
          })
        })
      })
    })
  })
})
