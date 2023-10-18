import {FakeContract, smock} from '@defi-wonderland/smock'
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {expect} from 'chai'
import {ethers} from 'hardhat'
import {MasterOracleMock, PoolRegistry, SwapperMock} from '../typechain'
import {setStorageAt} from '@nomicfoundation/hardhat-network-helpers'

describe('PoolRegistry', function () {
  let deployer: SignerWithAddress
  let alice: SignerWithAddress
  let bob: SignerWithAddress
  let feeCollector: SignerWithAddress
  let pool: FakeContract
  let poolRegistry: PoolRegistry
  let masterOracleMock: MasterOracleMock
  let swapper: SwapperMock

  beforeEach(async function () {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[deployer, alice, bob, feeCollector] = await ethers.getSigners()

    const masterOracleMockFactory = await ethers.getContractFactory('MasterOracleMock', deployer)
    masterOracleMock = await masterOracleMockFactory.deploy()
    await masterOracleMock.deployed()

    pool = await smock.fake('contracts/Pool.sol:Pool')

    const swapperMockFactory = await ethers.getContractFactory('SwapperMock', deployer)
    swapper = await swapperMockFactory.deploy(masterOracleMock.address)
    await swapper.deployed()

    const poolRegistryFactory = await ethers.getContractFactory('PoolRegistry', deployer)
    poolRegistry = await poolRegistryFactory.deploy()
    await poolRegistry.deployed()
    await setStorageAt(poolRegistry.address, 0, 0) // Undo initialization made by constructor
    await poolRegistry.initialize(masterOracleMock.address, feeCollector.address)
    await poolRegistry.updateSwapper(swapper.address)
  })

  describe('registerPool', function () {
    it('should revert if not governor', async function () {
      const tx = poolRegistry.connect(alice).registerPool(pool.address)
      await expect(tx).revertedWithCustomError(poolRegistry, 'SenderIsNotGovernor')
    })

    it('should revert if pool is null', async function () {
      const tx = poolRegistry.registerPool(ethers.constants.AddressZero)
      await expect(tx).revertedWithCustomError(poolRegistry, 'AddressIsNull')
    })

    it('should revert if adding twice', async function () {
      await poolRegistry.registerPool(pool.address)
      const tx = poolRegistry.registerPool(pool.address)
      await expect(tx).revertedWithCustomError(poolRegistry, 'AlreadyRegistered')
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
      await expect(tx).revertedWithCustomError(poolRegistry, 'SenderIsNotGovernor')
    })

    it('should revert if pool does not registered', async function () {
      await poolRegistry.unregisterPool(pool.address)
      const tx = poolRegistry.unregisterPool(pool.address)
      await expect(tx).revertedWithCustomError(poolRegistry, 'UnregisteredPool')
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
      await expect(tx).revertedWithCustomError(poolRegistry, 'SenderIsNotGovernor')
    })

    it('should revert if feeCollector is null', async function () {
      const tx = poolRegistry.updateFeeCollector(ethers.constants.AddressZero)
      await expect(tx).revertedWithCustomError(poolRegistry, 'FeeCollectorIsNull')
    })

    it('should revert if using the same address', async function () {
      // given
      expect(await poolRegistry.feeCollector()).eq(feeCollector.address)

      // when
      const tx = poolRegistry.updateFeeCollector(feeCollector.address)

      // then
      await expect(tx).revertedWithCustomError(poolRegistry, 'NewValueIsSameAsCurrent')
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
      await expect(tx).revertedWithCustomError(poolRegistry, 'SenderIsNotGovernor')
    })

    it('should revert if using the same address', async function () {
      // given
      expect(await poolRegistry.masterOracle()).eq(masterOracleMock.address)

      // when
      const tx = poolRegistry.updateMasterOracle(masterOracleMock.address)

      // then
      await expect(tx).revertedWithCustomError(poolRegistry, 'NewValueIsSameAsCurrent')
    })

    it('should revert if address is zero', async function () {
      // when
      const tx = poolRegistry.updateMasterOracle(ethers.constants.AddressZero)

      // then
      await expect(tx).revertedWithCustomError(poolRegistry, 'OracleIsNull')
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

  describe('updateNativeTokenGateway', function () {
    it('should revert if not governor', async function () {
      // when
      const tx = poolRegistry.connect(alice).updateNativeTokenGateway(ethers.constants.AddressZero)

      // then
      await expect(tx).revertedWithCustomError(poolRegistry, 'SenderIsNotGovernor')
    })

    it('should revert if using the same address', async function () {
      // given
      await poolRegistry.updateNativeTokenGateway(alice.address)
      expect(await poolRegistry.nativeTokenGateway()).eq(alice.address)

      // when
      const tx = poolRegistry.updateNativeTokenGateway(alice.address)

      // then
      await expect(tx).revertedWithCustomError(poolRegistry, 'NewValueIsSameAsCurrent')
    })

    it('should revert if address is zero', async function () {
      // when
      const tx = poolRegistry.updateNativeTokenGateway(ethers.constants.AddressZero)

      // then
      await expect(tx).revertedWithCustomError(poolRegistry, 'NativeTokenGatewayIsNull')
    })

    it('should update native token gateway contract', async function () {
      // given
      const currentGateway = await poolRegistry.nativeTokenGateway()
      const newGateway = bob.address
      expect(currentGateway).not.eq(newGateway)

      // when
      const tx = poolRegistry.updateNativeTokenGateway(newGateway)

      // then
      await expect(tx).emit(poolRegistry, 'NativeTokenGatewayUpdated').withArgs(currentGateway, newGateway)
      expect(await poolRegistry.nativeTokenGateway()).eq(newGateway)
    })
  })

  describe('updateSwapper', function () {
    it('should revert if using the same address', async function () {
      // given
      expect(await poolRegistry.swapper()).eq(swapper.address)

      // when
      const tx = poolRegistry.updateSwapper(swapper.address)

      // then
      await expect(tx).revertedWithCustomError(poolRegistry, 'NewValueIsSameAsCurrent')
    })

    it('should revert if caller is not governor', async function () {
      // when
      const tx = poolRegistry.connect(alice).updateSwapper(swapper.address)

      // then
      await expect(tx).revertedWithCustomError(poolRegistry, 'SenderIsNotGovernor')
    })

    it('should revert if address is zero', async function () {
      // when
      const tx = poolRegistry.updateSwapper(ethers.constants.AddressZero)

      // then
      await expect(tx).revertedWithCustomError(poolRegistry, 'AddressIsNull')
    })

    it('should update swapper', async function () {
      // given
      const before = await poolRegistry.swapper()
      const after = alice.address

      // when
      const tx = poolRegistry.updateSwapper(after)

      // then
      await expect(tx).emit(poolRegistry, 'SwapperUpdated').withArgs(before, after)
      expect(await poolRegistry.swapper()).eq(after)
    })
  })

  describe('toggleCrossChainFlashRepayIsActive', function () {
    it('should toggle isCrossChainFlashRepayActive flag', async function () {
      const before = await poolRegistry.isCrossChainFlashRepayActive()
      const after = !before
      const tx = poolRegistry.toggleCrossChainFlashRepayIsActive()
      await expect(tx).emit(poolRegistry, 'CrossChainFlashRepayActiveUpdated').withArgs(after)
      expect(await poolRegistry.isCrossChainFlashRepayActive()).eq(after)
    })

    it('should revert if not governor', async function () {
      const tx = poolRegistry.connect(alice).toggleCrossChainFlashRepayIsActive()
      await expect(tx).revertedWithCustomError(poolRegistry, 'SenderIsNotGovernor')
    })
  })
})
