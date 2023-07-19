/* eslint-disable prefer-template */
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import chai, {expect} from 'chai'
import {ethers} from 'hardhat'
import {Layer2ProxyOFT, Pool, PoolRegistry, SmartFarmingManager} from '../typechain'
import {FakeContract, smock} from '@defi-wonderland/smock'
import {SyntheticToken} from '../typechain/contracts'
import {ILayerZeroEndpoint} from '../typechain/contracts/dependencies/@layerzerolabs/solidity-examples/interfaces'
import {IStargateRouter} from '../typechain/contracts/dependencies/stargate-protocol/interfaces'
import {ERC20Mock} from '../typechain/contracts/mock'
import {parseEther} from '../helpers'
import {setBalance} from '@nomicfoundation/hardhat-network-helpers'
import {BigNumber} from 'ethers'
import {impersonateAccount} from './helpers'

chai.use(smock.matchers)

const LZ_ADAPTER_PARAMS_VERSION = 2

const LZ_MAINNET_ID = 101
const MAINNET_OFT_ADDRESS = '0x9000000000000000000000000000000000000009'
const SG_POOL_ID = 1

const LZ_BASE_GAS_LIMIT = BigNumber.from('200000')
const PT_SEND_AND_CALL = BigNumber.from(1)

const MAX_BYTES32 = '0x' + 'f'.repeat(32 * 2)
const MAX_BYTES8 = '0x' + 'f'.repeat(8 * 2)
const EMPTY_LZ_ARGS = ethers.utils.defaultAbiCoder.encode(['uint256', 'uint64'], [MAX_BYTES32, MAX_BYTES8])

