import {parseEther} from '@ethersproject/units'
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {loadFixture, setBalance} from '@nomicfoundation/hardhat-network-helpers'
import chai, {expect} from 'chai'
import {ethers} from 'hardhat'
import {Layer1ProxyOFT} from '../typechain'
import {FakeContract, smock} from '@defi-wonderland/smock'

chai.use(smock.matchers)

const {parseUnits} = ethers.utils

const LZ_CHAIN_ID_OPTIMISM = 111
const SG_USDC_POOL_ID = 1

describe('SmartFarmingManager', function () {
  let deployer: SignerWithAddress
  let alice: SignerWithAddress
  let bob: SignerWithAddress
  let layer1ProxyOFT: Layer1ProxyOFT
  let layer1ProxyOFTSigner: SignerWithAddress
  let usdc: FakeContract
  let msUSD: FakeContract
  let poolRegistry: FakeContract
  let swapper: FakeContract
  let smartFarmingManager: FakeContract
  let layer2ProxyOFT: FakeContract
  let lzEndpoint: FakeContract
  let stargateRouter: FakeContract

  async function fixture() {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[deployer, alice, bob] = await ethers.getSigners()

    const layer1ProxyOFTFactory = await ethers.getContractFactory('Layer1ProxyOFT', deployer)

    layer1ProxyOFT = await layer1ProxyOFTFactory.deploy()

    usdc = await smock.fake('ERC20')
    msUSD = await smock.fake('SyntheticToken')
    poolRegistry = await smock.fake('PoolRegistry')
    swapper = await smock.fake('ISwapper')

    smartFarmingManager = await smock.fake('SmartFarmingManager')
    layer2ProxyOFT = await smock.fake('Layer2ProxyOFT')
    lzEndpoint = await smock.fake('ILayerZeroEndpoint')
    stargateRouter = await smock.fake('IStargateRouter')
    const stargateFactory = await smock.fake('IStargateFactory')
    const stargatePool = await smock.fake('IStargatePool')

    await layer1ProxyOFT.initialize(lzEndpoint.address, msUSD.address)
    await layer1ProxyOFT.setTrustedRemoteAddress(LZ_CHAIN_ID_OPTIMISM, layer2ProxyOFT.address)
    await poolRegistry.updateStargateRouter(stargateRouter.address)
    await poolRegistry.updatePoolIdOf(usdc.address, SG_USDC_POOL_ID)
    await layer1ProxyOFT.setUseCustomAdapterParams(true)

    layer1ProxyOFTSigner = await ethers.getImpersonatedSigner(layer1ProxyOFT.address)
    await setBalance(layer1ProxyOFTSigner.address, parseEther('10'))

    usdc.approve.returns(true)
    msUSD.approve.returns(true)
    msUSD.poolRegistry.returns(poolRegistry.address)
    poolRegistry.swapper.returns(swapper.address)

    stargateRouter.factory.returns(stargateFactory.address)
    await setBalance(stargateRouter.address, parseEther('10'))
    stargateFactory.getPool.returns(stargatePool.address)
    stargatePool.token.returns(usdc.address)
  }

  beforeEach(async function () {
    await loadFixture(fixture)
  })

  describe('onOFTReceived', function () {
    it('should revert if caller is not self', async function () {
      // when
      const tx = layer1ProxyOFT
        .connect(alice)
        .onOFTReceived(LZ_CHAIN_ID_OPTIMISM, layer2ProxyOFT.address, '123', layer2ProxyOFT.address, parseEther('1'), [])

      // then
      await expect(tx).to.revertedWithCustomError(layer1ProxyOFT, 'InvalidMsgSender')
    })

    it('should revert if from is not trusted remote', async function () {
      // when
      const tx = layer1ProxyOFT
        .connect(layer1ProxyOFTSigner)
        .onOFTReceived(LZ_CHAIN_ID_OPTIMISM, layer2ProxyOFT.address, '123', alice.address, parseEther('1'), [])

      // then
      await expect(tx).to.revertedWithCustomError(layer1ProxyOFT, 'InvalidFromAddress')
    })

    it('should complete onOFTReceived flow', async function () {
      const nonce = 123
      const amountIn = parseEther('10')
      const requestId = 1
      const underlyingPoolId = 1
      const account = alice.address
      const amountOutMin = parseUnits('8', 6)
      const payload = ethers.utils.defaultAbiCoder.encode(
        ['address', 'uint256', 'uint256', 'address', 'uint256'],
        [smartFarmingManager.address, requestId, underlyingPoolId, account, amountOutMin]
      )

      // when
      await layer1ProxyOFT
        .connect(layer1ProxyOFTSigner)
        .onOFTReceived(LZ_CHAIN_ID_OPTIMISM, layer2ProxyOFT.address, nonce, layer2ProxyOFT.address, amountIn, payload)

      // then
      expect(swapper.swapExactInput).calledOnceWith(
        msUSD.address,
        usdc.address,
        amountIn,
        amountOutMin,
        layer1ProxyOFT.address
      )
      // then initiate swap via stargate
      expect(stargateRouter.swap).callCount(1)
    })
  })

  describe('sgReceive', function () {
    it('should revert if caller is not stargateRouter', async function () {
      // given
      const fromAddress = ethers.utils.defaultAbiCoder.encode(['address'], [layer2ProxyOFT.address])
      const amountIn = parseUnits('10', 6)
      // when
      const tx = layer1ProxyOFT
        .connect(alice)
        .sgReceive(LZ_CHAIN_ID_OPTIMISM, fromAddress, '123', usdc.address, amountIn, [])

      // then
      await expect(tx).to.revertedWithCustomError(layer1ProxyOFT, 'InvalidMsgSender')
    })

    it('should revert if from is not trusted remote', async function () {
      // given
      const badFromAddress = ethers.utils.defaultAbiCoder.encode(['address'], [bob.address])
      const amountIn = parseUnits('10', 6)
      // when
      const tx = layer1ProxyOFT
        .connect(stargateRouter.wallet)
        .sgReceive(LZ_CHAIN_ID_OPTIMISM, badFromAddress, '123', usdc.address, amountIn, [])

      // then
      await expect(tx).to.revertedWithCustomError(layer1ProxyOFT, 'InvalidFromAddress')
    })

    it('should complete sgReceive flow', async function () {
      // given
      swapper.swapExactInput.reset()

      await layer1ProxyOFT.setTrustedRemoteAddress(LZ_CHAIN_ID_OPTIMISM, layer2ProxyOFT.address)
      const fromAddress = ethers.utils.defaultAbiCoder.encode(['address'], [layer2ProxyOFT.address])

      const nonce = 123
      const amountIn = parseUnits('10', 6) // USDC amount
      const requestId = 1
      const account = alice.address
      const amountOutMin = parseEther('8') // msUSD amount
      const payload = ethers.utils.defaultAbiCoder.encode(
        ['address', 'uint256', 'address', 'uint256'],
        [smartFarmingManager.address, requestId, account, amountOutMin]
      )

      // when
      await layer1ProxyOFT
        .connect(stargateRouter.wallet)
        .sgReceive(LZ_CHAIN_ID_OPTIMISM, fromAddress, nonce, usdc.address, amountIn, payload)

      // then
      expect(swapper.swapExactInput).calledOnceWith(
        usdc.address,
        msUSD.address,
        amountIn,
        amountOutMin,
        layer1ProxyOFT.address
      )

      // then, initiate cross chain call
      expect(lzEndpoint.send).callCount(1)
    })
  })

  describe('retrySwapSynthAndTriggerCallback', function () {
    it('should revert if caller is not account aka user', async function () {
      // given
      const fromAddress = layer2ProxyOFT.address
      const nonce = 123
      const amountIn = parseEther('10') // msUSD amount
      const requestId = 1
      const underlyingPoolId = 1
      const account = alice.address
      const amountOutMin = parseUnits('8', 6) // USDC amount
      const newAmountOutMin = parseUnits('7', 6) // USDC amount
      const payload = ethers.utils.defaultAbiCoder.encode(
        ['address', 'uint256', 'uint256', 'address', 'uint256'],
        [smartFarmingManager.address, requestId, underlyingPoolId, account, amountOutMin]
      )

      // when
      const tx = layer1ProxyOFT
        .connect(bob)
        .retrySwapSynthAndTriggerCallback(LZ_CHAIN_ID_OPTIMISM, fromAddress, nonce, amountIn, payload, newAmountOutMin)

      // then
      await expect(tx).to.revertedWithCustomError(layer1ProxyOFT, 'InvalidMsgSender')
    })

    it('should retry SwapSynth and TriggerCallback', async function () {
      // given
      const fromAddress = layer2ProxyOFT.address
      const nonce = 123
      const amountIn = parseEther('10') // msUSD amount
      const requestId = 1
      const underlyingPoolId = 1
      const account = alice.address
      const amountOutMin = parseUnits('8', 6) // USDC amount
      const newAmountOutMin = parseUnits('7', 6) // USDC amount
      const payload = ethers.utils.defaultAbiCoder.encode(
        ['address', 'uint256', 'uint256', 'address', 'uint256'],
        [smartFarmingManager.address, requestId, underlyingPoolId, account, amountOutMin]
      )

      // Here idea is to fail lzReceive so that it can store message for retry
      const topPayload = ethers.utils.defaultAbiCoder.encode(
        ['uint16', 'bytes', 'bytes', 'uint256', 'bytes', 'uint64'],
        [1, layer2ProxyOFT.address, layer1ProxyOFT.address, amountIn, payload, '100000']
      )
      swapper.swapExactInput.reverts() // mock revert will store txn for retry
      await layer1ProxyOFT
        .connect(layer1ProxyOFTSigner)
        .nonblockingLzReceive(LZ_CHAIN_ID_OPTIMISM, layer2ProxyOFT.address, nonce, topPayload)
      // reset mock
      swapper.swapExactInput.reset()
      stargateRouter.swap.reset()

      // when
      await layer1ProxyOFT
        .connect(alice)
        .retrySwapSynthAndTriggerCallback(LZ_CHAIN_ID_OPTIMISM, fromAddress, nonce, amountIn, payload, newAmountOutMin)

      // then
      expect(swapper.swapExactInput).calledOnceWith(
        msUSD.address,
        usdc.address,
        amountIn,
        newAmountOutMin,
        layer1ProxyOFT.address
      )

      // then initiate swap via stargate
      expect(stargateRouter.swap).callCount(1)
    })
  })

  describe('retrySwapUnderlyingAndTriggerCallback', function () {
    it('should revert if caller is not account aka user', async function () {
      // given
      const fromAddress = layer2ProxyOFT.address
      const nonce = 123
      const amountIn = parseUnits('10', 6) // USDC amount
      const requestId = 1
      const account = alice.address
      const amountOutMin = parseEther('8') // msUSD amount
      const newAmountOutMin = parseEther('7') // msUSD amount
      const payload = ethers.utils.defaultAbiCoder.encode(
        ['address', 'uint256', 'address', 'uint256'],
        [smartFarmingManager.address, requestId, account, amountOutMin]
      )

      // when
      stargateRouter.cachedSwapLookup.returns([usdc.address, amountIn, layer1ProxyOFT.address, payload])
      // when
      const tx = layer1ProxyOFT
        .connect(bob)
        .retrySwapUnderlyingAndTriggerCallback(LZ_CHAIN_ID_OPTIMISM, fromAddress, nonce, newAmountOutMin)

      // then
      await expect(tx).to.revertedWithCustomError(layer1ProxyOFT, 'InvalidMsgSender')
    })

    it('should retry SwapUnderlying and TriggerCallback', async function () {
      // given
      const fromAddress = layer2ProxyOFT.address
      const nonce = ethers.BigNumber.from(123)
      const amountIn = parseUnits('10', 6) // USDC amount
      const requestId = 1
      const account = alice.address
      const amountOutMin = parseEther('8') // msUSD amount
      const newAmountOutMin = parseEther('7') // msUSD amount
      const payload = ethers.utils.defaultAbiCoder.encode(
        ['address', 'uint256', 'address', 'uint256'],
        [smartFarmingManager.address, requestId, account, amountOutMin]
      )

      // when
      stargateRouter.cachedSwapLookup.returns([usdc.address, amountIn, layer1ProxyOFT.address, payload])
      // when
      await layer1ProxyOFT
        .connect(alice)
        .retrySwapUnderlyingAndTriggerCallback('111', fromAddress, nonce, newAmountOutMin)

      // then
      expect(stargateRouter.clearCachedSwap).callCount(1)
    })
  })
})
