/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable camelcase */
import {parseEther} from '@ethersproject/units'
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {expect} from 'chai'
import {ethers} from 'hardhat'
import {
  DefaultOracle,
  DefaultOracle__factory,
  UniswapV3PriceProvider__factory,
  UniswapV2PriceProvider__factory,
  ChainlinkPriceProvider__factory,
  ERC20Mock__factory,
  PriceProviderMock__factory,
  PriceProviderMock,
  ERC20Mock,
} from '../../typechain'
import {
  DEFAULT_TWAP_PERIOD,
  CHAINLINK_DOGE_AGGREGATOR_ADDRESS,
  enableForking,
  disableForking,
  increaseTime,
} from '../helpers'
import Address from '../../helpers/address'

const {MET_ADDRESS, DAI_ADDRESS, UNISWAP_V3_CROSS_POOL_ORACLE_ADDRESS, WETH_ADDRESS, UNISWAP_V2_ROUTER02_ADDRESS} =
  Address

const {MaxUint256, AddressZero} = ethers.constants

const STALE_PERIOD = MaxUint256.div('2')

const Protocol = {
  NONE: 0,
  UNISWAP_V3: 1,
  UNISWAP_V2: 2,
  CHAINLINK: 3,
}

const abi = new ethers.utils.AbiCoder()