describe('Layer2ProxyOFT', function () {
  let alice: SignerWithAddress
  let lzEndpoint: FakeContract<ILayerZeroEndpoint>
  let stargateRouter: FakeContract<IStargateRouter>
  let msUSD: FakeContract<SyntheticToken>
  let dai: ERC20Mock
  let layer2ProxyOFT: Layer2ProxyOFT
  let smartFarmingManager: FakeContract<SmartFarmingManager>
  let pool: FakeContract<Pool>
  let poolRegistry: FakeContract<PoolRegistry>

  beforeEach(async function () {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[, alice] = await ethers.getSigners()

    const erc20MockFactory = await ethers.getContractFactory('ERC20Mock')

    dai = await erc20MockFactory.deploy('Dai Stablecoin', 'DAI', 18)
    await dai.deployed()

    lzEndpoint = await smock.fake('ILayerZeroEndpoint')
    pool = await smock.fake('IPool')
    poolRegistry = await smock.fake('PoolRegistry')
    msUSD = await smock.fake('SyntheticToken')
    msUSD.approve.returns(true) // needed for safeApprove
    smartFarmingManager = await smock.fake('SmartFarmingManager')
    stargateRouter = await smock.fake('IStargateRouter')

    const layer2ProxyOFTFactory = await ethers.getContractFactory('Layer2ProxyOFT')
    layer2ProxyOFT = await layer2ProxyOFTFactory.deploy()
    await layer2ProxyOFT.deployed()

    await layer2ProxyOFT.initialize(lzEndpoint.address, msUSD.address)
    await layer2ProxyOFT.setUseCustomAdapterParams(true)
    await layer2ProxyOFT.setTrustedRemote(
      LZ_MAINNET_ID,
      ethers.utils.solidityPack(['address', 'address'], [MAINNET_OFT_ADDRESS, layer2ProxyOFT.address])
    )
    expect(await layer2ProxyOFT.getProxyOFTOf(LZ_MAINNET_ID)).eq(MAINNET_OFT_ADDRESS)

    smartFarmingManager.pool.returns(pool.address)
    msUSD.poolRegistry.returns(poolRegistry.address)
    poolRegistry.isPoolRegistered.returns(([poolAddress]: string) => poolAddress === pool.address)
    poolRegistry.stargateRouter.returns(stargateRouter.address)
    poolRegistry.stargatePoolIdOf.returns(SG_POOL_ID)
    poolRegistry.stargateSlippage.returns(0)
    poolRegistry.lzMainnetChainId.returns(LZ_MAINNET_ID)
    poolRegistry.lzBaseGasLimit.returns(LZ_BASE_GAS_LIMIT)
    poolRegistry.isBridgingActive.returns(true)
    pool.smartFarmingManager.returns(smartFarmingManager.address)
    msUSD.proxyOFT.returns(layer2ProxyOFT.address)

    await setBalance(smartFarmingManager.address, parseEther('10'))
    await setBalance(stargateRouter.address, parseEther('10'))
  })

  describe('triggerFlashRepaySwap', function () {
    it('should revert if caller is invalid', async function () {
      // given
      const fakeSFM = await smock.fake<SmartFarmingManager>('SmartFarmingManager')
      await setBalance(fakeSFM.address, parseEther('10'))
      fakeSFM.pool.returns(pool.address)

      // when
      const tx = layer2ProxyOFT
        .connect(fakeSFM.wallet)
        .triggerFlashRepaySwap(1, alice.address, dai.address, parseEther('10'), 0, '0x')

      // then
      await expect(tx).revertedWithCustomError(layer2ProxyOFT, 'InvalidMsgSender')
    })

    it('should revert if destination proxyOFT is null', async function () {
      // given
      await layer2ProxyOFT.setTrustedRemote(
        LZ_MAINNET_ID,
        ethers.utils.solidityPack(['address', 'address'], [ethers.constants.AddressZero, ethers.constants.AddressZero])
      )

      // when
      const tx = layer2ProxyOFT
        .connect(smartFarmingManager.wallet)
        .triggerFlashRepaySwap(1, alice.address, dai.address, parseEther('10'), 0, EMPTY_LZ_ARGS)

      // then
      await expect(tx).revertedWithCustomError(layer2ProxyOFT, 'AddressIsNull')
    })

    it('should revert if bridging is paused', async function () {
      // given
      poolRegistry.isBridgingActive.returns(false)

      // when
      const tx = layer2ProxyOFT
        .connect(smartFarmingManager.wallet)
        .triggerFlashRepaySwap(1, alice.address, dai.address, parseEther('10'), 0, '0x')

      // then
      await expect(tx).revertedWithCustomError(layer2ProxyOFT, 'BridgingIsPaused')
    })

    it('should trigger SG transfer and call', async function () {
      // given
      const id = 1
      const account = alice.address
      const tokenIn = dai.address
      const amountIn = parseEther('10')
      const amountOutMin = parseEther('9')
      const swapTxGasLimit_ = BigNumber.from('500000')
      const callbackTxNativeFee = parseEther('0.1')
      const lzArgs = ethers.utils.defaultAbiCoder.encode(['uint256', 'uint64'], [callbackTxNativeFee, swapTxGasLimit_])

      const fee = parseEther('0.25')

      // when
      await layer2ProxyOFT
        .connect(smartFarmingManager.wallet)
        .triggerFlashRepaySwap(id, account, tokenIn, amountIn, amountOutMin, lzArgs, {value: fee})

      // then
      const dstChainId = LZ_MAINNET_ID
      const srcPoolId = SG_POOL_ID
      const dstPoolId = SG_POOL_ID
      const refundAddress = account
      const to = ethers.utils.solidityPack(['address'], [MAINNET_OFT_ADDRESS])
      const payload = ethers.utils.defaultAbiCoder.encode(
        ['address', 'uint256', 'address', 'uint256'],
        [smartFarmingManager.address, id, account, amountOutMin]
      )

      expect(stargateRouter.swap)
        .calledWith(
          dstChainId,
          srcPoolId,
          dstPoolId,
          refundAddress,
          amountIn,
          amountIn,
          {dstGasForCall: swapTxGasLimit_, dstNativeAmount: callbackTxNativeFee, dstNativeAddr: to},
          to,
          payload
        )
        .calledWithValue(fee)
    })
  })

  describe('triggerLeverageSwap', function () {
    it('should revert if caller is invalid', async function () {
      // given
      const fakeSFM = await smock.fake<SmartFarmingManager>('SmartFarmingManager')
      await setBalance(fakeSFM.address, parseEther('10'))
      fakeSFM.pool.returns(pool.address)

      // when
      const tx = layer2ProxyOFT
        .connect(fakeSFM.wallet)
        .triggerLeverageSwap(1, alice.address, dai.address, parseEther('10'), 0, '0x')

      // then
      await expect(tx).revertedWithCustomError(layer2ProxyOFT, 'InvalidMsgSender')
    })

    it('should revert if destination proxyOFT is null', async function () {
      // given
      await layer2ProxyOFT.setTrustedRemote(
        LZ_MAINNET_ID,
        ethers.utils.solidityPack(['address', 'address'], [ethers.constants.AddressZero, ethers.constants.AddressZero])
      )

      // when
      const tx = layer2ProxyOFT
        .connect(smartFarmingManager.wallet)
        .triggerLeverageSwap(1, alice.address, dai.address, parseEther('10'), 0, EMPTY_LZ_ARGS)

      // then
      await expect(tx).revertedWithCustomError(layer2ProxyOFT, 'AddressIsNull')
    })

    it('should revert if bridging is paused', async function () {
      // given
      poolRegistry.isBridgingActive.returns(false)

      // when
      const tx = layer2ProxyOFT
        .connect(smartFarmingManager.wallet)
        .triggerLeverageSwap(1, alice.address, dai.address, parseEther('10'), 0, EMPTY_LZ_ARGS)

      // then
      await expect(tx).revertedWithCustomError(layer2ProxyOFT, 'BridgingIsPaused')
    })

    it('should call LZ transfer and call', async function () {
      // given
      const id = 1
      const account = alice.address
      const tokenOut = dai.address
      const amountIn = parseEther('10')
      const amountOutMin = parseEther('9')
      const swapTxGasLimit_ = BigNumber.from('500000')
      const callbackTxNativeFee = parseEther('0.1')
      const lzArgs = ethers.utils.defaultAbiCoder.encode(['uint256', 'uint64'], [callbackTxNativeFee, swapTxGasLimit_])

      const fee = parseEther('0.25')

      // when
      await layer2ProxyOFT
        .connect(smartFarmingManager.wallet)
        .triggerLeverageSwap(id, account, tokenOut, amountIn, amountOutMin, lzArgs, {value: fee})

      // then
      const payload = ethers.utils.defaultAbiCoder.encode(
        ['address', 'uint256', 'uint64', 'address', 'uint256'],
        [smartFarmingManager.address, id, SG_POOL_ID, account, amountOutMin]
      )

      const adapterParams = ethers.utils.solidityPack(
        ['uint16', 'uint256', 'uint256', 'address'],
        [LZ_ADAPTER_PARAMS_VERSION, LZ_BASE_GAS_LIMIT.add(swapTxGasLimit_), callbackTxNativeFee, MAINNET_OFT_ADDRESS]
      )

      const lzPayload = ethers.utils.defaultAbiCoder.encode(
        ['uint16', 'bytes', 'bytes', 'uint256', 'bytes', 'uint64'],
        [
          PT_SEND_AND_CALL,
          ethers.utils.solidityPack(['address'], [layer2ProxyOFT.address]), // msg.sender
          ethers.utils.solidityPack(['address'], [MAINNET_OFT_ADDRESS]), // toAddress
          amountIn,
          payload,
          swapTxGasLimit_,
        ]
      )

      const dstChainId = LZ_MAINNET_ID
      const trustedRemote = await layer2ProxyOFT.trustedRemoteLookup(dstChainId)
      const refundAddress = account
      const zroPaymentAddress = ethers.constants.AddressZero
      expect(lzEndpoint.send)
        .calledWith(dstChainId, trustedRemote, lzPayload, refundAddress, zroPaymentAddress, adapterParams)
        .calledWithValue(fee)
    })
  })

  describe('onOFTReceived', function () {
    let layer2ProxyOFTWallet: SignerWithAddress
    const id = 1
    const from = ethers.utils.solidityPack(['address'], [MAINNET_OFT_ADDRESS])
    const amount = parseEther('10')
    let payload: string

    beforeEach(async function () {
      layer2ProxyOFTWallet = await impersonateAccount(layer2ProxyOFT.address)
      payload = ethers.utils.defaultAbiCoder.encode(['address', 'uint256'], [smartFarmingManager.address, id])
    })

    it('should revert if caller is invalid', async function () {
      // when
      const tx = layer2ProxyOFT.connect(alice).onOFTReceived(LZ_MAINNET_ID, from, 0, dai.address, amount, payload)

      // then
      await expect(tx).revertedWithCustomError(layer2ProxyOFT, 'InvalidMsgSender')
    })

    it('should revert if from is invalid', async function () {
      // given
      const invalidFrom = ethers.utils.solidityPack(['address'], [alice.address])

      // when
      const tx = layer2ProxyOFT
        .connect(layer2ProxyOFTWallet)
        .onOFTReceived(LZ_MAINNET_ID, invalidFrom, 0, dai.address, amount, payload)

      // then
      await expect(tx).revertedWithCustomError(layer2ProxyOFT, 'InvalidFromAddress')
    })

    it('should revert if from is empty', async function () {
      // given
      const invalidFrom = ethers.utils.solidityPack(['address'], [ethers.constants.AddressZero])

      // when
      const tx = layer2ProxyOFT
        .connect(layer2ProxyOFTWallet)
        .onOFTReceived(LZ_MAINNET_ID, invalidFrom, 0, dai.address, amount, payload)

      // then
      await expect(tx).revertedWithCustomError(layer2ProxyOFT, 'InvalidFromAddress')
    })

    it('should revert if source chain is invalid', async function () {
      // given
      const invalidSrcChainId = 123

      // when
      const tx = layer2ProxyOFT
        .connect(layer2ProxyOFTWallet)
        .onOFTReceived(invalidSrcChainId, '0x', 0, from, amount, payload)

      // then
      await expect(tx).revertedWithCustomError(layer2ProxyOFT, 'InvalidSourceChain')
    })

    it('should call layer2FlashRepayCallback', async function () {
      // when
      await layer2ProxyOFT.connect(layer2ProxyOFTWallet).onOFTReceived(LZ_MAINNET_ID, '0x', 0, from, amount, payload)

      // then
      expect(smartFarmingManager.layer2FlashRepayCallback).calledWith(id, amount)
    })
  })

  describe('sgReceive', function () {
    const id = 1
    const srcAddress = ethers.utils.defaultAbiCoder.encode(['address'], [MAINNET_OFT_ADDRESS])
    const amount = parseEther('10')
    let payload: string

    beforeEach(async function () {
      payload = ethers.utils.defaultAbiCoder.encode(['address', 'uint256'], [smartFarmingManager.address, id])
    })

    it('should revert if caller is invalid', async function () {
      // when
      const tx = layer2ProxyOFT.connect(alice).sgReceive(LZ_MAINNET_ID, srcAddress, 0, dai.address, amount, payload)

      // then
      await expect(tx).revertedWithCustomError(layer2ProxyOFT, 'InvalidMsgSender')
    })

    it('should revert if from is invalid', async function () {
      // given
      const invalidSrcAddress = ethers.utils.defaultAbiCoder.encode(['address'], [alice.address])

      // when
      const tx = layer2ProxyOFT
        .connect(stargateRouter.wallet)
        .sgReceive(LZ_MAINNET_ID, invalidSrcAddress, 0, dai.address, amount, payload)

      // then
      await expect(tx).revertedWithCustomError(layer2ProxyOFT, 'InvalidFromAddress')
    })

    it('should revert if from is null', async function () {
      // given
      const nullSrcAddress = ethers.utils.defaultAbiCoder.encode(['address'], [ethers.constants.AddressZero])

      // when
      const tx = layer2ProxyOFT
        .connect(stargateRouter.wallet)
        .sgReceive(LZ_MAINNET_ID, nullSrcAddress, 0, dai.address, amount, payload)

      // then
      await expect(tx).revertedWithCustomError(layer2ProxyOFT, 'InvalidFromAddress')
    })

    it('should revert if source chain is invalid', async function () {
      // given
      const invalidSrcChainId = 123

      // when
      const tx = layer2ProxyOFT
        .connect(stargateRouter.wallet)
        .sgReceive(invalidSrcChainId, srcAddress, 0, dai.address, amount, payload)

      // then
      await expect(tx).revertedWithCustomError(layer2ProxyOFT, 'InvalidSourceChain')
    })

    it('should call layer2LeverageCallback', async function () {
      // when
      await layer2ProxyOFT
        .connect(stargateRouter.wallet)
        .sgReceive(LZ_MAINNET_ID, srcAddress, 0, dai.address, amount, payload)

      // then
      expect(smartFarmingManager.layer2LeverageCallback).calledWith(id, amount)
    })
  })
})
