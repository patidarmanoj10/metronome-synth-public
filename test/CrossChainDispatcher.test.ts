/* eslint-disable prefer-template */
import {parseEther} from '@ethersproject/units'
import {BigNumber} from 'ethers'
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {loadFixture, setBalance, setCode, setStorageAt} from '@nomicfoundation/hardhat-network-helpers'
import chai, {expect} from 'chai'
import {ethers} from 'hardhat'
import {
  IStargateRouter,
  PoolRegistry,
  Quoter,
  SmartFarmingManager,
  ProxyOFT,
  ISwapper,
  Pool,
  ERC20,
  SyntheticToken,
  CrossChainDispatcher,
  IStargateComposerWithRetry,
} from '../typechain'
import {FakeContract, smock} from '@defi-wonderland/smock'
import {CrossChainLib} from './helpers/CrossChainLib'
import Address from '../helpers/address'

chai.use(smock.matchers)

const {parseUnits} = ethers.utils

const SG_USDC_POOL_ID = 1

const LZ_ADAPTER_PARAMS_VERSION = 2

const LZ_MAINNET_ID = 101
const LZ_OPTIMISM_ID = 111

const LZ_BASE_GAS_LIMIT = BigNumber.from('200000')

const MAX_BYTES32 = '0x' + 'f'.repeat(32 * 2)
const MAX_BYTES8 = '0x' + 'f'.repeat(8 * 2)
const MAX_BYTES2 = '0x' + 'f'.repeat(2 * 2)
const EMPTY_LZ_ARGS = CrossChainLib.encodeLzArgs(MAX_BYTES2, MAX_BYTES32, MAX_BYTES8)

