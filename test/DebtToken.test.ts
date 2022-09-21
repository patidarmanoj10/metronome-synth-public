/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable camelcase */
import {parseEther} from '@ethersproject/units'
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import chai, {expect} from 'chai'
import {ethers} from 'hardhat'
import {
  DebtToken,
  DebtToken__factory,
  DepositToken,
  DepositToken__factory,
  ERC20Mock,
  ERC20Mock__factory,
  MasterOracleMock,
  MasterOracleMock__factory,
  PoolMock,
  PoolMock__factory,
  SyntheticToken,
  SyntheticToken__factory,
} from '../typechain'
import {impersonateAccount, increaseTime, setEtherBalance} from './helpers'
import {FakeContract, MockContract, smock} from '@defi-wonderland/smock'
import {BigNumber} from 'ethers'
import {toUSD} from '../helpers'

chai.use(smock.matchers)

const {MaxUint256} = ethers.constants

let SECONDS_PER_YEAR: BigNumber

describe('DebtToken', function () {
  let deployer: SignerWithAddress
  let governor: SignerWithAddress
  let user1: SignerWithAddress
  let user2: SignerWithAddress
  let treasury: SignerWithAddress
  let poolRegistryMock: FakeContract
  let poolMock: MockContract
  let msUSD: SyntheticToken
  let met: ERC20Mock
  let msdMET: DepositToken
  let msUSDDebt: DebtToken
  let msUSDWallet: SignerWithAddress
  let masterOracleMock: MasterOracleMock
  let rewardsDistributorMock: MockContract

  const metCR = parseEther('0.5') // 50%
  const name = 'msETH Debt'
  const symbol = 'msETH-Debt'
  const interestRate = parseEther('0')

  beforeEach(async function () {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[deployer, governor, user1, user2, treasury] = await ethers.getSigners()

    poolRegistryMock = await smock.fake('PoolRegistry')

    const syntheticTokenFactory = new SyntheticToken__factory(deployer)
    msUSD = await syntheticTokenFactory.deploy()
    await msUSD.deployed()
    msUSDWallet = await impersonateAccount(msUSD.address)

    const masterOracleMockFactory = new MasterOracleMock__factory(deployer)
    masterOracleMock = await masterOracleMockFactory.deploy()
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

    const poolMockFactory = await smock.mock('PoolMock')
    poolMock = await poolMockFactory.deploy(msdMET.address, masterOracleMock.address, msUSD.address, msUSDDebt.address)
    await poolMock.deployed()
    await poolMock.updateTreasury(treasury.address)
    await setEtherBalance(poolMock.address, parseEther('10'))

    await msdMET.initialize(met.address, poolMock.address, 'msdMET', 18, metCR, MaxUint256)
    await msUSD.initialize('Metronome Synth ETH', 'msETH', 18, poolRegistryMock.address)
    await msUSDDebt.initialize(name, symbol, poolMock.address, msUSD.address, interestRate, MaxUint256)

    // eslint-disable-next-line new-cap
    SECONDS_PER_YEAR = await msUSDDebt.SECONDS_PER_YEAR()

    await masterOracleMock.updatePrice(msUSD.address, toUSD('1'))
    await masterOracleMock.updatePrice(msdMET.address, toUSD('1'))

    poolRegistryMock.poolExists.returns((address: string) => address == poolMock.address)
    poolRegistryMock.governor.returns(governor.address)

    const rewardsDistributorMockFactory = await smock.mock('RewardsDistributor')
    rewardsDistributorMock = await rewardsDistributorMockFactory.deploy()
    rewardsDistributorMock.pool.returns(poolMock.address)

    poolMock.getRewardsDistributors.returns([rewardsDistributorMock.address])
  })

  it('default values', async function () {
    expect(await msUSDDebt.totalSupply()).eq(0)
    expect(await msUSDDebt.name()).eq(name)
    expect(await msUSDDebt.symbol()).eq(symbol)
    expect(await msUSDDebt.decimals()).eq(18)
  })

  describe('issue', function () {
    const depositAmount = parseEther('100')

    beforeEach(async function () {
      await met.mint(user1.address, parseEther('1000'))
      await met.connect(user1).approve(msdMET.address, ethers.constants.MaxUint256)
      await msdMET.connect(user1).deposit(depositAmount, user1.address)
    })

    it('should not revert if paused', async function () {
      // given
      await poolMock.pause()

      // when
      const toIssue = parseEther('0.1')
      const tx = msUSDDebt.connect(user1).issue(toIssue, user1.address)

      // then
      await expect(tx).emit(msUSDDebt, 'SyntheticTokenIssued')
    })

    it('should revert if shutdown', async function () {
      // given
      await poolMock.shutdown()

      // when
      const toIssue = parseEther('0.1')
      const tx = msUSDDebt.connect(user1).issue(toIssue, user1.address)

      // then
      await expect(tx).revertedWith('shutdown')
    })

    it('should revert if synthetic does not exist', async function () {
      // given
      const syntheticTokenFactory = new SyntheticToken__factory(deployer)
      const notListedSynthetic = await syntheticTokenFactory.deploy()
      await notListedSynthetic.deployed()
      await notListedSynthetic.initialize(name, symbol, 18, poolMock.address)

      const debtTokenFactory = new DebtToken__factory(deployer)
      const notListedDebtToken = await debtTokenFactory.deploy()
      await notListedDebtToken.deployed()
      await notListedDebtToken.initialize(
        name,
        symbol,
        poolMock.address,
        notListedSynthetic.address,
        interestRate,
        MaxUint256
      )

      // when
      const toIssue = parseEther('1')
      const tx = notListedDebtToken.issue(toIssue, user1.address)

      // then
      await expect(tx).revertedWith('synthetic-inexistent')
    })

    it('should revert if synthetic is not active', async function () {
      // given
      await msUSD.connect(governor).toggleIsActive()

      // when
      const toIssue = parseEther('1')
      const tx = msUSDDebt.connect(user1).issue(toIssue, user1.address)

      // then
      await expect(tx).revertedWith('synthetic-inactive')
    })

    it('should revert if synthetic is inactive', async function () {
      // given
      await msUSDDebt.toggleIsActive()

      // when
      const toIssue = parseEther('1')
      const tx = msUSDDebt.connect(user1).issue(toIssue, user1.address)

      // then
      await expect(tx).revertedWith('debt-token-inactive')
    })

    it('should revert if user1 has not enough collateral deposited', async function () {
      // when
      const toIssue = parseEther('1000000000000000')
      const tx = msUSDDebt.connect(user1).issue(toIssue, user1.address)

      // then
      await expect(tx).revertedWith('not-enough-collateral')
    })

    it('should revert if amount to issue is 0', async function () {
      // when
      const toIssue = 0
      const tx = msUSDDebt.connect(user1).issue(toIssue, user1.address)

      // then
      await expect(tx).revertedWith('amount-is-zero')
    })

    it('should revert if new debt < debt floor', async function () {
      // given
      await poolMock.updateDebtFloor(parseEther('10000')) // $10,000

      // when
      const toIssue = parseEther('1') // $4,000
      const tx = msUSDDebt.connect(user1).issue(toIssue, user1.address)

      // then
      await expect(tx).revertedWith('debt-lt-floor')
    })

    it('should issue msAsset (issueFee == 0)', async function () {
      // when
      const toIssue = parseEther('1')
      const tx = () => msUSDDebt.connect(user1).issue(toIssue, user1.address)

      // then
      await expect(tx).changeTokenBalances(msUSDDebt, [user1], [toIssue])

      // Note: the calls below will make additional transfers
      await expect(tx).changeTokenBalances(msUSDDebt, [user1], [toIssue])
      await expect(tx).changeTokenBalances(met, [poolMock], [0])
      await expect(tx()).emit(msUSDDebt, 'SyntheticTokenIssued').withArgs(user1.address, user1.address, toIssue, 0)
    })

    it('should issue msAsset (issueFee > 0)', async function () {
      // given
      const issueFee = parseEther('0.1') // 10%
      await poolMock.updateIssueFee(issueFee)

      // when
      const amount = parseEther('1')
      const expectedFee = amount.mul(issueFee).div(parseEther('1'))
      const expectedAmountAfterFee = amount.sub(expectedFee)
      const tx = () => msUSDDebt.connect(user1).issue(amount, user1.address)
      await expect(tx).changeTokenBalances(msUSD, [user1, treasury], [expectedAmountAfterFee, expectedFee])

      // then
      // Note: the calls below will make additional transfers
      // See: https://github.com/EthWorks/Waffle/issues/569
      await expect(tx).changeTokenBalances(msUSDDebt, [user1], [amount])
      await expect(tx())
        .emit(msUSDDebt, 'SyntheticTokenIssued')
        .withArgs(user1.address, user1.address, amount, expectedFee)
    })

    it('should issue max issuable amount (issueFee == 0)', async function () {
      const {_issuableInUsd} = await poolMock.debtPositionOf(user1.address)
      const amount = await masterOracleMock.quoteUsdToToken(msUSD.address, _issuableInUsd)
      const tx = msUSDDebt.connect(user1).issue(amount, user1.address)
      await expect(tx).emit(msUSDDebt, 'SyntheticTokenIssued').withArgs(user1.address, user1.address, amount, 0)
    })

    it('should issue max issuable amount (issueFee > 0)', async function () {
      // given
      const issueFee = parseEther('0.1') // 10%
      await poolMock.updateIssueFee(issueFee)

      const {_issuableInUsd} = await poolMock.debtPositionOf(user1.address)
      const amount = await masterOracleMock.quoteUsdToToken(msUSD.address, _issuableInUsd)
      const expectedFee = amount.mul(issueFee).div(parseEther('1'))
      const tx = msUSDDebt.connect(user1).issue(amount, user1.address)
      await expect(tx)
        .emit(msUSDDebt, 'SyntheticTokenIssued')
        .withArgs(user1.address, user1.address, amount, expectedFee)
    })

    describe('when user1 minted some msETH', function () {
      const userMintAmount = parseEther('1')

      beforeEach(async function () {
        await msUSDDebt.connect(user1).issue(userMintAmount, user1.address)
      })

      describe('repay', function () {
        it('should not revert if paused', async function () {
          // given
          await poolMock.pause()
          const amount = await msUSDDebt.balanceOf(user1.address)

          // when
          const tx = msUSDDebt.connect(user1).repay(user1.address, amount)

          // then
          await expect(tx).emit(msUSDDebt, 'DebtRepaid')
        })

        it('should revert if shutdown', async function () {
          // given
          await poolMock.shutdown()
          const amount = await msUSDDebt.balanceOf(user1.address)

          // when
          const tx = msUSDDebt.connect(user1).repay(user1.address, amount)

          // then
          await expect(tx).revertedWith('shutdown')
        })

        it('should revert if amount is 0', async function () {
          // when
          const tx = msUSDDebt.connect(user1).repay(user1.address, 0)

          // then
          await expect(tx).revertedWith('amount-is-zero')
        })

        it('should revert if amount > unlocked collateral amount', async function () {
          // given
          const amount = await msUSDDebt.balanceOf(user1.address)

          // when
          const tx = msUSDDebt.connect(user1).repay(user1.address, amount.add('1'))

          // then
          await expect(tx).revertedWith('burn-amount-exceeds-balance')
        })

        it('should revert if new debt < debt floor', async function () {
          // given
          await poolMock.updateDebtFloor(parseEther('3000')) // $3,000

          const amount = await msUSDDebt.balanceOf(user1.address)
          expect(amount).eq(parseEther('1')) // $4,000

          // when
          const toRepay = amount.div('2') // $2,000
          const tx = msUSDDebt.connect(user1).repay(user1.address, toRepay)

          // then
          await expect(tx).revertedWith('debt-lt-floor')
        })

        it('should allow repay all when debt floor is set', async function () {
          // given
          await poolMock.updateRepayFee(0)
          await poolMock.updateDebtFloor(parseEther('3000')) // $3,000
          const amount = await msUSDDebt.balanceOf(user1.address)

          // when
          await msUSDDebt.connect(user1).repay(user1.address, amount)

          // then
          const debtAfter = await poolMock.debtOf(user1.address)
          expect(debtAfter).eq(0)
        })

        it('should repay if amount == debt (repayFee == 0)', async function () {
          // given
          await poolMock.updateRepayFee(0)
          const lockedCollateralBefore = await msdMET.lockedBalanceOf(user1.address)
          expect(lockedCollateralBefore).gt(0)

          // when
          const amount = await msUSDDebt.balanceOf(user1.address)
          const tx = msUSDDebt.connect(user1).repay(user1.address, amount)
          await expect(tx).emit(msUSDDebt, 'DebtRepaid').withArgs(user1.address, user1.address, amount, 0)

          // then
          expect(await msUSDDebt.balanceOf(user1.address)).eq(0)
          const lockedCollateralAfter = await msdMET.lockedBalanceOf(user1.address)
          expect(lockedCollateralAfter).eq(0)
        })

        it('should repay if amount < debt (repayFee == 0)', async function () {
          // given
          await poolMock.updateRepayFee(0)
          const lockedCollateralBefore = await msdMET.lockedBalanceOf(user1.address)
          expect(lockedCollateralBefore).gt(0)

          // when
          const amount = (await msUSDDebt.balanceOf(user1.address)).div('2')
          const tx = msUSDDebt.connect(user1).repay(user1.address, amount)
          await expect(tx).emit(msUSDDebt, 'DebtRepaid').withArgs(user1.address, user1.address, amount, 0)

          // then
          expect(await msUSDDebt.balanceOf(user1.address)).eq(amount)
          const lockedDepositAfter = await msdMET.lockedBalanceOf(user1.address)
          expect(lockedDepositAfter).eq(lockedCollateralBefore.div('2'))
        })

        it('should repay if amount == debt (repayFee > 0)', async function () {
          // given
          const repayFee = parseEther('0.1') // 10%
          await poolMock.updateRepayFee(repayFee)
          const {_debtInUsd: debtInUsdBefore} = await poolMock.debtPositionOf(user1.address)
          const msUsdBefore = await msUSD.balanceOf(user1.address)
          expect(msUsdBefore).eq(debtInUsdBefore)

          // when
          const amount = msUsdBefore
          const debtToErase = amount.mul(parseEther('1')).div(parseEther('1').add(repayFee))
          const expectedFee = amount.sub(debtToErase).sub(1)
          const tx = msUSDDebt.connect(user1).repay(user1.address, amount)
          await expect(tx).emit(msUSDDebt, 'DebtRepaid').withArgs(user1.address, user1.address, amount, expectedFee)

          // then
          expect(await msUSD.balanceOf(user1.address)).eq(0)
          const {_debtInUsd: debtInUsdAfter} = await poolMock.debtPositionOf(user1.address)
          expect(debtInUsdAfter).eq(expectedFee)
        })

        it('should repay if amount < debt (repayFee > 0)', async function () {
          // given
          const repayFee = parseEther('0.1') // 10%
          await poolMock.updateRepayFee(repayFee)
          const {_debtInUsd: debtInUsdBefore} = await poolMock.debtPositionOf(user1.address)
          const msUsdBefore = await msUSDDebt.balanceOf(user1.address)
          expect(msUsdBefore).eq(debtInUsdBefore)

          // when
          const halfBalance = msUsdBefore.div('2')
          const amount = halfBalance
          const debtToErase = amount.mul(parseEther('1')).div(parseEther('1').add(repayFee))
          const expectedFee = amount.sub(debtToErase)
          const tx = msUSDDebt.connect(user1).repay(user1.address, amount)
          await expect(tx).emit(msUSDDebt, 'DebtRepaid').withArgs(user1.address, user1.address, amount, expectedFee)

          // then
          const msUsdAfter = await msUSD.balanceOf(user1.address)
          expect(msUsdAfter).eq(halfBalance)
          const {_debtInUsd: debtInUsdAfter} = await poolMock.debtPositionOf(user1.address)
          expect(debtInUsdAfter).eq(halfBalance.add(expectedFee))
        })

        it('should repay all debt (repayFee > 0)', async function () {
          // given
          const repayFee = parseEther('0.1') // 10%
          await poolMock.updateRepayFee(repayFee)

          await met.mint(user2.address, parseEther('1000'))
          await met.connect(user2).approve(msdMET.address, ethers.constants.MaxUint256)
          await msdMET.connect(user2).deposit(depositAmount, user2.address)
          await msUSDDebt.connect(user2).issue(parseEther('1'), user1.address)

          const {_debtInUsd: debtBefore} = await poolMock.debtPositionOf(user1.address)
          expect(debtBefore).gt(0)

          // when
          const amount = debtBefore.mul(parseEther('1').add(repayFee)).div(parseEther('1'))
          await msUSDDebt.connect(user1).repay(user1.address, amount)

          // then
          const {_debtInUsd: debtAfter} = await poolMock.debtPositionOf(user1.address)
          expect(debtAfter).eq(0)
        })
      })
    })
  })

  describe('mint', function () {
    it('should mint', async function () {
      expect(await msUSDDebt.balanceOf(user1.address)).eq(0)
      const amount = parseEther('100')

      await msUSDDebt.connect(msUSDWallet).mint(user1.address, amount)

      expect(await msUSDDebt.balanceOf(user1.address)).eq(amount)
    })

    it('should revert if caller is not synthetic token', async function () {
      const tx = msUSDDebt.connect(user1).mint(user1.address, parseEther('10'))
      await expect(tx).revertedWith('not-synthetic-token')
    })

    it('should revert if surpass max total supply', async function () {
      // given
      expect(await msUSDDebt.totalSupply()).eq(0)
      const max = toUSD('100')
      await msUSDDebt.updateMaxTotalSupplyInUsd(max)

      // when
      const tx = msUSDDebt.connect(msUSDWallet).mint(user1.address, max.add('1'))

      // then
      await expect(tx).revertedWith('surpass-max-total-supply')
    })

    it('should not remove address(0) from the users array', async function () {
      // given
      poolMock.removeFromDebtTokensOfAccount.reset()
      expect(await msUSDDebt.balanceOf(user1.address)).eq(0)
      expect(await msUSDDebt.balanceOf(ethers.constants.AddressZero)).eq(0)

      // when
      // Note: Set `gasLimit` prevents messing up the calls counter
      // See more: https://github.com/defi-wonderland/smock/issues/99
      const gasLimit = 250000
      await msUSDDebt.connect(msUSDWallet).mint(user1.address, parseEther('1'), {gasLimit})

      // then
      expect(poolMock.removeFromDebtTokensOfAccount).callCount(0)
    })

    it('should add debt token to user1 array only if balance was 0 before mint', async function () {
      // given
      poolMock.addToDebtTokensOfAccount.reset()
      expect(await msUSDDebt.balanceOf(user1.address)).eq(0)

      // when
      // Note: Set `gasLimit` prevents messing up the calls counter
      // See more: https://github.com/defi-wonderland/smock/issues/99
      const gasLimit = 250000
      await msUSDDebt.connect(msUSDWallet).mint(user1.address, parseEther('1'), {gasLimit})
      await msUSDDebt.connect(msUSDWallet).mint(user1.address, parseEther('1'), {gasLimit})
      await msUSDDebt.connect(msUSDWallet).mint(user1.address, parseEther('1'), {gasLimit})

      // then
      expect(poolMock.addToDebtTokensOfAccount).callCount(1)
    })

    it('should trigger rewards update', async function () {
      // given
      rewardsDistributorMock.updateBeforeMintOrBurn.reset()

      // when
      await msUSDDebt.connect(msUSDWallet).mint(user1.address, parseEther('1'))

      // then
      // Note: Use `callCount` instead (Refs: https://github.com/defi-wonderland/smock/issues/85)
      expect(rewardsDistributorMock.updateBeforeMintOrBurn).called
      expect(rewardsDistributorMock.updateBeforeMintOrBurn.getCall(0).args[1]).eq(user1.address)
    })
  })

  describe('when some token was minted', function () {
    const amount = parseEther('100')

    beforeEach('should mint', async function () {
      await msUSDDebt.connect(msUSDWallet).mint(user1.address, amount)
    })

    describe('burn', function () {
      it('should burn', async function () {
        expect(await msUSDDebt.balanceOf(user1.address)).eq(amount)

        await msUSDDebt.connect(poolMock.wallet).burn(user1.address, amount)

        expect(await msUSDDebt.balanceOf(user1.address)).eq(0)
      })

      it('should revert if not authorized', async function () {
        const tx = msUSDDebt.connect(user1).burn(user1.address, parseEther('10'))
        await expect(tx).revertedWith('not-pool')
      })

      it('should not add address(0) to the users array', async function () {
        // given
        poolMock.addToDebtTokensOfAccount.reset()
        expect(await msUSDDebt.balanceOf(user1.address)).eq(amount)
        expect(await msUSDDebt.balanceOf(ethers.constants.AddressZero)).eq(0)

        // when
        // Note: Set `gasLimit` prevents messing up the calls counter
        // See more: https://github.com/defi-wonderland/smock/issues/99
        const gasLimit = 250000
        await msUSDDebt.connect(poolMock.wallet).burn(user1.address, amount, {gasLimit})

        // then
        expect(poolMock.addToDebtTokensOfAccount).callCount(0)
      })

      it('should remove debt token from user1 array only if burning all', async function () {
        // given
        // poolMock.removeFromDebtTokensOfAccount.reset()
        expect(await msUSDDebt.balanceOf(user1.address)).eq(amount)

        // when
        // Note: Set `gasLimit` prevents messing up the calls counter
        // See more: https://github.com/defi-wonderland/smock/issues/99
        const gasLimit = 250000
        await msUSDDebt.connect(poolMock.wallet).burn(user1.address, amount.div('4'), {gasLimit})
        await msUSDDebt.connect(poolMock.wallet).burn(user1.address, amount.div('4'), {gasLimit})
        await msUSDDebt.connect(poolMock.wallet).burn(user1.address, amount.div('4'), {gasLimit})
        await msUSDDebt.connect(poolMock.wallet).burn(user1.address, amount.div('4'), {gasLimit})

        // then
        expect(await msUSDDebt.balanceOf(user1.address)).eq(0)
        expect(poolMock.removeFromDebtTokensOfAccount).callCount(1)
      })

      it('should trigger rewards update', async function () {
        // given
        rewardsDistributorMock.updateBeforeMintOrBurn.reset()

        // when
        await msUSDDebt.connect(poolMock.wallet).burn(user1.address, amount)

        // then
        // Note: Use `callCount` instead (Refs: https://github.com/defi-wonderland/smock/issues/85)
        expect(rewardsDistributorMock.updateBeforeMintOrBurn).called
        expect(rewardsDistributorMock.updateBeforeMintOrBurn.getCall(0).args[1]).eq(user1.address)
      })
    })

    describe('transfer', function () {
      it('should revert when transferring', async function () {
        const tx = msUSDDebt.transfer(user2.address, parseEther('1'))
        await expect(tx).revertedWith('transfer-not-supported')
      })
    })

    describe('transferFrom', function () {
      it('should revert when transferring', async function () {
        const tx = msUSDDebt.connect(user2).transferFrom(user1.address, user2.address, parseEther('1'))
        await expect(tx).revertedWith('transfer-not-supported')
      })
    })
  })

  describe('balanceOf & totalSupply - get updated values without calling accrueInterest()', function () {
    const principal = parseEther('100')

    beforeEach(async function () {
      // given
      await msUSDDebt.connect(msUSDWallet).mint(user1.address, principal)
    })

    it('should get updated balance', async function () {
      // when
      await msUSDDebt.updateInterestRate(parseEther('0.02')) // 2%

      await increaseTime(SECONDS_PER_YEAR)

      // then
      const debtOfUser = await msUSDDebt.balanceOf(user1.address)
      const totalDebt = await msUSDDebt.totalSupply()

      expect(debtOfUser).closeTo(parseEther('102'), parseEther('0.0001'))
      expect(totalDebt).eq(debtOfUser)
    })

    it('should not accrue interest if rate is 0', async function () {
      expect(await msUSDDebt.interestRate()).eq(0)

      // when
      await increaseTime(SECONDS_PER_YEAR)

      // then
      const debtOfUser = await msUSDDebt.balanceOf(user1.address)
      const totalDebt = await msUSDDebt.totalSupply()

      expect(debtOfUser).eq(principal)
      expect(totalDebt).eq(debtOfUser)
    })

    it('should accrue interest after changing interest rate', async function () {
      // when
      // 1st year 10% interest + 2nd year 50% interest
      await msUSDDebt.updateInterestRate(parseEther('0.1')) // 10%
      await increaseTime(SECONDS_PER_YEAR)

      await msUSDDebt.updateInterestRate(parseEther('0.5')) // 50%
      await increaseTime(SECONDS_PER_YEAR)

      // then
      const debtOfUser = await msUSDDebt.balanceOf(user1.address)
      const totalDebt = await msUSDDebt.totalSupply()
      expect(debtOfUser).closeTo(parseEther('165'), parseEther('0.001'))
      expect(totalDebt).closeTo(debtOfUser, parseEther('0.00000001'))
    })

    it('should stop accruing interest after changing interest rate to 0', async function () {
      // when
      // 1st year 10% interest + 2nd year 0% interest
      await msUSDDebt.updateInterestRate(parseEther('0.1')) // 10%

      await increaseTime(SECONDS_PER_YEAR)

      await msUSDDebt.updateInterestRate(parseEther('0'))

      await increaseTime(SECONDS_PER_YEAR)

      // then
      const debtOfUser = await msUSDDebt.balanceOf(user1.address)
      const totalDebt = await msUSDDebt.totalSupply()

      expect(debtOfUser).closeTo(parseEther('110'), parseEther('0.1'))
      expect(totalDebt).eq(debtOfUser)
    })
  })

  describe('accrueInterest', function () {
    const principal = parseEther('100')

    beforeEach(async function () {
      // given
      await msUSDDebt.connect(msUSDWallet).mint(user1.address, principal)
    })

    it('should accrue interest', async function () {
      // when
      await msUSDDebt.updateInterestRate(parseEther('0.02')) // 2%
      await increaseTime(SECONDS_PER_YEAR)
      await msUSDDebt.accrueInterest()

      // then
      const totalDebt = await msUSDDebt.totalSupply()
      expect(totalDebt).closeTo(parseEther('102'), parseEther('0.0001'))
    })

    it('should not accrue interest if rate is 0', async function () {
      // given
      expect(await msUSDDebt.interestRate()).eq(0)

      // when
      await increaseTime(SECONDS_PER_YEAR)
      await msUSDDebt.accrueInterest()

      // then
      const totalDebt = await msUSDDebt.totalSupply()
      expect(totalDebt).eq(principal)
    })

    it('should accrue interest after changing interest rate', async function () {
      // when
      // 1st year 10% interest + 2nd year 50% interest
      await msUSDDebt.updateInterestRate(parseEther('0.1')) // 10%
      await increaseTime(SECONDS_PER_YEAR)
      await msUSDDebt.accrueInterest()

      await msUSDDebt.updateInterestRate(parseEther('0.5')) // 50%
      await increaseTime(SECONDS_PER_YEAR)
      await msUSDDebt.accrueInterest()

      // then
      const totalDebt = await msUSDDebt.totalSupply()
      expect(totalDebt).closeTo(parseEther('165'), parseEther('0.001'))
    })

    it('should stop accruing interest after changing interest rate to 0', async function () {
      // when
      // 1st year 10% interest + 2nd year 0% interest
      await msUSDDebt.updateInterestRate(parseEther('0.1')) // 10%
      await increaseTime(SECONDS_PER_YEAR)
      await msUSDDebt.accrueInterest()

      await msUSDDebt.updateInterestRate(parseEther('0'))
      await increaseTime(SECONDS_PER_YEAR)
      await msUSDDebt.accrueInterest()

      // then
      const totalDebt = await msUSDDebt.totalSupply()
      expect(totalDebt).closeTo(parseEther('110'), parseEther('0.1'))
    })

    it('should not accrue interest backwards after changing interest rate from 0', async function () {
      // given
      expect(await msUSDDebt.interestRate()).eq(0)

      // when
      // 1st year 0% interest + 2nd year 10% interest
      await increaseTime(SECONDS_PER_YEAR)
      await msUSDDebt.accrueInterest()

      await msUSDDebt.updateInterestRate(parseEther('0.1')) // 10%
      await increaseTime(SECONDS_PER_YEAR)
      await msUSDDebt.accrueInterest()

      // then
      const totalDebt = await msUSDDebt.totalSupply()
      expect(totalDebt).closeTo(parseEther('110'), parseEther('0.1'))
    })
  })

  describe('updateMaxTotalSupplyInUsd', function () {
    it('should update collateralization ratio', async function () {
      const before = await msUSDDebt.maxTotalSupplyInUsd()
      const after = before.div('2')
      const tx = msUSDDebt.updateMaxTotalSupplyInUsd(after)
      await expect(tx).emit(msUSDDebt, 'MaxTotalSupplyUpdated').withArgs(before, after)
      expect(await msUSDDebt.maxTotalSupplyInUsd()).eq(after)
    })

    it('should revert if using the current value', async function () {
      const currentMaxTotalSupplyInUsd = await msUSDDebt.maxTotalSupplyInUsd()
      const tx = msUSDDebt.updateMaxTotalSupplyInUsd(currentMaxTotalSupplyInUsd)
      await expect(tx).revertedWith('new-same-as-current')
    })

    it('should revert if not governor', async function () {
      const tx = msUSDDebt.connect(user1).updateMaxTotalSupplyInUsd(parseEther('10'))
      await expect(tx).revertedWith('not-governor')
    })
  })

  describe('updateInterestRate', function () {
    it('should update interest rate', async function () {
      const before = await msUSDDebt.interestRate()
      const after = parseEther('0.5')
      const tx = msUSDDebt.updateInterestRate(after)
      await expect(tx).emit(msUSDDebt, 'InterestRateUpdated').withArgs(before, after)
      expect(await msUSDDebt.interestRate()).eq(after)
    })

    it('should revert if using the current value', async function () {
      const currentInterestRate = await msUSDDebt.interestRate()
      const tx = msUSDDebt.updateInterestRate(currentInterestRate)
      await expect(tx).revertedWith('new-same-as-current')
    })

    it('should revert if not governor', async function () {
      const tx = msUSDDebt.connect(user1).updateInterestRate(parseEther('0.12'))
      await expect(tx).revertedWith('not-governor')
    })
  })

  describe('acrueInterest', function () {
    it('should mint accrued fee to treasury', async function () {
      // given
      const principal = parseEther('100')
      await msUSDDebt.updateInterestRate(parseEther('0.1')) // 10%
      await msUSD.connect(poolMock.wallet).mint(user1.address, principal)
      await msUSDDebt.connect(msUSDWallet).mint(user1.address, principal)
      await increaseTime(SECONDS_PER_YEAR)

      // when
      await msUSDDebt.accrueInterest()

      // then
      const totalCredit = await msUSD.totalSupply()
      const totalDebt = await msUSDDebt.totalSupply()
      const debtOfUser = await msUSDDebt.balanceOf(user1.address)
      const creditOfUser = await msUSD.balanceOf(user1.address)
      const creditOfTreasury = await msUSD.balanceOf(treasury.address)
      expect(totalDebt).closeTo(parseEther('110'), parseEther('0.01'))
      expect(totalCredit).eq(totalDebt)
      expect(totalDebt).closeTo(debtOfUser, parseEther('0.000001'))
      expect(creditOfUser).eq(principal)
      expect(totalCredit).eq(creditOfUser.add(creditOfTreasury))
    })
  })
})
