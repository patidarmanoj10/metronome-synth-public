/* eslint-disable camelcase */
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {expect} from 'chai'
import {parseEther} from 'ethers/lib/utils'
import {ethers} from 'hardhat'
import {ChainlinkPriceProvider, ChainlinkPriceProvider__factory} from '../../typechain'
import {
  CHAINLINK_DOGE_AGGREGATOR_ADDRESS,
  CHAINLINK_BTC_AGGREGATOR_ADDRESS,
  CHAINLINK_ETH_AGGREGATOR_ADDRESS,
  enableForking,
  disableForking,
} from '../helpers'
import {toUSD} from '../../helpers'

const abi = new ethers.utils.AbiCoder()
const encodedDogeData = abi.encode(['address', 'uint256'], [CHAINLINK_DOGE_AGGREGATOR_ADDRESS, 18])
const encodedBtcData = abi.encode(['address', 'uint256'], [CHAINLINK_BTC_AGGREGATOR_ADDRESS, 8])
const encodedEthData = abi.encode(['address', 'uint256'], [CHAINLINK_ETH_AGGREGATOR_ADDRESS, 18])

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
      const {_priceInUsd} = await priceProvider.getPriceInUsd(encodedDogeData)
      expect(_priceInUsd).eq(toUSD('0.24128635'))
    })

    it('should get BTC price', async function () {
      const {_priceInUsd} = await priceProvider.getPriceInUsd(encodedBtcData)
      expect(_priceInUsd).eq(toUSD('50241'))
    })

    it('should get ETH price', async function () {
      const {_priceInUsd} = await priceProvider.getPriceInUsd(encodedEthData)
      expect(_priceInUsd).eq(toUSD('3461.0476064'))
    })
  })
})
