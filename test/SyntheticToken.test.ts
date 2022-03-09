/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable camelcase */
import {parseEther} from '@ethersproject/units'
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {expect} from 'chai'
import {ethers} from 'hardhat'
import {
  SyntheticToken,
  SyntheticToken__factory,
  DebtTokenMock,
  DebtTokenMock__factory,
  MasterOracleMock__factory,
  MasterOracleMock,
  ControllerMock,
  ControllerMock__factory,
  ERC20Mock__factory,
  ERC20Mock,
  DepositToken__factory,
  DepositToken,
} from '../typechain'
import {toUSD} from './helpers'

describe('SyntheticToken', function () {
  let deployer: SignerWithAddress
  let governor: SignerWithAddress
  let user: SignerWithAddress
  let treasury: SignerWithAddress
  let controllerMock: ControllerMock
  let met: ERC20Mock
  let metDepositToken: DepositToken
  let vsAsset: SyntheticToken
  let debtToken: DebtTokenMock
  let masterOracleMock: MasterOracleMock

  const metCR = parseEther('0.5') // 50%
  const name = 'Vesper Synth ETH'
  const symbol = 'vsETH'
  const interestRate = parseEther('0')

  beforeEach(async function () {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[deployer, governor, user, treasury] = await ethers.getSigners()

    const masterOracleMockFactory = new MasterOracleMock__factory(deployer)
    masterOracleMock = <MasterOracleMock>await masterOracleMockFactory.deploy()
    await masterOracleMock.deployed()

    const erc20MockFactory = new ERC20Mock__factory(deployer)
    met = await erc20MockFactory.deploy('Metronome', 'MET', 18)
    await met.deployed()

    const depositTokenFactory = new DepositToken__factory(deployer)
    metDepositToken = await depositTokenFactory.deploy()
    await metDepositToken.deployed()

    const debtTokenFactory = new DebtTokenMock__factory(deployer)
    debtToken = await debtTokenFactory.deploy()
    await debtToken.deployed()

    const syntheticTokenFactory = new SyntheticToken__factory(deployer)
    vsAsset = await syntheticTokenFactory.deploy()
    await vsAsset.deployed()

    const controllerMockFactory = new ControllerMock__factory(deployer)
    controllerMock = await controllerMockFactory.deploy(
      metDepositToken.address,
      masterOracleMock.address,
      vsAsset.address
    )
    await controllerMock.deployed()
    await controllerMock.transferGovernorship(governor.address)
    await controllerMock.updateTreasury(treasury.address, false)

    // Initializations & Setup
    await controllerMock.updateTreasury(treasury.address, false)

    await metDepositToken.initialize(met.address, controllerMock.address, 'vSynth-MET', 18, metCR)
    await debtToken.initialize('vsETH Debt', 'vsETH-Debt', 18, controllerMock.address, vsAsset.address)
    await vsAsset.initialize(name, symbol, 18, controllerMock.address, debtToken.address, interestRate)

    await masterOracleMock.updatePrice(vsAsset.address, toUSD('1')) // 1 vsAsset = $1
    await masterOracleMock.updatePrice(metDepositToken.address, toUSD('1')) // 1 collateralToken = $1
  })

  it('default values', async function () {
    expect(await vsAsset.totalSupply()).eq(0)
    expect(await vsAsset.name()).eq(name)
    expect(await vsAsset.symbol()).eq(symbol)
    expect(await vsAsset.decimals()).eq(18)
  })

  describe('issue', function () {
    const depositAmount = parseEther('100')

    beforeEach(async function () {
      await met.mint(user.address, parseEther('1000'))
      await met.connect(user).approve(metDepositToken.address, ethers.constants.MaxUint256)
      await metDepositToken.connect(user).deposit(depositAmount, user.address)
    })

    it('should not revert if paused', async function () {
      // given
      await controllerMock.pause()

      // when
      const toIssue = parseEther('0.1')
      const tx = vsAsset.connect(user).issue(toIssue, user.address)

      // then
      await expect(tx).emit(vsAsset, 'SyntheticTokenIssued')
    })

    it('should revert if shutdown', async function () {
      // given
      await controllerMock.shutdown()

      // when
      const toIssue = parseEther('0.1')
      const tx = vsAsset.connect(user).issue(toIssue, user.address)

      // then
      await expect(tx).revertedWith('shutdown')
    })

    it('should revert if synthetic does not exist', async function () {
      // given
      const syntheticTokenFactory = new SyntheticToken__factory(deployer)
      const notListedSynthetic = await syntheticTokenFactory.deploy()
      await notListedSynthetic.deployed()
      await notListedSynthetic.initialize(name, symbol, 18, controllerMock.address, debtToken.address, interestRate)

      // when
      const toIssue = parseEther('1')
      const tx = notListedSynthetic.issue(toIssue, user.address)

      // then
      await expect(tx).revertedWith('synthetic-inexistent')
    })

    it('should revert if synthetic is not active', async function () {
      // given
      await vsAsset.toggleIsActive()

      // when
      const toIssue = parseEther('1')
      const tx = vsAsset.connect(user).issue(toIssue, user.address)

      // then
      await expect(tx).revertedWith('synthetic-inactive')
    })

    it('should revert if user has not enough collateral deposited', async function () {
      // when
      const toIssue = parseEther('1000000000000000')
      const tx = vsAsset.connect(user).issue(toIssue, user.address)

      // then
      await expect(tx).revertedWith('not-enough-collateral')
    })

    it('should revert if amount to issue is 0', async function () {
      // when
      const toIssue = 0
      const tx = vsAsset.connect(user).issue(toIssue, user.address)

      // then
      await expect(tx).revertedWith('amount-is-zero')
    })

    it('should revert if new debt < debt floor', async function () {
      // given
      await controllerMock.updateDebtFloor(parseEther('10000')) // $10,000

      // when
      const toIssue = parseEther('1') // $4,000
      const tx = vsAsset.connect(user).issue(toIssue, user.address)

      // then
      await expect(tx).revertedWith('debt-lt-floor')
    })

    it('should issue vsAsset (issueFee == 0)', async function () {
      // when
      const toIssue = parseEther('1')
      const tx = () => vsAsset.connect(user).issue(toIssue, user.address)

      // then
      await expect(tx).changeTokenBalances(vsAsset, [user], [toIssue])

      // Note: the calls below will make additional transfers
      await expect(tx).changeTokenBalances(debtToken, [user], [toIssue])
      await expect(tx).changeTokenBalances(met, [controllerMock], [0])
      await expect(tx()).emit(vsAsset, 'SyntheticTokenIssued').withArgs(user.address, user.address, toIssue, 0)
    })

    it('should issue vsAsset (issueFee > 0)', async function () {
      // given
      const issueFee = parseEther('0.1') // 10%
      await controllerMock.updateIssueFee(issueFee)

      // when
      const amount = parseEther('1')
      const expectedFee = amount.mul(issueFee).div(parseEther('1'))
      const expectedAmountAfterFee = amount.sub(expectedFee)
      const tx = () => vsAsset.connect(user).issue(amount, user.address)
      await expect(tx).changeTokenBalances(vsAsset, [user, treasury], [expectedAmountAfterFee, expectedFee])

      // then
      // Note: the calls below will make additional transfers
      // See: https://github.com/EthWorks/Waffle/issues/569
      await expect(tx).changeTokenBalances(debtToken, [user], [amount])
      await expect(tx()).emit(vsAsset, 'SyntheticTokenIssued').withArgs(user.address, user.address, amount, expectedFee)
    })

    it('should issue max issuable amount (issueFee == 0)', async function () {
      const {_issuableInUsd} = await controllerMock.debtPositionOf(user.address)
      const amount = await masterOracleMock.convertFromUsd(vsAsset.address, _issuableInUsd)
      const tx = vsAsset.connect(user).issue(amount, user.address)
      await expect(tx).emit(vsAsset, 'SyntheticTokenIssued').withArgs(user.address, user.address, amount, 0)
    })

    it('should issue max issuable amount (issueFee > 0)', async function () {
      // given
      const issueFee = parseEther('0.1') // 10%
      await controllerMock.updateIssueFee(issueFee)

      const {_issuableInUsd} = await controllerMock.debtPositionOf(user.address)
      const amount = await masterOracleMock.convertFromUsd(vsAsset.address, _issuableInUsd)
      const expectedFee = amount.mul(issueFee).div(parseEther('1'))
      const tx = vsAsset.connect(user).issue(amount, user.address)
      await expect(tx).emit(vsAsset, 'SyntheticTokenIssued').withArgs(user.address, user.address, amount, expectedFee)
    })

    describe('when user minted some vsETH', function () {
      const userMintAmount = parseEther('1')

      beforeEach(async function () {
        await vsAsset.connect(user).issue(userMintAmount, user.address)
      })

      describe('repay', function () {
        it('should not revert if paused', async function () {
          // given
          await controllerMock.pause()
          const amount = await vsAsset.balanceOf(user.address)

          // when
          const tx = vsAsset.connect(user).repay(user.address, amount)

          // then
          await expect(tx).emit(vsAsset, 'DebtRepayed')
        })

        it('should revert if shutdown', async function () {
          // given
          await controllerMock.shutdown()
          const amount = await vsAsset.balanceOf(user.address)

          // when
          const tx = vsAsset.connect(user).repay(user.address, amount)

          // then
          await expect(tx).revertedWith('shutdown')
        })

        it('should revert if amount is 0', async function () {
          // when
          const tx = vsAsset.connect(user).repay(user.address, 0)

          // then
          await expect(tx).revertedWith('amount-is-zero')
        })

        it('should revert if amount > unlocked collateral amount', async function () {
          // given
          const amount = await vsAsset.balanceOf(user.address)

          // when
          const tx = vsAsset.connect(user).repay(user.address, amount.add('1'))

          // then
          await expect(tx).revertedWith('burn-amount-exceeds-balance')
        })

        it('should revert if new debt < debt floor', async function () {
          // given
          await controllerMock.updateDebtFloor(parseEther('3000')) // $3,000

          const amount = await vsAsset.balanceOf(user.address)
          expect(amount).eq(parseEther('1')) // $4,000

          // when
          const toRepay = amount.div('2') // $2,000
          const tx = vsAsset.connect(user).repay(user.address, toRepay)

          // then
          await expect(tx).revertedWith('debt-lt-floor')
        })

        it('should allow repay all when debt floor is set', async function () {
          // given
          await controllerMock.updateRepayFee(0)
          await controllerMock.updateDebtFloor(parseEther('3000')) // $3,000
          const amount = await vsAsset.balanceOf(user.address)

          // when
          await vsAsset.connect(user).repay(user.address, amount)

          // then
          const debtAfter = await controllerMock.debtOf(user.address)
          expect(debtAfter).eq(0)
        })

        it('should repay if amount == debt (repayFee == 0)', async function () {
          // given
          await controllerMock.updateRepayFee(0)
          const lockedCollateralBefore = await metDepositToken.lockedBalanceOf(user.address)
          expect(lockedCollateralBefore).gt(0)

          // when
          const amount = await vsAsset.balanceOf(user.address)
          const tx = vsAsset.connect(user).repay(user.address, amount)
          await expect(tx).emit(vsAsset, 'DebtRepayed').withArgs(user.address, amount, 0)

          // then
          expect(await vsAsset.balanceOf(user.address)).eq(0)
          const lockedCollateralAfter = await metDepositToken.lockedBalanceOf(user.address)
          expect(lockedCollateralAfter).eq(0)
        })

        it('should repay if amount < debt (repayFee == 0)', async function () {
          // given
          await controllerMock.updateRepayFee(0)
          const lockedCollateralBefore = await metDepositToken.lockedBalanceOf(user.address)
          expect(lockedCollateralBefore).gt(0)

          // when
          const amount = (await vsAsset.balanceOf(user.address)).div('2')
          const tx = vsAsset.connect(user).repay(user.address, amount)
          await expect(tx).emit(vsAsset, 'DebtRepayed').withArgs(user.address, amount, 0)

          // then
          expect(await vsAsset.balanceOf(user.address)).eq(amount)
          const lockedDepositAfter = await metDepositToken.lockedBalanceOf(user.address)
          expect(lockedDepositAfter).eq(lockedCollateralBefore.div('2'))
        })

        it('should repay if amount == debt (repayFee > 0)', async function () {
          // given
          const repayFee = parseEther('0.1') // 10%
          await controllerMock.updateRepayFee(repayFee)
          const {_depositInUsd: depositInUsdBefore} = await controllerMock.debtPositionOf(user.address)
          const lockedCollateralBefore = await metDepositToken.lockedBalanceOf(user.address)
          expect(lockedCollateralBefore).gt(0)

          // when
          const amount = await vsAsset.balanceOf(user.address)
          const expectedFee = amount.mul(repayFee).div(parseEther('1'))
          const tx = vsAsset.connect(user).repay(user.address, amount)
          await expect(tx).emit(vsAsset, 'DebtRepayed').withArgs(user.address, amount, expectedFee)

          // then
          expect(await vsAsset.balanceOf(user.address)).eq(0)
          const {_depositInUsd: depositInUsdAfter} = await controllerMock.debtPositionOf(user.address)
          const lockedCollateralAfter = await metDepositToken.lockedBalanceOf(user.address)
          const expectedLockedCollateralAfter = lockedCollateralBefore.mul(repayFee).div(parseEther('1'))
          expect(lockedCollateralAfter).closeTo(expectedLockedCollateralAfter, parseEther('0.000000001'))
          expect(depositInUsdAfter).eq(depositInUsdBefore)
        })

        it('should repay if amount < debt (repayFee > 0)', async function () {
          // given
          const repayFee = parseEther('0.1') // 10%
          await controllerMock.updateRepayFee(repayFee)
          const {_depositInUsd: depositInUsdBefore} = await controllerMock.debtPositionOf(user.address)
          const lockedDepositBefore = await metDepositToken.lockedBalanceOf(user.address)
          expect(lockedDepositBefore).gt(0)
          expect(depositInUsdBefore).gt(0)

          // when
          const amount = (await vsAsset.balanceOf(user.address)).div('2')
          const expectedFee = amount.mul(repayFee).div(parseEther('1'))
          const tx = vsAsset.connect(user).repay(user.address, amount)
          await expect(tx).emit(vsAsset, 'DebtRepayed').withArgs(user.address, amount, expectedFee)

          // then
          expect(await vsAsset.balanceOf(user.address)).eq(amount)
          const {_depositInUsd: depositInUsdAfter} = await controllerMock.debtPositionOf(user.address)
          const lockedDepositAfter = await metDepositToken.lockedBalanceOf(user.address)
          const expectedlockedDepositAfter = lockedDepositBefore
            .div('2')
            .mul(parseEther('1').add(repayFee))
            .div(parseEther('1'))
          expect(lockedDepositAfter).closeTo(expectedlockedDepositAfter, parseEther('0.000000001'))
          expect(depositInUsdAfter).eq(depositInUsdBefore)
        })
      })
    })
  })

  describe('mint', function () {
    it('should mint', async function () {
      expect(await vsAsset.balanceOf(user.address)).eq(0)
      const amount = parseEther('100')
      const call = vsAsset.interface.encodeFunctionData('mint', [user.address, amount])
      await controllerMock.mockCall(vsAsset.address, call)
      expect(await vsAsset.balanceOf(user.address)).eq(amount)
    })

    it('should revert if not controller', async function () {
      const tx = vsAsset.connect(user).mint(user.address, parseEther('10'))
      await expect(tx).revertedWith('not-controller')
    })

    it('should revert if surpass max total supply', async function () {
      // given
      expect(await vsAsset.totalSupply()).eq(0)
      const maxInUsd = toUSD('100')
      await vsAsset.updateMaxTotalSupplyInUsd(maxInUsd)

      // when
      const maxAmount = parseEther('100')
      const call = vsAsset.interface.encodeFunctionData('mint', [user.address, maxAmount.add(parseEther('0.00000007'))])
      const tx = controllerMock.mockCall(vsAsset.address, call)

      // then
      await expect(tx).revertedWith('surpass-max-total-supply')
    })

    it('should revert if vsAsset is inactive', async function () {
      // given
      await vsAsset.toggleIsActive()

      // when
      const call = vsAsset.interface.encodeFunctionData('mint', [deployer.address, '1'])
      const tx = controllerMock.mockCall(vsAsset.address, call)

      // then
      await expect(tx).revertedWith('synthetic-inactive')
    })
  })

  describe('burn', function () {
    const amount = parseEther('100')

    beforeEach(async function () {
      const call = vsAsset.interface.encodeFunctionData('mint', [user.address, amount])
      await controllerMock.mockCall(vsAsset.address, call)
    })

    it('should burn', async function () {
      expect(await vsAsset.balanceOf(user.address)).eq(amount)

      const call = vsAsset.interface.encodeFunctionData('burn', [user.address, amount])
      await controllerMock.mockCall(vsAsset.address, call)

      expect(await vsAsset.balanceOf(user.address)).eq(0)
    })

    it('should revert if not controller', async function () {
      const tx = vsAsset.connect(user).burn(user.address, parseEther('10'))
      await expect(tx).revertedWith('not-controller')
    })
  })

  describe('updateMaxTotalSupplyInUsd', function () {
    it('should update collateralization ratio', async function () {
      const before = await vsAsset.maxTotalSupplyInUsd()
      const after = before.div('2')
      const tx = vsAsset.updateMaxTotalSupplyInUsd(after)
      await expect(tx).emit(vsAsset, 'MaxTotalSupplyUpdated').withArgs(before, after)
      expect(await vsAsset.maxTotalSupplyInUsd()).eq(after)
    })

    it('should revert if using the current value', async function () {
      const currentMaxTotalSupplyInUsd = await vsAsset.maxTotalSupplyInUsd()
      const tx = vsAsset.updateMaxTotalSupplyInUsd(currentMaxTotalSupplyInUsd)
      await expect(tx).revertedWith('new-same-as-current')
    })

    it('should revert if not governor', async function () {
      const tx = vsAsset.connect(user).updateMaxTotalSupplyInUsd(parseEther('10'))
      await expect(tx).revertedWith('not-governor')
    })
  })

  describe('updateInterestRate', function () {
    it('should update interest rate', async function () {
      const before = await vsAsset.interestRate()
      const after = parseEther('0.5')
      const tx = vsAsset.updateInterestRate(after)
      await expect(tx).emit(vsAsset, 'InterestRateUpdated').withArgs(before, after)
      expect(await vsAsset.interestRate()).eq(after)
    })

    it('should revert if using the current value', async function () {
      const currentInterestRate = await vsAsset.interestRate()
      const tx = vsAsset.updateInterestRate(currentInterestRate)
      await expect(tx).revertedWith('new-same-as-current')
    })

    it('should revert if not governor', async function () {
      const tx = vsAsset.connect(user).updateInterestRate(parseEther('0.12'))
      await expect(tx).revertedWith('not-governor')
    })
  })

  describe('toggleIsActive', function () {
    it('should update active flag', async function () {
      expect(await vsAsset.isActive()).eq(true)
      const tx = vsAsset.toggleIsActive()
      await expect(tx).emit(vsAsset, 'SyntheticTokenActiveUpdated').withArgs(true, false)
      expect(await vsAsset.isActive()).eq(false)
    })

    it('should revert if not governor', async function () {
      const tx = vsAsset.connect(user).toggleIsActive()
      await expect(tx).revertedWith('not-governor')
    })
  })

  describe('acrueInterest', function () {
    it('should mint accrued fee to treasury', async function () {
      const pricipal = parseEther('100')

      // given
      await vsAsset.updateInterestRate(parseEther('0.1')) // 10%

      const mintCall = vsAsset.interface.encodeFunctionData('mint', [user.address, pricipal])
      await controllerMock.mockCall(vsAsset.address, mintCall)
      await controllerMock.mockCall(debtToken.address, mintCall)

      // eslint-disable-next-line new-cap
      await debtToken.incrementBlockNumber(await vsAsset.BLOCKS_PER_YEAR())

      // when
      await vsAsset.accrueInterest()

      // then
      const totalCredit = await vsAsset.totalSupply()
      const totalDebt = await debtToken.totalSupply()
      const debtOfUser = await debtToken.balanceOf(user.address)
      const creditOfUser = await vsAsset.balanceOf(user.address)
      const creditOfTreasury = await vsAsset.balanceOf(treasury.address)

      expect(totalDebt).closeTo(parseEther('110'), parseEther('0.01'))
      expect(totalCredit).eq(totalDebt)
      expect(totalDebt).closeTo(debtOfUser, parseEther('0.000001'))
      expect(creditOfUser).eq(pricipal)
      expect(totalCredit).eq(creditOfUser.add(creditOfTreasury))
    })
  })
})
