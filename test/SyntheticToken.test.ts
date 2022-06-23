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
  ControllerMock,
  ControllerMock__factory,
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
  let controllerMock: ControllerMock
  let met: ERC20Mock
  let vsdMET: DepositToken
  let vsUSD: SyntheticToken
  let vsUSDDebt: DebtToken
  let masterOracleMock: MasterOracleMock

  const metCR = parseEther('0.5') // 50%
  const name = 'Vesper Synth ETH'
  const symbol = 'vsETH'
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
    vsdMET = await depositTokenFactory.deploy()
    await vsdMET.deployed()

    const debtTokenFactory = new DebtToken__factory(deployer)
    vsUSDDebt = await debtTokenFactory.deploy()
    await vsUSDDebt.deployed()

    const syntheticTokenFactory = new SyntheticToken__factory(deployer)
    vsUSD = await syntheticTokenFactory.deploy()
    await vsUSD.deployed()

    const controllerMockFactory = new ControllerMock__factory(deployer)
    controllerMock = await controllerMockFactory.deploy(vsdMET.address, masterOracleMock.address, vsUSD.address)
    await controllerMock.deployed()
    await controllerMock.transferGovernorship(governor.address)

    // Initializations & Setup
    await controllerMock.updateTreasury(treasury.address)

    await vsdMET.initialize(met.address, controllerMock.address, 'vsdMET', 18, metCR, MaxUint256)
    await vsUSD.initialize(name, symbol, 18, controllerMock.address, vsUSDDebt.address, interestRate, MaxUint256)
    await vsUSDDebt.initialize('vsUSD Debt', 'vsUSD-Debt', 18, controllerMock.address)
    await vsUSDDebt.setSyntheticToken(vsUSD.address)

    await masterOracleMock.updatePrice(vsUSD.address, toUSD('1')) // 1 vsAsset = $1
    await masterOracleMock.updatePrice(vsdMET.address, toUSD('1')) // 1 collateralToken = $1
  })

  it('default values', async function () {
    expect(await vsUSD.totalSupply()).eq(0)
    expect(await vsUSD.name()).eq(name)
    expect(await vsUSD.symbol()).eq(symbol)
    expect(await vsUSD.decimals()).eq(18)
  })

  describe('issue', function () {
    const depositAmount = parseEther('100')

    beforeEach(async function () {
      await met.mint(user.address, parseEther('1000'))
      await met.connect(user).approve(vsdMET.address, ethers.constants.MaxUint256)
      await vsdMET.connect(user).deposit(depositAmount, user.address)
    })

    it('should not revert if paused', async function () {
      // given
      await controllerMock.pause()

      // when
      const toIssue = parseEther('0.1')
      const tx = vsUSD.connect(user).issue(toIssue, user.address)

      // then
      await expect(tx).emit(vsUSD, 'SyntheticTokenIssued')
    })

    it('should revert if shutdown', async function () {
      // given
      await controllerMock.shutdown()

      // when
      const toIssue = parseEther('0.1')
      const tx = vsUSD.connect(user).issue(toIssue, user.address)

      // then
      await expect(tx).revertedWith('shutdown')
    })

    it('should revert if synthetic does not exist', async function () {
      // given
      const syntheticTokenFactory = new SyntheticToken__factory(deployer)
      const notListedSynthetic = await syntheticTokenFactory.deploy()
      await notListedSynthetic.deployed()
      await notListedSynthetic.initialize(
        name,
        symbol,
        18,
        controllerMock.address,
        vsUSDDebt.address,
        interestRate,
        MaxUint256
      )

      // when
      const toIssue = parseEther('1')
      const tx = notListedSynthetic.issue(toIssue, user.address)

      // then
      await expect(tx).revertedWith('synthetic-inexistent')
    })

    it('should revert if synthetic is not active', async function () {
      // given
      await vsUSD.toggleIsActive()

      // when
      const toIssue = parseEther('1')
      const tx = vsUSD.connect(user).issue(toIssue, user.address)

      // then
      await expect(tx).revertedWith('synthetic-inactive')
    })

    it('should revert if user has not enough collateral deposited', async function () {
      // when
      const toIssue = parseEther('1000000000000000')
      const tx = vsUSD.connect(user).issue(toIssue, user.address)

      // then
      await expect(tx).revertedWith('not-enough-collateral')
    })

    it('should revert if amount to issue is 0', async function () {
      // when
      const toIssue = 0
      const tx = vsUSD.connect(user).issue(toIssue, user.address)

      // then
      await expect(tx).revertedWith('amount-is-zero')
    })

    it('should revert if new debt < debt floor', async function () {
      // given
      await controllerMock.updateDebtFloor(parseEther('10000')) // $10,000

      // when
      const toIssue = parseEther('1') // $4,000
      const tx = vsUSD.connect(user).issue(toIssue, user.address)

      // then
      await expect(tx).revertedWith('debt-lt-floor')
    })

    it('should issue vsAsset (issueFee == 0)', async function () {
      // when
      const toIssue = parseEther('1')
      const tx = () => vsUSD.connect(user).issue(toIssue, user.address)

      // then
      await expect(tx).changeTokenBalances(vsUSD, [user], [toIssue])

      // Note: the calls below will make additional transfers
      await expect(tx).changeTokenBalances(vsUSDDebt, [user], [toIssue])
      await expect(tx).changeTokenBalances(met, [controllerMock], [0])
      await expect(tx()).emit(vsUSD, 'SyntheticTokenIssued').withArgs(user.address, user.address, toIssue, 0)
    })

    it('should issue vsAsset (issueFee > 0)', async function () {
      // given
      const issueFee = parseEther('0.1') // 10%
      await controllerMock.updateIssueFee(issueFee)

      // when
      const amount = parseEther('1')
      const expectedFee = amount.mul(issueFee).div(parseEther('1'))
      const expectedAmountAfterFee = amount.sub(expectedFee)
      const tx = () => vsUSD.connect(user).issue(amount, user.address)
      await expect(tx).changeTokenBalances(vsUSD, [user, treasury], [expectedAmountAfterFee, expectedFee])

      // then
      // Note: the calls below will make additional transfers
      // See: https://github.com/EthWorks/Waffle/issues/569
      await expect(tx).changeTokenBalances(vsUSDDebt, [user], [amount])
      await expect(tx()).emit(vsUSD, 'SyntheticTokenIssued').withArgs(user.address, user.address, amount, expectedFee)
    })

    it('should issue max issuable amount (issueFee == 0)', async function () {
      const {_issuableInUsd} = await controllerMock.debtPositionOf(user.address)
      const amount = await masterOracleMock.quoteUsdToToken(vsUSD.address, _issuableInUsd)
      const tx = vsUSD.connect(user).issue(amount, user.address)
      await expect(tx).emit(vsUSD, 'SyntheticTokenIssued').withArgs(user.address, user.address, amount, 0)
    })

    it('should issue max issuable amount (issueFee > 0)', async function () {
      // given
      const issueFee = parseEther('0.1') // 10%
      await controllerMock.updateIssueFee(issueFee)

      const {_issuableInUsd} = await controllerMock.debtPositionOf(user.address)
      const amount = await masterOracleMock.quoteUsdToToken(vsUSD.address, _issuableInUsd)
      const expectedFee = amount.mul(issueFee).div(parseEther('1'))
      const tx = vsUSD.connect(user).issue(amount, user.address)
      await expect(tx).emit(vsUSD, 'SyntheticTokenIssued').withArgs(user.address, user.address, amount, expectedFee)
    })

    describe('when user minted some vsETH', function () {
      const userMintAmount = parseEther('1')

      beforeEach(async function () {
        await vsUSD.connect(user).issue(userMintAmount, user.address)
      })

      describe('repay', function () {
        it('should not revert if paused', async function () {
          // given
          await controllerMock.pause()
          const amount = await vsUSD.balanceOf(user.address)

          // when
          const tx = vsUSD.connect(user).repay(user.address, amount)

          // then
          await expect(tx).emit(vsUSD, 'DebtRepaid')
        })

        it('should revert if shutdown', async function () {
          // given
          await controllerMock.shutdown()
          const amount = await vsUSD.balanceOf(user.address)

          // when
          const tx = vsUSD.connect(user).repay(user.address, amount)

          // then
          await expect(tx).revertedWith('shutdown')
        })

        it('should revert if amount is 0', async function () {
          // when
          const tx = vsUSD.connect(user).repay(user.address, 0)

          // then
          await expect(tx).revertedWith('amount-is-zero')
        })

        it('should revert if amount > unlocked collateral amount', async function () {
          // given
          const amount = await vsUSD.balanceOf(user.address)

          // when
          const tx = vsUSD.connect(user).repay(user.address, amount.add('1'))

          // then
          await expect(tx).revertedWith('burn-amount-exceeds-balance')
        })

        it('should revert if new debt < debt floor', async function () {
          // given
          await controllerMock.updateDebtFloor(parseEther('3000')) // $3,000

          const amount = await vsUSD.balanceOf(user.address)
          expect(amount).eq(parseEther('1')) // $4,000

          // when
          const toRepay = amount.div('2') // $2,000
          const tx = vsUSD.connect(user).repay(user.address, toRepay)

          // then
          await expect(tx).revertedWith('debt-lt-floor')
        })

        it('should allow repay all when debt floor is set', async function () {
          // given
          await controllerMock.updateRepayFee(0)
          await controllerMock.updateDebtFloor(parseEther('3000')) // $3,000
          const amount = await vsUSD.balanceOf(user.address)

          // when
          await vsUSD.connect(user).repay(user.address, amount)

          // then
          const debtAfter = await controllerMock.debtOf(user.address)
          expect(debtAfter).eq(0)
        })

        it('should repay if amount == debt (repayFee == 0)', async function () {
          // given
          await controllerMock.updateRepayFee(0)
          const lockedCollateralBefore = await vsdMET.lockedBalanceOf(user.address)
          expect(lockedCollateralBefore).gt(0)

          // when
          const amount = await vsUSD.balanceOf(user.address)
          const tx = vsUSD.connect(user).repay(user.address, amount)
          await expect(tx).emit(vsUSD, 'DebtRepaid').withArgs(user.address, user.address, amount, 0)

          // then
          expect(await vsUSD.balanceOf(user.address)).eq(0)
          const lockedCollateralAfter = await vsdMET.lockedBalanceOf(user.address)
          expect(lockedCollateralAfter).eq(0)
        })

        it('should repay if amount < debt (repayFee == 0)', async function () {
          // given
          await controllerMock.updateRepayFee(0)
          const lockedCollateralBefore = await vsdMET.lockedBalanceOf(user.address)
          expect(lockedCollateralBefore).gt(0)

          // when
          const amount = (await vsUSD.balanceOf(user.address)).div('2')
          const tx = vsUSD.connect(user).repay(user.address, amount)
          await expect(tx).emit(vsUSD, 'DebtRepaid').withArgs(user.address, user.address, amount, 0)

          // then
          expect(await vsUSD.balanceOf(user.address)).eq(amount)
          const lockedDepositAfter = await vsdMET.lockedBalanceOf(user.address)
          expect(lockedDepositAfter).eq(lockedCollateralBefore.div('2'))
        })

        it('should repay if amount == debt (repayFee > 0)', async function () {
          // given
          const repayFee = parseEther('0.1') // 10%
          await controllerMock.updateRepayFee(repayFee)
          const {_debtInUsd: debtInUsdBefore} = await controllerMock.debtPositionOf(user.address)
          const vsUsdBefore = await vsUSD.balanceOf(user.address)
          expect(vsUsdBefore).eq(debtInUsdBefore)

          // when
          const amount = vsUsdBefore
          const debtToErase = amount.mul(parseEther('1')).div(parseEther('1').add(repayFee))
          const expectedFee = amount.sub(debtToErase).sub(1)
          const tx = vsUSD.connect(user).repay(user.address, amount)
          await expect(tx).emit(vsUSD, 'DebtRepaid').withArgs(user.address, user.address, amount, expectedFee)

          // then
          expect(await vsUSD.balanceOf(user.address)).eq(0)
          const {_debtInUsd: debtInUsdAfter} = await controllerMock.debtPositionOf(user.address)
          expect(debtInUsdAfter).eq(expectedFee)
        })

        it('should repay if amount < debt (repayFee > 0)', async function () {
          // given
          const repayFee = parseEther('0.1') // 10%
          await controllerMock.updateRepayFee(repayFee)
          const {_debtInUsd: debtInUsdBefore} = await controllerMock.debtPositionOf(user.address)
          const vsUsdBefore = await vsUSD.balanceOf(user.address)
          expect(vsUsdBefore).eq(debtInUsdBefore)

          // when
          const halfBalance = vsUsdBefore.div('2')
          const amount = halfBalance
          const debtToErase = amount.mul(parseEther('1')).div(parseEther('1').add(repayFee))
          const expectedFee = amount.sub(debtToErase)
          const tx = vsUSD.connect(user).repay(user.address, amount)
          await expect(tx).emit(vsUSD, 'DebtRepaid').withArgs(user.address, user.address, amount, expectedFee)

          // then
          const vsUsdAfter = await vsUSD.balanceOf(user.address)
          expect(vsUsdAfter).eq(halfBalance)
          const {_debtInUsd: debtInUsdAfter} = await controllerMock.debtPositionOf(user.address)
          expect(debtInUsdAfter).eq(halfBalance.add(expectedFee))
        })

        it('should repay all debt (repayFee > 0)', async function () {
          // given
          const repayFee = parseEther('0.1') // 10%
          await controllerMock.updateRepayFee(repayFee)

          await met.mint(otherUser.address, parseEther('1000'))
          await met.connect(otherUser).approve(vsdMET.address, ethers.constants.MaxUint256)
          await vsdMET.connect(otherUser).deposit(depositAmount, otherUser.address)
          await vsUSD.connect(otherUser).issue(parseEther('1'), user.address)

          const {_debtInUsd: debtBefore} = await controllerMock.debtPositionOf(user.address)
          expect(debtBefore).gt(0)

          // when
          const amount = debtBefore.mul(parseEther('1').add(repayFee)).div(parseEther('1'))
          await vsUSD.connect(user).repay(user.address, amount)

          // then
          const {_debtInUsd: debtAfter} = await controllerMock.debtPositionOf(user.address)
          expect(debtAfter).eq(0)
        })
      })
    })
  })

  describe('mint', function () {
    it('should mint', async function () {
      expect(await vsUSD.balanceOf(user.address)).eq(0)
      const amount = parseEther('100')
      const call = vsUSD.interface.encodeFunctionData('mint', [user.address, amount])
      await controllerMock.mockCall(vsUSD.address, call)
      expect(await vsUSD.balanceOf(user.address)).eq(amount)
    })

    it('should revert if not controller', async function () {
      const tx = vsUSD.connect(user).mint(user.address, parseEther('10'))
      await expect(tx).revertedWith('not-controller')
    })

    it('should revert if surpass max total supply', async function () {
      // given
      expect(await vsUSD.totalSupply()).eq(0)
      const max = toUSD('100')
      await vsUSD.updateMaxTotalSupplyInUsd(max)

      // when
      const call = vsUSD.interface.encodeFunctionData('mint', [user.address, max.add('1')])
      const tx = controllerMock.mockCall(vsUSD.address, call)

      // then
      await expect(tx).revertedWith('surpass-max-total-supply')
    })

    it('should revert if vsAsset is inactive', async function () {
      // given
      await vsUSD.toggleIsActive()

      // when
      const call = vsUSD.interface.encodeFunctionData('mint', [deployer.address, '1'])
      const tx = controllerMock.mockCall(vsUSD.address, call)

      // then
      await expect(tx).revertedWith('synthetic-inactive')
    })
  })

  describe('burn', function () {
    const amount = parseEther('100')

    beforeEach(async function () {
      const call = vsUSD.interface.encodeFunctionData('mint', [user.address, amount])
      await controllerMock.mockCall(vsUSD.address, call)
    })

    it('should burn', async function () {
      expect(await vsUSD.balanceOf(user.address)).eq(amount)

      const call = vsUSD.interface.encodeFunctionData('burn', [user.address, amount])
      await controllerMock.mockCall(vsUSD.address, call)

      expect(await vsUSD.balanceOf(user.address)).eq(0)
    })

    it('should revert if not controller', async function () {
      const tx = vsUSD.connect(user).burn(user.address, parseEther('10'))
      await expect(tx).revertedWith('not-controller')
    })
  })

  describe('updateMaxTotalSupplyInUsd', function () {
    it('should update collateralization ratio', async function () {
      const before = await vsUSD.maxTotalSupplyInUsd()
      const after = before.div('2')
      const tx = vsUSD.updateMaxTotalSupplyInUsd(after)
      await expect(tx).emit(vsUSD, 'MaxTotalSupplyUpdated').withArgs(before, after)
      expect(await vsUSD.maxTotalSupplyInUsd()).eq(after)
    })

    it('should revert if using the current value', async function () {
      const currentMaxTotalSupplyInUsd = await vsUSD.maxTotalSupplyInUsd()
      const tx = vsUSD.updateMaxTotalSupplyInUsd(currentMaxTotalSupplyInUsd)
      await expect(tx).revertedWith('new-same-as-current')
    })

    it('should revert if not governor', async function () {
      const tx = vsUSD.connect(user).updateMaxTotalSupplyInUsd(parseEther('10'))
      await expect(tx).revertedWith('not-governor')
    })
  })

  describe('updateInterestRate', function () {
    it('should update interest rate', async function () {
      const before = await vsUSD.interestRate()
      const after = parseEther('0.5')
      const tx = vsUSD.updateInterestRate(after)
      await expect(tx).emit(vsUSD, 'InterestRateUpdated').withArgs(before, after)
      expect(await vsUSD.interestRate()).eq(after)
    })

    it('should revert if using the current value', async function () {
      const currentInterestRate = await vsUSD.interestRate()
      const tx = vsUSD.updateInterestRate(currentInterestRate)
      await expect(tx).revertedWith('new-same-as-current')
    })

    it('should revert if not governor', async function () {
      const tx = vsUSD.connect(user).updateInterestRate(parseEther('0.12'))
      await expect(tx).revertedWith('not-governor')
    })
  })

  describe('toggleIsActive', function () {
    it('should update active flag', async function () {
      expect(await vsUSD.isActive()).eq(true)
      const tx = vsUSD.toggleIsActive()
      await expect(tx).emit(vsUSD, 'SyntheticTokenActiveUpdated').withArgs(true, false)
      expect(await vsUSD.isActive()).eq(false)
    })

    it('should revert if not governor', async function () {
      const tx = vsUSD.connect(user).toggleIsActive()
      await expect(tx).revertedWith('not-governor')
    })
  })

  describe('acrueInterest', function () {
    it('should mint accrued fee to treasury', async function () {
      const principal = parseEther('100')

      // given
      await vsUSD.updateInterestRate(parseEther('0.1')) // 10%

      const mintCall = vsUSD.interface.encodeFunctionData('mint', [user.address, principal])
      await controllerMock.mockCall(vsUSD.address, mintCall)
      const vsUSDWallet = await impersonateAccount(vsUSD.address)
      await vsUSDDebt.connect(vsUSDWallet).mint(user.address, principal)

      // eslint-disable-next-line new-cap
      await increaseTime(await vsUSD.SECONDS_PER_YEAR())

      // when
      await vsUSD.accrueInterest()

      // then
      const totalCredit = await vsUSD.totalSupply()
      const totalDebt = await vsUSDDebt.totalSupply()
      const debtOfUser = await vsUSDDebt.balanceOf(user.address)
      const creditOfUser = await vsUSD.balanceOf(user.address)
      const creditOfTreasury = await vsUSD.balanceOf(treasury.address)
      expect(totalDebt).closeTo(parseEther('110'), parseEther('0.01'))
      expect(totalCredit).eq(totalDebt)
      expect(totalDebt).closeTo(debtOfUser, parseEther('0.000001'))
      expect(creditOfUser).eq(principal)
      expect(totalCredit).eq(creditOfUser.add(creditOfTreasury))
    })
  })
})
