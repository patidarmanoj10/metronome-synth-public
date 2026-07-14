/* eslint-disable no-unexpected-multiline */
import {BigNumber} from 'ethers'
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {loadFixture, setStorageAt} from '@nomicfoundation/hardhat-network-helpers'
import chai, {expect} from 'chai'
import {ethers} from 'hardhat'
import {SyntheticToken, PoolRegistry, ProxyOFT, ILayerZeroEndpoint} from '../typechain'
import {FakeContract, smock} from '@defi-wonderland/smock'
import {parseEther} from '../helpers'
import {Contract} from 'ethers'
import {impersonateAccount} from './helpers'

chai.use(smock.matchers)

const LZ_MAINNET_CHAIN_ID = 101 // Example destination chain
const LZ_PLASMA_CHAIN_ID = 102
const LZ_BASE_GAS_LIMIT = ethers.BigNumber.from('200000')
const PT_SEND = BigNumber.from(0)
const PT_SEND_AND_CALL = BigNumber.from(1)

describe('SyntheticToken & ProxyOFT on Plasma', function () {
  let deployer: SignerWithAddress
  let user: SignerWithAddress

  let syntheticToken: SyntheticToken
  let proxyOFT: Contract & ProxyOFT
  let lzEndpointMock: FakeContract<ILayerZeroEndpoint>
  let poolRegistryMock: FakeContract<PoolRegistry>

  async function fixture() {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[deployer, user] = await ethers.getSigners()

    // Setup mock contracts
    poolRegistryMock = await smock.fake('PoolRegistry')
    lzEndpointMock = await smock.fake('ILayerZeroEndpoint')

    // Setup mock returns
    poolRegistryMock.governor.returns(deployer.address)
    poolRegistryMock.lzBaseGasLimit.returns(LZ_BASE_GAS_LIMIT)
    poolRegistryMock.isBridgingActive.returns(true)
    poolRegistryMock.isDestinationChainSupported.returns(true)

    // Deploy synthetic token
    const syntheticTokenFactory = await ethers.getContractFactory('SyntheticToken', deployer)
    syntheticToken = await syntheticTokenFactory.deploy()
    await syntheticToken.deployed()
    await setStorageAt(syntheticToken.address, 0, 0) // Undo initialization made by constructor
    await syntheticToken.initialize('Metronome Synth msUSD', 'msUSD', 18, poolRegistryMock.address)

    // Deploy and initialize ProxyOFT
    const proxyOFTFactory = await ethers.getContractFactory('ProxyOFT', deployer)
    proxyOFT = (await proxyOFTFactory.deploy()) as Contract & ProxyOFT
    await proxyOFT.deployed()
    await setStorageAt(proxyOFT.address, 0, 0) // Undo initialization made by constructor
    await proxyOFT.initialize(lzEndpointMock.address, syntheticToken.address)

    // Setup ProxyOFT for cross-chain
    await proxyOFT.setTrustedRemote(
      LZ_MAINNET_CHAIN_ID,
      ethers.utils.solidityPack(['address', 'address'], [proxyOFT.address, proxyOFT.address])
    )
    await proxyOFT.setTrustedRemote(
      LZ_PLASMA_CHAIN_ID,
      ethers.utils.solidityPack(['address', 'address'], [proxyOFT.address, proxyOFT.address])
    )
    await proxyOFT.setUseCustomAdapterParams(true)
    await proxyOFT.setUseCustomAdapterParams(true)
    await proxyOFT.setMinDstGas(LZ_PLASMA_CHAIN_ID, PT_SEND, LZ_BASE_GAS_LIMIT)
    await proxyOFT.setMinDstGas(LZ_PLASMA_CHAIN_ID, PT_SEND_AND_CALL, LZ_BASE_GAS_LIMIT)

    // setup synthetic token for cross-chain
    await syntheticToken.updateProxyOFT(proxyOFT.address)
    await syntheticToken.updateMaxBridgedOutSupply(ethers.utils.parseEther('1000'))
    await syntheticToken.updateMaxBridgedInSupply(ethers.utils.parseEther('1000'))
  }

  beforeEach(async function () {
    await loadFixture(fixture)
  })

  describe('Mint Synth', function () {
    it('should allow minting when receiving tokens from trusted remote', async function () {
      const amount = parseEther('100')
      const balanceBefore = await syntheticToken.balanceOf(user.address)
      expect(balanceBefore).eq(0)

      const payload = ethers.utils.defaultAbiCoder.encode(['uint16', 'bytes', 'uint256'], [0, user.address, amount])
      const path = await proxyOFT.trustedRemoteLookup(LZ_MAINNET_CHAIN_ID)

      // lzReceive aka mint
      const lzEndpointSigner = await impersonateAccount(lzEndpointMock.address)
      await proxyOFT.connect(lzEndpointSigner).lzReceive(LZ_MAINNET_CHAIN_ID, path, 0, payload)

      const balanceAfter = await syntheticToken.balanceOf(user.address)
      expect(balanceAfter).eq(amount, 'Mint did not work')
    })
  })

  describe('Burning Synth', function () {
    it('should burn tokens when sending to another chain', async function () {
      const amount = parseEther('100')
      const payload = ethers.utils.defaultAbiCoder.encode(['uint16', 'bytes', 'uint256'], [0, user.address, amount])
      const path = await proxyOFT.trustedRemoteLookup(LZ_MAINNET_CHAIN_ID)
      // lzReceive aka mint
      const lzEndpointSigner = await impersonateAccount(lzEndpointMock.address)
      await proxyOFT.connect(lzEndpointSigner).lzReceive(LZ_MAINNET_CHAIN_ID, path, 0, payload)

      const balanceBefore = await syntheticToken.balanceOf(user.address)
      expect(balanceBefore).eq(amount, 'No synth balance')

      const burnAmount = amount.div(3)

      await proxyOFT
        .connect(user)
        ['sendFrom(address,uint16,address,uint256)'](user.address, LZ_PLASMA_CHAIN_ID, user.address, burnAmount)

      expect(await syntheticToken.balanceOf(user.address)).eq(balanceBefore.sub(burnAmount))
    })
  })
})