describe('DefaultOracle', function () {
  let snapshotId: string
  let deployer: SignerWithAddress
  let user: SignerWithAddress
  let oracle: DefaultOracle
  let mUSD: ERC20Mock
  let depositToken: ERC20Mock
  let vsDOGE: ERC20Mock
  let vsETH: ERC20Mock
  let vsBTC: ERC20Mock
  let priceProviderMock: PriceProviderMock

  before(enableForking)

  after(disableForking)

  beforeEach(async function () {
    snapshotId = await ethers.provider.send('evm_snapshot', [])
    ;[deployer, user] = await ethers.getSigners()

    const erc20MockFactory = new ERC20Mock__factory(deployer)

    // mUSD
    mUSD = await erc20MockFactory.deploy('mUSD', 'mUSD', 18)
    await mUSD.deployed()

    // depositToken
    depositToken = await erc20MockFactory.deploy('Tokenized deposit position', 'vSynth-MET', 18)
    await depositToken.deployed()

    // vsDOGE
    vsDOGE = await erc20MockFactory.deploy('vsDOGE', 'vsDOGE', 18)
    await vsDOGE.deployed()

    // vsETH
    vsETH = await erc20MockFactory.deploy('vsETH', 'vsETH', 18)
    await vsETH.deployed()

    // vsETH
    vsBTC = await erc20MockFactory.deploy('vsBTC', 'vsBTC', 8)
    await vsBTC.deployed()

    // UniswapV3
    const uniswapV3PriceProviderFactory = new UniswapV3PriceProvider__factory(deployer)
    const uniswapV3PriceProvider = await uniswapV3PriceProviderFactory.deploy(
      UNISWAP_V3_CROSS_POOL_ORACLE_ADDRESS,
      DAI_ADDRESS,
      DEFAULT_TWAP_PERIOD
    )
    await uniswapV3PriceProvider.deployed()

    // Uniswap V2
    const uniswapV2PriceProviderFactory = new UniswapV2PriceProvider__factory(deployer)
    const uniswapV2PriceProvider = await uniswapV2PriceProviderFactory.deploy(
      UNISWAP_V2_ROUTER02_ADDRESS,
      DAI_ADDRESS,
      DEFAULT_TWAP_PERIOD
    )
    await uniswapV2PriceProvider.deployed()

    // Chainlink
    const chainlinkPriceProviderFactory = new ChainlinkPriceProvider__factory(deployer)
    const chainlinkPriceProvider = await chainlinkPriceProviderFactory.deploy()
    await chainlinkPriceProvider.deployed()

    // Mock
    const priceProviderMockFactory = new PriceProviderMock__factory(deployer)
    priceProviderMock = await priceProviderMockFactory.deploy()
    await priceProviderMock.deployed()

    // Oracle
    const oracleFactory = new DefaultOracle__factory(deployer)
    oracle = await oracleFactory.deploy()
    await oracle.deployed()

    await oracle.setPriceProvider(Protocol.UNISWAP_V3, uniswapV3PriceProvider.address)
    await oracle.setPriceProvider(Protocol.UNISWAP_V2, uniswapV2PriceProvider.address)
    await oracle.setPriceProvider(Protocol.CHAINLINK, chainlinkPriceProvider.address)

    await oracle.addOrUpdateUsdAsset(mUSD.address)
    await oracle.addOrUpdateAssetThatUsesUniswapV3(vsETH.address, WETH_ADDRESS)
    await oracle.addOrUpdateAssetThatUsesUniswapV3(vsETH.address, WETH_ADDRESS)
    await oracle.addOrUpdateAssetThatUsesUniswapV2(depositToken.address, MET_ADDRESS, STALE_PERIOD)
    await oracle.addOrUpdateAssetThatUsesChainlink(vsDOGE.address, CHAINLINK_DOGE_AGGREGATOR_ADDRESS, STALE_PERIOD)
  })

  afterEach(async function () {
    await ethers.provider.send('evm_revert', [snapshotId])
  })

  describe('using latest price (view) functions', function () {
    describe('convertToUsd', function () {
      it('should convert to USD using no price provider needed', async function () {
        const _amountInUsd = await oracle.convertToUsd(mUSD.address, parseEther('1'))
        expect(_amountInUsd).eq(parseEther('1'))
      })

      it('should convert to USD using UniswapV3 price provider', async function () {
        const _amountInUsd = await oracle.convertToUsd(vsETH.address, parseEther('1'))
        expect(_amountInUsd).eq('344642503883')
      })

      it('should convert to USD using UniswapV2 price provider', async function () {
        await increaseTime(DEFAULT_TWAP_PERIOD)
        await oracle.update(depositToken.address)
        const _amountInUsd = await oracle.convertToUsd(depositToken.address, parseEther('1'))
        expect(_amountInUsd).eq('480514770')
      })

      it('should convert to USD using Chainlink price provider', async function () {
        const _amountInUsd = await oracle.convertToUsd(vsDOGE.address, parseEther('1'))
        expect(_amountInUsd).eq('24128635')
      })

      it('should revert when price is outdated', async function () {
        await oracle.setPriceProvider(Protocol.UNISWAP_V2, priceProviderMock.address)
        await priceProviderMock.setLastUpdatedAt(0)
        const tx = oracle.convertToUsd(depositToken.address, parseEther('1'))
        await expect(tx).revertedWith('price-is-invalid'), STALE_PERIOD
      })

      it('should revert when price is zero', async function () {
        await oracle.setPriceProvider(Protocol.UNISWAP_V2, priceProviderMock.address)
        await priceProviderMock.setAmount(0)
        const tx = oracle.convertToUsd(depositToken.address, parseEther('1'))
        await expect(tx).revertedWith('price-is-invalid')
      })
    })

    describe('convertFromUsd', function () {
      it('should convert to USD using no price provider needed', async function () {
        const _amount = await oracle.convertFromUsd(mUSD.address, parseEther('1'))
        expect(_amount).eq(parseEther('1'))
      })

      it('should convert to USD using UniswapV3 price provider', async function () {
        const _amount = await oracle.convertFromUsd(vsETH.address, '344642503883')
        expect(_amount).closeTo(parseEther('1'), parseEther('0.000000000001').toNumber())
      })

      it('should convert to USD using UniswapV2 price provider', async function () {
        await increaseTime(DEFAULT_TWAP_PERIOD)
        await oracle.update(depositToken.address)
        const _amount = await oracle.convertFromUsd(depositToken.address, '480514770')
        expect(_amount).closeTo(parseEther('1'), parseEther('0.000000001').toNumber())
      })

      it('should convert to USD using Chainlink price provider', async function () {
        const _amount = await oracle.convertFromUsd(vsDOGE.address, '24128635')
        expect(_amount).eq(parseEther('1'))
      })

      it('should revert when price is outdated', async function () {
        await oracle.setPriceProvider(Protocol.UNISWAP_V2, priceProviderMock.address)
        await priceProviderMock.setLastUpdatedAt(0)
        const tx = oracle.convertFromUsd(depositToken.address, '480514770')
        await expect(tx).revertedWith('price-is-invalid')
      })

      it('should indicates when price is zero', async function () {
        await oracle.setPriceProvider(Protocol.UNISWAP_V2, priceProviderMock.address)
        await priceProviderMock.setAmount(0)
        const tx = oracle.convertFromUsd(depositToken.address, '480514770')
        await expect(tx).revertedWith('price-is-invalid')
      })
    })

    describe('convert', function () {
      it('should convert assets using distinct price providers', async function () {
        const amountInUsd = '344642503883'
        const amountInEther = await oracle.convertFromUsd(vsETH.address, amountInUsd)
        const amountInDoge = await oracle.convert(vsETH.address, vsDOGE.address, amountInEther)
        const _amountInUsd = await oracle.convertToUsd(vsDOGE.address, amountInDoge)
        expect(_amountInUsd).closeTo(amountInUsd, 2)
      })
    })
  })

  describe('update', function () {
    it('should update price if needed (UniswapV2)', async function () {
      // given
      await oracle.update(depositToken.address)
      await increaseTime(DEFAULT_TWAP_PERIOD)
      await expect(oracle.convertFromUsd(depositToken.address, parseEther('1'))).revertedWith('price-is-invalid')

      // when
      await oracle.update(depositToken.address)

      // then
      const amount = await oracle.convertFromUsd(depositToken.address, parseEther('1'))
      expect(amount).gt(0)
    })
  })

  describe('setPriceProvider', function () {
    it('should revert if not governor', async function () {
      const tx = oracle.connect(user).setPriceProvider(Protocol.CHAINLINK, deployer.address)
      await expect(tx).revertedWith('not-governor')
    })

    it('should revert if address is null', async function () {
      const tx = oracle.setPriceProvider(Protocol.CHAINLINK, AddressZero)
      await expect(tx).revertedWith('price-provider-address-null')
    })

    it('should update price provider', async function () {
      const source = Protocol.CHAINLINK
      const oldPriceProvider = await oracle.providerByProtocol(source)
      const newPriceProvider = deployer.address
      const tx = oracle.setPriceProvider(Protocol.CHAINLINK, newPriceProvider)
      await expect(tx).emit(oracle, 'PriceProviderUpdated').withArgs(source, oldPriceProvider, newPriceProvider)
    })
  })

  describe('addOrUpdateUsdAsset', function () {
    it('should revert if not governor', async function () {
      const tx = oracle.connect(user).addOrUpdateUsdAsset(mUSD.address)
      await expect(tx).revertedWith('not-governor')
    })

    it('should revert if asset address is null', async function () {
      const tx = oracle.addOrUpdateUsdAsset(AddressZero)
      await expect(tx).revertedWith('asset-address-is-null')
    })

    it('should set an USD asset', async function () {
      const tx = oracle.addOrUpdateUsdAsset(mUSD.address)
      await expect(tx).emit(oracle, 'AssetUpdated').withArgs(mUSD.address, Protocol.NONE, '0x', true, MaxUint256)
    })
  })

  describe('addOrUpdateAssetThatUsesChainlink', function () {
    it('should revert if not governor', async function () {
      const tx = oracle.connect(user).addOrUpdateAssetThatUsesChainlink(depositToken.address, AddressZero, STALE_PERIOD)
      await expect(tx).revertedWith('not-governor')
    })

    it('should revert if asset address is null', async function () {
      const tx = oracle.addOrUpdateAssetThatUsesChainlink(AddressZero, depositToken.address, STALE_PERIOD)
      await expect(tx).revertedWith('asset-address-is-null')
    })

    it('should revert if aggregator address is null', async function () {
      const tx = oracle.addOrUpdateAssetThatUsesChainlink(depositToken.address, AddressZero, STALE_PERIOD)
      await expect(tx).revertedWith('aggregator-address-is-null')
    })

    it('should set an asset that uses Chainlink as oracle', async function () {
      const tx = oracle.addOrUpdateAssetThatUsesChainlink(
        depositToken.address,
        CHAINLINK_DOGE_AGGREGATOR_ADDRESS,
        STALE_PERIOD
      )
      const assetData = abi.encode(['address', 'uint256'], [CHAINLINK_DOGE_AGGREGATOR_ADDRESS, 18])
      await expect(tx)
        .emit(oracle, 'AssetUpdated')
        .withArgs(depositToken.address, Protocol.CHAINLINK, assetData, false, STALE_PERIOD)
    })
  })

  describe('addOrUpdateAssetThatUsesUniswapV2', function () {
    it('should revert if not governor', async function () {
      const tx = oracle.connect(user).addOrUpdateAssetThatUsesUniswapV2(depositToken.address, AddressZero, STALE_PERIOD)
      await expect(tx).revertedWith('not-governor')
    })

    it('should revert if asset address is null', async function () {
      const tx = oracle.addOrUpdateAssetThatUsesUniswapV2(AddressZero, depositToken.address, STALE_PERIOD)
      await expect(tx).revertedWith('asset-address-is-null')
    })

    it('should revert if underlying address is null', async function () {
      const tx = oracle.addOrUpdateAssetThatUsesUniswapV2(depositToken.address, AddressZero, STALE_PERIOD)
      await expect(tx).revertedWith('underlying-address-is-null')
    })

    it('should set an asset that uses UniswapV2 as oracle', async function () {
      const tx = oracle.addOrUpdateAssetThatUsesUniswapV2(depositToken.address, MET_ADDRESS, STALE_PERIOD)
      const encodedMetAddress = abi.encode(['address'], [MET_ADDRESS])
      await expect(tx)
        .emit(oracle, 'AssetUpdated')
        .withArgs(depositToken.address, Protocol.UNISWAP_V2, encodedMetAddress, false, STALE_PERIOD)
    })
  })

  describe('addOrUpdateAssetThatUsesUniswapV3', function () {
    it('should revert if not governor', async function () {
      const tx = oracle.connect(user).addOrUpdateAssetThatUsesUniswapV3(depositToken.address, AddressZero)
      await expect(tx).revertedWith('not-governor')
    })

    it('should revert if asset address is null', async function () {
      const tx = oracle.addOrUpdateAssetThatUsesUniswapV3(AddressZero, depositToken.address)
      await expect(tx).revertedWith('asset-address-is-null')
    })

    it('should revert if underlying address is null', async function () {
      const tx = oracle.addOrUpdateAssetThatUsesUniswapV3(depositToken.address, AddressZero)
      await expect(tx).revertedWith('underlying-address-is-null')
    })

    it('should set an asset that uses UniswapV3 as oracle', async function () {
      const tx = oracle.addOrUpdateAssetThatUsesUniswapV3(depositToken.address, MET_ADDRESS)
      const encodedMetAddress = abi.encode(['address'], [MET_ADDRESS])
      await expect(tx)
        .emit(oracle, 'AssetUpdated')
        .withArgs(depositToken.address, Protocol.UNISWAP_V3, encodedMetAddress, false, MaxUint256)
    })
  })
})
