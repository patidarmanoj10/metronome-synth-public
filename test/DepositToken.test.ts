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
    depositToken = depositToken.connect(governor)
    await depositToken.setMBox(governor.address)
  })

  describe('mint', function () {
    it('should mint', async function () {
      // given

      expect(await depositToken.balanceOf(user.address)).to.eq(0)

      // when
      const amount = parseEther('100')
      await depositToken.mint(user.address, amount)

      // then
      expect(await depositToken.balanceOf(user.address)).to.eq(amount)
    })

    it('should revert if not mbox', async function () {
      const tx = depositToken.connect(user).mint(user.address, parseEther('10'))
      await expect(tx).to.revertedWith('not-mbox')
    })
  })

  describe('when user has some balance', function () {
    const amount = parseEther('100')

    beforeEach(async function () {
      await depositToken.mint(user.address, amount)
      expect(await depositToken.balanceOf(user.address)).to.eq(amount)
    })

    describe('burn', function () {
      it('should burn', async function () {
        await depositToken.burn(user.address, amount)
        expect(await depositToken.balanceOf(user.address)).to.eq(0)
      })

      it('should revert if not mbox', async function () {
        const tx = depositToken.connect(user).burn(user.address, parseEther('10'))
        await expect(tx).to.revertedWith('not-mbox')
      })
    })

    describe('transfer', function () {
      beforeEach(async function () {
        await depositToken.setMBox(mBox.address)
        await mBox.updateLockedCollateral(amount.div('2'))
      })

      it('should transfer if amount <= free amount', async function () {
        const {_unlockedDeposit} = await mBox.debtPositionOf(user.address)
        expect(await depositToken.balanceOf(user.address)).to.eq(amount)
        await depositToken.connect(user).transfer(deployer.address, _unlockedDeposit)
        expect(await depositToken.balanceOf(user.address)).to.eq(amount.sub(_unlockedDeposit))
      })

      it('should revert if amount > free amount', async function () {
        const {_unlockedDeposit} = await mBox.debtPositionOf(user.address)
        const tx = depositToken.connect(user).transfer(deployer.address, _unlockedDeposit.add('1'))
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
        const tx = () => depositToken.seize(user.address, deployer.address, amountToSeize)
        await expect(tx).to.changeTokenBalances(
          depositToken,
          [user, deployer],
          [amountToSeize.mul('-1'), amountToSeize]
        )
      })
    })
  })
})
