/* eslint-disable camelcase */
import {parseEther} from '@ethersproject/units'
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import chai, {expect} from 'chai'
import {ethers} from 'hardhat'
import {
  DepositToken__factory,
  DepositToken,
  ERC20Mock__factory,
  ERC20Mock,
  MasterOracleMock__factory,
  MasterOracleMock,
  Treasury,
  Treasury__factory,
  Pool,
  FeeProvider,
  FeeProvider__factory,
  PoolRegistry,
} from '../typechain'
import {setBalance} from '@nomicfoundation/hardhat-network-helpers'
import {FakeContract, MockContract, smock} from '@defi-wonderland/smock'
import {BigNumber} from 'ethers'
import {toUSD} from '../helpers'

chai.use(smock.matchers)

const {MaxUint256} = ethers.constants

describe('DepositToken', function () {
  let deployer: SignerWithAddress
  let governor: SignerWithAddress
  let alice: SignerWithAddress
  let bob: SignerWithAddress
  let feeCollector: SignerWithAddress
  let treasury: Treasury
  let met: ERC20Mock
  let poolMock: FakeContract<Pool>
  let metDepositToken: DepositToken
  let masterOracle: MasterOracleMock
  let rewardsDistributorMock: MockContract
  let feeProvider: FeeProvider

  const metPrice = toUSD('4') // 1 MET = $4
  const metCF = parseEther('0.5') // 50%

  beforeEach(async function () {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[deployer, governor, alice, bob, feeCollector] = await ethers.getSigners()

    const masterOracleMock = new MasterOracleMock__factory(deployer)
    masterOracle = <MasterOracleMock>await masterOracleMock.deploy()
    await masterOracle.deployed()

    const metMockFactory = new ERC20Mock__factory(deployer)
    met = await metMockFactory.deploy('Metronome', 'MET', 18)
    await met.deployed()
    await met.mint(alice.address, parseEther('1000'))

    const treasuryFactory = new Treasury__factory(deployer)
    treasury = await treasuryFactory.deploy()
    await treasury.deployed()

    const esMET = await smock.fake('IESMET')

    const poolMockRegistry = await smock.fake<PoolRegistry>('PoolRegistry')
    poolMockRegistry.governor.returns(governor.address)

    const feeProviderFactory = new FeeProvider__factory(deployer)
    feeProvider = await feeProviderFactory.deploy()
    await feeProvider.deployed()
    await feeProvider.initialize(poolMockRegistry.address, esMET.address)

    const depositTokenFactory = new DepositToken__factory(deployer)
    metDepositToken = await depositTokenFactory.deploy()
    await metDepositToken.deployed()

    poolMock = await smock.fake<Pool>('Pool')
    await setBalance(poolMock.address, parseEther('10'))
    poolMock.masterOracle.returns(masterOracle.address)
    poolMock.governor.returns(governor.address)
    poolMock.feeCollector.returns(feeCollector.address)
    poolMock.paused.returns(false)
    poolMock.everythingStopped.returns(false)
    poolMock.doesDepositTokenExist.returns(true)
    poolMock.treasury.returns(treasury.address)
    poolMock.feeProvider.returns(feeProvider.address)

    const rewardsDistributorMockFactory = await smock.mock('RewardsDistributor')
    rewardsDistributorMock = await rewardsDistributorMockFactory.deploy()
    poolMock.getRewardsDistributors.returns([rewardsDistributorMock.address])
    rewardsDistributorMock.pool.returns(poolMock.address)

    await metDepositToken.initialize(
      met.address,
      poolMock.address,
      'Metronome Synth MET-Deposit',
      'msdMET',
      18,
      metCF,
      MaxUint256
    )
    metDepositToken = metDepositToken.connect(governor)

    await masterOracle.updatePrice(met.address, metPrice)
    await treasury.initialize(poolMock.address)
  })

  describe('when user has some balance', function () {
    const depositedAmount = parseEther('100')

    const debtPositionOf_returnsAllUnlocked = (balance: BigNumber) => () => {
      const _isHealth = true
      const _depositInUsd = balance.mul(metPrice).div(parseEther('1'))
      const _debtInUsd = parseEther('0') // all tokens are unlocked
      const _issuableLimitInUsd = _depositInUsd.mul(parseEther('1')).div(metCF)
      const _issuableInUsd = _issuableLimitInUsd.sub(_debtInUsd)
      return [_isHealth, _depositInUsd, _debtInUsd, _issuableLimitInUsd, _issuableInUsd]
    }

    const debtPositionOf_returnsAllLocked = (balance: BigNumber) => () => {
      const _isHealth = true
      const _depositInUsd = balance.mul(metPrice).div(parseEther('1'))
      const _issuableLimitInUsd = _depositInUsd.mul(metCF).div(parseEther('1'))
      const _debtInUsd = _issuableLimitInUsd
      const _issuableInUsd = parseEther('0') // all tokens are locked
      return [_isHealth, _depositInUsd, _debtInUsd, _issuableLimitInUsd, _issuableInUsd]
    }

    beforeEach(async function () {
      await met.connect(alice).approve(metDepositToken.address, ethers.constants.MaxUint256)
      await metDepositToken.connect(alice).deposit(depositedAmount, alice.address)
      expect(await metDepositToken.balanceOf(alice.address)).eq(depositedAmount)
      poolMock.debtPositionOf.returns(debtPositionOf_returnsAllUnlocked(depositedAmount))
    })

    describe('withdraw', function () {
      it('should revert not if paused', async function () {
        // given
        poolMock.paused.returns(true)

        // when
        const toWithdraw = 1
        const tx = metDepositToken.connect(alice).withdraw(toWithdraw, alice.address)

        // then
        await expect(tx).emit(metDepositToken, 'CollateralWithdrawn')
      })

      it('should revert if shutdown', async function () {
        // given
        poolMock.paused.returns(true)
        poolMock.everythingStopped.returns(true)

        // when
        const toWithdraw = 1
        const tx = metDepositToken.connect(alice).withdraw(toWithdraw, alice.address)

        // then
        await expect(tx).revertedWithCustomError(metDepositToken, 'IsShutdown')
      })

      it('should revert if amount is 0', async function () {
        // when
        const tx = metDepositToken.connect(alice).withdraw(0, alice.address)

        // then
        await expect(tx).revertedWithCustomError(metDepositToken, 'AmountIsZero')
      })

      it('should revert if amount > unlocked collateral amount', async function () {
        // when
        const unlockedDeposit = await metDepositToken.unlockedBalanceOf(alice.address)
        const tx = metDepositToken.connect(alice).withdraw(unlockedDeposit.add('1'), alice.address)

        // then
        await expect(tx).revertedWithCustomError(metDepositToken, 'NotEnoughFreeBalance')
      })

      it('should withdraw if amount <= unlocked collateral amount (withdrawFee == 0)', async function () {
        // given
        const metBalanceBefore = await met.balanceOf(alice.address)
        const depositBefore = await metDepositToken.balanceOf(alice.address)

        // when
        const amountToWithdraw = await metDepositToken.unlockedBalanceOf(alice.address)
        const tx = metDepositToken.connect(alice).withdraw(amountToWithdraw, alice.address)
        await expect(tx)
          .emit(metDepositToken, 'CollateralWithdrawn')
          .withArgs(alice.address, alice.address, amountToWithdraw, amountToWithdraw, 0)

        // then
        expect(await met.balanceOf(alice.address)).eq(metBalanceBefore.add(amountToWithdraw))
        expect(await metDepositToken.balanceOf(alice.address)).eq(depositBefore.sub(amountToWithdraw))
        expect(await metDepositToken.unlockedBalanceOf(alice.address)).eq(0)
      })

      it('should withdraw if amount <= unlocked collateral amount (withdrawFee > 0)', async function () {
        // given
        await feeProvider.connect(governor).updateWithdrawFee(parseEther('0.1')) // 10%
        const metBalanceBefore = await met.balanceOf(alice.address)
        const depositBefore = await metDepositToken.balanceOf(alice.address)
        const amount = await metDepositToken.unlockedBalanceOf(alice.address)
        const {_amountToWithdraw, _fee: fee} = await metDepositToken.quoteWithdrawOut(amount)
        const {_amount: amountIn} = await metDepositToken.quoteWithdrawIn(_amountToWithdraw)
        expect(amount).eq(amountIn)

        // when
        const tx = metDepositToken.connect(alice).withdraw(amount, alice.address)
        await expect(tx)
          .emit(metDepositToken, 'CollateralWithdrawn')
          .withArgs(alice.address, alice.address, amount, _amountToWithdraw, fee)

        // then
        expect(await met.balanceOf(alice.address)).eq(metBalanceBefore.add(_amountToWithdraw))
        expect(await metDepositToken.balanceOf(alice.address)).eq(depositBefore.sub(amount))
        expect(await metDepositToken.unlockedBalanceOf(alice.address)).eq(0)
      })

      it('should withdraw collateral to another user', async function () {
        // given
        const depositBefore = await metDepositToken.balanceOf(alice.address)

        // when
        const amountToWithdraw = await metDepositToken.unlockedBalanceOf(alice.address)
        const tx = metDepositToken.connect(alice).withdraw(amountToWithdraw, bob.address)
        await expect(tx)
          .emit(metDepositToken, 'CollateralWithdrawn')
          .withArgs(alice.address, bob.address, amountToWithdraw, amountToWithdraw, 0)

        // then
        expect(await met.balanceOf(bob.address)).eq(amountToWithdraw)
        expect(await metDepositToken.balanceOf(alice.address)).eq(depositBefore.sub(amountToWithdraw))
        expect(await metDepositToken.unlockedBalanceOf(alice.address)).eq(0)
      })

      it('should trigger rewards update', async function () {
        // given
        rewardsDistributorMock.updateBeforeMintOrBurn.reset()

        // when
        await metDepositToken.connect(alice).withdraw(parseEther('1'), alice.address)

        // then
        // Note: Use `callCount` instead (Refs: https://github.com/defi-wonderland/smock/issues/85)
        expect(rewardsDistributorMock.updateBeforeMintOrBurn).called
        expect(rewardsDistributorMock.updateBeforeMintOrBurn.getCall(0).args[1]).eq(alice.address)
      })
    })

    describe('deposit', function () {
      beforeEach(async function () {
        await met.connect(alice).approve(metDepositToken.address, ethers.constants.MaxUint256)
      })

      it('should revert if paused', async function () {
        // given
        poolMock.paused.returns(true)

        // when
        const toDeposit = parseEther('10')
        const tx = metDepositToken.connect(alice).deposit(toDeposit, alice.address)

        // then
        await expect(tx).revertedWithCustomError(metDepositToken, 'IsPaused')
      })

      it('should revert if shutdown', async function () {
        // given
        poolMock.paused.returns(true)
        poolMock.everythingStopped.returns(true)

        // when
        const toDeposit = parseEther('10')
        const tx = metDepositToken.connect(alice).deposit(toDeposit, alice.address)

        // then
        await expect(tx).revertedWithCustomError(metDepositToken, 'IsPaused')
      })

      it('should revert if surpass max supply in usd', async function () {
        // given
        await metDepositToken.updateMaxTotalSupply(parseEther('40'))

        // when
        const tx = metDepositToken.connect(alice).deposit(parseEther('11'), alice.address)

        // then
        await expect(tx).revertedWithCustomError(metDepositToken, 'SurpassMaxDepositSupply')
      })

      it('should revert if collateral amount is 0', async function () {
        const toDeposit = 0
        const tx = metDepositToken.connect(alice).deposit(toDeposit, alice.address)
        await expect(tx).revertedWithCustomError(metDepositToken, 'AmountIsZero')
      })

      it('should revert if MET balance is not enough', async function () {
        const balance = await met.balanceOf(alice.address)
        const tooHigh = balance.add('1')
        const tx = metDepositToken.connect(alice).deposit(tooHigh, alice.address)
        await expect(tx).reverted
      })

      it('should deposit MET and mint msdMET (depositFee == 0)', async function () {
        // when
        const toDeposit = parseEther('10')
        const tx = () => metDepositToken.connect(alice).deposit(toDeposit, alice.address)

        // then
        await expect(tx).changeTokenBalances(met, [alice, treasury], [toDeposit.mul('-1'), toDeposit])
        await expect(tx).changeTokenBalances(metDepositToken, [alice, poolMock], [toDeposit, 0])
        await expect(tx())
          .emit(metDepositToken, 'CollateralDeposited')
          .withArgs(alice.address, alice.address, toDeposit, toDeposit, 0)
      })

      it('should deposit TOKEN and mint msdTOKEN when TOKEN has transfer fee', async function () {
        // given
        const fee = parseEther('0.1') // 10%
        await met.updateFee(fee)

        // when
        const toDeposit = parseEther('100')
        const tx = () => metDepositToken.connect(alice).deposit(toDeposit, alice.address)

        // then
        const amountAfterFee = toDeposit.sub(toDeposit.mul(fee).div(parseEther('1')))
        await expect(tx).changeTokenBalances(met, [alice, treasury], [toDeposit.mul('-1'), amountAfterFee])
        await expect(tx).changeTokenBalances(metDepositToken, [alice, poolMock], [amountAfterFee, 0])
        await expect(tx())
          .emit(metDepositToken, 'CollateralDeposited')
          .withArgs(alice.address, alice.address, amountAfterFee, amountAfterFee, 0)
      })

      it('should deposit MET and mint msdMET (depositFee > 0)', async function () {
        // given
        await feeProvider.connect(governor).updateDepositFee(parseEther('0.01')) // 1%

        // when
        const amount = parseEther('100')
        const tx = () => metDepositToken.connect(alice).deposit(amount, alice.address)
        const {_amountToDeposit, _fee: fee} = await metDepositToken.quoteDepositOut(amount)
        const {_amount: amountIn} = await metDepositToken.quoteDepositIn(_amountToDeposit)
        expect(amount).eq(amountIn)

        // then
        await expect(tx).changeTokenBalances(met, [alice, treasury], [amount.mul('-1'), amount])
        await expect(tx).changeTokenBalances(
          metDepositToken,
          [alice, poolMock, feeCollector],
          [_amountToDeposit, 0, fee]
        )
        await expect(tx())
          .emit(metDepositToken, 'CollateralDeposited')
          .withArgs(alice.address, alice.address, amount, _amountToDeposit, fee)
      })

      it('should deposit on behalf of another user', async function () {
        // when
        const toDeposit = parseEther('10')
        const tx = () => metDepositToken.connect(alice).deposit(toDeposit, bob.address)

        // then
        await expect(tx).changeTokenBalances(met, [alice, treasury], [toDeposit.mul('-1'), toDeposit])
        await expect(tx).changeTokenBalances(metDepositToken, [poolMock, bob], [0, toDeposit])
        await expect(tx())
          .emit(metDepositToken, 'CollateralDeposited')
          .withArgs(alice.address, bob.address, toDeposit, toDeposit, 0)
      })

      it('should trigger rewards update', async function () {
        // given
        rewardsDistributorMock.updateBeforeMintOrBurn.reset()

        // when
        await metDepositToken.connect(alice).deposit(parseEther('1'), alice.address)

        // then
        // Note: Use `callCount` instead (Refs: https://github.com/defi-wonderland/smock/issues/85)
        expect(rewardsDistributorMock.updateBeforeMintOrBurn).called
        expect(rewardsDistributorMock.updateBeforeMintOrBurn.getCall(0).args[1]).eq(alice.address)
      })
    })

    describe('transfer', function () {
      it('should transfer if amount <= free amount', async function () {
        // when
        const _unlockedDeposit = await metDepositToken.unlockedBalanceOf(alice.address)
        expect(await metDepositToken.balanceOf(alice.address)).eq(depositedAmount)
        await metDepositToken.connect(alice).transfer(deployer.address, _unlockedDeposit)

        // then
        expect(await metDepositToken.balanceOf(alice.address)).eq(depositedAmount.sub(_unlockedDeposit))
      })

      it('should revert if amount > free amount', async function () {
        // given
        poolMock.debtPositionOf.returns(debtPositionOf_returnsAllLocked(depositedAmount))

        // when
        const _unlockedDeposit = await metDepositToken.unlockedBalanceOf(alice.address)
        const tx = metDepositToken.connect(alice).transfer(deployer.address, _unlockedDeposit.add('1'))

        // then
        await expect(tx).revertedWithCustomError(metDepositToken, 'NotEnoughFreeBalance')
      })

      // eslint-disable-next-line quotes
      it("should add and remove deposit token from users' arrays only once", async function () {
        // given
        poolMock.addToDepositTokensOfAccount.reset()
        poolMock.removeFromDepositTokensOfAccount.reset()
        expect(await metDepositToken.balanceOf(deployer.address)).eq(0)
        expect(await metDepositToken.balanceOf(alice.address)).eq(depositedAmount)

        // when
        // Note: Set `gasLimit` prevents messing up the calls counter
        // See more: https://github.com/defi-wonderland/smock/issues/99
        const gasLimit = 250000

        await metDepositToken.connect(alice).transfer(deployer.address, depositedAmount.div('4'), {gasLimit})
        await metDepositToken.connect(alice).transfer(deployer.address, depositedAmount.div('4'), {gasLimit})
        await metDepositToken.connect(alice).transfer(deployer.address, depositedAmount.div('4'), {gasLimit})
        await metDepositToken.connect(alice).transfer(deployer.address, depositedAmount.div('4'), {gasLimit})

        // then
        expect(await metDepositToken.balanceOf(alice.address)).eq(0)
        expect(await metDepositToken.balanceOf(deployer.address)).eq(depositedAmount)
        expect(poolMock.addToDepositTokensOfAccount).callCount(1)
        expect(poolMock.addToDepositTokensOfAccount).calledWith(deployer.address)

        expect(poolMock.removeFromDepositTokensOfAccount).callCount(1)
        expect(poolMock.removeFromDepositTokensOfAccount).calledWith(alice.address)
      })

      it('should trigger rewards update', async function () {
        // given
        rewardsDistributorMock.updateBeforeTransfer.reset()

        // when
        await metDepositToken.connect(alice).transfer(bob.address, depositedAmount)

        // then
        // Note: Use `callCount` instead (Refs: https://github.com/defi-wonderland/smock/issues/85)
        expect(rewardsDistributorMock.updateBeforeTransfer).called
        expect(rewardsDistributorMock.updateBeforeTransfer.getCall(0).args[1]).eq(alice.address)
        expect(rewardsDistributorMock.updateBeforeTransfer.getCall(0).args[2]).eq(bob.address)
      })

      it('should transfer to himself', async function () {
        expect(await metDepositToken.balanceOf(alice.address)).eq(depositedAmount)
        await metDepositToken.connect(alice).transfer(alice.address, depositedAmount)
        expect(await metDepositToken.balanceOf(alice.address)).eq(depositedAmount)
      })
    })

    describe('transferFrom', function () {
      beforeEach(async function () {
        await metDepositToken.connect(alice).approve(deployer.address, ethers.constants.MaxUint256)
      })

      it('should transfer if amount <= free amount', async function () {
        // when
        const _unlockedDeposit = await metDepositToken.unlockedBalanceOf(alice.address)
        expect(await metDepositToken.balanceOf(alice.address)).eq(depositedAmount)
        await metDepositToken.connect(deployer).transferFrom(alice.address, deployer.address, _unlockedDeposit)

        // then
        expect(await metDepositToken.balanceOf(alice.address)).eq(depositedAmount.sub(_unlockedDeposit))
      })

      it('should revert if amount > free amount', async function () {
        // when
        const _unlockedDeposit = await metDepositToken.unlockedBalanceOf(alice.address)
        const tx = metDepositToken
          .connect(deployer)
          .transferFrom(alice.address, deployer.address, _unlockedDeposit.add('1'))

        // then
        await expect(tx).revertedWithCustomError(metDepositToken, 'NotEnoughFreeBalance')
      })

      it('should trigger rewards update', async function () {
        // given
        rewardsDistributorMock.updateBeforeTransfer.reset()

        // when
        await metDepositToken.connect(deployer).transferFrom(alice.address, bob.address, depositedAmount)

        // then
        // Note: Use `callCount` instead (Refs: https://github.com/defi-wonderland/smock/issues/85)
        expect(rewardsDistributorMock.updateBeforeTransfer).called
        expect(rewardsDistributorMock.updateBeforeTransfer.getCall(0).args[1]).eq(alice.address)
        expect(rewardsDistributorMock.updateBeforeTransfer.getCall(0).args[2]).eq(bob.address)
      })
    })

    describe('seize', function () {
      it('should revert if not pool', async function () {
        const tx = metDepositToken.connect(alice).seize(alice.address, deployer.address, parseEther('10'))
        await expect(tx).revertedWithCustomError(metDepositToken, 'SenderIsNotPool')
      })

      it('should seize tokens', async function () {
        const amountToSeize = parseEther('10')

        const tx = () => metDepositToken.connect(poolMock.wallet).seize(alice.address, deployer.address, amountToSeize)

        await expect(tx).changeTokenBalances(
          metDepositToken,
          [alice, deployer],
          [amountToSeize.mul('-1'), amountToSeize]
        )
      })

      it('should trigger rewards update', async function () {
        // given
        rewardsDistributorMock.updateBeforeTransfer.reset()

        // when
        await metDepositToken.connect(poolMock.wallet).seize(alice.address, bob.address, parseEther('1'))

        // then
        // Note: Use `callCount` instead (Refs: https://github.com/defi-wonderland/smock/issues/85)
        expect(rewardsDistributorMock.updateBeforeTransfer).called
        expect(rewardsDistributorMock.updateBeforeTransfer.getCall(0).args[1]).eq(alice.address)
        expect(rewardsDistributorMock.updateBeforeTransfer.getCall(0).args[2]).eq(bob.address)
      })
    })

    describe('updateCollateralFactor', function () {
      it('should update collateral factor', async function () {
        // given
        const currentCollateralFactor = await metDepositToken.collateralFactor()

        // when
        const newCollateralFactor = currentCollateralFactor.mul('2')
        const tx = metDepositToken.updateCollateralFactor(newCollateralFactor)

        // then
        await expect(tx)
          .emit(metDepositToken, 'CollateralFactorUpdated')
          .withArgs(currentCollateralFactor, newCollateralFactor)
        expect(await metDepositToken.collateralFactor()).eq(newCollateralFactor)
      })

      it('should revert if using the current value', async function () {
        // given
        const currentCollateralFactor = await metDepositToken.collateralFactor()

        // when
        const tx = metDepositToken.updateCollateralFactor(currentCollateralFactor)

        // then
        await expect(tx).revertedWithCustomError(metDepositToken, 'NewValueIsSameAsCurrent')
      })

      it('should revert if not governor', async function () {
        const tx = metDepositToken.connect(alice).updateCollateralFactor(parseEther('10'))
        await expect(tx).revertedWithCustomError(metDepositToken, 'SenderIsNotGovernor')
      })

      it('should revert if > 100%', async function () {
        // when
        const tx = metDepositToken.updateCollateralFactor(parseEther('1').add('1'))

        // then
        await expect(tx).revertedWithCustomError(metDepositToken, 'CollateralFactorTooHigh')
      })
    })

    describe('updateMaxTotalSupply', function () {
      it('should update max total supply', async function () {
        // given
        const currentMaxTotalSupply = await metDepositToken.maxTotalSupply()
        const newMaxTotalSupply = currentMaxTotalSupply.div('2')
        expect(newMaxTotalSupply).not.eq(currentMaxTotalSupply)

        // when
        const tx = metDepositToken.updateMaxTotalSupply(newMaxTotalSupply)

        // then
        await expect(tx)
          .emit(metDepositToken, 'MaxTotalSupplyUpdated')
          .withArgs(currentMaxTotalSupply, newMaxTotalSupply)
        expect(await metDepositToken.maxTotalSupply()).eq(newMaxTotalSupply)
      })

      it('should revert if using the current value', async function () {
        // given
        const currentMaxTotalSupply = await metDepositToken.maxTotalSupply()

        // then
        const tx = metDepositToken.updateMaxTotalSupply(currentMaxTotalSupply)

        // then
        await expect(tx).revertedWithCustomError(metDepositToken, 'NewValueIsSameAsCurrent')
      })

      it('should revert if not governor', async function () {
        // when
        const tx = metDepositToken.connect(alice).updateMaxTotalSupply('10')

        // then
        await expect(tx).revertedWithCustomError(metDepositToken, 'SenderIsNotGovernor')
      })
    })

    describe('toggleIsActive', function () {
      it('should update min deposit time', async function () {
        // given
        const currentIsActive = await metDepositToken.isActive()
        const expectedIsActive = !currentIsActive

        // when
        const tx = metDepositToken.toggleIsActive()

        // then
        await expect(tx).emit(metDepositToken, 'DepositTokenActiveUpdated').withArgs(expectedIsActive)
        expect(await metDepositToken.isActive()).eq(expectedIsActive)
      })

      it('should revert if not governor', async function () {
        // when
        const tx = metDepositToken.connect(alice).toggleIsActive()

        // then
        await expect(tx).revertedWithCustomError(metDepositToken, 'SenderIsNotGovernor')
      })
    })
  })
})
