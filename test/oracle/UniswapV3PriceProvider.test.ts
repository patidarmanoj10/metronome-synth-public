/* eslint-disable camelcase */
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {expect} from 'chai'
import {ethers} from 'hardhat'
import {UniswapV3PriceProvider, UniswapV3PriceProvider__factory} from '../../typechain'
import {DEFAULT_TWAP_PERIOD, enableForking, disableForking} from '../helpers'
import Address from '../../helpers/address'
import {toUSD} from '../../helpers'

const {
  MET_ADDRESS,
  DAI_ADDRESS,
  USDC_ADDRESS,
  NATIVE_TOKEN_ADDRESS,
  UNISWAP_V3_CROSS_POOL_ORACLE_ADDRESS,
  WBTC_ADDRESS,
} = Address

describe('UniswapV3PriceProvider', function () {
  let snapshotId: string
  let deployer: SignerWithAddress
  let user: SignerWithAddress
  let priceProviderFactory: UniswapV3PriceProvider__factory
  let priceProvider: UniswapV3PriceProvider

  before(enableForking)

  after(disableForking)

  beforeEach(async function () {
    snapshotId = await ethers.provider.send('evm_snapshot', [])
    ;[deployer, user] = await ethers.getSigners()

    priceProviderFactory = new UniswapV3PriceProvider__factory(deployer)
    priceProvider = await priceProviderFactory.deploy(
      UNISWAP_V3_CROSS_POOL_ORACLE_ADDRESS,
      DAI_ADDRESS,
      DEFAULT_TWAP_PERIOD
    )
    await priceProvider.deployed()
  })

  afterEach(async function () {
    await ethers.provider.send('evm_revert', [snapshotId])
  })

  describe('getPriceInUsd', function () {
    it('should get MET price', async function () {
      const {_priceInUsd} = await priceProvider.getPriceInUsd(MET_ADDRESS)
      expect(_priceInUsd).closeTo(toUSD('1.96868563'), toUSD('0.000001'))
    })

    it('should get WBTC price', async function () {
      const {_priceInUsd} = await priceProvider.getPriceInUsd(WBTC_ADDRESS)
      expect(_priceInUsd).closeTo(toUSD('38691.28411634'), toUSD('0.000001'))
    })

    it('should get ETH price', async function () {
      const {_priceInUsd} = await priceProvider.getPriceInUsd(NATIVE_TOKEN_ADDRESS)
      expect(_priceInUsd).closeTo(toUSD('2560.37141557'), toUSD('0.000001'))
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

  describe('when using USDC as USD token', function () {
    beforeEach(async function () {
      priceProvider = await priceProviderFactory.deploy(
        UNISWAP_V3_CROSS_POOL_ORACLE_ADDRESS,
        USDC_ADDRESS,
        DEFAULT_TWAP_PERIOD
      )
      await priceProvider.deployed()
    })

    describe('getPriceInUsd', function () {
      it('should get MET price', async function () {
        const {_priceInUsd} = await priceProvider.getPriceInUsd(MET_ADDRESS)
        expect(_priceInUsd).closeTo(toUSD('1.969281'), toUSD('0.000001'))
      })

      it('should get WBTC price', async function () {
        const {_priceInUsd} = await priceProvider.getPriceInUsd(WBTC_ADDRESS)
        expect(_priceInUsd).closeTo(toUSD('38702.994986'), toUSD('0.000001'))
      })

      it('should get ETH price', async function () {
        const {_priceInUsd} = await priceProvider.getPriceInUsd(NATIVE_TOKEN_ADDRESS)
        expect(_priceInUsd).closeTo(toUSD('2561.146375'), toUSD('0.000001'))
      })
    })
  })
})
