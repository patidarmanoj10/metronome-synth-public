/* eslint-disable camelcase */
import {parseEther} from '@ethersproject/units'
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {expect} from 'chai'
import {ethers} from 'hardhat'
import {
  DepositToken__factory,
  DepositToken,
  ERC20Mock__factory,
  ERC20Mock,
  MBoxMock,
  MBoxMock__factory,
} from '../typechain'
import {HOUR} from './helpers'

describe('DepositToken', function () {
  let deployer: SignerWithAddress
  let governor: SignerWithAddress
  let user: SignerWithAddress
  let met: ERC20Mock
  let mBox: MBoxMock
  let depositToken: DepositToken

  beforeEach(async function () {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[deployer, governor, user] = await ethers.getSigners()

    const metMockFactory = new ERC20Mock__factory(deployer)
    met = await metMockFactory.deploy('Metronome', 'MET')
    await met.deployed()

    const depositTokenFactory = new DepositToken__factory(deployer)
    depositToken = await depositTokenFactory.deploy(met.address)
    await depositToken.deployed()

    const mBoxMockFactory = new MBoxMock__factory(deployer)
    mBox = await mBoxMockFactory.deploy(depositToken.address)
    await mBox.deployed()

    await depositToken.transferGovernorship(governor.address)
    await depositToken.connect(governor).acceptGovernorship()
    depositToken = depositToken.connect(governor)
    await depositToken.setMBox(mBox.address)
  })

  describe('mint', function () {
    it('should mint', async function () {
      // given
      expect(await depositToken.balanceOf(user.address)).to.eq(0)
      expect(await depositToken.lastDepositOf(user.address)).to.eq(0)

      // when
      const amount = parseEther('100')

      const call = depositToken.interface.encodeFunctionData('mint', [user.address, amount])

      await mBox.mockCall(depositToken.address, call)

      // then
      expect(await depositToken.balanceOf(user.address)).to.eq(amount)
      const lastBlock = await await ethers.provider.getBlock('latest')
      expect(await depositToken.lastDepositOf(user.address)).to.eq(lastBlock.timestamp)
    })

    it('should revert if not mbox', async function () {
      const tx = depositToken.connect(user).mint(user.address, parseEther('10'))
      await expect(tx).to.revertedWith('not-mbox')
    })
  })

  describe('when user has some balance', function () {
    const amount = parseEther('100')

    beforeEach(async function () {
      const call = depositToken.interface.encodeFunctionData('mint', [user.address, amount])
      await mBox.mockCall(depositToken.address, call)
      expect(await depositToken.balanceOf(user.address)).to.eq(amount)
    })

    describe('burnAsFee', function () {
      it('should revert if not mbox', async function () {
        const tx = depositToken.connect(user).burnAsFee(user.address, parseEther('10'))
        await expect(tx).to.revertedWith('not-mbox')
      })

      it('should revert if amount > free amount', async function () {
        // given
        const {_unlockedDeposit} = await mBox.debtPositionOf(user.address)

        // when
        const call = depositToken.interface.encodeFunctionData('burnAsFee', [
          deployer.address,
          _unlockedDeposit.add('1'),
        ])
        const tx = mBox.mockCall(depositToken.address, call)

        // then
        await expect(tx).to.revertedWith('not-enough-free-balance')
      })

      it('should burn if amount <= free amount', async function () {
        // given
        const {_unlockedDeposit} = await mBox.debtPositionOf(user.address)
        expect(await depositToken.balanceOf(user.address)).to.eq(amount)

        // when
        const call = depositToken.interface.encodeFunctionData('burnAsFee', [user.address, _unlockedDeposit])
        await mBox.mockCall(depositToken.address, call)

        // then
        expect(await depositToken.balanceOf(user.address)).to.eq(amount.sub(_unlockedDeposit))
      })
    })

    describe('burnForWithdraw', function () {
      it('should revert if not mbox', async function () {
        const tx = depositToken.connect(user).burnForWithdraw(user.address, parseEther('10'))
        await expect(tx).to.revertedWith('not-mbox')
      })

      it('should revert if minimum deposit time have not passed', async function () {
        // given
        await depositToken.connect(governor).setMinDepositTime(HOUR)

        // when
        const call = depositToken.interface.encodeFunctionData('burnForWithdraw', [user.address, parseEther('10')])
        const tx = mBox.mockCall(depositToken.address, call)

        // then
        await expect(tx).to.revertedWith('min-deposit-time-have-not-passed')
      })

      it('should revert if amount > free amount', async function () {
        // given
        const {_unlockedDeposit} = await mBox.debtPositionOf(user.address)

        // when
        const call = depositToken.interface.encodeFunctionData('burnForWithdraw', [
          user.address,
          _unlockedDeposit.add('1'),
        ])
        const tx = mBox.mockCall(depositToken.address, call)

        // then
        await expect(tx).to.revertedWith('not-enough-free-balance')
      })

      it('should burn if amount <= free amount', async function () {
        // given
        const {_unlockedDeposit} = await mBox.debtPositionOf(user.address)
        expect(await depositToken.balanceOf(user.address)).to.eq(amount)

        // when
        const call = depositToken.interface.encodeFunctionData('burnForWithdraw', [user.address, _unlockedDeposit])
        await mBox.mockCall(depositToken.address, call)

        // then
        expect(await depositToken.balanceOf(user.address)).to.eq(amount.sub(_unlockedDeposit))
      })
    })

    describe('burn', function () {
      it('should burn', async function () {
        const call = depositToken.interface.encodeFunctionData('burn', [user.address, amount])
        await mBox.mockCall(depositToken.address, call)
        expect(await depositToken.balanceOf(user.address)).to.eq(0)
      })

      it('should revert if not mbox', async function () {
        const tx = depositToken.connect(user).burn(user.address, parseEther('10'))
        await expect(tx).to.revertedWith('not-mbox')
      })
    })

    describe('transfer', function () {
      beforeEach(async function () {
        await mBox.updateLockedCollateral(amount.div('2'))
      })

      it('should transfer if amount <= free amount', async function () {
        const {_unlockedDeposit} = await mBox.debtPositionOf(user.address)
        expect(await depositToken.balanceOf(user.address)).to.eq(amount)
        await depositToken.connect(user).transfer(deployer.address, _unlockedDeposit)
        expect(await depositToken.balanceOf(user.address)).to.eq(amount.sub(_unlockedDeposit))
      })

      it('should revert if minimum deposit time have not passed', async function () {
        // given
        await depositToken.connect(governor).setMinDepositTime(HOUR)

        // when
        const {_unlockedDeposit} = await mBox.debtPositionOf(user.address)
        const tx = depositToken.connect(user).transfer(deployer.address, _unlockedDeposit)

        // then
        await expect(tx).to.revertedWith('min-deposit-time-have-not-passed')
      })

      it('should revert if amount > free amount', async function () {
        const {_unlockedDeposit} = await mBox.debtPositionOf(user.address)
        const tx = depositToken.connect(user).transfer(deployer.address, _unlockedDeposit.add('1'))
        await expect(tx).to.revertedWith('not-enough-free-balance')
      })
    })

    describe('transferFrom', function () {
      beforeEach(async function () {
        await mBox.updateLockedCollateral(amount.div('2'))
        await depositToken.connect(user).approve(deployer.address, ethers.constants.MaxUint256)
      })

      it('should transfer if amount <= free amount', async function () {
        const {_unlockedDeposit} = await mBox.debtPositionOf(user.address)
        expect(await depositToken.balanceOf(user.address)).to.eq(amount)
        await depositToken.connect(deployer).transferFrom(user.address, deployer.address, _unlockedDeposit)
        expect(await depositToken.balanceOf(user.address)).to.eq(amount.sub(_unlockedDeposit))
      })

      it('should revert if minimum deposit time have not passed', async function () {
        // given
        await depositToken.connect(governor).setMinDepositTime(HOUR)

        // when
        const {_unlockedDeposit} = await mBox.debtPositionOf(user.address)
        const tx = depositToken.connect(deployer).transferFrom(user.address, deployer.address, _unlockedDeposit)

        // then
        await expect(tx).to.revertedWith('min-deposit-time-have-not-passed')
      })

      it('should revert if amount > free amount', async function () {
        const {_unlockedDeposit} = await mBox.debtPositionOf(user.address)
        const tx = depositToken
          .connect(deployer)
          .transferFrom(user.address, deployer.address, _unlockedDeposit.add('1'))
        await expect(tx).to.revertedWith('not-enough-free-balance')
      })
    })

    describe('seize', function () {
      it('should revert if not mbox', async function () {
        const tx = depositToken.connect(user).seize(user.address, deployer.address, parseEther('10'))
        await expect(tx).to.revertedWith('not-mbox')
      })

      it('should seize tokens', async function () {
        const amountToSeize = parseEther('10')

        const call = depositToken.interface.encodeFunctionData('seize', [user.address, deployer.address, amountToSeize])
        const tx = () => mBox.mockCall(depositToken.address, call)

        await expect(tx).to.changeTokenBalances(
          depositToken,
          [user, deployer],
          [amountToSeize.mul('-1'), amountToSeize]
        )
      })
    })
  })
})
