/* eslint-disable camelcase */
import {parseEther} from '@ethersproject/units'
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {expect} from 'chai'
import {ethers} from 'hardhat'
import {
  Oracle,
  Oracle__factory,
  UniswapV3PriceProvider__factory,
  UniswapV2PriceProvider__factory,
  ChainlinkPriceProvider__factory,
  ERC20Mock__factory,
  ERC20,
  PriceProviderMock__factory,
  PriceProviderMock,
} from '../../typechain'
import {
  DEFAULT_TWAP_PERIOD,
  MET_ADDRESS,
  DAI_ADDRESS,
  CHAINLINK_DOGE_AGGREGATOR_ADDRESS,
  UNISWAP_V3_CROSS_POOL_ORACLE_ADDRESS,
  enableForking,
  disableForking,
  WETH_ADDRESS,
  UNISWAP_V2_ROUTER02_ADDRESS,
  increaseTime,
} from './../helpers'

const STALE_PERIOD = ethers.constants.MaxUint256

const Protocol = {
  NONE: 0,
  UNISWAP_V3: 1,
  UNISWAP_V2: 2,
  CHAINLINK: 3,
}

const abi = new ethers.utils.AbiCoder()

describe('Oracle', function () {
  let snapshotId: string
  let deployer: SignerWithAddress
  let user: SignerWithAddress
  let oracle: Oracle
  let mUSD: ERC20
  let depositToken: ERC20
  let mDOGE: ERC20
  let mETH: ERC20
  let priceProviderMock: PriceProviderMock

  before(enableForking)

  after(disableForking)

  beforeEach(async function () {
    snapshotId = await ethers.provider.send('evm_snapshot', [])
    ;[deployer, user] = await ethers.getSigners()

    const erc20MockFactory = new ERC20Mock__factory(deployer)

    // mUSD
    mUSD = await erc20MockFactory.deploy('mUSD', 'mUSD')
    await mUSD.deployed()

    // depositToken
    depositToken = await erc20MockFactory.deploy('Tokenized deposit position', 'mBOX-MET')
    await depositToken.deployed()

    // mDOGE
    mDOGE = await erc20MockFactory.deploy('mDOGE', 'mDOGE')
    await mDOGE.deployed()

    // mETH
    mETH = await erc20MockFactory.deploy('mETH', 'mETH')
    await mETH.deployed()

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
    const oracleFactory = new Oracle__factory(deployer)
    oracle = await oracleFactory.deploy(STALE_PERIOD)
    await oracle.deployed()

    await oracle.setPriceProvider(Protocol.UNISWAP_V3, uniswapV3PriceProvider.address)
    await oracle.setPriceProvider(Protocol.UNISWAP_V2, uniswapV2PriceProvider.address)
    await oracle.setPriceProvider(Protocol.CHAINLINK, chainlinkPriceProvider.address)

    await oracle.setUsdAsset(mUSD.address)
    await oracle.setAssetThatUsesUniswapV3(mETH.address, WETH_ADDRESS)
    await oracle.setAssetThatUsesUniswapV2(depositToken.address, MET_ADDRESS)
    await oracle.setAssetThatUsesChainlink(mDOGE.address, CHAINLINK_DOGE_AGGREGATOR_ADDRESS)
  })

  afterEach(async function () {
    await ethers.provider.send('evm_revert', [snapshotId])
  })

  describe('using latest price (view) functions', function () {
    describe('convertToUsdUsingLatestPrice', function () {
      it('should convert to USD using no price provider needed', async function () {
        const {_amountInUsd, _priceInvalid} = await oracle.convertToUsdUsingLatestPrice(mUSD.address, parseEther('1'))
        expect(_amountInUsd).to.eq(parseEther('1'))
        expect(_priceInvalid).to.eq(false)
      })

      it('should convert to USD using UniswapV3 price provider', async function () {
        const {_amountInUsd, _priceInvalid} = await oracle.convertToUsdUsingLatestPrice(mETH.address, parseEther('1'))
        expect(_amountInUsd).to.eq('344642503883')
        expect(_priceInvalid).to.eq(false)
      })

      it('should convert to USD using UniswapV2 price provider', async function () {
        await increaseTime(DEFAULT_TWAP_PERIOD)
        await oracle.update(depositToken.address)
        const {_amountInUsd, _priceInvalid} = await oracle.convertToUsdUsingLatestPrice(
          depositToken.address,
          parseEther('1')
        )
        expect(_amountInUsd).to.eq('480514770')
        expect(_priceInvalid).to.eq(false)
      })

      it('should convert to USD using Chainlink price provider', async function () {
        const {_amountInUsd, _priceInvalid} = await oracle.convertToUsdUsingLatestPrice(mDOGE.address, parseEther('1'))
        expect(_amountInUsd).to.eq('24128635')
        expect(_priceInvalid).to.eq(false)
      })

      it('should indicates when price is outdated', async function () {
        await oracle.setPriceProvider(Protocol.UNISWAP_V2, priceProviderMock.address)
        await priceProviderMock.setLastUpdatedAt(0)
        const {_priceInvalid} = await oracle.convertToUsdUsingLatestPrice(depositToken.address, parseEther('1'))
        expect(_priceInvalid).to.eq(true)
      })

      it('should indicates when price is zero', async function () {
        await oracle.setPriceProvider(Protocol.UNISWAP_V2, priceProviderMock.address)
        await priceProviderMock.setAmount(0)
        const {_priceInvalid} = await oracle.convertToUsdUsingLatestPrice(depositToken.address, parseEther('1'))
        expect(_priceInvalid).to.eq(true)
      })
    })

    describe('convertFromUsdUsingLatestPrice', function () {
      it('should convert to USD using no price provider needed', async function () {
        const {_amount, _priceInvalid} = await oracle.convertFromUsdUsingLatestPrice(mUSD.address, parseEther('1'))
        expect(_amount).to.eq(parseEther('1'))
        expect(_priceInvalid).to.eq(false)
      })

      it('should convert to USD using UniswapV3 price provider', async function () {
        const {_amount, _priceInvalid} = await oracle.convertFromUsdUsingLatestPrice(mETH.address, '344642503883')
        expect(_amount).to.closeTo(parseEther('1'), parseEther('0.000000000001').toNumber())
        expect(_priceInvalid).to.eq(false)
      })

      it('should convert to USD using UniswapV2 price provider', async function () {
        await increaseTime(DEFAULT_TWAP_PERIOD)
        await oracle.update(depositToken.address)
        const {_amount, _priceInvalid} = await oracle.convertFromUsdUsingLatestPrice(depositToken.address, '480514770')
        expect(_amount).to.closeTo(parseEther('1'), parseEther('0.000000001').toNumber())
        expect(_priceInvalid).to.eq(false)
      })

      it('should convert to USD using Chainlink price provider', async function () {
        const {_amount, _priceInvalid} = await oracle.convertFromUsdUsingLatestPrice(mDOGE.address, '24128635')
        expect(_amount).to.eq(parseEther('1'))
        expect(_priceInvalid).to.eq(false)
      })

      it('should indicates when price is outdated', async function () {
        await oracle.setPriceProvider(Protocol.UNISWAP_V2, priceProviderMock.address)
        await priceProviderMock.setLastUpdatedAt(0)
        const {_priceInvalid} = await oracle.convertFromUsdUsingLatestPrice(depositToken.address, '480514770')
        expect(_priceInvalid).to.eq(true)
      })

      it('should indicates when price is zero', async function () {
        await oracle.setPriceProvider(Protocol.UNISWAP_V2, priceProviderMock.address)
        await priceProviderMock.setAmount(0)
        const {_priceInvalid} = await oracle.convertFromUsdUsingLatestPrice(depositToken.address, '480514770')
        expect(_priceInvalid).to.eq(true)
      })
    })

    describe('convertUsingLatestPrice', function () {
      it('should convert assets using distinct price providers', async function () {
        const amountInUsd = '344642503883'
        const {_amount: amountInEther} = await oracle.convertFromUsdUsingLatestPrice(mETH.address, amountInUsd)
        const {_amountOut: amountInDoge} = await oracle.convertUsingLatestPrice(
          mETH.address,
          mDOGE.address,
          amountInEther
        )
        const {_amountInUsd} = await oracle.convertToUsdUsingLatestPrice(mDOGE.address, amountInDoge)
        expect(_amountInUsd).to.closeTo(amountInUsd, 2)
      })
    })
  })

  describe('update & query (non-view) functions', function () {
    describe('convertToUsd', function () {
      it('should convert to USD using no price provider needed', async function () {
        const amountOutInUsd = await oracle.callStatic.convertToUsd(mUSD.address, parseEther('1'))
        expect(amountOutInUsd).to.eq(parseEther('1'))
      })

      it('should convert to USD using UniswapV3 price provider', async function () {
        const amountOutInUsd = await oracle.callStatic.convertToUsd(mETH.address, parseEther('1'))
        expect(amountOutInUsd).to.eq('344642503883')
      })

      it('should convert to USD using UniswapV2 price provider', async function () {
        await increaseTime(DEFAULT_TWAP_PERIOD)
        const amountOutInUsd = await oracle.callStatic.convertToUsd(depositToken.address, parseEther('1'))
        expect(amountOutInUsd).to.eq('480514770')
      })

      it('should convert to USD using Chainlink price provider', async function () {
        const amountOutInUsd = await oracle.callStatic.convertToUsd(mDOGE.address, parseEther('1'))
        expect(amountOutInUsd).to.eq('24128635')
      })

      it('should revert when price is invalid', async function () {
        await oracle.setPriceProvider(Protocol.UNISWAP_V2, priceProviderMock.address)
        await priceProviderMock.setLastUpdatedAt(0)
        const tx = oracle.convertToUsd(depositToken.address, parseEther('1'))
        await expect(tx).to.revertedWith('price-is-invalid')
      })

      it('should update when price is outdated', async function () {
        // given
        await oracle.update(depositToken.address)
        await increaseTime(DEFAULT_TWAP_PERIOD)
        const {_priceInvalid: priceInvalidBefore} = await oracle.convertToUsdUsingLatestPrice(
          depositToken.address,
          parseEther('1')
        )
        expect(priceInvalidBefore).to.be.true

        // when
        await oracle.convertToUsd(depositToken.address, parseEther('1'))

        // then
        const {_priceInvalid: priceInvalidAfter} = await oracle.convertToUsdUsingLatestPrice(
          depositToken.address,
          parseEther('1')
        )
        expect(priceInvalidAfter).to.be.false
      })
    })

    describe('convertFromUsd', function () {
      it('should convert to USD using no price provider needed', async function () {
        const amountOut = await oracle.callStatic.convertFromUsd(mUSD.address, parseEther('1'))
        expect(amountOut).to.eq(parseEther('1'))
      })

      it('should convert to USD using UniswapV3 price provider', async function () {
        const amountOut = await oracle.callStatic.convertFromUsd(mETH.address, '344642503883')
        expect(amountOut).to.closeTo(parseEther('1'), parseEther('0.000000000001').toNumber())
      })

      it('should convert to USD using UniswapV2 price provider', async function () {
        await increaseTime(DEFAULT_TWAP_PERIOD)
        const amountOut = await oracle.callStatic.convertFromUsd(depositToken.address, '480514770')
        expect(amountOut).to.closeTo(parseEther('1'), parseEther('0.000000001').toNumber())
      })

      it('should convert to USD using Chainlink price provider', async function () {
        const amountOut = await oracle.callStatic.convertFromUsd(mDOGE.address, '24128635')
        expect(amountOut).to.eq(parseEther('1'))
      })

      it('should revert when price is invalid', async function () {
        await oracle.setPriceProvider(Protocol.UNISWAP_V2, priceProviderMock.address)
        await priceProviderMock.setLastUpdatedAt(0)
        const tx = oracle.convertFromUsd(depositToken.address, parseEther('1'))
        await expect(tx).to.revertedWith('price-is-invalid')
      })

      it('should update when price is outdated', async function () {
        // given
        await oracle.update(depositToken.address)
        await increaseTime(DEFAULT_TWAP_PERIOD)
        const {_priceInvalid: priceInvalidBefore} = await oracle.convertFromUsdUsingLatestPrice(
          depositToken.address,
          parseEther('1')
        )
        expect(priceInvalidBefore).to.be.true

        // when
        await oracle.convertFromUsd(depositToken.address, parseEther('1'))

        // then
        const {_priceInvalid: priceInvalidAfter} = await oracle.convertFromUsdUsingLatestPrice(
          depositToken.address,
          parseEther('1')
        )
        expect(priceInvalidAfter).to.be.false
      })
    })

    describe('convert', function () {
      it('should convert assets using distinct price providers', async function () {
        const amountInUsd = '344642503883'
        const amountInEther = await oracle.callStatic.convertFromUsd(mETH.address, amountInUsd)
        const amountInDoge = await oracle.callStatic.convert(mETH.address, mDOGE.address, amountInEther)
        expect(await oracle.callStatic.convertToUsd(mDOGE.address, amountInDoge)).to.closeTo(amountInUsd, 2)
      })
    })
  })

  describe('update', function () {
    it('should update price if needed (UniswapV2)', async function () {
      // given
      await oracle.update(depositToken.address)
      await increaseTime(DEFAULT_TWAP_PERIOD)
      const {_priceInvalid: priceInvalidBefore} = await oracle.convertFromUsdUsingLatestPrice(
        depositToken.address,
        parseEther('1')
      )
      expect(priceInvalidBefore).to.be.true

      // when
      await oracle.update(depositToken.address)

      // then
      const {_priceInvalid: priceInvalidAfter} = await oracle.convertFromUsdUsingLatestPrice(
        depositToken.address,
        parseEther('1')
      )
      expect(priceInvalidAfter).to.be.false
    })
  })

  describe('setPriceProvider', function () {
    it('should revert if not governor', async function () {
      const tx = oracle.connect(user).setPriceProvider(Protocol.CHAINLINK, deployer.address)
      await expect(tx).to.be.revertedWith('not-the-governor')
    })

    it('should revert if address is null', async function () {
      const tx = oracle.setPriceProvider(Protocol.CHAINLINK, ethers.constants.AddressZero)
      await expect(tx).to.be.revertedWith('price-provider-address-null')
    })

    it('should update price provider', async function () {
      const source = Protocol.CHAINLINK
      const oldPriceProvider = await oracle.providerByProtocol(source)
      const newPriceProvider = deployer.address
      const tx = oracle.setPriceProvider(Protocol.CHAINLINK, newPriceProvider)
      await expect(tx).to.emit(oracle, 'PriceProviderUpdated').withArgs(source, oldPriceProvider, newPriceProvider)
    })
  })

  describe('updateStalePeriod', function () {
    it('should revert if not governor', async function () {
      const tx = oracle.connect(user).updateStalePeriod(0)
      await expect(tx).to.be.revertedWith('not-the-governor')
    })

    it('should revert if new value is the same as old', async function () {
      const tx = oracle.updateStalePeriod(await oracle.stalePeriod())
      await expect(tx).to.be.revertedWith('stale-period-same-as-current')
    })

    it('should update stalle period', async function () {
      const oldStalePeriod = await oracle.stalePeriod()
      const newStalePeriod = 1
      const tx = oracle.updateStalePeriod(newStalePeriod)
      await expect(tx).to.emit(oracle, 'StalePeriodUpdated').withArgs(oldStalePeriod, newStalePeriod)
    })
  })

  describe('setUsdAsset', function () {
    it('should revert if not governor', async function () {
      const tx = oracle.connect(user).setUsdAsset(mUSD.address)
      await expect(tx).to.be.revertedWith('not-the-governor')
    })

    it('should revert if asset address is null', async function () {
      const tx = oracle.setUsdAsset(ethers.constants.AddressZero)
      await expect(tx).to.be.revertedWith('asset-address-is-null')
    })

    it('should set an USD asset', async function () {
      const tx = oracle.setUsdAsset(mUSD.address)
      await expect(tx).to.emit(oracle, 'AssetUpdated').withArgs(mUSD.address, Protocol.NONE, '0x', true)
    })
  })

  describe('setAssetThatUsesChainlink', function () {
    it('should revert if not governor', async function () {
      const tx = oracle.connect(user).setAssetThatUsesChainlink(depositToken.address, ethers.constants.AddressZero)
      await expect(tx).to.be.revertedWith('not-the-governor')
    })

    it('should revert if asset address is null', async function () {
      const tx = oracle.setAssetThatUsesChainlink(ethers.constants.AddressZero, depositToken.address)
      await expect(tx).to.be.revertedWith('asset-address-is-null')
    })

    it('should revert if aggregator address is null', async function () {
      const tx = oracle.setAssetThatUsesChainlink(depositToken.address, ethers.constants.AddressZero)
      await expect(tx).to.be.revertedWith('aggregator-address-is-null')
    })

    it('should set an asset that uses Chainlink as oracle', async function () {
      const tx = oracle.setAssetThatUsesChainlink(depositToken.address, CHAINLINK_DOGE_AGGREGATOR_ADDRESS)
      const assetData = abi.encode(['address', 'uint256'], [CHAINLINK_DOGE_AGGREGATOR_ADDRESS, 18])
      await expect(tx)
        .to.emit(oracle, 'AssetUpdated')
        .withArgs(depositToken.address, Protocol.CHAINLINK, assetData, false)
    })
  })

  describe('setAssetThatUsesUniswapV2', function () {
    it('should revert if not governor', async function () {
      const tx = oracle.connect(user).setAssetThatUsesUniswapV2(depositToken.address, ethers.constants.AddressZero)
      await expect(tx).to.be.revertedWith('not-the-governor')
    })

    it('should revert if asset address is null', async function () {
      const tx = oracle.setAssetThatUsesUniswapV2(ethers.constants.AddressZero, depositToken.address)
      await expect(tx).to.be.revertedWith('asset-address-is-null')
    })

    it('should revert if underlying address is null', async function () {
      const tx = oracle.setAssetThatUsesUniswapV2(depositToken.address, ethers.constants.AddressZero)
      await expect(tx).to.be.revertedWith('underlying-address-is-null')
    })

    it('should set an asset that uses UniswapV2 as oracle', async function () {
      const tx = oracle.setAssetThatUsesUniswapV2(depositToken.address, MET_ADDRESS)
      const encodedMetAddress = abi.encode(['address'], [MET_ADDRESS])
      await expect(tx)
        .to.emit(oracle, 'AssetUpdated')
        .withArgs(depositToken.address, Protocol.UNISWAP_V2, encodedMetAddress, false)
    })
  })

  describe('setAssetThatUsesUniswapV3', function () {
    it('should revert if not governor', async function () {
      const tx = oracle.connect(user).setAssetThatUsesUniswapV3(depositToken.address, ethers.constants.AddressZero)
      await expect(tx).to.be.revertedWith('not-the-governor')
    })

    it('should revert if asset address is null', async function () {
      const tx = oracle.setAssetThatUsesUniswapV3(ethers.constants.AddressZero, depositToken.address)
      await expect(tx).to.be.revertedWith('asset-address-is-null')
    })

    it('should revert if underlying address is null', async function () {
      const tx = oracle.setAssetThatUsesUniswapV3(depositToken.address, ethers.constants.AddressZero)
      await expect(tx).to.be.revertedWith('underlying-address-is-null')
    })

    it('should set an asset that uses UniswapV3 as oracle', async function () {
      const tx = oracle.setAssetThatUsesUniswapV3(depositToken.address, MET_ADDRESS)
      const encodedMetAddress = abi.encode(['address'], [MET_ADDRESS])
      await expect(tx)
        .to.emit(oracle, 'AssetUpdated')
        .withArgs(depositToken.address, Protocol.UNISWAP_V3, encodedMetAddress, false)
    })
  })
})
