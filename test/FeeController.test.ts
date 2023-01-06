/* eslint-disable camelcase */
import {parseEther} from '@ethersproject/units'
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {expect} from 'chai'
import {ethers} from 'hardhat'
import {FeeProvider__factory, FeeProvider} from '../typechain'

describe('FeeProvider', function () {
  let deployer: SignerWithAddress
  let alice: SignerWithAddress
  let bob: SignerWithAddress
  let feeProvider: FeeProvider

  beforeEach(async function () {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[deployer, alice, bob] = await ethers.getSigners()

    const feeProviderFactory = new FeeProvider__factory(deployer)
    feeProvider = await feeProviderFactory.deploy()
    await feeProvider.deployed()
    await feeProvider.initialize()
  })

  describe('updateSwapFee', function () {
    it('should revert if caller is not governor', async function () {
      // when
      const tx = feeProvider.connect(alice).updateSwapFee(parseEther('1'))

      // then
      await expect(tx).revertedWithCustomError(feeProvider, 'SenderIsNotGovernor')
    })

    it('should revert if using the current value', async function () {
      // when
      const swapFee = await feeProvider.swapFee()
      const tx = feeProvider.updateSwapFee(swapFee)

      // then
      await expect(tx).revertedWithCustomError(feeProvider, 'NewValueIsSameAsCurrent')
    })

    it('should revert if swap fee > 25%', async function () {
      // when
      const newSwapFee = parseEther('0.25').add('1')
      const tx = feeProvider.updateSwapFee(newSwapFee)

      // then
      await expect(tx).revertedWithCustomError(feeProvider, 'FeeIsGreaterThanTheMax')
    })

    it('should update swap fee param', async function () {
      // given
      const currentSwapFee = await feeProvider.swapFee()
      const newSwapFee = parseEther('0.01')
      expect(newSwapFee).not.eq(currentSwapFee)

      // when
      const tx = feeProvider.updateSwapFee(newSwapFee)

      // then
      await expect(tx).emit(feeProvider, 'SwapFeeUpdated').withArgs(currentSwapFee, newSwapFee)
    })
  })

  describe('updateDepositFee', function () {
    it('should revert if caller is not governor', async function () {
      // when
      const tx = feeProvider.connect(alice).updateDepositFee(parseEther('1'))

      // then
      await expect(tx).revertedWithCustomError(feeProvider, 'SenderIsNotGovernor')
    })

    it('should revert if using the current value', async function () {
      // when
      const depositFee = await feeProvider.depositFee()
      const tx = feeProvider.updateDepositFee(depositFee)

      // then
      await expect(tx).revertedWithCustomError(feeProvider, 'NewValueIsSameAsCurrent')
    })

    it('should revert if deposit fee > 25%', async function () {
      // when
      const newDepositFee = parseEther('0.25').add('1')
      const tx = feeProvider.updateDepositFee(newDepositFee)

      // then
      await expect(tx).revertedWithCustomError(feeProvider, 'FeeIsGreaterThanTheMax')
    })

    it('should update deposit fee param', async function () {
      // given
      const currentDepositFee = await feeProvider.depositFee()
      const newDepositFee = parseEther('0.01')
      expect(newDepositFee).not.eq(currentDepositFee)

      // when
      const tx = feeProvider.updateDepositFee(newDepositFee)

      // then
      await expect(tx).emit(feeProvider, 'DepositFeeUpdated').withArgs(currentDepositFee, newDepositFee)
    })
  })

  describe('updateIssueFee', function () {
    it('should revert if caller is not governor', async function () {
      // when
      const tx = feeProvider.connect(alice).updateIssueFee(parseEther('1'))

      // then
      await expect(tx).revertedWithCustomError(feeProvider, 'SenderIsNotGovernor')
    })

    it('should revert if using the current value', async function () {
      // when
      const issueFee = await feeProvider.issueFee()
      const tx = feeProvider.updateIssueFee(issueFee)

      // then
      await expect(tx).revertedWithCustomError(feeProvider, 'NewValueIsSameAsCurrent')
    })

    it('should revert if issue fee > 25%', async function () {
      // when
      const newIssueFee = parseEther('0.25').add('1')
      const tx = feeProvider.updateIssueFee(newIssueFee)

      // then
      await expect(tx).revertedWithCustomError(feeProvider, 'FeeIsGreaterThanTheMax')
    })

    it('should update issue fee param', async function () {
      // given
      const currentIssueFee = await feeProvider.issueFee()
      const newIssueFee = parseEther('0.01')
      expect(newIssueFee).not.eq(currentIssueFee)

      // when
      const tx = feeProvider.updateIssueFee(newIssueFee)

      // then
      await expect(tx).emit(feeProvider, 'IssueFeeUpdated').withArgs(currentIssueFee, newIssueFee)
    })
  })

  describe('updateWithdrawFee', function () {
    it('should revert if caller is not governor', async function () {
      // when
      const tx = feeProvider.connect(alice).updateWithdrawFee(parseEther('1'))

      // then
      await expect(tx).revertedWithCustomError(feeProvider, 'SenderIsNotGovernor')
    })

    it('should revert if using the current value', async function () {
      // when
      const withdrawFee = await feeProvider.withdrawFee()
      const tx = feeProvider.updateWithdrawFee(withdrawFee)

      // then
      await expect(tx).revertedWithCustomError(feeProvider, 'NewValueIsSameAsCurrent')
    })

    it('should revert if withdraw fee > 25%', async function () {
      // when
      const newWithdrawFee = parseEther('0.25').add('1')
      const tx = feeProvider.updateWithdrawFee(newWithdrawFee)

      // then
      await expect(tx).revertedWithCustomError(feeProvider, 'FeeIsGreaterThanTheMax')
    })

    it('should update withdraw fee param', async function () {
      // given
      const currentWithdrawFee = await feeProvider.withdrawFee()
      const newWithdrawFee = parseEther('0.01')
      expect(newWithdrawFee).not.eq(currentWithdrawFee)

      // when
      const tx = feeProvider.updateWithdrawFee(newWithdrawFee)

      // then
      await expect(tx).emit(feeProvider, 'WithdrawFeeUpdated').withArgs(currentWithdrawFee, newWithdrawFee)
    })
  })

  describe('updateRepayFee', function () {
    it('should revert if caller is not governor', async function () {
      // when
      const tx = feeProvider.connect(alice).updateRepayFee(parseEther('1'))

      // then
      await expect(tx).revertedWithCustomError(feeProvider, 'SenderIsNotGovernor')
    })

    it('should revert if using the current value', async function () {
      // when
      const repayFee = await feeProvider.repayFee()
      const tx = feeProvider.updateRepayFee(repayFee)

      // then
      await expect(tx).revertedWithCustomError(feeProvider, 'NewValueIsSameAsCurrent')
    })

    it('should revert if repay fee > 25%', async function () {
      // when
      const newRepayFee = parseEther('0.25').add('1')
      const tx = feeProvider.updateRepayFee(newRepayFee)

      // then
      await expect(tx).revertedWithCustomError(feeProvider, 'FeeIsGreaterThanTheMax')
    })

    it('should update repay fee param', async function () {
      // given
      const currentRepayFee = await feeProvider.repayFee()
      const newRepayFee = parseEther('0.01')
      expect(newRepayFee).not.eq(currentRepayFee)

      // when
      const tx = feeProvider.updateRepayFee(newRepayFee)

      // then
      await expect(tx).emit(feeProvider, 'RepayFeeUpdated').withArgs(currentRepayFee, newRepayFee)
    })
  })

  describe('updateLiquidatorIncentive', function () {
    it('should revert if caller is not governor', async function () {
      // when
      const tx = feeProvider.connect(alice).updateLiquidatorIncentive(parseEther('1'))

      // then
      await expect(tx).revertedWithCustomError(feeProvider, 'SenderIsNotGovernor')
    })

    it('should revert if using the current value', async function () {
      // when
      const [newLiquidatorIncentive] = await feeProvider.liquidationFees()
      const tx = feeProvider.updateLiquidatorIncentive(newLiquidatorIncentive)

      // then
      await expect(tx).revertedWithCustomError(feeProvider, 'NewValueIsSameAsCurrent')
    })

    it('should revert if liquidator incentive > 25%', async function () {
      // when
      const newLiquidatorIncentive = parseEther('0.25').add('1')
      const tx = feeProvider.updateLiquidatorIncentive(newLiquidatorIncentive)

      // then
      await expect(tx).revertedWithCustomError(feeProvider, 'FeeIsGreaterThanTheMax')
    })

    it('should update liquidator incentive param', async function () {
      // given
      const [currentLiquidatorIncentive] = await feeProvider.liquidationFees()
      const newLiquidatorIncentive = parseEther('0.01')
      expect(newLiquidatorIncentive).not.eq(currentLiquidatorIncentive)

      // when
      const tx = feeProvider.updateLiquidatorIncentive(newLiquidatorIncentive)

      // then
      await expect(tx)
        .emit(feeProvider, 'LiquidatorIncentiveUpdated')
        .withArgs(currentLiquidatorIncentive, newLiquidatorIncentive)
    })
  })

  describe('updateProtocolLiquidationFee', function () {
    it('should revert if caller is not governor', async function () {
      // when
      const tx = feeProvider.connect(alice).updateProtocolLiquidationFee(parseEther('1'))

      // then
      await expect(tx).revertedWithCustomError(feeProvider, 'SenderIsNotGovernor')
    })

    it('should revert if using the current value', async function () {
      // when
      const [, newProtocolLiquidationFee] = await feeProvider.liquidationFees()
      const tx = feeProvider.updateProtocolLiquidationFee(newProtocolLiquidationFee)

      // then
      await expect(tx).revertedWithCustomError(feeProvider, 'NewValueIsSameAsCurrent')
    })

    it('should revert if protocol liquidation fee > 25%', async function () {
      // when
      const newProtocolLiquidationFee = parseEther('0.25').add('1')
      const tx = feeProvider.updateProtocolLiquidationFee(newProtocolLiquidationFee)

      // then
      await expect(tx).revertedWithCustomError(feeProvider, 'FeeIsGreaterThanTheMax')
    })

    it('should update protocol liquidation fee param', async function () {
      // given
      const [, currentProtocolLiquidationFee] = await feeProvider.liquidationFees()
      const newProtocolLiquidationFee = parseEther('0.01')
      expect(newProtocolLiquidationFee).not.eq(currentProtocolLiquidationFee)

      // when
      const tx = feeProvider.updateProtocolLiquidationFee(newProtocolLiquidationFee)

      // then
      await expect(tx)
        .emit(feeProvider, 'ProtocolLiquidationFeeUpdated')
        .withArgs(currentProtocolLiquidationFee, newProtocolLiquidationFee)
    })
  })
})