describe('CrossChainDispatcher', function () {
  let deployer: SignerWithAddress
  let alice: SignerWithAddress
  let bob: SignerWithAddress
  let proxyOFT: FakeContract<ProxyOFT>
  let usdc: FakeContract<ERC20>
  let msUSD: FakeContract<SyntheticToken>
  let pool: FakeContract<Pool>
  let poolRegistry: FakeContract<PoolRegistry>
  let swapper: FakeContract<ISwapper>
  let smartFarmingManager: FakeContract<SmartFarmingManager>
  let stargateRouter: FakeContract<IStargateRouter>
  let stargateComposer: FakeContract<IStargateComposerWithRetry>
  let quoter: FakeContract<Quoter>
  let crossChainDispatcher: CrossChainDispatcher

  async function fixture() {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[deployer, alice, bob] = await ethers.getSigners()

    usdc = await smock.fake('ERC20')
    msUSD = await smock.fake('SyntheticToken')
    swapper = await smock.fake('ISwapper')
    poolRegistry = await smock.fake('PoolRegistry')
    pool = await smock.fake('contracts/Pool.sol:Pool')
    smartFarmingManager = await smock.fake('SmartFarmingManager')
    quoter = await smock.fake('Quoter')
    stargateRouter = await smock.fake('IStargateRouter')
    stargateComposer = await smock.fake('IStargateComposerWithRetry')
    proxyOFT = await smock.fake('ProxyOFT')

    await setBalance(stargateRouter.address, parseEther('10'))
    await setCode(stargateRouter.address, '0x01')
    const stargateFactory = await smock.fake('IStargateFactory')
    const stargatePool = await smock.fake('IStargatePool')
    await setCode(stargatePool.address, '0x01')
    await setCode(swapper.address, '0x01')

    stargateRouter.factory.returns(stargateFactory.address)
    stargateComposer.stargateRouter.returns(stargateRouter.address)
    stargateComposer.peers.returns(stargateComposer.address)
    stargateFactory.getPool.returns(stargatePool.address)
    stargatePool.token.returns(usdc.address)
    smartFarmingManager.pool.returns(pool.address)
    poolRegistry.isPoolRegistered.returns(pool.address)
    poolRegistry.swapper.returns(swapper.address)
    poolRegistry.quoter.returns(quoter.address)
    poolRegistry.governor.returns(deployer.address)
    poolRegistry.doesSyntheticTokenExist.returns(true)
    pool.smartFarmingManager.returns(smartFarmingManager.address)
    pool.doesSyntheticTokenExist.returns(true)
    pool.isBridgingActive.returns(true)
    usdc.approve.returns(true)
    msUSD.approve.returns(true)
    msUSD.poolRegistry.returns(poolRegistry.address)
    msUSD.proxyOFT.returns(proxyOFT.address)
    proxyOFT.token.returns(msUSD.address)
    proxyOFT.getProxyOFTOf.returns(proxyOFT.address)
    quoter.quoteLeverageCallbackNativeFee.returns(parseEther('0.25'))
    quoter.quoteFlashRepayCallbackNativeFee.returns(parseEther('0.25'))

    const crossChainDispatcherFactory = await ethers.getContractFactory('CrossChainDispatcher', deployer)
    crossChainDispatcher = await crossChainDispatcherFactory.deploy()
    await setStorageAt(crossChainDispatcher.address, 0, 0) // Undo initialization made by constructor
    await crossChainDispatcher.initialize(poolRegistry.address, Address.WETH_ADDRESS, Address.SGETH_ADDRESS)
    await crossChainDispatcher.toggleBridgingIsActive()
    await crossChainDispatcher.updateStargatePoolIdOf(usdc.address, SG_USDC_POOL_ID)
    await crossChainDispatcher.updateCrossChainDispatcherOf(LZ_MAINNET_ID, crossChainDispatcher.address)
    await crossChainDispatcher.updateCrossChainDispatcherOf(LZ_OPTIMISM_ID, crossChainDispatcher.address)
    await crossChainDispatcher.updateStargateComposer(stargateComposer.address)
    await crossChainDispatcher.updateStargateSlippage(0)
    await crossChainDispatcher.toggleDestinationChainIsActive(LZ_MAINNET_ID)

    poolRegistry.crossChainDispatcher.returns(crossChainDispatcher.address)

    await setBalance(smartFarmingManager.address, parseEther('10'))
    await setBalance(stargateComposer.address, parseEther('10'))
    await setBalance(proxyOFT.address, parseEther('10'))
    await setBalance(crossChainDispatcher.address, parseEther('10'))
  }

  beforeEach(async function () {
    await loadFixture(fixture)

    pool.isBridgingActive.returns(true)
    swapper.swapExactInput.reset()
    proxyOFT.sendAndCall.reset()
  })

  describe('onOFTReceived', function () {
    it('should revert if caller is not ProxyOFT', async function () {
      // given
      const fakeProxyOFT = await smock.fake('ProxyOFT')
      fakeProxyOFT.token.returns(msUSD.address)
      await setBalance(fakeProxyOFT.address, parseEther('10'))

      // when
      const tx = crossChainDispatcher
        .connect(fakeProxyOFT.wallet)
        .onOFTReceived(LZ_OPTIMISM_ID, '0x', 0, crossChainDispatcher.address, parseEther('1'), '0x')

      // then
      await expect(tx).to.revertedWithCustomError(crossChainDispatcher, 'InvalidMsgSender')
    })

    it('should revert if from is invalid', async function () {
      // given
      const srcChainId = LZ_MAINNET_ID
      const valid = await crossChainDispatcher.crossChainDispatcherOf(srcChainId)

      // when
      const invalid = ethers.utils.solidityPack(['address'], [alice.address])
      expect(invalid).not.eq(valid)
      const tx = crossChainDispatcher
        .connect(proxyOFT.wallet)
        .onOFTReceived(srcChainId, '0x', 0, invalid, parseEther('1'), '0x')

      // then
      await expect(tx).to.revertedWithCustomError(crossChainDispatcher, 'InvalidFromAddress')
    })

    it('should revert if from is null', async function () {
      // given
      const srcChainId = LZ_MAINNET_ID
      const valid = await crossChainDispatcher.crossChainDispatcherOf(srcChainId)

      // when
      const invalid = ethers.utils.solidityPack(['address'], [ethers.constants.AddressZero])
      expect(invalid).not.eq(valid)
      const tx = crossChainDispatcher
        .connect(proxyOFT.wallet)
        .onOFTReceived(srcChainId, '0x', 0, invalid, parseEther('1'), '0x')

      // then
      await expect(tx).to.revertedWithCustomError(crossChainDispatcher, 'InvalidFromAddress')
    })

    // FIXME: Reverting with `Transaction ran out of gas` error
    it.skip('should call _swapAndTriggerLeverageCallback()', async function () {
      const amountIn = parseEther('10')
      const requestId = 1
      const account = alice.address
      const amountOutMin = parseUnits('8', 6)
      const payload = CrossChainLib.encodeLeverageSwapPayload(
        smartFarmingManager.address,
        proxyOFT.address,
        requestId,
        SG_USDC_POOL_ID,
        account,
        amountOutMin,
        parseEther('0.1')
      )

      // when
      await crossChainDispatcher
        .connect(proxyOFT.wallet)
        .onOFTReceived(LZ_MAINNET_ID, '0x', '0', crossChainDispatcher.address, amountIn, payload)

      // then
      expect(swapper.swapExactInput).calledOnceWith(
        msUSD.address,
        usdc.address,
        amountIn,
        amountOutMin,
        crossChainDispatcher.address
      )

      expect(stargateRouter.swap).calledOnce
    })

    it('should call _crossChainFlashRepayCallback()', async function () {
      // given
      const requestId = 1
      const amount = parseEther('10')
      const payload = CrossChainLib.encodeFlashRepayCallbackPayload(
        proxyOFT.address,
        smartFarmingManager.address,
        requestId
      )

      // when
      await crossChainDispatcher
        .connect(proxyOFT.wallet)
        .onOFTReceived(LZ_MAINNET_ID, '0x', 0, crossChainDispatcher.address, amount, payload)

      // then
      expect(smartFarmingManager.crossChainFlashRepayCallback).calledWith(requestId, amount)
    })
  })

  describe('sgReceive', function () {
    it('should revert if caller is not stargateRouter', async function () {
      // given
      const fromAddress = ethers.utils.defaultAbiCoder.encode(['address'], [proxyOFT.address])
      const amountIn = parseUnits('10', 6)
      // when
      const tx = crossChainDispatcher
        .connect(alice)
        .sgReceive(LZ_MAINNET_ID, fromAddress, '123', usdc.address, amountIn, [])

      // then
      await expect(tx).to.revertedWithCustomError(crossChainDispatcher, 'InvalidMsgSender')
    })

    it('should revert if from is invalid', async function () {
      // given
      const badFromAddress = ethers.utils.defaultAbiCoder.encode(['address'], [bob.address])
      const amountIn = parseUnits('10', 6)
      // when
      const tx = crossChainDispatcher
        .connect(stargateComposer.wallet)
        .sgReceive(LZ_MAINNET_ID, badFromAddress, '123', usdc.address, amountIn, '0x')

      // then
      await expect(tx).to.revertedWithCustomError(crossChainDispatcher, 'InvalidFromAddress')
    })

    it('should revert if from is null', async function () {
      // given
      const badFromAddress = ethers.utils.defaultAbiCoder.encode(['address'], [ethers.constants.AddressZero])
      const amountIn = parseUnits('10', 6)
      // when
      const tx = crossChainDispatcher
        .connect(stargateComposer.wallet)
        .sgReceive(LZ_MAINNET_ID, badFromAddress, '123', usdc.address, amountIn, '0x')

      // then
      await expect(tx).to.revertedWithCustomError(crossChainDispatcher, 'InvalidFromAddress')
    })

    it('should call _swapAndTriggerFlashRepayCallback()', async function () {
      // given
      const srcAddress = ethers.utils.solidityPack(['address'], [crossChainDispatcher.address])
      const nonce = BigNumber.from(0)
      const amountIn = parseUnits('10', 6) // USDC amount
      const requestId = 1
      const account = alice.address
      const amountOutMin = parseEther('8') // msUSD amount
      const payload = CrossChainLib.encodeFlashRepaySwapPayload(
        smartFarmingManager.address,
        proxyOFT.address,
        requestId,
        account,
        amountOutMin,
        parseEther('0.1')
      )

      // when
      await crossChainDispatcher
        .connect(stargateComposer.wallet)
        .sgReceive(LZ_MAINNET_ID, srcAddress, nonce, usdc.address, amountIn, payload)

      // then
      expect(swapper.swapExactInput).calledOnceWith(
        usdc.address,
        msUSD.address,
        amountIn,
        amountOutMin,
        crossChainDispatcher.address
      )

      expect(proxyOFT.sendAndCall).calledOnce
    })

    it('should call _crossChainLeverageCallback()', async function () {
      // given
      const id = 1
      const amount = parseEther('10')
      const payload = CrossChainLib.encodeLeverageCallbackPayload(smartFarmingManager.address, id)
      const srcAddress = ethers.utils.solidityPack(['address'], [crossChainDispatcher.address])

      // when
      await crossChainDispatcher
        .connect(stargateComposer.wallet)
        .sgReceive(LZ_MAINNET_ID, srcAddress, 0, usdc.address, amount, payload)

      // then
      expect(smartFarmingManager.crossChainLeverageCallback).calledWith(id, amount)
    })
  })

  describe('triggerFlashRepaySwap', function () {
    it('should revert if caller is invalid', async function () {
      // given
      const fakeSFM = await smock.fake<SmartFarmingManager>('SmartFarmingManager')
      await setBalance(fakeSFM.address, parseEther('10'))
      fakeSFM.pool.returns(pool.address)

      // when
      const tx = crossChainDispatcher
        .connect(fakeSFM.wallet)
        .triggerFlashRepaySwap(1, alice.address, usdc.address, msUSD.address, parseEther('10'), 0, '0x')

      // then
      await expect(tx).revertedWithCustomError(crossChainDispatcher, 'InvalidMsgSender')
    })

    it('should revert if bridging is paused (global)', async function () {
      // given
      await crossChainDispatcher.toggleBridgingIsActive()

      // when
      const tx = crossChainDispatcher
        .connect(smartFarmingManager.wallet)
        .triggerFlashRepaySwap(1, alice.address, usdc.address, msUSD.address, parseEther('10'), 0, '0x')

      // then
      await expect(tx).revertedWithCustomError(crossChainDispatcher, 'BridgingIsPaused')
    })

    it('should revert if bridging is paused (pool)', async function () {
      // given
      pool.isBridgingActive.returns(false)

      // when
      const tx = crossChainDispatcher
        .connect(smartFarmingManager.wallet)
        .triggerFlashRepaySwap(1, alice.address, usdc.address, msUSD.address, parseEther('10'), 0, '0x')

      // then
      await expect(tx).revertedWithCustomError(crossChainDispatcher, 'BridgingIsPaused')
    })

    it('should revert if destination proxyOFT is null', async function () {
      // given
      proxyOFT.getProxyOFTOf.returns(ethers.constants.AddressZero)

      // when
      const tx = crossChainDispatcher
        .connect(smartFarmingManager.wallet)
        .triggerFlashRepaySwap(1, alice.address, usdc.address, msUSD.address, parseEther('10'), 0, EMPTY_LZ_ARGS)

      // then
      await expect(tx).revertedWithCustomError(crossChainDispatcher, 'AddressIsNull')
      proxyOFT.getProxyOFTOf.returns(proxyOFT.address)
    })

    it('should revert if destination chain is not supported', async function () {
      // given
      await crossChainDispatcher.toggleDestinationChainIsActive(LZ_MAINNET_ID)

      // when
      const tx = crossChainDispatcher
        .connect(smartFarmingManager.wallet)
        .triggerFlashRepaySwap(1, alice.address, usdc.address, msUSD.address, parseEther('10'), 0, EMPTY_LZ_ARGS)

      // then
      await expect(tx).revertedWithCustomError(crossChainDispatcher, 'DestinationChainNotAllowed')
      proxyOFT.getProxyOFTOf.returns(proxyOFT.address)
    })

    it('should trigger SG transfer and call', async function () {
      // given
      const id = 1
      const account = alice.address
      const tokenIn = usdc.address
      const amountIn = parseEther('10')
      const amountOutMin = parseEther('9')
      const swapTxGasLimit = BigNumber.from('500000')
      const callbackTxNativeFee = parseEther('0.1')
      const lzArgs = CrossChainLib.encodeLzArgs(LZ_MAINNET_ID, callbackTxNativeFee, swapTxGasLimit)

      const fee = parseEther('0.25')

      // when
      await crossChainDispatcher
        .connect(smartFarmingManager.wallet)
        .triggerFlashRepaySwap(id, account, tokenIn, msUSD.address, amountIn, amountOutMin, lzArgs, {value: fee})

      // then
      const dstChainId = LZ_MAINNET_ID
      const srcPoolId = SG_USDC_POOL_ID
      const dstPoolId = SG_USDC_POOL_ID
      const refundAddress = account
      const to = ethers.utils.solidityPack(['address'], [crossChainDispatcher.address])
      const payload = CrossChainLib.encodeFlashRepaySwapPayload(
        smartFarmingManager.address,
        proxyOFT.address,
        id,
        account,
        amountOutMin,
        callbackTxNativeFee
      )

      expect(stargateComposer.swap)
        .calledWith(
          dstChainId,
          srcPoolId,
          dstPoolId,
          refundAddress,
          amountIn,
          amountIn,
          {dstGasForCall: swapTxGasLimit, dstNativeAmount: callbackTxNativeFee, dstNativeAddr: to},
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
      const tx = crossChainDispatcher
        .connect(fakeSFM.wallet)
        .triggerLeverageSwap(1, alice.address, msUSD.address, usdc.address, parseEther('10'), 0, '0x')

      // then
      await expect(tx).revertedWithCustomError(crossChainDispatcher, 'InvalidMsgSender')
    })

    it('should revert if bridging is paused (global)', async function () {
      // given
      await crossChainDispatcher.toggleBridgingIsActive()

      // when
      const lzArgs = CrossChainLib.encodeLzArgs(LZ_MAINNET_ID, '0', '0')
      const tx = crossChainDispatcher
        .connect(smartFarmingManager.wallet)
        .triggerLeverageSwap(1, alice.address, msUSD.address, usdc.address, parseEther('10'), 0, lzArgs)

      // then
      await expect(tx).revertedWithCustomError(crossChainDispatcher, 'BridgingIsPaused')
    })

    it('should revert if bridging is paused (pool)', async function () {
      // given
      pool.isBridgingActive.returns(false)

      // when
      const lzArgs = CrossChainLib.encodeLzArgs(LZ_MAINNET_ID, '0', '0')
      const tx = crossChainDispatcher
        .connect(smartFarmingManager.wallet)
        .triggerLeverageSwap(1, alice.address, msUSD.address, usdc.address, parseEther('10'), 0, lzArgs)

      // then
      await expect(tx).revertedWithCustomError(crossChainDispatcher, 'BridgingIsPaused')
    })

    it('should revert if destination proxyOFT is null', async function () {
      // given
      proxyOFT.getProxyOFTOf.returns(ethers.constants.AddressZero)

      // when
      const tx = crossChainDispatcher
        .connect(smartFarmingManager.wallet)
        .triggerLeverageSwap(1, alice.address, msUSD.address, usdc.address, parseEther('10'), 0, EMPTY_LZ_ARGS)

      // then
      await expect(tx).revertedWithCustomError(crossChainDispatcher, 'AddressIsNull')
      proxyOFT.getProxyOFTOf.returns(proxyOFT.address)
    })

    it('should revert if destination chain is not supported', async function () {
      // given
      await crossChainDispatcher.toggleDestinationChainIsActive(LZ_MAINNET_ID)

      // when
      const tx = crossChainDispatcher
        .connect(smartFarmingManager.wallet)
        .triggerLeverageSwap(1, alice.address, msUSD.address, usdc.address, parseEther('10'), 0, EMPTY_LZ_ARGS)

      // then
      await expect(tx).revertedWithCustomError(crossChainDispatcher, 'DestinationChainNotAllowed')
      proxyOFT.getProxyOFTOf.returns(proxyOFT.address)
    })

    it('should call LZ transfer and call', async function () {
      // given
      const dstChainId = LZ_MAINNET_ID
      const requestId = 1
      const account = alice.address
      const tokenOut = usdc.address
      const amountIn = parseEther('10')
      const amountOutMin = parseEther('9')
      const swapTxGasLimit = BigNumber.from('500000')
      const callbackTxNativeFee = parseEther('0.1')
      const lzArgs = CrossChainLib.encodeLzArgs(dstChainId, callbackTxNativeFee, swapTxGasLimit)

      const fee = parseEther('0.25')

      // when
      await crossChainDispatcher
        .connect(smartFarmingManager.wallet)
        .triggerLeverageSwap(requestId, account, msUSD.address, tokenOut, amountIn, amountOutMin, lzArgs, {value: fee})

      // then
      const payload = CrossChainLib.encodeLeverageSwapPayload(
        smartFarmingManager.address,
        proxyOFT.address,
        requestId,
        SG_USDC_POOL_ID,
        account,
        amountOutMin,
        callbackTxNativeFee
      )

      const adapterParams = ethers.utils.solidityPack(
        ['uint16', 'uint256', 'uint256', 'address'],
        [
          LZ_ADAPTER_PARAMS_VERSION,
          LZ_BASE_GAS_LIMIT.add(swapTxGasLimit),
          callbackTxNativeFee,
          crossChainDispatcher.address,
        ]
      )

      expect(proxyOFT.sendAndCall).calledOnceWith(
        crossChainDispatcher.address,
        dstChainId,
        ethers.utils.solidityPack(['address'], [crossChainDispatcher.address]),
        amountIn,
        payload,
        swapTxGasLimit,
        account,
        ethers.constants.AddressZero,
        adapterParams
      )
    })
  })

  describe('retrySwapAndTriggerLeverageCallback', function () {
    it('should revert when using a invalid dstProxyOFT', async function () {
      // given
      const fakeProxyOFT = await smock.fake('IProxyOFT')
      fakeProxyOFT.token.returns(msUSD.address)
      fakeProxyOFT.retryOFTReceived.returns(null) // won't reject fake payload

      const srcAddress = crossChainDispatcher.address
      const nonce = '0'
      const amountIn = parseEther('10') // msUSD amount
      const requestId = 1
      const sgPoolId = 1
      const account = alice.address
      const amountOutMin = parseUnits('8', 6) // USDC amount
      const newAmountOutMin = parseUnits('7', 6) // USDC amount
      const fakePayload = CrossChainLib.encodeLeverageSwapPayload(
        smartFarmingManager.address,
        fakeProxyOFT.address,
        requestId,
        sgPoolId,
        account,
        amountOutMin,
        parseEther('0.1')
      )

      // when
      const tx = crossChainDispatcher
        .connect(alice)
        .retrySwapAndTriggerLeverageCallback(LZ_OPTIMISM_ID, srcAddress, nonce, amountIn, fakePayload, newAmountOutMin)

      // then
      await expect(tx).to.revertedWithCustomError(crossChainDispatcher, 'InvalidPayload')
    })

    it('should revert when setting 0 to amountOutMin', async function () {
      // given
      const fromAddress = proxyOFT.address
      const nonce = 123
      const amountIn = parseEther('10') // msUSD amount
      const requestId = 1
      const underlyingPoolId = 1
      const account = alice.address
      const amountOutMin = parseUnits('8', 6) // USDC amount
      const newAmountOutMin = 0 // USDC amount
      const payload = CrossChainLib.encodeLeverageSwapPayload(
        smartFarmingManager.address,
        proxyOFT.address,
        requestId,
        underlyingPoolId,
        account,
        amountOutMin,
        parseEther('0.1')
      )

      // when
      const tx = crossChainDispatcher
        .connect(alice)
        .retrySwapAndTriggerLeverageCallback(LZ_OPTIMISM_ID, fromAddress, nonce, amountIn, payload, newAmountOutMin)

      // then
      await expect(tx).to.revertedWithCustomError(crossChainDispatcher, 'InvalidSlippageParam')
    })

    it('should update amountOutMin and retry', async function () {
      // given
      proxyOFT.retryOFTReceived.reset()
      const srcAddress = crossChainDispatcher.address
      const nonce = '0'
      const amountIn = parseEther('10') // msUSD amount
      const requestId = 1
      const underlyingPoolId = 1
      const account = alice.address
      const amountOutMin = parseUnits('8', 6) // USDC amount
      const newAmountOutMin = parseUnits('7', 6) // USDC amount
      const payload = CrossChainLib.encodeLeverageSwapPayload(
        smartFarmingManager.address,
        proxyOFT.address,
        requestId,
        underlyingPoolId,
        account,
        amountOutMin,
        parseEther('0.1')
      )
      expect(await crossChainDispatcher.swapAmountOutMin(requestId)).eq(0)

      // when
      await crossChainDispatcher
        .connect(alice)
        .retrySwapAndTriggerLeverageCallback(LZ_MAINNET_ID, srcAddress, nonce, amountIn, payload, newAmountOutMin)

      // then
      expect(await crossChainDispatcher.swapAmountOutMin(requestId)).eq(newAmountOutMin)
      expect(proxyOFT.retryOFTReceived).calledOnce
    })

    it('should be called by anyone (not updates amountOutMin)', async function () {
      // given
      proxyOFT.retryOFTReceived.reset()
      const srcAddress = crossChainDispatcher.address
      const nonce = '0'
      const amountIn = parseEther('10') // msUSD amount
      const requestId = 1
      const underlyingPoolId = 1
      const account = alice.address
      const amountOutMin = parseUnits('8', 6) // USDC amount
      const newAmountOutMin = 0 // will be ignored
      const payload = CrossChainLib.encodeLeverageSwapPayload(
        smartFarmingManager.address,
        proxyOFT.address,
        requestId,
        underlyingPoolId,
        account,
        amountOutMin,
        parseEther('0.1')
      )
      expect(await crossChainDispatcher.swapAmountOutMin(requestId)).eq(0)

      // when
      await crossChainDispatcher
        .connect(bob)
        .retrySwapAndTriggerLeverageCallback(LZ_MAINNET_ID, srcAddress, nonce, amountIn, payload, newAmountOutMin)

      // then
      expect(await crossChainDispatcher.swapAmountOutMin(requestId)).eq(0)
      expect(proxyOFT.retryOFTReceived).calledOnce
    })
  })

  describe('retrySwapAndTriggerFlashRepayCallback', function () {
    it('should revert when setting 0 to amountOutMin', async function () {
      // given
      const fromAddress = proxyOFT.address
      const nonce = 123
      const amountIn = parseUnits('10', 6) // USDC amount
      const requestId = 1
      const account = alice.address
      const amountOutMin = parseEther('8') // msUSD amount
      const newAmountOutMin = 0 // msUSD amount
      const payload = CrossChainLib.encodeFlashRepaySwapPayload(
        smartFarmingManager.address,
        proxyOFT.address,
        requestId,
        account,
        amountOutMin,
        parseEther('0.1')
      )

      const sgReceiveCallData = crossChainDispatcher.interface.encodeFunctionData('sgReceive', [
        LZ_OPTIMISM_ID,
        ethers.utils.solidityPack(['address'], [crossChainDispatcher.address]),
        nonce,
        msUSD.address,
        amountIn,
        payload,
      ])
      const hash = ethers.utils.solidityKeccak256(
        ['bytes'],
        [ethers.utils.solidityPack(['address', 'bytes'], [crossChainDispatcher.address, sgReceiveCallData])]
      )

      stargateComposer.payloadHashes.returns(hash)

      // when
      const tx = crossChainDispatcher
        .connect(alice)
        .retrySwapAndTriggerFlashRepayCallback(
          LZ_OPTIMISM_ID,
          fromAddress,
          nonce,
          msUSD.address,
          amountIn,
          payload,
          newAmountOutMin
        )

      // then
      await expect(tx).to.revertedWithCustomError(crossChainDispatcher, 'InvalidSlippageParam')
    })

    it('should update amountOutMin and retry', async function () {
      // given
      const srcChainId = BigNumber.from(LZ_MAINNET_ID)
      const srcAddress = ethers.utils.solidityPack(['address'], [crossChainDispatcher.address])
      const nonce = BigNumber.from('123')
      const amountIn = parseUnits('10', 6) // USDC amount
      const requestId = 1
      const account = alice.address
      const amountOutMin = parseEther('8') // msUSD amount
      const newAmountOutMin = parseEther('7') // msUSD amount
      const payload = CrossChainLib.encodeFlashRepaySwapPayload(
        smartFarmingManager.address,
        proxyOFT.address,
        requestId,
        account,
        amountOutMin,
        parseEther('0.1')
      )

      const sgReceiveCallData = crossChainDispatcher.interface.encodeFunctionData('sgReceive', [
        srcChainId,
        ethers.utils.solidityPack(['address'], [crossChainDispatcher.address]),
        nonce,
        msUSD.address,
        amountIn,
        payload,
      ])
      const hash = ethers.utils.solidityKeccak256(
        ['bytes'],
        [ethers.utils.solidityPack(['address', 'bytes'], [crossChainDispatcher.address, sgReceiveCallData])]
      )

      stargateComposer.payloadHashes.returns(hash)

      expect(await crossChainDispatcher.swapAmountOutMin(requestId)).eq(0)
      stargateRouter.cachedSwapLookup.returns([usdc.address, amountIn, crossChainDispatcher.address, payload])

      // when
      await crossChainDispatcher
        .connect(alice)
        .retrySwapAndTriggerFlashRepayCallback(
          srcChainId,
          srcAddress,
          nonce,
          msUSD.address,
          amountIn,
          payload,
          newAmountOutMin
        )

      // then
      expect(stargateComposer.clearCachedSwap).calledOnceWith(
        srcChainId,
        srcAddress,
        nonce,
        crossChainDispatcher.address,
        sgReceiveCallData
      )
      expect(await crossChainDispatcher.swapAmountOutMin(requestId)).eq(newAmountOutMin)
    })

    it('should retry by anyone (not updates amountOutMin)', async function () {
      // given
      stargateComposer.clearCachedSwap.reset()
      const srcChainId = BigNumber.from(LZ_MAINNET_ID)
      const srcAddress = ethers.utils.solidityPack(['address'], [crossChainDispatcher.address])
      const nonce = BigNumber.from('123')
      const amountIn = parseUnits('10', 6) // USDC amount
      const requestId = 1
      const account = alice.address
      const amountOutMin = parseEther('8') // msUSD amount
      const newAmountOutMin = 0 // will be ignored
      const payload = CrossChainLib.encodeFlashRepaySwapPayload(
        smartFarmingManager.address,
        proxyOFT.address,
        requestId,
        account,
        amountOutMin,
        parseEther('0.1')
      )

      const sgReceiveCallData = crossChainDispatcher.interface.encodeFunctionData('sgReceive', [
        srcChainId,
        ethers.utils.solidityPack(['address'], [crossChainDispatcher.address]),
        nonce,
        msUSD.address,
        amountIn,
        payload,
      ])
      const hash = ethers.utils.solidityKeccak256(
        ['bytes'],
        [ethers.utils.solidityPack(['address', 'bytes'], [crossChainDispatcher.address, sgReceiveCallData])]
      )

      stargateComposer.payloadHashes.returns(hash)

      expect(await crossChainDispatcher.swapAmountOutMin(requestId)).eq(0)
      stargateRouter.cachedSwapLookup.returns([usdc.address, amountIn, crossChainDispatcher.address, payload])

      // when
      await crossChainDispatcher
        .connect(bob)
        .retrySwapAndTriggerFlashRepayCallback(
          srcChainId,
          srcAddress,
          nonce,
          msUSD.address,
          amountIn,
          payload,
          newAmountOutMin
        )

      // then
      expect(stargateComposer.clearCachedSwap).calledOnceWith(
        srcChainId,
        srcAddress,
        nonce,
        crossChainDispatcher.address,
        sgReceiveCallData
      )
      expect(await crossChainDispatcher.swapAmountOutMin(requestId)).eq(0)
    })
  })

  describe('toggleBridgingIsActive', function () {
    it('should toggle isBridgingActive flag', async function () {
      const before = await crossChainDispatcher.isBridgingActive()
      const after = !before
      const tx = crossChainDispatcher.toggleBridgingIsActive()
      await expect(tx).emit(crossChainDispatcher, 'BridgingIsActiveUpdated').withArgs(after)
      expect(await crossChainDispatcher.isBridgingActive()).eq(after)
    })

    it('should revert if not governor', async function () {
      const tx = crossChainDispatcher.connect(alice).toggleBridgingIsActive()
      await expect(tx).revertedWithCustomError(crossChainDispatcher, 'SenderIsNotGovernor')
    })
  })
})
