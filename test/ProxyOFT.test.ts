/* eslint-disable prefer-template */
import {parseEther} from '@ethersproject/units'
import {BigNumber} from 'ethers'
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {loadFixture, setBalance, setCode} from '@nomicfoundation/hardhat-network-helpers'
import chai, {expect} from 'chai'
import {ethers} from 'hardhat'
import {
  IStargateRouter,
  ERC20Mock,
  PoolRegistry,
  Quoter,
  SmartFarmingManager,
  ProxyOFT,
  ISwapper,
  ILayerZeroEndpoint,
  Pool,
} from '../typechain'
import {FakeContract, smock} from '@defi-wonderland/smock'
import {CrossChainLib} from './helpers/CrossChainLib'

chai.use(smock.matchers)

const {parseUnits} = ethers.utils

const SG_USDC_POOL_ID = 1

const LZ_ADAPTER_PARAMS_VERSION = 2

const LZ_MAINNET_ID = 101
const LZ_OPTIMISM_ID = 111
const SG_POOL_ID = 1

const LZ_BASE_GAS_LIMIT = BigNumber.from('200000')
const PT_SEND_AND_CALL = BigNumber.from(1)

const MAX_BYTES32 = '0x' + 'f'.repeat(32 * 2)
const MAX_BYTES8 = '0x' + 'f'.repeat(8 * 2)
const EMPTY_LZ_ARGS = ethers.utils.defaultAbiCoder.encode(['uint256', 'uint64'], [MAX_BYTES32, MAX_BYTES8])

