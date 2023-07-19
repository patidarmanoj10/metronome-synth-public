/* eslint-disable prefer-template */
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import chai, {expect} from 'chai'
import {ethers} from 'hardhat'
import {IStargateBridge, Layer2ProxyOFT, Pool, PoolRegistry, Quoter, SmartFarmingManager} from '../typechain'
import {FakeContract, smock} from '@defi-wonderland/smock'
import {SyntheticToken} from '../typechain/contracts'
import {ERC20Mock} from '../typechain/contracts/mock'
import {parseEther} from '../helpers'
import {setBalance} from '@nomicfoundation/hardhat-network-helpers'
import {BigNumber} from 'ethers'
import {ILayerZeroEndpoint} from '../typechain/contracts/dependencies/@layerzerolabs/solidity-examples/interfaces'

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
  let stargateRouter: FakeContract //<IStargateRouter>
  let stargateBridge: FakeContract<IStargateBridge>
  let msUSD: FakeContract<SyntheticToken>
  let dai: ERC20Mock
  let layer2ProxyOFT: Layer2ProxyOFT
  let smartFarmingManager: FakeContract<SmartFarmingManager>
  let pool: FakeContract<Pool>
  let poolRegistry: FakeContract<PoolRegistry>
  let quoter: Quoter

  beforeEach(async function () {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[owner] = await ethers.getSigners()

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
    stargateBridge = await smock.fake('IStargateBridge')

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

    const quoterFactory = await ethers.getContractFactory('Quoter')
    quoter = await quoterFactory.deploy()
    await quoter.deployed()
    await quoter.initialize(poolRegistry.address)

    smartFarmingManager.pool.returns(pool.address)
    msUSD.poolRegistry.returns(poolRegistry.address)
    poolRegistry.isPoolRegistered.returns(([poolAddress]: string) => poolAddress === pool.address)
    poolRegistry.stargateRouter.returns(stargateRouter.address)
    poolRegistry.stargatePoolIdOf.returns(SG_POOL_ID)
    poolRegistry.stargateSlippage.returns(0)
    poolRegistry.lzMainnetChainId.returns(BigNumber.from(101))
    poolRegistry.governor.returns(owner.address)
    poolRegistry.lzBaseGasLimit.returns(LZ_BASE_GAS_LIMIT)
    poolRegistry.flashRepayCallbackTxGasLimit.returns(100000)
    poolRegistry.leverageCallbackTxGasLimit.returns(200000)
    poolRegistry.leverageSwapTxGasLimit.returns(300000)
    poolRegistry.flashRepaySwapTxGasLimit.returns(400000)
    pool.smartFarmingManager.returns(smartFarmingManager.address)
    msUSD.proxyOFT.returns(layer2ProxyOFT.address)
    stargateRouter.bridge.returns(stargateBridge.address)
    stargateBridge.layerZeroEndpoint.returns(lzEndpoint.address)

    await setBalance(smartFarmingManager.address, parseEther('10'))
    await setBalance(stargateRouter.address, parseEther('10'))
  })

  it('getLeverageSwapAndCallbackLzArgs', async function () {
    // given
    const leverageCallbackNativeFee = parseEther('0.25')
    stargateRouter.quoteLayerZeroFee.returns([leverageCallbackNativeFee, 0])
    const leverageSwapTxGasLimit = await poolRegistry.leverageSwapTxGasLimit()

    // when
    const lzArgs = await quoter.getLeverageSwapAndCallbackLzArgs(LZ_OPTIMISM_ID)

    // then
    expect(lzArgs).eq(
      ethers.utils.defaultAbiCoder.encode(['uint256', 'uint256'], [leverageCallbackNativeFee, leverageSwapTxGasLimit])
    )
  })

  it('getFlashRepaySwapAndCallbackLzArgs', async function () {
    // given
    const flashRepayCallbackNativeFee = parseEther('0.25')
    lzEndpoint.estimateFees.returns([flashRepayCallbackNativeFee, 0])
    const flashRepaySwapTxGasLimit = await poolRegistry.flashRepaySwapTxGasLimit()

    // when
    const lzArgs = await quoter.getFlashRepaySwapAndCallbackLzArgs(LZ_OPTIMISM_ID)

    // then
    expect(lzArgs).eq(
      ethers.utils.defaultAbiCoder.encode(
        ['uint256', 'uint256'],
        [flashRepayCallbackNativeFee, flashRepaySwapTxGasLimit]
      )
    )
  })

  it('quoteLeverageCallbackNativeFee', async function () {
    // given
    const dstGasForCall = await poolRegistry.leverageCallbackTxGasLimit()
    const transferAndCallFullPayload = ethers.utils.solidityPack(['address', 'bytes32'], [MAX_ADDRESS, MAX_BYTES32])

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
    const callbackTxGasLimit = await poolRegistry.flashRepayCallbackTxGasLimit()

    // when
    await quoter.quoteFlashRepayCallbackNativeFee(LZ_OPTIMISM_ID)

    // then
    const payload = ethers.utils.defaultAbiCoder.encode(['address', 'bytes32'], [MAX_ADDRESS, MAX_BYTES32])

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

  it('quoteLayer2FlashRepayNativeFee', async function () {
    // given
    const swapTxGasLimit = BigNumber.from('500000')
    const callbackTxNativeFee = parseEther('0.1')
    const lzArgs = ethers.utils.defaultAbiCoder.encode(['uint256', 'uint64'], [callbackTxNativeFee, swapTxGasLimit])
    const transferAndCallFullPayload = ethers.utils.solidityPack(
      ['address', 'bytes32', 'address', 'uint256'],
      [MAX_ADDRESS, MAX_BYTES32, MAX_ADDRESS, MAX_BYTES32]
    )

    // when
    await quoter.quoteLayer2FlashRepayNativeFee(layer2ProxyOFT.address, lzArgs)

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

  it('quoteLayer2LeverageNativeFee', async function () {
    // given
    const swapTxGasLimit_ = BigNumber.from('500000')
    const callbackTxNativeFee = parseEther('0.1')
    const lzArgs = ethers.utils.defaultAbiCoder.encode(['uint256', 'uint64'], [callbackTxNativeFee, swapTxGasLimit_])
    const transferAndCallFullPayload = ethers.utils.defaultAbiCoder.encode(
      ['address', 'bytes32', 'uint256', 'address', 'uint256'],
      [MAX_ADDRESS, MAX_BYTES32, MAX_BYTES32, MAX_ADDRESS, MAX_BYTES32]
    )

    // when
    await quoter.quoteLayer2LeverageNativeFee(layer2ProxyOFT.address, lzArgs)

    // then
    const adapterParams = ethers.utils.solidityPack(
      ['uint16', 'uint256', 'uint256', 'address'],
      [LZ_ADAPTER_PARAMS_VERSION, LZ_BASE_GAS_LIMIT.add(swapTxGasLimit_), callbackTxNativeFee, MAINNET_OFT_ADDRESS]
    )

    const lzPayload = ethers.utils.defaultAbiCoder.encode(
      ['uint16', 'bytes', 'bytes', 'uint256', 'bytes', 'uint64'],
      [
        PT_SEND_AND_CALL,
        ethers.utils.solidityPack(['address'], [quoter.address]), // msg.sender
        ethers.utils.solidityPack(['address'], [MAINNET_OFT_ADDRESS]), // toAddress
        ethers.constants.MaxUint256,
        transferAndCallFullPayload,
        swapTxGasLimit_,
      ]
    )

    expect(lzEndpoint.estimateFees).calledWith(LZ_MAINNET_ID, layer2ProxyOFT.address, lzPayload, false, adapterParams)
  })
})
