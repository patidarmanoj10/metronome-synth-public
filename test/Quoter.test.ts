/* eslint-disable prefer-template */
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import chai, {expect} from 'chai'
import {ethers} from 'hardhat'
import {
  IStargateBridge,
  ProxyOFT,
  PoolRegistry,
  Quoter,
  IStargateRouter,
  ILayerZeroEndpoint,
  CrossChainDispatcher,
} from '../typechain'
import {FakeContract, smock} from '@defi-wonderland/smock'
import {parseEther} from '../helpers'
import {loadFixture, setStorageAt} from '@nomicfoundation/hardhat-network-helpers'
import {BigNumber} from 'ethers'
import {CrossChainLib} from './helpers/CrossChainLib'

chai.use(smock.matchers)

const LZ_ADAPTER_PARAMS_VERSION = 2
const SG_TYPE_SWAP_REMOTE = 1

const LZ_MAINNET_ID = 101
const LZ_OPTIMISM_ID = 110
const MAINNET_OFT_ADDRESS = '0x0000000000000000000000000000000000000009'
const SG_POOL_ID = 1

const LZ_BASE_GAS_LIMIT = BigNumber.from('200000')
const PT_SEND_AND_CALL = BigNumber.from(1)
const MAX_ADDRESS = '0x' + 'f'.repeat(20 * 2)
const MAX_BYTES32 = '0x' + 'f'.repeat(32 * 2)

