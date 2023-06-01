/* eslint-disable camelcase */
import {parseEther} from '@ethersproject/units'
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {expect} from 'chai'
import {ethers} from 'hardhat'
import {SyntheticToken, ProxyOFT, LZEndpointMock} from '../typechain'
import {FakeContract, smock} from '@defi-wonderland/smock'
import {setBalance, setCode} from '@nomicfoundation/hardhat-network-helpers'
import {IERC20} from '../typechain/dependencies/openzeppelin/token/ERC20'
import {disableForking, enableForking} from './helpers'

const chainId_L1 = 1
const chainId_L2 = 2

// Note: Based on https://github.com/LayerZero-Labs/solidity-examples/blob/main/test/contracts/oft/ProxyOFT.test.js
describe('ProxyOFT', function () {
  let deployer: SignerWithAddress
  let dai: IERC20
  let poolMock: FakeContract
  let alice: SignerWithAddress
  let bob: SignerWithAddress
  let poolRegistryMock_L1: FakeContract
  let poolRegistryMock_L2: FakeContract
  let msUSD_L1: SyntheticToken
  let msUSD_L2: SyntheticToken
  let lzEndpoint_L1: LZEndpointMock
  let lzEndpoint_L2: LZEndpointMock
  let proxyOFT_L1: ProxyOFT
  let proxyOFT_L2: ProxyOFT

  before(enableForking)

  after(disableForking)

  beforeEach(async function () {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[deployer, alice, bob] = await ethers.getSigners()

    const erc20MockFactory = await ethers.getContractFactory('ERC20Mock', deployer)
    dai = await erc20MockFactory.deploy('DAI', 'DAI', 18)
    await dai.deployed()

    poolMock = await smock.fake('contracts/Pool.sol:Pool')
    await setBalance(poolMock.address, parseEther('100'))
    poolMock.doesSyntheticTokenExist.returns(true)

    poolRegistryMock_L1 = await smock.fake('PoolRegistry')
    await setCode(poolRegistryMock_L1.address, '0x01')
    poolRegistryMock_L1.governor.returns(deployer.address)
    poolRegistryMock_L1.isPoolRegistered.returns((address: string) => address == poolMock.address)

    poolRegistryMock_L2 = await smock.fake('PoolRegistry')
    await setCode(poolRegistryMock_L2.address, '0x01')
    poolRegistryMock_L2.governor.returns(deployer.address)
    poolRegistryMock_L2.isPoolRegistered.returns((address: string) => address == poolMock.address)

    const syntheticTokenFactory = await ethers.getContractFactory('SyntheticToken', deployer)
    const lzEndpointMockFactory = await ethers.getContractFactory('LZEndpointMock', deployer)
    const proxyOFTFactory = await ethers.getContractFactory('ProxyOFT', deployer)

    //
    // L1 Contracts
    //
    msUSD_L1 = await syntheticTokenFactory.deploy()
    await msUSD_L1.deployed()
    await msUSD_L1.initialize('Metronome Synth USD', 'msUSD', 18, poolRegistryMock_L1.address)

    lzEndpoint_L1 = await lzEndpointMockFactory.deploy(chainId_L1)

    proxyOFT_L1 = await proxyOFTFactory.deploy(lzEndpoint_L1.address, msUSD_L1.address, chainId_L1)

    //
    // L2 Contracts
    //
    msUSD_L2 = await syntheticTokenFactory.deploy()
    await msUSD_L2.deployed()
    await msUSD_L2.initialize('Metronome Synth USD', 'msUSD', 18, poolRegistryMock_L2.address)

    lzEndpoint_L2 = await lzEndpointMockFactory.deploy(chainId_L2)

    proxyOFT_L2 = await proxyOFTFactory.deploy(lzEndpoint_L2.address, msUSD_L2.address, chainId_L2)

    //
    // Setup
    //
    await msUSD_L1.updateProxyOFT(proxyOFT_L1.address)
    await msUSD_L2.updateProxyOFT(proxyOFT_L2.address)
    await msUSD_L1.updateMaxBridgingBalance(ethers.constants.MaxUint256)
    await msUSD_L2.updateMaxBridgingBalance(ethers.constants.MaxUint256)

    await lzEndpoint_L1.setDestLzEndpoint(proxyOFT_L2.address, lzEndpoint_L2.address)
    await lzEndpoint_L2.setDestLzEndpoint(proxyOFT_L1.address, lzEndpoint_L1.address)

    await proxyOFT_L1.setTrustedRemote(
      chainId_L2,
      ethers.utils.solidityPack(['address', 'address'], [proxyOFT_L2.address, proxyOFT_L1.address])
    )

    await proxyOFT_L2.setTrustedRemote(
      chainId_L1,
      ethers.utils.solidityPack(['address', 'address'], [proxyOFT_L1.address, proxyOFT_L2.address])
    )
  })

  describe('when alice has balance', function () {
    const amount = parseEther('100')

    beforeEach(async function () {
      await msUSD_L1.connect(poolMock.wallet).mint(alice.address, amount)

      expect(await msUSD_L1.balanceOf(alice.address)).eq(amount)
      expect(await msUSD_L2.balanceOf(bob.address)).eq(0)
    })

    it('should transfer token cross-chains', async function () {
      // when
      const nativeFee = (await proxyOFT_L1.estimateSendFee(chainId_L2, alice.address, amount, false, '0x')).nativeFee
      await proxyOFT_L1
        .connect(alice)
        .sendFrom(alice.address, chainId_L2, bob.address, amount, alice.address, ethers.constants.AddressZero, '0x', {
          value: nativeFee,
        })

      // then
      expect(await msUSD_L1.balanceOf(alice.address)).eq(0)
      expect(await msUSD_L2.balanceOf(bob.address)).eq(amount)
    })

    // Note: This test case is failing with `{"message": "Endpoint request timed out"}` when using Bloq provider
    // but it's passing when using Alchemy provider
    it.skip('should be able recover if reached the bridging max', async function () {
      // given
      await msUSD_L2.updateMaxBridgingBalance(0)

      const nativeFee = (await proxyOFT_L1.estimateSendFee(chainId_L2, alice.address, amount, false, '0x')).nativeFee
      await proxyOFT_L1
        .connect(alice)
        .sendFrom(alice.address, chainId_L2, bob.address, amount, alice.address, ethers.constants.AddressZero, '0x', {
          value: nativeFee,
        })

      expect(await msUSD_L1.balanceOf(alice.address)).eq(0) // burnt from L1
      expect(await msUSD_L2.balanceOf(bob.address)).eq(0) // didn't mint L2

      const filter = proxyOFT_L2.filters.MessageFailed(null, null, null, null, null)
      const [messageFailedEvent] = await proxyOFT_L2.queryFilter(filter, 0, 'latest')
      const {
        args: {_srcChainId, _srcAddress, _nonce, _payload, _reason},
      } = messageFailedEvent
      expect(_srcChainId).eq(chainId_L1)
      expect(ethers.utils.getAddress(_srcAddress.slice(0, 42))).eq(proxyOFT_L1.address)
      expect(_nonce).eq(1)
      expect(_reason).eq(msUSD_L2.interface.getSighash('SurpassMaxBridgingBalance'))

      // when
      await msUSD_L2.updateMaxBridgingBalance(ethers.constants.MaxUint256)
      await proxyOFT_L2.retryMessage(_srcChainId, _srcAddress, _nonce, _payload)

      // then
      expect(await msUSD_L2.balanceOf(bob.address)).eq(amount)
    })
  })
})
