/* eslint-disable camelcase */
import {parseEther} from '@ethersproject/units'
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {expect} from 'chai'
import {ethers} from 'hardhat'
import {DepositLedger__factory, DepositLedger} from '../typechain'

describe('DepositLedger', function () {
  let deployer: SignerWithAddress
  let user: SignerWithAddress
  let depositLedger: DepositLedger

  beforeEach(async function () {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[deployer, user] = await ethers.getSigners()

    const depositLedgerFactory = new DepositLedger__factory(deployer)
    depositLedger = await depositLedgerFactory.deploy()
  })

  describe('mint', function () {
    it('should mint', async function () {
      expect(await depositLedger.balanceOf(user.address)).to.eq(0)
      const amount = parseEther('100')
      await depositLedger.mint(user.address, amount)
      expect(await depositLedger.balanceOf(user.address)).to.eq(amount)
    })

    it('should revert if not owner', async function () {
      const tx = depositLedger.connect(user).mint(user.address, parseEther('10'))
      await expect(tx).to.revertedWith('Ownable: caller is not the owner')
    })
  })

  describe('when user has some balance', function () {
    const amount = parseEther('100')

    beforeEach(async function () {
      await depositLedger.mint(user.address, amount)
      expect(await depositLedger.balanceOf(user.address)).to.eq(amount)
    })

    describe('burn', function () {
      it('should burn', async function () {
        await depositLedger.burn(user.address, amount)
        expect(await depositLedger.balanceOf(user.address)).to.eq(0)
      })

      it('should revert if not owner', async function () {
        const tx = depositLedger.connect(user).burn(user.address, parseEther('10'))
        await expect(tx).to.revertedWith('Ownable: caller is not the owner')
      })

      it('should revert if amount > free', async function () {
        // given
        const balance = await depositLedger.balanceOf(user.address)
        const half = amount.div('2')
        await depositLedger.lock(user.address, half)
        const free = await depositLedger.freeBalanceOf(user.address)
        expect(free).to.lt(balance)
        const toBurn = free.add('1')
        expect(balance).to.gt(toBurn)

        // when
        const tx = depositLedger.burn(user.address, toBurn)

        // then
        await expect(tx).to.revertedWith('amount-gt-free')
      })
    })

    describe('lock', function () {
      it('should lock', async function () {
        // given
        expect(await depositLedger.balanceOf(user.address)).to.eq(amount)
        expect(await depositLedger.lockedBalanceOf(user.address)).to.eq(0)
        expect(await depositLedger.freeBalanceOf(user.address)).to.eq(amount)

        // when
        const half = amount.div('2')
        await depositLedger.lock(user.address, half)

        // then
        expect(await depositLedger.balanceOf(user.address)).to.eq(amount)
        expect(await depositLedger.lockedBalanceOf(user.address)).to.eq(half)
        expect(await depositLedger.freeBalanceOf(user.address)).to.eq(half)
      })

      it('should revert if not owner', async function () {
        const tx = depositLedger.connect(user).lock(user.address, parseEther('10'))
        await expect(tx).to.revertedWith('Ownable: caller is not the owner')
      })

      it('should revert if lock amount > balance', async function () {
        const invalidAmount = amount.mul('2')
        const tx = depositLedger.lock(user.address, invalidAmount)
        await expect(tx).to.revertedWith('amount-gt-balance')
      })
    })

    describe('when user has some amount of tokens locked', function () {
      beforeEach(async function () {
        const half = amount.div('2')
        await depositLedger.lock(user.address, half)
      })

      describe('unlock', function () {
        it('should unlock', async function () {
          // given
          const balanceBefore = await depositLedger.balanceOf(user.address)
          const lockedBefore = await depositLedger.lockedBalanceOf(user.address)

          // when
          await depositLedger.unlock(user.address, lockedBefore)

          // then
          expect(await depositLedger.balanceOf(user.address)).to.eq(balanceBefore)
          expect(await depositLedger.lockedBalanceOf(user.address)).to.eq(0)
          expect(await depositLedger.freeBalanceOf(user.address)).to.eq(balanceBefore)
        })

        it('should revert if not owner', async function () {
          const tx = depositLedger.connect(user).unlock(user.address, parseEther('10'))
          await expect(tx).to.revertedWith('Ownable: caller is not the owner')
        })

        it('should revert if unlock amount > locked', async function () {
          const locked = await depositLedger.lockedBalanceOf(user.address)
          const invalidAmount = locked.mul('2')
          const tx = depositLedger.unlock(user.address, invalidAmount)
          await expect(tx).to.revertedWith('amount-gt-locked')
        })
      })

      describe('transfer', function () {
        it('should revert if amount > free', async function () {
          // given
          const balance = await depositLedger.balanceOf(user.address)
          const free = await depositLedger.freeBalanceOf(user.address)
          const toTransfer = free.add('1')
          expect(balance).to.gt(toTransfer)

          // when
          const tx = depositLedger.connect(user).transfer(deployer.address, toTransfer)

          // then
          await expect(tx).to.revertedWith('not-enough-free-balance')
        })

        it('should transfer free amount', async function () {
          const free = await depositLedger.freeBalanceOf(user.address)
          const toTransfer = free

          const tx = () => depositLedger.connect(user).transfer(deployer.address, toTransfer)

          expect(tx).to.changeTokenBalances(depositLedger, [user, deployer], [toTransfer.mul('-1'), toTransfer])
        })
      })
    })
  })
})
