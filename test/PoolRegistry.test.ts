/* eslint-disable camelcase */
import {FakeContract, smock} from '@defi-wonderland/smock'
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {expect} from 'chai'
import {ethers} from 'hardhat'
import {MasterOracleMock, MasterOracleMock__factory, PoolRegistry, PoolRegistry__factory} from '../typechain'

describe('PoolRegistry', function () {
  let deployer: SignerWithAddress
  let alice: SignerWithAddress
  let bob: SignerWithAddress
  let feeCollector: SignerWithAddress
  let pool: FakeContract
  let poolRegistry: PoolRegistry
  let masterOracleMock: MasterOracleMock

  beforeEach(async function () {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[deployer, alice, bob, feeCollector] = await ethers.getSigners()

    const masterOracleMockFactory = new MasterOracleMock__factory(deployer)
    masterOracleMock = await masterOracleMockFactory.deploy()
    await masterOracleMock.deployed()

    pool = await smock.fake('Pool')

    const poolRegistryFactory = new PoolRegistry__factory(deployer)
    poolRegistry = await poolRegistryFactory.deploy()
    await poolRegistry.deployed()
    await poolRegistry.initialize(masterOracleMock.address, feeCollector.address)
  })

  describe('registerPool', function () {
    it('should revert if not governor', async function () {
      const tx = poolRegistry.connect(alice).registerPool(pool.address)
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
      const id = await poolRegistry.nextPoolId()
      expect(id).eq(1)
      expect(await poolRegistry.getPools()).to.deep.eq([])

      // when
      const tx = poolRegistry.registerPool(pool.address)

      // then
      await expect(tx).emit(poolRegistry, 'PoolRegistered').withArgs(id, pool.address)
      expect(await poolRegistry.getPools()).to.deep.eq([pool.address])
      expect(await poolRegistry.nextPoolId()).eq(2)
      expect(await poolRegistry.idOfPool(pool.address)).eq(1)
    })

    it('should manage pool ids', async function () {
      // given
      expect(await poolRegistry.nextPoolId()).eq(1)

      // when
      await poolRegistry.registerPool(alice.address)
      await poolRegistry.unregisterPool(alice.address)
      await poolRegistry.registerPool(bob.address)
      await poolRegistry.registerPool(alice.address)

      // then
      expect(await poolRegistry.idOfPool(alice.address)).eq(1)
      expect(await poolRegistry.idOfPool(bob.address)).eq(2)
      expect(await poolRegistry.nextPoolId()).eq(3)
    })
  })

  describe('unregisterPool', function () {
    beforeEach(async function () {
      await poolRegistry.registerPool(pool.address)
    })

    it('should revert if not governor', async function () {
      const tx = poolRegistry.connect(alice).unregisterPool(pool.address)
      await expect(tx).revertedWith('not-governor')
    })

    it('should revert if pool does not registered', async function () {
      await poolRegistry.unregisterPool(pool.address)
      const tx = poolRegistry.unregisterPool(pool.address)
      await expect(tx).revertedWith('not-registered')
    })

    it('should unregister pool', async function () {
      // given
      const id = await poolRegistry.idOfPool(pool.address)
      expect(await poolRegistry.getPools()).to.deep.eq([pool.address])

      // when
      const tx = poolRegistry.unregisterPool(pool.address)

      // then
      await expect(tx).emit(poolRegistry, 'PoolUnregistered').withArgs(id, pool.address)
      expect(await poolRegistry.getPools()).to.deep.eq([])
    })
  })

  describe('updateFeeCollector', function () {
    it('should revert if not governor', async function () {
      const tx = poolRegistry.connect(bob).updateFeeCollector(bob.address)
      await expect(tx).revertedWith('not-governor')
    })

    it('should revert if feeCollector is null', async function () {
      const tx = poolRegistry.updateFeeCollector(ethers.constants.AddressZero)
      await expect(tx).revertedWith('fee-collector-is-null')
    })

    it('should revert if using the same address', async function () {
      // given
      expect(await poolRegistry.feeCollector()).eq(feeCollector.address)

      // when
      const tx = poolRegistry.updateFeeCollector(feeCollector.address)

      // then
      await expect(tx).revertedWith('new-same-as-current')
    })

    it('should update fee collector', async function () {
      // given
      const before = await poolRegistry.feeCollector()
      expect(before).to.eq(feeCollector.address)

      // when
      const tx = poolRegistry.updateFeeCollector(alice.address)

      // then
      await expect(tx).emit(poolRegistry, 'FeeCollectorUpdated').withArgs(before, alice.address)
      const after = await poolRegistry.feeCollector()
      expect(after).to.eq(alice.address)
    })
  })

  describe('updateMasterOracle', function () {
    it('should revert if not governor', async function () {
      // when
      const tx = poolRegistry.connect(alice).updateMasterOracle(ethers.constants.AddressZero)

      // then
      await expect(tx).revertedWith('not-governor')
    })

    it('should revert if using the same address', async function () {
      // given
      expect(await poolRegistry.masterOracle()).eq(masterOracleMock.address)

      // when
      const tx = poolRegistry.updateMasterOracle(masterOracleMock.address)

      // then
      await expect(tx).revertedWith('new-same-as-current')
    })

    it('should revert if address is zero', async function () {
      // when
      const tx = poolRegistry.updateMasterOracle(ethers.constants.AddressZero)

      // then
      await expect(tx).revertedWith('address-is-null')
    })

    it('should update master oracle contract', async function () {
      // given
      const currentMasterOracle = await poolRegistry.masterOracle()
      const newMasterOracle = bob.address
      expect(currentMasterOracle).not.eq(newMasterOracle)

      // when
      const tx = poolRegistry.updateMasterOracle(newMasterOracle)

      // then
      await expect(tx).emit(poolRegistry, 'MasterOracleUpdated').withArgs(currentMasterOracle, newMasterOracle)
      expect(await poolRegistry.masterOracle()).eq(newMasterOracle)
    })
  })
})
