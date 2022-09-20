/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable camelcase */
import {parseEther} from '@ethersproject/units'
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {expect} from 'chai'
import {ethers} from 'hardhat'
import {
  SyntheticToken,
  SyntheticToken__factory,
  DebtToken,
  DebtToken__factory,
  MasterOracleMock__factory,
  MasterOracleMock,
  PoolMock,
  PoolMock__factory,
  ERC20Mock__factory,
  ERC20Mock,
  DepositToken__factory,
  DepositToken,
} from '../typechain'
import {toUSD} from '../helpers'

const {MaxUint256} = ethers.constants
import {impersonateAccount, increaseTime} from './helpers'

describe('SyntheticToken', function () {
  let deployer: SignerWithAddress
  let governor: SignerWithAddress
  let user: SignerWithAddress
  let otherUser: SignerWithAddress
  let treasury: SignerWithAddress
  let poolMock: PoolMock
  let met: ERC20Mock
  let msdMET: DepositToken
  let msUSD: SyntheticToken
  let msUSDDebt: DebtToken
  let masterOracleMock: MasterOracleMock

  const metCR = parseEther('0.5') // 50%
  const name = 'Metronome Synth ETH'
  const symbol = 'msETH'
  const interestRate = parseEther('0')

  beforeEach(async function () {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[deployer, governor, user, otherUser, treasury] = await ethers.getSigners()

    const masterOracleMockFactory = new MasterOracleMock__factory(deployer)
    masterOracleMock = <MasterOracleMock>await masterOracleMockFactory.deploy()
    await masterOracleMock.deployed()

    const erc20MockFactory = new ERC20Mock__factory(deployer)
    met = await erc20MockFactory.deploy('Metronome', 'MET', 18)
    await met.deployed()

    const depositTokenFactory = new DepositToken__factory(deployer)
    msdMET = await depositTokenFactory.deploy()
    await msdMET.deployed()

    const debtTokenFactory = new DebtToken__factory(deployer)
    msUSDDebt = await debtTokenFactory.deploy()
    await msUSDDebt.deployed()

    const syntheticTokenFactory = new SyntheticToken__factory(deployer)
    msUSD = await syntheticTokenFactory.deploy()
    await msUSD.deployed()

    const poolMockFactory = new PoolMock__factory(deployer)
    poolMock = await poolMockFactory.deploy(msdMET.address, masterOracleMock.address, msUSD.address, msUSDDebt.address)
    await poolMock.deployed()
    await poolMock.transferGovernorship(governor.address)

    // Initializations & Setup
    await poolMock.updateTreasury(treasury.address)

    await msdMET.initialize(met.address, poolMock.address, 'msdMET', 18, metCR, MaxUint256)
    await msUSD.initialize(name, symbol, 18, poolMock.address, interestRate, MaxUint256)
    await msUSDDebt.initialize('msUSD Debt', 'msUSD-Debt', poolMock.address, msUSD.address)

    await masterOracleMock.updatePrice(msUSD.address, toUSD('1')) // 1 msAsset = $1
    await masterOracleMock.updatePrice(msdMET.address, toUSD('1')) // 1 collateralToken = $1
  })

  it('default values', async function () {
    expect(await msUSD.totalSupply()).eq(0)
    expect(await msUSD.name()).eq(name)
    expect(await msUSD.symbol()).eq(symbol)
    expect(await msUSD.decimals()).eq(18)
  })

  describe('issue', function () {
    const depositAmount = parseEther('100')

    beforeEach(async function () {
      await met.mint(user.address, parseEther('1000'))
      await met.connect(user).approve(msdMET.address, ethers.constants.MaxUint256)
      await msdMET.connect(user).deposit(depositAmount, user.address)
    })

    it('should not revert if paused', async function () {
      // given
      await poolMock.pause()

      // when
      const toIssue = parseEther('0.1')
      const tx = msUSD.connect(user).issue(toIssue, user.address)

      // then
      await expect(tx).emit(msUSD, 'SyntheticTokenIssued')
    })

    it('should revert if shutdown', async function () {
      // given
      await poolMock.shutdown()

      // when
      const toIssue = parseEther('0.1')
      const tx = msUSD.connect(user).issue(toIssue, user.address)

      // then
      await expect(tx).revertedWith('shutdown')
    })

    it('should revert if synthetic does not exist', async function () {
      // given
      const syntheticTokenFactory = new SyntheticToken__factory(deployer)
      const notListedSynthetic = await syntheticTokenFactory.deploy()
      await notListedSynthetic.deployed()
      await notListedSynthetic.initialize(name, symbol, 18, poolMock.address, interestRate, MaxUint256)

      // when
      const toIssue = parseEther('1')
      const tx = notListedSynthetic.issue(toIssue, user.address)

      // then
      await expect(tx).revertedWith('synthetic-inexistent')
    })

    it('should revert if synthetic is not active', async function () {
      // given
      await msUSD.toggleIsActive()

      // when
      const toIssue = parseEther('1')
      const tx = msUSD.connect(user).issue(toIssue, user.address)

      // then
      await expect(tx).revertedWith('synthetic-inactive')
    })

    it('should revert if user has not enough collateral deposited', async function () {
      // when
      const toIssue = parseEther('1000000000000000')
      const tx = msUSD.connect(user).issue(toIssue, user.address)

      // then
      await expect(tx).revertedWith('not-enough-collateral')
    })

    it('should revert if amount to issue is 0', async function () {
      // when
      const toIssue = 0
      const tx = msUSD.connect(user).issue(toIssue, user.address)

      // then
      await expect(tx).revertedWith('amount-is-zero')
    })

    it('should revert if new debt < debt floor', async function () {
      // given
      await poolMock.updateDebtFloor(parseEther('10000')) // $10,000

      // when
      const toIssue = parseEther('1') // $4,000
      const tx = msUSD.connect(user).issue(toIssue, user.address)

      // then
      await expect(tx).revertedWith('debt-lt-floor')
    })

    it('should issue msAsset (issueFee == 0)', async function () {
      // when
      const toIssue = parseEther('1')
      const tx = () => msUSD.connect(user).issue(toIssue, user.address)

      // then
      await expect(tx).changeTokenBalances(msUSD, [user], [toIssue])

      // Note: the calls below will make additional transfers
      await expect(tx).changeTokenBalances(msUSDDebt, [user], [toIssue])
      await expect(tx).changeTokenBalances(met, [poolMock], [0])
      await expect(tx()).emit(msUSD, 'SyntheticTokenIssued').withArgs(user.address, user.address, toIssue, 0)
    })

    it('should issue msAsset (issueFee > 0)', async function () {
      // given
      const issueFee = parseEther('0.1') // 10%
      await poolMock.updateIssueFee(issueFee)

      // when
      const amount = parseEther('1')
      const expectedFee = amount.mul(issueFee).div(parseEther('1'))
      const expectedAmountAfterFee = amount.sub(expectedFee)
      const tx = () => msUSD.connect(user).issue(amount, user.address)
      await expect(tx).changeTokenBalances(msUSD, [user, treasury], [expectedAmountAfterFee, expectedFee])

      // then
      // Note: the calls below will make additional transfers
      // See: https://github.com/EthWorks/Waffle/issues/569
      await expect(tx).changeTokenBalances(msUSDDebt, [user], [amount])
      await expect(tx()).emit(msUSD, 'SyntheticTokenIssued').withArgs(user.address, user.address, amount, expectedFee)
    })

    it('should issue max issuable amount (issueFee == 0)', async function () {
      const {_issuableInUsd} = await poolMock.debtPositionOf(user.address)
      const amount = await masterOracleMock.quoteUsdToToken(msUSD.address, _issuableInUsd)
      const tx = msUSD.connect(user).issue(amount, user.address)
      await expect(tx).emit(msUSD, 'SyntheticTokenIssued').withArgs(user.address, user.address, amount, 0)
    })

    it('should issue max issuable amount (issueFee > 0)', async function () {
      // given
      const issueFee = parseEther('0.1') // 10%
      await poolMock.updateIssueFee(issueFee)

      const {_issuableInUsd} = await poolMock.debtPositionOf(user.address)
      const amount = await masterOracleMock.quoteUsdToToken(msUSD.address, _issuableInUsd)
      const expectedFee = amount.mul(issueFee).div(parseEther('1'))
      const tx = msUSD.connect(user).issue(amount, user.address)
      await expect(tx).emit(msUSD, 'SyntheticTokenIssued').withArgs(user.address, user.address, amount, expectedFee)
    })

    describe('when user minted some msETH', function () {
      const userMintAmount = parseEther('1')

      beforeEach(async function () {
        await msUSD.connect(user).issue(userMintAmount, user.address)
      })

      describe('repay', function () {
        it('should not revert if paused', async function () {
          // given
          await poolMock.pause()
          const amount = await msUSD.balanceOf(user.address)

          // when
          const tx = msUSD.connect(user).repay(user.address, amount)

          // then
          await expect(tx).emit(msUSD, 'DebtRepaid')
        })

        it('should revert if shutdown', async function () {
          // given
          await poolMock.shutdown()
          const amount = await msUSD.balanceOf(user.address)

          // when
          const tx = msUSD.connect(user).repay(user.address, amount)

          // then
          await expect(tx).revertedWith('shutdown')
        })

        it('should revert if amount is 0', async function () {
          // when
          const tx = msUSD.connect(user).repay(user.address, 0)

          // then
          await expect(tx).revertedWith('amount-is-zero')
        })

        it('should revert if amount > unlocked collateral amount', async function () {
          // given
          const amount = await msUSD.balanceOf(user.address)

          // when
          const tx = msUSD.connect(user).repay(user.address, amount.add('1'))

          // then
          await expect(tx).revertedWith('burn-amount-exceeds-balance')
        })

        it('should revert if new debt < debt floor', async function () {
          // given
          await poolMock.updateDebtFloor(parseEther('3000')) // $3,000

          const amount = await msUSD.balanceOf(user.address)
          expect(amount).eq(parseEther('1')) // $4,000

          // when
          const toRepay = amount.div('2') // $2,000
          const tx = msUSD.connect(user).repay(user.address, toRepay)

          // then
          await expect(tx).revertedWith('debt-lt-floor')
        })

        it('should allow repay all when debt floor is set', async function () {
          // given
          await poolMock.updateRepayFee(0)
          await poolMock.updateDebtFloor(parseEther('3000')) // $3,000
          const amount = await msUSD.balanceOf(user.address)

          // when
          await msUSD.connect(user).repay(user.address, amount)

          // then
          const debtAfter = await poolMock.debtOf(user.address)
          expect(debtAfter).eq(0)
        })

        it('should repay if amount == debt (repayFee == 0)', async function () {
          // given
          await poolMock.updateRepayFee(0)
          const lockedCollateralBefore = await msdMET.lockedBalanceOf(user.address)
          expect(lockedCollateralBefore).gt(0)

          // when
          const amount = await msUSD.balanceOf(user.address)
          const tx = msUSD.connect(user).repay(user.address, amount)
          await expect(tx).emit(msUSD, 'DebtRepaid').withArgs(user.address, user.address, amount, 0)

          // then
          expect(await msUSD.balanceOf(user.address)).eq(0)
          const lockedCollateralAfter = await msdMET.lockedBalanceOf(user.address)
          expect(lockedCollateralAfter).eq(0)
        })

        it('should repay if amount < debt (repayFee == 0)', async function () {
          // given
          await poolMock.updateRepayFee(0)
          const lockedCollateralBefore = await msdMET.lockedBalanceOf(user.address)
          expect(lockedCollateralBefore).gt(0)

          // when
          const amount = (await msUSD.balanceOf(user.address)).div('2')
          const tx = msUSD.connect(user).repay(user.address, amount)
          await expect(tx).emit(msUSD, 'DebtRepaid').withArgs(user.address, user.address, amount, 0)

          // then
          expect(await msUSD.balanceOf(user.address)).eq(amount)
          const lockedDepositAfter = await msdMET.lockedBalanceOf(user.address)
          expect(lockedDepositAfter).eq(lockedCollateralBefore.div('2'))
        })

        it('should repay if amount == debt (repayFee > 0)', async function () {
          // given
          const repayFee = parseEther('0.1') // 10%
          await poolMock.updateRepayFee(repayFee)
          const {_debtInUsd: debtInUsdBefore} = await poolMock.debtPositionOf(user.address)
          const msUsdBefore = await msUSD.balanceOf(user.address)
          expect(msUsdBefore).eq(debtInUsdBefore)

          // when
          const amount = msUsdBefore
          const debtToErase = amount.mul(parseEther('1')).div(parseEther('1').add(repayFee))
          const expectedFee = amount.sub(debtToErase).sub(1)
          const tx = msUSD.connect(user).repay(user.address, amount)
          await expect(tx).emit(msUSD, 'DebtRepaid').withArgs(user.address, user.address, amount, expectedFee)

          // then
          expect(await msUSD.balanceOf(user.address)).eq(0)
          const {_debtInUsd: debtInUsdAfter} = await poolMock.debtPositionOf(user.address)
          expect(debtInUsdAfter).eq(expectedFee)
        })

        it('should repay if amount < debt (repayFee > 0)', async function () {
          // given
          const repayFee = parseEther('0.1') // 10%
          await poolMock.updateRepayFee(repayFee)
          const {_debtInUsd: debtInUsdBefore} = await poolMock.debtPositionOf(user.address)
          const msUsdBefore = await msUSD.balanceOf(user.address)
          expect(msUsdBefore).eq(debtInUsdBefore)

          // when
          const halfBalance = msUsdBefore.div('2')
          const amount = halfBalance
          const debtToErase = amount.mul(parseEther('1')).div(parseEther('1').add(repayFee))
          const expectedFee = amount.sub(debtToErase)
          const tx = msUSD.connect(user).repay(user.address, amount)
          await expect(tx).emit(msUSD, 'DebtRepaid').withArgs(user.address, user.address, amount, expectedFee)

          // then
          const msUsdAfter = await msUSD.balanceOf(user.address)
          expect(msUsdAfter).eq(halfBalance)
          const {_debtInUsd: debtInUsdAfter} = await poolMock.debtPositionOf(user.address)
          expect(debtInUsdAfter).eq(halfBalance.add(expectedFee))
        })

        it('should repay all debt (repayFee > 0)', async function () {
          // given
          const repayFee = parseEther('0.1') // 10%
          await poolMock.updateRepayFee(repayFee)

          await met.mint(otherUser.address, parseEther('1000'))
          await met.connect(otherUser).approve(msdMET.address, ethers.constants.MaxUint256)
          await msdMET.connect(otherUser).deposit(depositAmount, otherUser.address)
          await msUSD.connect(otherUser).issue(parseEther('1'), user.address)

          const {_debtInUsd: debtBefore} = await poolMock.debtPositionOf(user.address)
          expect(debtBefore).gt(0)

          // when
          const amount = debtBefore.mul(parseEther('1').add(repayFee)).div(parseEther('1'))
          await msUSD.connect(user).repay(user.address, amount)

          // then
          const {_debtInUsd: debtAfter} = await poolMock.debtPositionOf(user.address)
          expect(debtAfter).eq(0)
        })
      })
    })
  })

  describe('mint', function () {
    it('should mint', async function () {
      expect(await msUSD.balanceOf(user.address)).eq(0)
      const amount = parseEther('100')
      const call = msUSD.interface.encodeFunctionData('mint', [user.address, amount])
      await poolMock.mockCall(msUSD.address, call)
      expect(await msUSD.balanceOf(user.address)).eq(amount)
    })

    it('should revert if not pool', async function () {
      const tx = msUSD.connect(user).mint(user.address, parseEther('10'))
      await expect(tx).revertedWith('not-pool')
    })

    it('should revert if surpass max total supply', async function () {
      // given
      expect(await msUSD.totalSupply()).eq(0)
      const max = toUSD('100')
      await msUSD.updateMaxTotalSupplyInUsd(max)

      // when
      const call = msUSD.interface.encodeFunctionData('mint', [user.address, max.add('1')])
      const tx = poolMock.mockCall(msUSD.address, call)

      // then
      await expect(tx).revertedWith('surpass-max-total-supply')
    })

    it('should revert if msAsset is inactive', async function () {
      // given
      await msUSD.toggleIsActive()

      // when
      const call = msUSD.interface.encodeFunctionData('mint', [deployer.address, '1'])
      const tx = poolMock.mockCall(msUSD.address, call)

      // then
      await expect(tx).revertedWith('synthetic-inactive')
    })
  })

  describe('burn', function () {
    const amount = parseEther('100')

    beforeEach(async function () {
      const call = msUSD.interface.encodeFunctionData('mint', [user.address, amount])
      await poolMock.mockCall(msUSD.address, call)
    })

    it('should burn', async function () {
      expect(await msUSD.balanceOf(user.address)).eq(amount)

      const call = msUSD.interface.encodeFunctionData('burn', [user.address, amount])
      await poolMock.mockCall(msUSD.address, call)

      expect(await msUSD.balanceOf(user.address)).eq(0)
    })

    it('should revert if not pool', async function () {
      const tx = msUSD.connect(user).burn(user.address, parseEther('10'))
      await expect(tx).revertedWith('not-pool')
    })
  })

  describe('updateMaxTotalSupplyInUsd', function () {
    it('should update collateralization ratio', async function () {
      const before = await msUSD.maxTotalSupplyInUsd()
      const after = before.div('2')
      const tx = msUSD.updateMaxTotalSupplyInUsd(after)
      await expect(tx).emit(msUSD, 'MaxTotalSupplyUpdated').withArgs(before, after)
      expect(await msUSD.maxTotalSupplyInUsd()).eq(after)
    })

    it('should revert if using the current value', async function () {
      const currentMaxTotalSupplyInUsd = await msUSD.maxTotalSupplyInUsd()
      const tx = msUSD.updateMaxTotalSupplyInUsd(currentMaxTotalSupplyInUsd)
      await expect(tx).revertedWith('new-same-as-current')
    })

    it('should revert if not governor', async function () {
      const tx = msUSD.connect(user).updateMaxTotalSupplyInUsd(parseEther('10'))
      await expect(tx).revertedWith('not-governor')
    })
  })

  describe('updateInterestRate', function () {
    it('should update interest rate', async function () {
      const before = await msUSD.interestRate()
      const after = parseEther('0.5')
      const tx = msUSD.updateInterestRate(after)
      await expect(tx).emit(msUSD, 'InterestRateUpdated').withArgs(before, after)
      expect(await msUSD.interestRate()).eq(after)
    })

    it('should revert if using the current value', async function () {
      const currentInterestRate = await msUSD.interestRate()
      const tx = msUSD.updateInterestRate(currentInterestRate)
      await expect(tx).revertedWith('new-same-as-current')
    })

    it('should revert if not governor', async function () {
      const tx = msUSD.connect(user).updateInterestRate(parseEther('0.12'))
      await expect(tx).revertedWith('not-governor')
    })
  })

  describe('toggleIsActive', function () {
    it('should update active flag', async function () {
      expect(await msUSD.isActive()).eq(true)
      const tx = msUSD.toggleIsActive()
      await expect(tx).emit(msUSD, 'SyntheticTokenActiveUpdated').withArgs(true, false)
      expect(await msUSD.isActive()).eq(false)
    })

    it('should revert if not governor', async function () {
      const tx = msUSD.connect(user).toggleIsActive()
      await expect(tx).revertedWith('not-governor')
    })
  })

  describe('acrueInterest', function () {
    it('should mint accrued fee to treasury', async function () {
      const principal = parseEther('100')

      // given
      await msUSD.updateInterestRate(parseEther('0.1')) // 10%

      const mintCall = msUSD.interface.encodeFunctionData('mint', [user.address, principal])
      await poolMock.mockCall(msUSD.address, mintCall)
      const msUSDWallet = await impersonateAccount(msUSD.address)
      await msUSDDebt.connect(msUSDWallet).mint(user.address, principal)

      // eslint-disable-next-line new-cap
      await increaseTime(await msUSD.SECONDS_PER_YEAR())

      // when
      await msUSD.accrueInterest()

      // then
      const totalCredit = await msUSD.totalSupply()
      const totalDebt = await msUSDDebt.totalSupply()
      const debtOfUser = await msUSDDebt.balanceOf(user.address)
      const creditOfUser = await msUSD.balanceOf(user.address)
      const creditOfTreasury = await msUSD.balanceOf(treasury.address)
      expect(totalDebt).closeTo(parseEther('110'), parseEther('0.01'))
      expect(totalCredit).eq(totalDebt)
      expect(totalDebt).closeTo(debtOfUser, parseEther('0.000001'))
      expect(creditOfUser).eq(principal)
      expect(totalCredit).eq(creditOfUser.add(creditOfTreasury))
    })
  })
})
