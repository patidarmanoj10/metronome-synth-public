/* eslint-disable camelcase */
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {expect} from 'chai'
import {ethers} from 'hardhat'
import {ChainlinkPriceProvider, ChainlinkPriceProvider__factory} from '../../typechain'
import {DOGE_USD_CHAINLINK_AGGREGATOR_ADDRESS, enableForking, disableForking} from '../helpers'
import {toUSD} from '../../helpers'
import Address from '../../helpers/address'

const {BTC_USD_CHAINLINK_AGGREGATOR_ADDRESS, ETH_USD_CHAINLINK_AGGREGATOR_ADDRESS} = Address

describe('ChainlinkPriceProvider', function () {
  let snapshotId: string
  let deployer: SignerWithAddress
  let priceProvider: ChainlinkPriceProvider

  before(enableForking)

  after(disableForking)

  beforeEach(async function () {
    snapshotId = await ethers.provider.send('evm_snapshot', [])
    ;[deployer] = await ethers.getSigners()

    const priceProviderFactory = new ChainlinkPriceProvider__factory(deployer)
    priceProvider = await priceProviderFactory.deploy()
    await priceProvider.deployed()
  })

  afterEach(async function () {
    await ethers.provider.send('evm_revert', [snapshotId])
  })

  describe('getPriceInUsd ', function () {
    it('should get DOGE price', async function () {
      const {_priceInUsd} = await priceProvider.getPriceInUsd(DOGE_USD_CHAINLINK_AGGREGATOR_ADDRESS)
      expect(_priceInUsd).eq(toUSD('0.11530811'))
    })

    it('should get BTC price', async function () {
      const {_priceInUsd} = await priceProvider.getPriceInUsd(BTC_USD_CHAINLINK_AGGREGATOR_ADDRESS)
      expect(_priceInUsd).closeTo(toUSD('38841'), toUSD('1'))
    })

    it('should get ETH price', async function () {
      const {_priceInUsd} = await priceProvider.getPriceInUsd(ETH_USD_CHAINLINK_AGGREGATOR_ADDRESS)
      expect(_priceInUsd).eq(toUSD('2567.24244481'))
    })
  })
})
