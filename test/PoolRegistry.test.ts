/* eslint-disable camelcase */
import {FakeContract, MockContract, smock} from '@defi-wonderland/smock'
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {expect} from 'chai'
import {parseEther} from 'ethers/lib/utils'
import {ethers} from 'hardhat'
import {toUSD} from '../helpers'
import {MasterOracleMock, MasterOracleMock__factory, PoolRegistry, PoolRegistry__factory} from '../typechain'
import {impersonateAccount, setEtherBalance} from './helpers'

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

  describe('swap', function () {
    const userMintAmount = parseEther('1')
    const ethPrice = toUSD('4000') // 1 ETH = $4,000
    const dogePrice = toUSD('0.4') // 1 DOGE = $0.4
    let msEth: MockContract
    let msDoge: MockContract

    beforeEach(async function () {
      await poolRegistry.registerPool(pool.address)
      pool.isSyntheticTokenExists.returns(true)

      const msEthFactory = await smock.mock('SyntheticToken')
      msEth = await msEthFactory.deploy()
      await msEth.initialize('msEth', 'msEth', 18, poolRegistry.address)

      const msDogeFactory = await smock.mock('SyntheticToken')
      msDoge = await msDogeFactory.deploy()
      await msDoge.initialize('msDoge', 'msDoge', 18, poolRegistry.address)

      await masterOracleMock.updatePrice(msEth.address, ethPrice)
      await masterOracleMock.updatePrice(msDoge.address, dogePrice)

      await setEtherBalance(poolRegistry.address, parseEther('1'))
      await impersonateAccount(poolRegistry.address)
      const poolRegistryWallet = await ethers.getSigner(poolRegistry.address)
      await msEth.connect(poolRegistryWallet).mint(alice.address, userMintAmount)
    })

    it('should not revert if paused', async function () {
      // given
      await poolRegistry.pause()

      // when
      const amount = parseEther('0.1')
      const tx = poolRegistry.connect(alice).swap(msEth.address, msDoge.address, amount)

      // then
      await expect(tx).emit(poolRegistry, 'SyntheticTokenSwapped')
    })

    it('should revert if shutdown', async function () {
      // given
      await poolRegistry.shutdown()

      // when
      const amount = parseEther('0.1')
      const tx = poolRegistry.connect(alice).swap(msEth.address, msDoge.address, amount)

      // then
      await expect(tx).revertedWith('shutdown')
    })

    it('should revert if amount == 0', async function () {
      // when
      const tx = poolRegistry.connect(alice).swap(msEth.address, msDoge.address, 0)

      // then
      await expect(tx).revertedWith('amount-in-is-invalid')
    })

    it('should revert if synthetic out is not active', async function () {
      // given
      await msDoge.toggleIsActive()

      // when
      const amountIn = await msEth.balanceOf(alice.address)
      const tx = poolRegistry.connect(alice).swap(msEth.address, msDoge.address, amountIn)

      // then
      await expect(tx).revertedWith('synthetic-inactive')
    })

    it('should revert if user has not enough balance', async function () {
      // given
      const msAssetInBalance = await msEth.balanceOf(alice.address)

      // when
      const amountIn = msAssetInBalance.add('1')
      const tx = poolRegistry.connect(alice).swap(msEth.address, msDoge.address, amountIn)

      // then
      await expect(tx).revertedWith('amount-in-is-invalid')
    })

    it('should swap synthetic tokens (swapFee == 0)', async function () {
      // given
      await poolRegistry.updateSwapFee(0)
      const msAssetInBalanceBefore = await msEth.balanceOf(alice.address)
      const msAssetOutBalanceBefore = await msDoge.balanceOf(alice.address)
      expect(msAssetOutBalanceBefore).eq(0)

      // when
      const msAssetIn = msEth.address
      const msAssetOut = msDoge.address
      const amountIn = msAssetInBalanceBefore
      const amountInUsd = amountIn.mul(ethPrice).div(parseEther('1'))
      const tx = await poolRegistry.connect(alice).swap(msAssetIn, msAssetOut, amountIn)

      // then
      const expectedAmountOut = amountInUsd.mul(parseEther('1')).div(dogePrice)

      await expect(tx)
        .emit(poolRegistry, 'SyntheticTokenSwapped')
        .withArgs(alice.address, msAssetIn, msAssetOut, amountIn, expectedAmountOut, 0)

      const msAssetInBalanceAfter = await msEth.balanceOf(alice.address)
      const msAssetOutBalanceAfter = await msDoge.balanceOf(alice.address)

      expect(msAssetInBalanceAfter).eq(msAssetInBalanceBefore.sub(amountIn))
      expect(msAssetOutBalanceAfter).eq(msAssetOutBalanceBefore.add(expectedAmountOut))
    })

    it('should swap synthetic tokens (swapFee > 0)', async function () {
      // given
      const swapFee = parseEther('0.1') // 10%
      await poolRegistry.updateSwapFee(swapFee)
      const msAssetInBalanceBefore = await msEth.balanceOf(alice.address)
      const msAssetOutBalanceBefore = await msDoge.balanceOf(alice.address)
      expect(msAssetOutBalanceBefore).eq(0)

      // when
      const msAssetIn = msEth.address
      const msAssetOut = msDoge.address
      const amountIn = msAssetInBalanceBefore
      const amountInUsd = amountIn.mul(ethPrice).div(parseEther('1'))
      const tx = await poolRegistry.connect(alice).swap(msAssetIn, msAssetOut, amountIn)

      // then
      const expectedAmountOut = amountInUsd.mul(parseEther('1')).div(dogePrice)
      const expectedFee = expectedAmountOut.mul(swapFee).div(parseEther('1'))
      const expectedAmountOutAfterFee = expectedAmountOut.sub(expectedFee)

      await expect(tx)
        .emit(poolRegistry, 'SyntheticTokenSwapped')
        .withArgs(alice.address, msAssetIn, msAssetOut, amountIn, expectedAmountOutAfterFee, expectedFee)

      const msAssetInBalanceAfter = await msEth.balanceOf(alice.address)
      const msAssetOutBalanceAfter = await msDoge.balanceOf(alice.address)

      expect(msAssetInBalanceAfter).eq(msAssetInBalanceBefore.sub(amountIn))
      expect(msAssetOutBalanceAfter).eq(msAssetOutBalanceBefore.add(expectedAmountOutAfterFee))
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

  describe('updateSwapFee', function () {
    it('should revert if caller is not governor', async function () {
      // when
      const tx = poolRegistry.connect(alice).updateSwapFee(parseEther('1'))

      // then
      await expect(tx).revertedWith('not-governor')
    })

    it('should revert if using the current value', async function () {
      // when
      const swapFee = await poolRegistry.swapFee()
      const tx = poolRegistry.updateSwapFee(swapFee)

      // then
      await expect(tx).revertedWith('new-same-as-current')
    })

    it('should revert if swap fee > 100%', async function () {
      // when
      const newSwapFee = parseEther('1').add('1')
      const tx = poolRegistry.updateSwapFee(newSwapFee)

      // then
      await expect(tx).revertedWith('max-is-100%')
    })

    it('should update swap fee param', async function () {
      // given
      const currentSwapFee = await poolRegistry.swapFee()
      const newSwapFee = parseEther('0.01')
      expect(newSwapFee).not.eq(currentSwapFee)

      // when
      const tx = poolRegistry.updateSwapFee(newSwapFee)

      // then
      await expect(tx).emit(poolRegistry, 'SwapFeeUpdated').withArgs(currentSwapFee, newSwapFee)
    })
  })
})
