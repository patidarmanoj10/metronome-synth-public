/* eslint-disable camelcase */
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {expect} from 'chai'
import {ethers} from 'hardhat'
import {
  DefaultOracle,
  DefaultOracle__factory,
  UniswapV3PriceProvider__factory,
  UniswapV2LikePriceProvider__factory,
  ChainlinkPriceProvider__factory,
  ERC20Mock__factory,
  ERC20Mock,
} from '../../typechain'
import {
  DEFAULT_TWAP_PERIOD,
  DOGE_USD_CHAINLINK_AGGREGATOR_ADDRESS,
  enableForking,
  disableForking,
  increaseTime,
} from '../helpers'
import Address from '../../helpers/address'
import {BigNumber} from 'ethers'
import {FakeContract, smock} from '@defi-wonderland/smock'
import {toUSD} from '../../helpers'

const {
  MET_ADDRESS,
  DAI_ADDRESS,
  UNISWAP_V3_CROSS_POOL_ORACLE_ADDRESS,
  NATIVE_TOKEN_ADDRESS,
  UNISWAP_V2_LIKE_ROUTER_ADDRESS,
} = Address

const {MaxUint256, AddressZero} = ethers.constants

const STALE_PERIOD = BigNumber.from(`${60 * 60 * 24}`) // 24h

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
  let vsUSD: ERC20Mock
  let depositToken: ERC20Mock
  let vsDOGE: ERC20Mock
  let vsETH: ERC20Mock
  let vsBTC: ERC20Mock
  let priceProviderMock: FakeContract

  before(enableForking)

  after(disableForking)

  beforeEach(async function () {
    snapshotId = await ethers.provider.send('evm_snapshot', [])
    ;[deployer, user] = await ethers.getSigners()

    const erc20MockFactory = new ERC20Mock__factory(deployer)

    // vsUSD
    vsUSD = await erc20MockFactory.deploy('vsUSD', 'vsUSD', 18)
    await vsUSD.deployed()

    // depositToken
    depositToken = await erc20MockFactory.deploy('Tokenized deposit position', 'vsdMET', 18)
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
    const uniswapV2LikePriceProviderFactory = new UniswapV2LikePriceProvider__factory(deployer)
    const uniswapV2LikePriceProvider = await uniswapV2LikePriceProviderFactory.deploy(
      UNISWAP_V2_LIKE_ROUTER_ADDRESS,
      NATIVE_TOKEN_ADDRESS,
      DAI_ADDRESS,
      DEFAULT_TWAP_PERIOD
    )
    await uniswapV2LikePriceProvider.deployed()

    // Chainlink
    const chainlinkPriceProviderFactory = new ChainlinkPriceProvider__factory(deployer)
    const chainlinkPriceProvider = await chainlinkPriceProviderFactory.deploy()
    await chainlinkPriceProvider.deployed()

    // Mock
    priceProviderMock = await smock.fake('ChainlinkPriceProvider')

    // Oracle
    const oracleFactory = new DefaultOracle__factory(deployer)
    oracle = await oracleFactory.deploy()
    await oracle.deployed()

    await oracle.setPriceProvider(Protocol.UNISWAP_V3, uniswapV3PriceProvider.address)
    await oracle.setPriceProvider(Protocol.UNISWAP_V2, uniswapV2LikePriceProvider.address)
    await oracle.setPriceProvider(Protocol.CHAINLINK, chainlinkPriceProvider.address)

    await oracle.addOrUpdateUsdAsset(vsUSD.address)
    await oracle.addOrUpdateAssetThatUsesUniswapV3(vsETH.address, NATIVE_TOKEN_ADDRESS)
    await oracle.addOrUpdateAssetThatUsesUniswapV2(depositToken.address, MET_ADDRESS, STALE_PERIOD)
    await oracle.addOrUpdateAssetThatUsesChainlink(vsDOGE.address, DOGE_USD_CHAINLINK_AGGREGATOR_ADDRESS, STALE_PERIOD)
  })

  afterEach(async function () {
    await ethers.provider.send('evm_revert', [snapshotId])
  })

  describe('using latest price (view) functions', function () {
    describe('getPriceInUsd', function () {
      it('should convert to USD using no price provider needed', async function () {
        const _amountInUsd = await oracle.getPriceInUsd(vsUSD.address)
        expect(_amountInUsd).eq(toUSD('1'))
      })

      it('should convert to USD using UniswapV3 price provider', async function () {
        const _amountInUsd = await oracle.getPriceInUsd(vsETH.address)
        expect(_amountInUsd).closeTo(toUSD('2560.37141557'), toUSD('0.000001'))
      })

      it('should convert to USD using UniswapV2 price provider', async function () {
        await increaseTime(DEFAULT_TWAP_PERIOD)
        await oracle.update(depositToken.address)
        const _amountInUsd = await oracle.getPriceInUsd(depositToken.address)
        expect(_amountInUsd).closeTo(toUSD('2.13506071'), toUSD('0.000001'))
      })

      it('should convert to USD using Chainlink price provider', async function () {
        const _amountInUsd = await oracle.getPriceInUsd(vsDOGE.address)
        expect(_amountInUsd).closeTo(toUSD('0.11530811'), toUSD('0.000001'))
      })

      it('should revert when price is outdated', async function () {
        await oracle.setPriceProvider(Protocol.UNISWAP_V2, priceProviderMock.address)
        priceProviderMock.getPriceInUsd.returns([0, 0])

        const tx = oracle.getPriceInUsd(depositToken.address)
        await expect(tx).revertedWith('price-is-stale')
      })
    })
  })

  describe('update', function () {
    it('should update price if needed (UniswapV2)', async function () {
      // given
      await oracle.update(depositToken.address)
      await increaseTime(STALE_PERIOD.mul('2'))
      await expect(oracle.getPriceInUsd(depositToken.address)).revertedWith('price-is-stale')

      // when
      await oracle.update(depositToken.address)

      // then
      const amount = await oracle.getPriceInUsd(depositToken.address)
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
      await expect(tx).revertedWith('provider-address-null')
    })

    it('should revert if using the current value', async function () {
      const currentProvider = await oracle.providerByProtocol(Protocol.CHAINLINK)
      const tx = oracle.setPriceProvider(Protocol.CHAINLINK, currentProvider)
      await expect(tx).revertedWith('new-same-as-current')
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
      const tx = oracle.connect(user).addOrUpdateUsdAsset(vsUSD.address)
      await expect(tx).revertedWith('not-governor')
    })

    it('should revert if asset address is null', async function () {
      const tx = oracle.addOrUpdateUsdAsset(AddressZero)
      await expect(tx).revertedWith('asset-address-is-null')
    })

    it('should set an USD asset', async function () {
      const tx = oracle.addOrUpdateUsdAsset(vsUSD.address)
      await expect(tx).emit(oracle, 'AssetUpdated').withArgs(vsUSD.address, Protocol.NONE, '0x', true, MaxUint256)
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
        DOGE_USD_CHAINLINK_AGGREGATOR_ADDRESS,
        STALE_PERIOD
      )
      const assetData = abi.encode(['address', 'uint256'], [DOGE_USD_CHAINLINK_AGGREGATOR_ADDRESS, 18])
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