// TODO: Review all tests (and improve if needed)
describe.only('ProxyOFT', function () {
  let deployer: SignerWithAddress
  let alice: SignerWithAddress
  let bob: SignerWithAddress
  let proxyOFT: ProxyOFT
  let proxyOFTSigner: SignerWithAddress
  let dai: ERC20Mock
  let usdc: FakeContract
  let msUSD: FakeContract
  let pool: FakeContract<Pool>
  let poolRegistry: FakeContract<PoolRegistry>
  let swapper: FakeContract<ISwapper>
  let smartFarmingManager: FakeContract<SmartFarmingManager>
  let lzEndpoint: FakeContract<ILayerZeroEndpoint>
  let stargateRouter: FakeContract<IStargateRouter>
  let quoter: FakeContract<Quoter>

  async function fixture() {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[deployer, alice, bob] = await ethers.getSigners()

    const erc20MockFactory = await ethers.getContractFactory('ERC20Mock')
    dai = await erc20MockFactory.deploy('Dai Stablecoin', 'DAI', 18)
    await dai.deployed()

    usdc = await smock.fake('ERC20')
    msUSD = await smock.fake('SyntheticToken')
    swapper = await smock.fake('ISwapper')
    poolRegistry = await smock.fake('PoolRegistry')
    pool = await smock.fake('IPool')
    smartFarmingManager = await smock.fake('SmartFarmingManager')
    quoter = await smock.fake('Quoter')
    lzEndpoint = await smock.fake('ILayerZeroEndpoint')
    stargateRouter = await smock.fake('IStargateRouter')
    await setBalance(stargateRouter.address, parseEther('10'))
    const stargateFactory = await smock.fake('IStargateFactory')
    const stargatePool = await smock.fake('IStargatePool')
    await setCode(stargatePool.address, '0x01')

    const proxyOFTFactory = await ethers.getContractFactory('ProxyOFT', deployer)
    proxyOFT = await proxyOFTFactory.deploy()
    proxyOFTSigner = await ethers.getImpersonatedSigner(proxyOFT.address)
    await setBalance(proxyOFTSigner.address, parseEther('10'))
    await proxyOFT.initialize(lzEndpoint.address, msUSD.address)
    await proxyOFT.setTrustedRemote(
      LZ_MAINNET_ID,
      ethers.utils.solidityPack(['address', 'address'], [proxyOFT.address, proxyOFT.address])
    )
    await proxyOFT.setUseCustomAdapterParams(true)

    stargateRouter.factory.returns(stargateFactory.address)
    stargateFactory.getPool.returns(stargatePool.address)
    stargatePool.token.returns(usdc.address)

    smartFarmingManager.pool.returns(pool.address)
    poolRegistry.isPoolRegistered.returns(([poolAddress]: string) => poolAddress === pool.address)
    poolRegistry.stargateRouter.returns(stargateRouter.address)
    poolRegistry.stargatePoolIdOf.returns(SG_USDC_POOL_ID)
    poolRegistry.stargateSlippage.returns(0)
    poolRegistry.swapper.returns(swapper.address)
    poolRegistry.quoter.returns(quoter.address)
    poolRegistry.flashRepayCallbackTxGasLimit.returns(500000)
    poolRegistry.lzBaseGasLimit.returns(LZ_BASE_GAS_LIMIT)
    poolRegistry.isBridgingActive.returns(true)
    pool.smartFarmingManager.returns(smartFarmingManager.address)
    usdc.approve.returns(true)
    msUSD.approve.returns(true)
    msUSD.poolRegistry.returns(poolRegistry.address)

    quoter.quoteLeverageCallbackNativeFee.returns(parseEther('0.25'))
    quoter.quoteFlashRepayCallbackNativeFee.returns(parseEther('0.25'))

    await setBalance(smartFarmingManager.address, parseEther('10'))
    await setBalance(stargateRouter.address, parseEther('10'))
  }

  beforeEach(async function () {
    await loadFixture(fixture)
  })

  describe('onOFTReceived', function () {
    describe('LEVERAGE', function () {
      it('should revert if caller is not self', async function () {
        // when
        const tx = proxyOFT
          .connect(alice)
          .onOFTReceived(LZ_OPTIMISM_ID, proxyOFT.address, '123', proxyOFT.address, parseEther('1'), [])

        // then
        await expect(tx).to.revertedWithCustomError(proxyOFT, 'InvalidMsgSender')
      })

      it('should revert if from is not trusted remote', async function () {
        // when
        const tx = proxyOFT
          .connect(proxyOFTSigner)
          .onOFTReceived(LZ_MAINNET_ID, proxyOFT.address, '123', alice.address, parseEther('1'), '0x')

        // then
        await expect(tx).to.revertedWithCustomError(proxyOFT, 'InvalidFromAddress')
      })

      it('should complete onOFTReceived flow', async function () {
        const nonce = 123
        const amountIn = parseEther('10')
        const requestId = 1
        const underlyingPoolId = 1
        const account = alice.address
        const amountOutMin = parseUnits('8', 6)
        const payload = CrossChainLib.encodeLeverageSwapPayload(
          smartFarmingManager.address,
          requestId,
          underlyingPoolId,
          account,
          amountOutMin
        )

        // when
        await proxyOFT
          .connect(proxyOFTSigner)
          .onOFTReceived(LZ_MAINNET_ID, proxyOFT.address, nonce, proxyOFT.address, amountIn, payload)

        // then
        expect(swapper.swapExactInput).calledOnceWith(
          msUSD.address,
          usdc.address,
          amountIn,
          amountOutMin,
          proxyOFT.address
        )
        // then initiate swap via stargate
        expect(stargateRouter.swap).callCount(1)
      })
    })

    describe('FLASH_REPAY', function () {
      const id = 1
      const amount = parseEther('10')
      let payload: string

      beforeEach(async function () {
        payload = CrossChainLib.encodeFlashRepayCallbackPayload(smartFarmingManager.address, id)
      })

      it('should revert if caller is invalid', async function () {
        // given
        const from = ethers.utils.solidityPack(['address'], [proxyOFT.address])

        // when
        const tx = proxyOFT.connect(alice).onOFTReceived(LZ_MAINNET_ID, from, 0, dai.address, amount, payload)

        // then
        await expect(tx).revertedWithCustomError(proxyOFT, 'InvalidMsgSender')
      })

      it('should revert if from is invalid', async function () {
        // given
        const invalidFrom = ethers.utils.solidityPack(['address'], [alice.address])

        // when
        const tx = proxyOFT
          .connect(proxyOFTSigner)
          .onOFTReceived(LZ_MAINNET_ID, invalidFrom, 0, dai.address, amount, payload)

        // then
        await expect(tx).revertedWithCustomError(proxyOFT, 'InvalidFromAddress')
      })

      it('should revert if from is empty', async function () {
        // given
        const invalidFrom = ethers.utils.solidityPack(['address'], [ethers.constants.AddressZero])

        // when
        const tx = proxyOFT
          .connect(proxyOFTSigner)
          .onOFTReceived(LZ_MAINNET_ID, invalidFrom, 0, dai.address, amount, payload)

        // then
        await expect(tx).revertedWithCustomError(proxyOFT, 'InvalidFromAddress')
      })

      it('should call crossChainFlashRepayCallback', async function () {
        // given
        const from = ethers.utils.solidityPack(['address'], [proxyOFT.address])

        // when
        await proxyOFT.connect(proxyOFTSigner).onOFTReceived(LZ_MAINNET_ID, '0x', 0, from, amount, payload)

        // then
        expect(smartFarmingManager.crossChainFlashRepayCallback).calledWith(id, amount)
      })
    })
  })

  describe('sgReceive', function () {
    describe('FLASH_REPAY', function () {
      it('should revert if caller is not stargateRouter', async function () {
        // given
        const fromAddress = ethers.utils.defaultAbiCoder.encode(['address'], [proxyOFT.address])
        const amountIn = parseUnits('10', 6)
        // when
        const tx = proxyOFT.connect(alice).sgReceive(LZ_OPTIMISM_ID, fromAddress, '123', usdc.address, amountIn, [])

        // then
        await expect(tx).to.revertedWithCustomError(proxyOFT, 'InvalidMsgSender')
      })

      it('should revert if from is not trusted remote', async function () {
        // given
        const badFromAddress = ethers.utils.defaultAbiCoder.encode(['address'], [bob.address])
        const amountIn = parseUnits('10', 6)
        // when
        const tx = proxyOFT
          .connect(stargateRouter.wallet)
          .sgReceive(LZ_MAINNET_ID, badFromAddress, '123', usdc.address, amountIn, [])

        // then
        await expect(tx).to.revertedWithCustomError(proxyOFT, 'InvalidFromAddress')
      })

      it('should complete sgReceive flow', async function () {
        // given
        swapper.swapExactInput.reset()

        await proxyOFT.setTrustedRemoteAddress(LZ_OPTIMISM_ID, proxyOFT.address)
        const fromAddress = ethers.utils.defaultAbiCoder.encode(['address'], [proxyOFT.address])

        const nonce = 123
        const amountIn = parseUnits('10', 6) // USDC amount
        const requestId = 1
        const account = alice.address
        const amountOutMin = parseEther('8') // msUSD amount
        const payload = CrossChainLib.encodeFlashRepaySwapPayload(
          smartFarmingManager.address,
          requestId,
          account,
          amountOutMin
        )

        // when
        await proxyOFT
          .connect(stargateRouter.wallet)
          .sgReceive(LZ_OPTIMISM_ID, fromAddress, nonce, usdc.address, amountIn, payload)

        // then
        expect(swapper.swapExactInput).calledOnceWith(
          usdc.address,
          msUSD.address,
          amountIn,
          amountOutMin,
          proxyOFT.address
        )

        // then, initiate cross chain call
        expect(lzEndpoint.send).callCount(1)
      })
    })

    describe('LEVERAGE', function () {
      const id = 1
      const amount = parseEther('10')
      let payload: string

      beforeEach(async function () {
        payload = CrossChainLib.encodeLeverageCallbackPayload(smartFarmingManager.address, id)
      })

      it('should revert if caller is invalid', async function () {
        // given
        const srcAddress = ethers.utils.defaultAbiCoder.encode(['address'], [proxyOFT.address])

        // when
        const tx = proxyOFT.connect(alice).sgReceive(LZ_MAINNET_ID, srcAddress, 0, dai.address, amount, payload)

        // then
        await expect(tx).revertedWithCustomError(proxyOFT, 'InvalidMsgSender')
      })

      it('should revert if from is invalid', async function () {
        // given
        const invalidSrcAddress = ethers.utils.defaultAbiCoder.encode(['address'], [alice.address])

        // when
        const tx = proxyOFT
          .connect(stargateRouter.wallet)
          .sgReceive(LZ_MAINNET_ID, invalidSrcAddress, 0, dai.address, amount, payload)

        // then
        await expect(tx).revertedWithCustomError(proxyOFT, 'InvalidFromAddress')
      })

      it('should revert if from is null', async function () {
        // given
        const nullSrcAddress = ethers.utils.defaultAbiCoder.encode(['address'], [ethers.constants.AddressZero])

        // when
        const tx = proxyOFT
          .connect(stargateRouter.wallet)
          .sgReceive(LZ_MAINNET_ID, nullSrcAddress, 0, dai.address, amount, payload)

        // then
        await expect(tx).revertedWithCustomError(proxyOFT, 'InvalidFromAddress')
      })

      it('should call crossChainLeverageCallback', async function () {
        // given
        const srcAddress = ethers.utils.defaultAbiCoder.encode(['address'], [proxyOFT.address])

        // when
        await proxyOFT
          .connect(stargateRouter.wallet)
          .sgReceive(LZ_MAINNET_ID, srcAddress, 0, dai.address, amount, payload)

        // then
        expect(smartFarmingManager.crossChainLeverageCallback).calledWith(id, amount)
      })
    })
  })

  describe('triggerFlashRepaySwap', function () {
    it('should revert if caller is invalid', async function () {
      // given
      const fakeSFM = await smock.fake<SmartFarmingManager>('SmartFarmingManager')
      await setBalance(fakeSFM.address, parseEther('10'))
      fakeSFM.pool.returns(pool.address)

      // when
      const tx = proxyOFT
        .connect(fakeSFM.wallet)
        .triggerFlashRepaySwap(LZ_MAINNET_ID, 1, alice.address, dai.address, parseEther('10'), 0, '0x')

      // then
      await expect(tx).revertedWithCustomError(proxyOFT, 'InvalidMsgSender')
    })

    it('should revert if destination proxyOFT is null', async function () {
      // given
      await proxyOFT.setTrustedRemote(
        LZ_MAINNET_ID,
        ethers.utils.solidityPack(['address', 'address'], [ethers.constants.AddressZero, ethers.constants.AddressZero])
      )

      // when
      const tx = proxyOFT
        .connect(smartFarmingManager.wallet)
        .triggerFlashRepaySwap(LZ_MAINNET_ID, 1, alice.address, dai.address, parseEther('10'), 0, EMPTY_LZ_ARGS)

      // then
      await expect(tx).revertedWithCustomError(proxyOFT, 'AddressIsNull')
    })

    it('should revert if bridging is paused', async function () {
      // given
      poolRegistry.isBridgingActive.returns(false)

      // when
      const tx = proxyOFT
        .connect(smartFarmingManager.wallet)
        .triggerFlashRepaySwap(LZ_MAINNET_ID, 1, alice.address, dai.address, parseEther('10'), 0, '0x')

      // then
      await expect(tx).revertedWithCustomError(proxyOFT, 'BridgingIsPaused')
      poolRegistry.isBridgingActive.returns(true)
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
      // TODO: Use `CrossChainLib`
      const lzArgs = ethers.utils.defaultAbiCoder.encode(['uint256', 'uint64'], [callbackTxNativeFee, swapTxGasLimit_])

      const fee = parseEther('0.25')

      // when
      await proxyOFT
        .connect(smartFarmingManager.wallet)
        .triggerFlashRepaySwap(LZ_MAINNET_ID, id, account, tokenIn, amountIn, amountOutMin, lzArgs, {value: fee})

      // then
      const dstChainId = LZ_MAINNET_ID
      const srcPoolId = SG_POOL_ID
      const dstPoolId = SG_POOL_ID
      const refundAddress = account
      const to = ethers.utils.solidityPack(['address'], [proxyOFT.address])
      const payload = CrossChainLib.encodeFlashRepaySwapPayload(smartFarmingManager.address, id, account, amountOutMin)

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
      const tx = proxyOFT
        .connect(fakeSFM.wallet)
        .triggerLeverageSwap(LZ_MAINNET_ID, 1, alice.address, dai.address, parseEther('10'), 0, '0x')

      // then
      await expect(tx).revertedWithCustomError(proxyOFT, 'InvalidMsgSender')
    })

    it('should revert if destination proxyOFT is null', async function () {
      // given
      await proxyOFT.setTrustedRemote(
        LZ_MAINNET_ID,
        ethers.utils.solidityPack(['address', 'address'], [ethers.constants.AddressZero, ethers.constants.AddressZero])
      )

      // when
      const tx = proxyOFT
        .connect(smartFarmingManager.wallet)
        .triggerLeverageSwap(LZ_MAINNET_ID, 1, alice.address, dai.address, parseEther('10'), 0, EMPTY_LZ_ARGS)

      // then
      await expect(tx).revertedWithCustomError(proxyOFT, 'AddressIsNull')
    })

    it('should revert if bridging is paused', async function () {
      // given
      poolRegistry.isBridgingActive.returns(false)

      // when
      const tx = proxyOFT
        .connect(smartFarmingManager.wallet)
        .triggerLeverageSwap(LZ_MAINNET_ID, 1, alice.address, dai.address, parseEther('10'), 0, EMPTY_LZ_ARGS)

      // then
      await expect(tx).revertedWithCustomError(proxyOFT, 'BridgingIsPaused')
      poolRegistry.isBridgingActive.returns(true)
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
      await proxyOFT
        .connect(smartFarmingManager.wallet)
        .triggerLeverageSwap(LZ_MAINNET_ID, id, account, tokenOut, amountIn, amountOutMin, lzArgs, {value: fee})

      // then
      const payload = CrossChainLib.encodeLeverageSwapPayload(
        smartFarmingManager.address,
        id,
        SG_POOL_ID,
        account,
        amountOutMin
      )

      const adapterParams = ethers.utils.solidityPack(
        ['uint16', 'uint256', 'uint256', 'address'],
        [LZ_ADAPTER_PARAMS_VERSION, LZ_BASE_GAS_LIMIT.add(swapTxGasLimit_), callbackTxNativeFee, proxyOFT.address]
      )

      const lzPayload = ethers.utils.defaultAbiCoder.encode(
        ['uint16', 'bytes', 'bytes', 'uint256', 'bytes', 'uint64'],
        [
          PT_SEND_AND_CALL,
          ethers.utils.solidityPack(['address'], [proxyOFT.address]), // msg.sender
          ethers.utils.solidityPack(['address'], [proxyOFT.address]), // toAddress
          amountIn,
          payload,
          swapTxGasLimit_,
        ]
      )

      const dstChainId = LZ_MAINNET_ID
      const trustedRemote = await proxyOFT.trustedRemoteLookup(dstChainId)
      const refundAddress = account
      const zroPaymentAddress = ethers.constants.AddressZero
      expect(lzEndpoint.send)
        .calledWith(dstChainId, trustedRemote, lzPayload, refundAddress, zroPaymentAddress, adapterParams)
        .calledWithValue(fee)
    })
  })

  describe('retrySwapSynthAndTriggerCallback', function () {
    it('should revert if caller is not account aka user', async function () {
      // given
      const fromAddress = proxyOFT.address
      const nonce = 123
      const amountIn = parseEther('10') // msUSD amount
      const requestId = 1
      const underlyingPoolId = 1
      const account = alice.address
      const amountOutMin = parseUnits('8', 6) // USDC amount
      const newAmountOutMin = parseUnits('7', 6) // USDC amount
      const payload = CrossChainLib.encodeLeverageSwapPayload(
        smartFarmingManager.address,
        requestId,
        underlyingPoolId,
        account,
        amountOutMin
      )

      // when
      const tx = proxyOFT
        .connect(bob)
        .retrySwapSynthAndTriggerCallback(LZ_OPTIMISM_ID, fromAddress, nonce, amountIn, payload, newAmountOutMin)

      // then
      await expect(tx).to.revertedWithCustomError(proxyOFT, 'InvalidMsgSender')
    })

    it('should retry SwapSynth and TriggerCallback', async function () {
      // given
      const fromAddress = proxyOFT.address
      const nonce = 123
      const amountIn = parseEther('10') // msUSD amount
      const requestId = 1
      const underlyingPoolId = 1
      const account = alice.address
      const amountOutMin = parseUnits('8', 6) // USDC amount
      const newAmountOutMin = parseUnits('7', 6) // USDC amount
      const payload = CrossChainLib.encodeLeverageSwapPayload(
        smartFarmingManager.address,
        requestId,
        underlyingPoolId,
        account,
        amountOutMin
      )

      // Here idea is to fail lzReceive so that it can store message for retry
      const topPayload = ethers.utils.defaultAbiCoder.encode(
        ['uint16', 'bytes', 'bytes', 'uint256', 'bytes', 'uint64'],
        [1, proxyOFT.address, proxyOFT.address, amountIn, payload, '100000']
      )
      swapper.swapExactInput.reverts() // mock revert will store txn for retry
      await proxyOFT.connect(proxyOFTSigner).nonblockingLzReceive(LZ_MAINNET_ID, proxyOFT.address, nonce, topPayload)
      // reset mock
      swapper.swapExactInput.reset()
      stargateRouter.swap.reset()

      // when
      await proxyOFT
        .connect(alice)
        .retrySwapSynthAndTriggerCallback(LZ_MAINNET_ID, fromAddress, nonce, amountIn, payload, newAmountOutMin)

      // then
      expect(swapper.swapExactInput).calledOnceWith(
        msUSD.address,
        usdc.address,
        amountIn,
        newAmountOutMin,
        proxyOFT.address
      )

      // then initiate swap via stargate
      expect(stargateRouter.swap).callCount(1)
    })
  })

  describe('retrySwapUnderlyingAndTriggerCallback', function () {
    it('should revert if caller is not account aka user', async function () {
      // given
      const fromAddress = proxyOFT.address
      const nonce = 123
      const amountIn = parseUnits('10', 6) // USDC amount
      const requestId = 1
      const account = alice.address
      const amountOutMin = parseEther('8') // msUSD amount
      const newAmountOutMin = parseEther('7') // msUSD amount
      const payload = CrossChainLib.encodeFlashRepaySwapPayload(
        smartFarmingManager.address,
        requestId,
        account,
        amountOutMin
      )

      // when
      stargateRouter.cachedSwapLookup.returns([usdc.address, amountIn, proxyOFT.address, payload])
      // when
      const tx = proxyOFT
        .connect(bob)
        .retrySwapUnderlyingAndTriggerCallback(LZ_OPTIMISM_ID, fromAddress, nonce, newAmountOutMin)

      // then
      await expect(tx).to.revertedWithCustomError(proxyOFT, 'InvalidMsgSender')
    })

    it('should retry SwapUnderlying and TriggerCallback', async function () {
      // given
      const fromAddress = proxyOFT.address
      const nonce = ethers.BigNumber.from(123)
      const amountIn = parseUnits('10', 6) // USDC amount
      const requestId = 1
      const account = alice.address
      const amountOutMin = parseEther('8') // msUSD amount
      const newAmountOutMin = parseEther('7') // msUSD amount
      const payload = CrossChainLib.encodeFlashRepaySwapPayload(
        smartFarmingManager.address,
        requestId,
        account,
        amountOutMin
      )

      // when
      stargateRouter.cachedSwapLookup.returns([usdc.address, amountIn, proxyOFT.address, payload])
      // when
      await proxyOFT.connect(alice).retrySwapUnderlyingAndTriggerCallback('111', fromAddress, nonce, newAmountOutMin)

      // then
      expect(stargateRouter.clearCachedSwap).callCount(1)
    })
  })
})
