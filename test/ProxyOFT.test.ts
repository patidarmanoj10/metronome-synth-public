import {BigNumber} from 'ethers'
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {loadFixture, setStorageAt} from '@nomicfoundation/hardhat-network-helpers'
import chai, {expect} from 'chai'
import {ethers} from 'hardhat'
import {
  IStargateRouter,
  SyntheticToken,
  PoolRegistry,
  ProxyOFT,
  ILayerZeroEndpoint,
  CrossChainDispatcher,
  IStargateBridge,
  IStargateComposer,
} from '../typechain'
import {FakeContract, smock} from '@defi-wonderland/smock'
import {parseEther} from '../helpers'

chai.use(smock.matchers)

const LZ_MAINNET_ID = 101
const LZ_OPTIMISM_ID = 111
const PT_SEND = BigNumber.from(0)
const PT_SEND_AND_CALL = BigNumber.from(1)
const LZ_BASE_GAS_LIMIT = BigNumber.from('200000')
const LZ_ADAPTER_PARAMS_VERSION = 2

const adapterParams = ethers.utils.solidityPack(
  ['uint16', 'uint256', 'uint256', 'address'],
  [LZ_ADAPTER_PARAMS_VERSION, LZ_BASE_GAS_LIMIT, 0, ethers.constants.AddressZero]
)

describe('ProxyOFT', function () {
  let deployer: SignerWithAddress
  let alice: SignerWithAddress
  let bob: SignerWithAddress
  let msUSD: FakeContract<SyntheticToken>
  let lzEndpoint: FakeContract<ILayerZeroEndpoint>
  let stargateRouter: FakeContract<IStargateRouter>
  let stargateComposer: FakeContract<IStargateComposer>
  let stargateBridge: FakeContract<IStargateBridge>
  let proxyOFT: ProxyOFT
  let crossChainDispatcher: FakeContract<CrossChainDispatcher>
  let poolRegistry: FakeContract<PoolRegistry>

  async function fixture() {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[deployer, alice, bob] = await ethers.getSigners()

    msUSD = await smock.fake('SyntheticToken')
    lzEndpoint = await smock.fake('ILayerZeroEndpoint')
    poolRegistry = await smock.fake('PoolRegistry')
    stargateRouter = await smock.fake('IStargateRouter')
    stargateComposer = await smock.fake('IStargateComposer')
    stargateBridge = await smock.fake('IStargateBridge')
    crossChainDispatcher = await smock.fake('CrossChainDispatcher')

    stargateComposer.stargateRouter.returns(stargateRouter.address)
    stargateRouter.bridge.returns(stargateBridge.address)
    stargateBridge.layerZeroEndpoint.returns(lzEndpoint.address)
    poolRegistry.crossChainDispatcher.returns(crossChainDispatcher.address)
    poolRegistry.governor.returns(deployer.address)
    msUSD.poolRegistry.returns(poolRegistry.address)
    crossChainDispatcher.stargateComposer.returns(stargateComposer.address)
    crossChainDispatcher.lzBaseGasLimit.returns(LZ_BASE_GAS_LIMIT)
    crossChainDispatcher.flashRepayCallbackTxGasLimit.returns(100000)
    crossChainDispatcher.leverageCallbackTxGasLimit.returns(200000)
    crossChainDispatcher.leverageSwapTxGasLimit.returns(300000)
    crossChainDispatcher.flashRepaySwapTxGasLimit.returns(400000)

    const proxyOFTFactory = await ethers.getContractFactory('ProxyOFT', deployer)
    proxyOFT = await proxyOFTFactory.deploy()
    await proxyOFT.deployed()
    await setStorageAt(proxyOFT.address, 0, 0) // Undo initialization made by constructor
    await proxyOFT.initialize(lzEndpoint.address, msUSD.address)
    await proxyOFT.setUseCustomAdapterParams(true)
    await proxyOFT.setTrustedRemote(
      LZ_MAINNET_ID,
      ethers.utils.solidityPack(['address', 'address'], [proxyOFT.address, proxyOFT.address])
    )
    await proxyOFT.setUseCustomAdapterParams(true)
    await proxyOFT.setMinDstGas(LZ_MAINNET_ID, PT_SEND, LZ_BASE_GAS_LIMIT)
    await proxyOFT.setMinDstGas(LZ_MAINNET_ID, PT_SEND_AND_CALL, LZ_BASE_GAS_LIMIT)
  }

  beforeEach(async function () {
    await loadFixture(fixture)

    crossChainDispatcher.isBridgingActive.returns(true)
    crossChainDispatcher.isDestinationChainSupported.returns(true)
  })

  describe('sendFrom', function () {
    it('should revert if caller is not the owner', async function () {
      // given
      const amount = parseEther('100')

      // when
      const tx = proxyOFT
        .connect(bob)
        ['sendFrom(address,uint16,address,uint256)'](alice.address, LZ_MAINNET_ID, bob.address, amount)

      // then
      await expect(tx).revertedWithCustomError(proxyOFT, 'SenderIsNotTheOwner')
    })

    it('should revert if bridge is paused', async function () {
      // given
      crossChainDispatcher.isBridgingActive.returns(false)
      const amount = parseEther('100')

      // when
      const tx = proxyOFT
        .connect(alice)
        ['sendFrom(address,uint16,address,uint256)'](alice.address, LZ_MAINNET_ID, bob.address, amount)

      // then
      await expect(tx).revertedWithCustomError(proxyOFT, 'BridgingIsPaused')
    })

    it('should revert if dstChain is not supported', async function () {
      // given
      crossChainDispatcher.isDestinationChainSupported.returns(false)
      const amount = parseEther('100')

      // when
      const tx = proxyOFT
        .connect(alice)
        ['sendFrom(address,uint16,address,uint256)'](alice.address, LZ_MAINNET_ID, bob.address, amount)

      // then
      await expect(tx).revertedWithCustomError(proxyOFT, 'DestinationChainNotAllowed')
    })

    it('should burn amount', async function () {
      // given
      const amount = parseEther('100')

      // when
      await proxyOFT
        .connect(alice)
        ['sendFrom(address,uint16,address,uint256)'](alice.address, LZ_MAINNET_ID, bob.address, amount)

      // then
      expect(msUSD.burn).calledWith(alice.address, amount)
    })
  })

  describe('sendAndCall', function () {
    it('should revert if caller is not CrossChainDispatcher', async function () {
      // when
      const tx = proxyOFT
        .connect(bob)
        .sendAndCall(
          ethers.constants.AddressZero,
          0,
          '0x',
          0,
          '0x',
          0,
          ethers.constants.AddressZero,
          ethers.constants.AddressZero,
          adapterParams
        )

      // then
      await expect(tx).revertedWithCustomError(proxyOFT, 'SenderIsNotCrossChainDispatcher')
    })
  })

  describe('getProxyOFTOf', function () {
    it('should get proxyOFT from trusted remote mapping', async function () {
      // when
      await proxyOFT.setTrustedRemote(
        LZ_MAINNET_ID,
        ethers.utils.solidityPack(['address', 'address'], [alice.address, bob.address])
      )
      await proxyOFT.setTrustedRemote(
        LZ_OPTIMISM_ID,
        ethers.utils.solidityPack(['address', 'address'], [bob.address, alice.address])
      )

      // then
      expect(await proxyOFT.getProxyOFTOf(LZ_MAINNET_ID)).eq(alice.address)
      expect(await proxyOFT.getProxyOFTOf(LZ_OPTIMISM_ID)).eq(bob.address)
    })
  })
})
