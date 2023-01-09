/* eslint-disable camelcase */
import {parseEther} from '@ethersproject/units'
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {expect} from 'chai'
import {ethers} from 'hardhat'
import {PauseableMock, PauseableMock__factory} from '../../typechain'

describe('Pauseable', function () {
  let governor: SignerWithAddress
  let user: SignerWithAddress
  let pauseable: PauseableMock

  beforeEach(async function () {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[governor, user] = await ethers.getSigners()
    const pauseableFactory = new PauseableMock__factory(governor)
    pauseable = await pauseableFactory.deploy()
  })

  describe('pause', function () {
    it('should revert if caller is not governor', async function () {
      // when
      const tx = pauseable.connect(user).pause()

      // then
      await expect(tx).revertedWithCustomError(pauseable, 'SenderIsNotGovernor')
    })

    it('should revert if already paused', async function () {
      // given
      await pauseable.pause()

      // when
      const tx = pauseable.connect(user).pause()

      // then
      await expect(tx).revertedWithCustomError(pauseable, 'IsPaused')
    })

    it('should pause', async function () {
      // given
      expect(await pauseable.paused()).false

      // when
      await pauseable.pause()

      // then
      expect(await pauseable.paused()).true
    })
  })

  describe('unpause', function () {
    beforeEach(async function () {
      await pauseable.pause()
    })

    it('should revert if caller is not governor', async function () {
      const tx = pauseable.connect(user).unpause()
      await expect(tx).revertedWithCustomError(pauseable, 'SenderIsNotGovernor')
    })

    it('should revert if not paused', async function () {
      // given
      await pauseable.unpause()

      // when
      const tx = pauseable.unpause()

      // then
      await expect(tx).revertedWithCustomError(pauseable, 'IsNotPaused')
    })

    it('should revert if shutdown', async function () {
      // given
      await pauseable.shutdown()

      // when
      const tx = pauseable.unpause()

      // then
      await expect(tx).revertedWithCustomError(pauseable, 'IsShutdown')
    })

    it('should unpause', async function () {
      // given
      expect(await pauseable.paused()).true

      // when
      await pauseable.unpause()

      // then
      expect(await pauseable.paused()).false
    })
  })

  describe('open', function () {
    beforeEach(async function () {
      await pauseable.shutdown()
    })

    it('should revert if caller is not governor', async function () {
      const tx = pauseable.connect(user).open()
      await expect(tx).revertedWithCustomError(pauseable, 'SenderIsNotGovernor')
    })

    it('should revert if not shutdown', async function () {
      // given
      await pauseable.open()

      // when
      const tx = pauseable.open()

      // then
      await expect(tx).revertedWithCustomError(pauseable, 'IsNotShutdown')
    })

    it('should open', async function () {
      // given
      expect(await pauseable.everythingStopped()).true
      expect(await pauseable.paused()).true

      // when
      await pauseable.open()

      // then
      expect(await pauseable.everythingStopped()).false
      expect(await pauseable.paused()).true
    })
  })

  describe('shutdown', function () {
    it('should revert if caller is not governor', async function () {
      const tx = pauseable.connect(user).shutdown()
      await expect(tx).revertedWithCustomError(pauseable, 'SenderIsNotGovernor')
    })

    it('should revert if already shutdown', async function () {
      await pauseable.shutdown()
      const tx = pauseable.connect(user).shutdown()
      await expect(tx).revertedWithCustomError(pauseable, 'IsShutdown')
    })

    it('should shutdown', async function () {
      // given
      expect(await pauseable.paused()).false
      expect(await pauseable.everythingStopped()).false

      // when
      await pauseable.shutdown()

      // then
      expect(await pauseable.paused()).true
      expect(await pauseable.everythingStopped()).true
    })
  })
})
