/* eslint-disable camelcase */
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {expect} from 'chai'
import {ethers} from 'hardhat'
import {UniswapV2LikePriceProvider, UniswapV2LikePriceProvider__factory} from '../../typechain'
import {DEFAULT_TWAP_PERIOD, enableForking, disableForking, increaseTime} from '../helpers'
import Address from '../../helpers/address'
import {toUSD} from '../../helpers'

const {
  NATIVE_TOKEN_ADDRESS,
  MIM_ADDRESS,
  LINK_ADDRESS,
  DAI_ADDRESS,
  USDC_ADDRESS,
  WETH_ADDRESS,
  UNISWAP_V2_LIKE_ROUTER_ADDRESS,
  WBTC_ADDRESS,
} = Address

const abi = new ethers.utils.AbiCoder()
const encodedLinkAddress = abi.encode(['address'], [LINK_ADDRESS])
const encodedWbtcAddress = abi.encode(['address'], [WBTC_ADDRESS])
const encodedWethAddress = abi.encode(['address'], [WETH_ADDRESS])

describe('UniswapV2LikePriceProvider', function () {
  let snapshotId: string
  let deployer: SignerWithAddress
  let user: SignerWithAddress
  let priceProviderFactory: UniswapV2LikePriceProvider__factory
  let priceProvider: UniswapV2LikePriceProvider

  before(enableForking)

  after(disableForking)

  beforeEach(async function () {
    snapshotId = await ethers.provider.send('evm_snapshot', [])
    ;[deployer, user] = await ethers.getSigners()

    priceProviderFactory = new UniswapV2LikePriceProvider__factory(deployer)
    priceProvider = await priceProviderFactory.deploy(
      UNISWAP_V2_LIKE_ROUTER_ADDRESS,
      NATIVE_TOKEN_ADDRESS,
      DAI_ADDRESS,
      DEFAULT_TWAP_PERIOD
    )
    await priceProvider.deployed()

    await increaseTime(DEFAULT_TWAP_PERIOD)
    await priceProvider.update(encodedLinkAddress)
    await priceProvider.update(encodedWbtcAddress)
    await priceProvider.update(encodedWethAddress)
  })

  afterEach(async function () {
    await ethers.provider.send('evm_revert', [snapshotId])
  })

  describe('getPriceInUsd', function () {
    it('should get LINK price', async function () {
      const {_priceInUsd} = await priceProvider.getPriceInUsd(encodedLinkAddress)
      expect(_priceInUsd).closeTo(toUSD('13.08898148'), toUSD('0.0000001'))
    })

    it('should get WBTC price', async function () {
      const {_priceInUsd} = await priceProvider.getPriceInUsd(encodedWbtcAddress)
      expect(_priceInUsd).closeTo(toUSD('38893.89154814'), toUSD('0.0000001'))
    })

    it('should get ETH price', async function () {
      const {_priceInUsd} = await priceProvider.getPriceInUsd(encodedWethAddress)
      expect(_priceInUsd).closeTo(toUSD('2566.9129679'), toUSD('0.0000001'))
    })
  })

  describe('updateTwapPeriod', function () {
    it('should revert if not governor', async function () {
      const tx = priceProvider.connect(user).updateTwapPeriod(1)
      await expect(tx).revertedWith('not-governor')
    })

    it('should update twap period', async function () {
      const newTwapPeriod = DEFAULT_TWAP_PERIOD.mul('2')
      const tx = priceProvider.updateTwapPeriod(newTwapPeriod)
      await expect(tx).emit(priceProvider, 'TwapPeriodUpdated').withArgs(DEFAULT_TWAP_PERIOD, newTwapPeriod)
    })
  })

  describe('update', function () {
    describe('when usd token price is updated', function () {
      beforeEach(async function () {
        const {blockTimestampLast} = await priceProvider.oracleDataOf(DAI_ADDRESS)
        const {timestamp} = await ethers.provider.getBlock('latest')
        const isUpdated = timestamp - blockTimestampLast < DEFAULT_TWAP_PERIOD.toNumber()
        expect(isUpdated).true
      })

      it('should add oracle data if token does not exist', async function () {
        // given
        expect((await priceProvider.oracleDataOf(MIM_ADDRESS)).blockTimestampLast).eq(0)

        // when
        const encodedTokenAddress = abi.encode(['address'], [MIM_ADDRESS])
        await priceProvider.update(encodedTokenAddress)

        // then
        expect((await priceProvider.oracleDataOf(MIM_ADDRESS)).blockTimestampLast).not.eq(0)
      })

      it('should update token price', async function () {
        // given
        const {blockTimestampLast: blockTimestampLastBefore} = await priceProvider.oracleDataOf(WBTC_ADDRESS)
        await increaseTime(DEFAULT_TWAP_PERIOD)

        // when
        await priceProvider.update(encodedWbtcAddress)

        // then
        const {blockTimestampLast: blockTimestampLastAfter} = await priceProvider.oracleDataOf(WBTC_ADDRESS)
        expect(blockTimestampLastAfter).gt(blockTimestampLastBefore)
        const {timestamp} = await ethers.provider.getBlock('latest')
        expect(blockTimestampLastAfter).eq(timestamp)
        // should update usd token oracle data too
        expect((await priceProvider.oracleDataOf(DAI_ADDRESS)).blockTimestampLast).eq(timestamp)
      })
    })

    describe('when usd token price is outdated', function () {
      beforeEach(async function () {
        await increaseTime(DEFAULT_TWAP_PERIOD)
        const {blockTimestampLast} = await priceProvider.oracleDataOf(DAI_ADDRESS)
        const {timestamp} = await ethers.provider.getBlock('latest')
        const isUpdated = timestamp - blockTimestampLast < DEFAULT_TWAP_PERIOD.toNumber()
        expect(isUpdated).false
      })

      it('should add oracle data if token does not exist', async function () {
        // given
        await increaseTime(DEFAULT_TWAP_PERIOD)
        expect((await priceProvider.oracleDataOf(MIM_ADDRESS)).blockTimestampLast).eq(0)

        // when
        const encodedTokenAddress = abi.encode(['address'], [MIM_ADDRESS])
        await priceProvider.update(encodedTokenAddress)

        // then
        expect((await priceProvider.oracleDataOf(MIM_ADDRESS)).blockTimestampLast).not.eq(0)
        // should update usd token oracle data too
        const {timestamp} = await ethers.provider.getBlock('latest')
        expect((await priceProvider.oracleDataOf(DAI_ADDRESS)).blockTimestampLast).eq(timestamp)
      })

      it('should update token price', async function () {
        // given
        const {blockTimestampLast: blockTimestampLastBefore} = await priceProvider.oracleDataOf(WBTC_ADDRESS)
        await increaseTime(DEFAULT_TWAP_PERIOD.mul('10'))

        // when
        await priceProvider.update(encodedWbtcAddress)

        // then
        const {blockTimestampLast: blockTimestampLastAfter} = await priceProvider.oracleDataOf(WBTC_ADDRESS)
        expect(blockTimestampLastAfter).gt(blockTimestampLastBefore)
        const {timestamp} = await ethers.provider.getBlock('latest')
        expect(blockTimestampLastAfter).eq(timestamp)
        // should update usd token oracle data too
        expect((await priceProvider.oracleDataOf(DAI_ADDRESS)).blockTimestampLast).eq(timestamp)
      })
    })
  })

  describe('when using USDC as USD token', function () {
    beforeEach(async function () {
      priceProvider = await priceProviderFactory.deploy(
        UNISWAP_V2_LIKE_ROUTER_ADDRESS,
        NATIVE_TOKEN_ADDRESS,
        USDC_ADDRESS,
        DEFAULT_TWAP_PERIOD
      )
      await priceProvider.deployed()

      await priceProvider.update(encodedLinkAddress)
      await priceProvider.update(encodedWbtcAddress)
      await priceProvider.update(encodedWethAddress)
    })

    describe('getPriceInUsd', function () {
      it('should get LINK price', async function () {
        const {_priceInUsd} = await priceProvider.getPriceInUsd(encodedLinkAddress)
        expect(_priceInUsd).eq(toUSD('13.063278'))
      })

      it('should get WBTC price', async function () {
        const {_priceInUsd} = await priceProvider.getPriceInUsd(encodedWbtcAddress)
        expect(_priceInUsd).eq(toUSD('38817.513939'))
      })

      it('should get ETH price', async function () {
        const {_priceInUsd} = await priceProvider.getPriceInUsd(encodedWethAddress)
        expect(_priceInUsd).eq(toUSD('2561.87221'))
      })
    })
  })
})
