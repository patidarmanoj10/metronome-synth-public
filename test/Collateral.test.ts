/* eslint-disable camelcase */
import {parseEther} from '@ethersproject/units'
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {expect} from 'chai'
import {ethers} from 'hardhat'
import {Collateral__factory, Collateral} from '../typechain'

describe('Collateral', function () {
  let deployer: SignerWithAddress
  let user: SignerWithAddress
  let collateral: Collateral

  beforeEach(async function () {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[deployer, user] = await ethers.getSigners()

    const collateralFactory = new Collateral__factory(deployer)
    collateral = await collateralFactory.deploy()
  })

  describe('mint', function () {
    it('should mint', async function () {
      expect(await collateral.balanceOf(user.address)).to.eq(0)
      const amount = parseEther('100')
      await collateral.mint(user.address, amount)
      expect(await collateral.balanceOf(user.address)).to.eq(amount)
    })

    it('should revert if not owner', async function () {
      const tx = collateral.connect(user).mint(user.address, parseEther('10'))
      await expect(tx).to.revertedWith('Ownable: caller is not the owner')
    })
  })

  describe('when user has some balance', function () {
    const amount = parseEther('100')

    beforeEach(async function () {
      await collateral.mint(user.address, amount)
      expect(await collateral.balanceOf(user.address)).to.eq(amount)
    })

    describe('burn', function () {
      it('should burn', async function () {
        await collateral.burn(user.address, amount)
        expect(await collateral.balanceOf(user.address)).to.eq(0)
      })

      it('should revert if not owner', async function () {
        const tx = collateral.connect(user).burn(user.address, parseEther('10'))
        await expect(tx).to.revertedWith('Ownable: caller is not the owner')
      })

      it('should revert if amount > free', async function () {
        // given
        const balance = await collateral.balanceOf(user.address)
        const half = amount.div('2')
        await collateral.lock(user.address, half)
        const free = await collateral.freeBalanceOf(user.address)
        expect(free).to.lt(balance)
        const toBurn = free.add('1')
        expect(balance).to.gt(toBurn)

        // when
        const tx = collateral.burn(user.address, toBurn)

        // then
        await expect(tx).to.revertedWith('amount-gt-free')
      })
    })

    describe('lock', function () {
      it('should lock', async function () {
        // given
        expect(await collateral.balanceOf(user.address)).to.eq(amount)
        expect(await collateral.lockedBalanceOf(user.address)).to.eq(0)
        expect(await collateral.freeBalanceOf(user.address)).to.eq(amount)

        // when
        const half = amount.div('2')
        await collateral.lock(user.address, half)

        // then
        expect(await collateral.balanceOf(user.address)).to.eq(amount)
        expect(await collateral.lockedBalanceOf(user.address)).to.eq(half)
        expect(await collateral.freeBalanceOf(user.address)).to.eq(half)
      })

      it('should revert if not owner', async function () {
        const tx = collateral.connect(user).lock(user.address, parseEther('10'))
        await expect(tx).to.revertedWith('Ownable: caller is not the owner')
      })

      it('should revert if lock amount > balance', async function () {
        const invalidAmount = amount.mul('2')
        const tx = collateral.lock(user.address, invalidAmount)
        await expect(tx).to.revertedWith('amount-gt-balance')
      })
    })

    describe('when user has some amount of tokens locked', function () {
      beforeEach(async function () {
        const half = amount.div('2')
        await collateral.lock(user.address, half)
      })

      describe('unlock', function () {
        it('should unlock', async function () {
          // given
          const balanceBefore = await collateral.balanceOf(user.address)
          const lockedBefore = await collateral.lockedBalanceOf(user.address)

          // when
          await collateral.unlock(user.address, lockedBefore)

          // then
          expect(await collateral.balanceOf(user.address)).to.eq(balanceBefore)
          expect(await collateral.lockedBalanceOf(user.address)).to.eq(0)
          expect(await collateral.freeBalanceOf(user.address)).to.eq(balanceBefore)
        })

        it('should revert if not owner', async function () {
          const tx = collateral.connect(user).unlock(user.address, parseEther('10'))
          await expect(tx).to.revertedWith('Ownable: caller is not the owner')
        })

        it('should revert if unlock amount > locked', async function () {
          const locked = await collateral.lockedBalanceOf(user.address)
          const invalidAmount = locked.mul('2')
          const tx = collateral.unlock(user.address, invalidAmount)
          await expect(tx).to.revertedWith('amount-gt-locked')
        })
      })

      describe('transfer', function () {
        it('should revert if amount > free', async function () {
          // given
          const balance = await collateral.balanceOf(user.address)
          const free = await collateral.freeBalanceOf(user.address)
          const toTransfer = free.add('1')
          expect(balance).to.gt(toTransfer)

          // when
          const tx = collateral.connect(user).transfer(deployer.address, toTransfer)

          // then
          await expect(tx).to.revertedWith('not-enough-free-balance')
        })

        it('should transfer free amount', async function () {
          const free = await collateral.freeBalanceOf(user.address)
          const toTransfer = free

          const tx = () => collateral.connect(user).transfer(deployer.address, toTransfer)

          expect(tx).to.changeTokenBalances(collateral, [user, deployer], [toTransfer.mul('-1'), toTransfer])
        })
      })
    })
  })
})
