/* eslint-disable camelcase */
import {FakeContract, smock} from '@defi-wonderland/smock'
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {expect} from 'chai'
import {ethers} from 'hardhat'
import {PoolRegistry, PoolRegistry__factory} from '../typechain'

describe('PoolRegistry', function () {
  let deployer: SignerWithAddress
  let user: SignerWithAddress
  let pool: FakeContract
  let poolRegistry: PoolRegistry

  beforeEach(async function () {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[deployer, user] = await ethers.getSigners()

    pool = await smock.fake('Controller')

    const poolRegistryFactory = new PoolRegistry__factory(deployer)
    poolRegistry = await poolRegistryFactory.deploy()
    await poolRegistry.deployed()
    await poolRegistry.initialize()
  })

  describe('registerPool', function () {
    it('should revert if not governor', async function () {
      const tx = poolRegistry.connect(user).registerPool(pool.address)
      await expect(tx).revertedWith('not-governor')
    })

    it('should revert if pool is null', async function () {
      const tx = poolRegistry.registerPool(ethers.constants.AddressZero)
      await expect(tx).revertedWith('address-is-null')
    })

    it('should revert if adding twice', async function () {
      await poolRegistry.registerPool(pool.address)
      const tx = poolRegistry.registerPool(pool.address)
      await expect(tx).revertedWith('already-registered')
    })

    it('should register pool', async function () {
      // given
      const before = await poolRegistry.getPools()
      expect(before).to.deep.eq([])

      // when
      const tx = poolRegistry.registerPool(pool.address)

      // then
      await expect(tx).emit(poolRegistry, 'PoolRegistered').withArgs(pool.address)
      const after = await poolRegistry.getPools()
      expect(after).to.deep.eq([pool.address])
    })
  })

  describe('unregisterPool', function () {
    beforeEach(async function () {
      await poolRegistry.registerPool(pool.address)
    })

    it('should revert if not governor', async function () {
      const tx = poolRegistry.connect(user).unregisterPool(pool.address)
      await expect(tx).revertedWith('not-governor')
    })

    it('should revert if pool does not registered', async function () {
      await poolRegistry.unregisterPool(pool.address)
      const tx = poolRegistry.unregisterPool(pool.address)
      await expect(tx).revertedWith('not-registered')
    })

    it('should unregister pool', async function () {
      // given
      const before = await poolRegistry.getPools()
      expect(before).to.deep.eq([pool.address])

      // when
      const tx = poolRegistry.unregisterPool(pool.address)

      // then
      await expect(tx).emit(poolRegistry, 'PoolUnregistered').withArgs(pool.address)
      const after = await poolRegistry.getPools()
      expect(after).to.deep.eq([])
    })
  })
})