describe('Quoter', function () {
  let owner: SignerWithAddress
  let lzEndpoint: FakeContract<ILayerZeroEndpoint>
  let stargateRouter: FakeContract<IStargateRouter>
  let stargateBridge: FakeContract<IStargateBridge>
  let proxyOFT: FakeContract<ProxyOFT>
  let crossChainDispatcher: FakeContract<CrossChainDispatcher>
  let poolRegistry: FakeContract<PoolRegistry>
  let quoter: Quoter

  async function fixture() {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[owner] = await ethers.getSigners()

    lzEndpoint = await smock.fake('ILayerZeroEndpoint')
    poolRegistry = await smock.fake('PoolRegistry')
    stargateRouter = await smock.fake('IStargateRouter')
    stargateBridge = await smock.fake('IStargateBridge')
    crossChainDispatcher = await smock.fake('CrossChainDispatcher')
    proxyOFT = await smock.fake('ProxyOFT')

    const quoterFactory = await ethers.getContractFactory('Quoter')
    quoter = await quoterFactory.deploy()
    await quoter.deployed()
    await setStorageAt(quoter.address, 0, 0) // Undo initialization made by constructor
    await quoter.initialize(poolRegistry.address)

    proxyOFT.getProxyOFTOf.returns(MAINNET_OFT_ADDRESS)
    stargateRouter.bridge.returns(stargateBridge.address)
    stargateBridge.layerZeroEndpoint.returns(lzEndpoint.address)
    poolRegistry.crossChainDispatcher.returns(crossChainDispatcher.address)
    crossChainDispatcher.stargateRouter.returns(stargateRouter.address)
    crossChainDispatcher.stargatePoolIdOf.returns(SG_POOL_ID)
    crossChainDispatcher.stargateSlippage.returns(0)
    crossChainDispatcher.lzBaseGasLimit.returns(LZ_BASE_GAS_LIMIT)
    crossChainDispatcher.flashRepayCallbackTxGasLimit.returns(100000)
    crossChainDispatcher.leverageCallbackTxGasLimit.returns(200000)
    crossChainDispatcher.leverageSwapTxGasLimit.returns(300000)
    crossChainDispatcher.flashRepaySwapTxGasLimit.returns(400000)
  }

  beforeEach(async function () {
    await loadFixture(fixture)
  })

  it('getFlashRepaySwapAndCallbackLzArgs', async function () {
    // given
    const flashRepayCallbackNativeFee = parseEther('0.25')
    lzEndpoint.estimateFees.returns([flashRepayCallbackNativeFee, 0])
    const flashRepaySwapTxGasLimit = await crossChainDispatcher.flashRepaySwapTxGasLimit()

    // when
    const lzArgs = await quoter.getFlashRepaySwapAndCallbackLzArgs(LZ_OPTIMISM_ID, LZ_MAINNET_ID)

    // then
    expect(lzArgs).eq(CrossChainLib.encodeLzArgs(LZ_MAINNET_ID, flashRepayCallbackNativeFee, flashRepaySwapTxGasLimit))
  })

  it('getLeverageSwapAndCallbackLzArgs', async function () {
    // given
    const leverageCallbackNativeFee = parseEther('0.25')
    stargateRouter.quoteLayerZeroFee.returns([leverageCallbackNativeFee, 0])
    const leverageSwapTxGasLimit = await crossChainDispatcher.leverageSwapTxGasLimit()

    // when
    const lzArgs = await quoter.getLeverageSwapAndCallbackLzArgs(LZ_OPTIMISM_ID, LZ_MAINNET_ID)

    // then
    expect(lzArgs).eq(CrossChainLib.encodeLzArgs(LZ_MAINNET_ID, leverageCallbackNativeFee, leverageSwapTxGasLimit))
  })

  it('quoteLeverageCallbackNativeFee', async function () {
    // given
    const dstGasForCall = await crossChainDispatcher.leverageCallbackTxGasLimit()
    const transferAndCallFullPayload = CrossChainLib.encodeLeverageCallbackPayload(MAX_ADDRESS, MAX_BYTES32)

    // when
    await quoter.quoteLeverageCallbackNativeFee(LZ_OPTIMISM_ID)

    // then
    expect(stargateRouter.quoteLayerZeroFee).calledWith(
      LZ_OPTIMISM_ID,
      SG_TYPE_SWAP_REMOTE,
      ethers.utils.solidityPack(['address'], [MAX_ADDRESS]),
      transferAndCallFullPayload,
      {
        dstGasForCall,
        dstNativeAmount: BigNumber.from(0),
        dstNativeAddr: '0x',
      }
    )
  })

  it('quoteFlashRepayCallbackNativeFee', async function () {
    // given
    const callbackTxGasLimit = await crossChainDispatcher.flashRepayCallbackTxGasLimit()

    // when
    await quoter.quoteFlashRepayCallbackNativeFee(LZ_OPTIMISM_ID)

    // then
    const payload = CrossChainLib.encodeFlashRepayCallbackPayload(MAX_ADDRESS, MAX_ADDRESS, MAX_BYTES32)

    const adapterParams = ethers.utils.solidityPack(
      ['uint16', 'uint256', 'uint256', 'address'],
      [LZ_ADAPTER_PARAMS_VERSION, LZ_BASE_GAS_LIMIT.add(callbackTxGasLimit), 0, ethers.constants.AddressZero]
    )

    const lzPayload = ethers.utils.defaultAbiCoder.encode(
      ['uint16', 'bytes', 'bytes', 'uint256', 'bytes', 'uint64'],
      [
        PT_SEND_AND_CALL,
        ethers.utils.solidityPack(['address'], [owner.address]), // msg.sender
        MAX_ADDRESS,
        ethers.constants.MaxUint256,
        payload,
        callbackTxGasLimit,
      ]
    )

    expect(lzEndpoint.estimateFees).calledWith(LZ_OPTIMISM_ID, quoter.address, lzPayload, false, adapterParams)
  })

  it('quoteCrossChainFlashRepayNativeFee', async function () {
    // given
    const swapTxGasLimit = BigNumber.from('500000')
    const callbackTxNativeFee = parseEther('0.1')
    const lzArgs = CrossChainLib.encodeLzArgs(LZ_MAINNET_ID, callbackTxNativeFee, swapTxGasLimit)
    const transferAndCallFullPayload = CrossChainLib.encodeFlashRepaySwapPayload(
      MAX_ADDRESS,
      MAX_ADDRESS,
      MAX_BYTES32,
      MAX_ADDRESS,
      MAX_BYTES32
    )

    // when
    await quoter.quoteCrossChainFlashRepayNativeFee(proxyOFT.address, lzArgs)

    // then
    expect(stargateRouter.quoteLayerZeroFee).calledWith(
      LZ_MAINNET_ID,
      SG_TYPE_SWAP_REMOTE,
      MAINNET_OFT_ADDRESS,
      transferAndCallFullPayload,
      {
        dstGasForCall: swapTxGasLimit,
        dstNativeAmount: callbackTxNativeFee,
        dstNativeAddr: MAINNET_OFT_ADDRESS,
      }
    )
  })

  it('quoteCrossChainLeverageNativeFee', async function () {
    // given
    const swapTxGasLimit = BigNumber.from('500000')
    const callbackTxNativeFee = parseEther('0.1')
    const lzArgs = CrossChainLib.encodeLzArgs(LZ_MAINNET_ID, callbackTxNativeFee, swapTxGasLimit)
    const transferAndCallFullPayload = CrossChainLib.encodeLeverageSwapPayload(
      MAX_ADDRESS,
      MAX_ADDRESS,
      MAX_BYTES32,
      MAX_BYTES32,
      MAX_ADDRESS,
      MAX_BYTES32
    )

    // when
    await quoter.quoteCrossChainLeverageNativeFee(proxyOFT.address, lzArgs)

    // then
    const adapterParams = ethers.utils.solidityPack(
      ['uint16', 'uint256', 'uint256', 'address'],
      [LZ_ADAPTER_PARAMS_VERSION, LZ_BASE_GAS_LIMIT.add(swapTxGasLimit), callbackTxNativeFee, MAINNET_OFT_ADDRESS]
    )

    expect(proxyOFT.estimateSendAndCallFee).calledWith(
      LZ_MAINNET_ID,
      ethers.utils.solidityPack(['address'], [MAINNET_OFT_ADDRESS]),
      MAX_BYTES32,
      transferAndCallFullPayload,
      swapTxGasLimit,
      false,
      adapterParams
    )
  })
})
