/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable camelcase */
import {parseEther, parseUnits} from '@ethersproject/units'
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {expect} from 'chai'
import {ethers} from 'hardhat'
import {UniswapV3PriceProvider, UniswapV3PriceProvider__factory} from '../../typechain'
import {
  DEFAULT_TWAP_PERIOD,
  MET_ADDRESS,
  USDC_ADDRESS,
  DAI_ADDRESS,
  UNISWAP_V3_CROSS_POOL_ORACLE_ADDRESS,
  WBTC_ADDRESS,
  enableForking,
  disableForking,
  WETH_ADDRESS,
} from './../helpers'

const abi = new ethers.utils.AbiCoder()
const encodedMetAddress = abi.encode(['address'], [MET_ADDRESS])
const encodedWbtcAddress = abi.encode(['address'], [WBTC_ADDRESS])
const encodedWethAddress = abi.encode(['address'], [WETH_ADDRESS])

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

  describe('convertToUsd', function () {
    it('should convert MET to USD', async function () {
      const {_amountInUsd} = await priceProvider.convertToUsd(encodedMetAddress, parseEther('1'))
      expect(_amountInUsd).to.eq('477943235')
    })

    it('should convert WBTC to USD', async function () {
      const {_amountInUsd} = await priceProvider.convertToUsd(encodedWbtcAddress, parseUnits('1', 8))
      expect(_amountInUsd).to.eq('5002893354162')
    })

    it('should convert ETH to USD', async function () {
      const {_amountInUsd} = await priceProvider.convertToUsd(encodedWethAddress, parseEther('1'))
      expect(_amountInUsd).to.eq('344642503883')
    })
  })

  describe('convertFromUsd', function () {
    it('should convert USD to MET', async function () {
      const {_amount} = await priceProvider.convertFromUsd(encodedMetAddress, '477943236')
      expect(_amount).to.closeTo(parseEther('1'), parseEther('0.00000001').toNumber())
    })

    it('should convert USD to WBTC', async function () {
      const {_amount} = await priceProvider.convertFromUsd(encodedWbtcAddress, '5002893354162')
      expect(_amount).to.closeTo(parseUnits('1', 8), 1)
    })

    it('should convert ETH to WBTC', async function () {
      const {_amount} = await priceProvider.convertFromUsd(encodedWethAddress, '344642503883')
      expect(_amount).to.closeTo(parseEther('1'), parseEther('0.00000000001').toNumber())
    })
  })

  describe('updateTwapPeriod', function () {
    it('should revert if not governor', async function () {
      const tx = priceProvider.connect(user).updateTwapPeriod(1)
      await expect(tx).to.be.revertedWith('not-the-governor')
    })

    it('should update twap period', async function () {
      const newTwapPeriod = DEFAULT_TWAP_PERIOD.mul('2')
      const tx = priceProvider.updateTwapPeriod(newTwapPeriod)
      await expect(tx).to.emit(priceProvider, 'TwapPeriodUpdated').withArgs(DEFAULT_TWAP_PERIOD, newTwapPeriod)
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

    describe('convertToUsd', function () {
      it('should convert MET to USD', async function () {
        const {_amountInUsd} = await priceProvider.convertToUsd(encodedMetAddress, parseEther('1'))
        expect(_amountInUsd).to.eq('478183500')
      })

      it('should convert WBTC to USD', async function () {
        const {_amountInUsd} = await priceProvider.convertToUsd(encodedWbtcAddress, parseUnits('1', 8))
        expect(_amountInUsd).to.eq('5005408534500')
      })

      it('should convert ETH to USD', async function () {
        const {_amountInUsd} = await priceProvider.convertToUsd(encodedWethAddress, parseEther('1'))
        expect(_amountInUsd).to.eq('344815771200')
      })
    })

    describe('convertFromUsd', function () {
      it('should convert USD to MET', async function () {
        const {_amount} = await priceProvider.convertFromUsd(encodedMetAddress, '478183500')
        expect(_amount).to.closeTo(parseEther('1'), parseEther('0.0000001').toNumber())
      })

      it('should convert USD to WBTC', async function () {
        const {_amount} = await priceProvider.convertFromUsd(encodedWbtcAddress, '5002893354162')
        expect(_amount).to.closeTo(parseUnits('1', 8), parseUnits('0.001', 8).toNumber())
      })

      it('should convert ETH to WBTC', async function () {
        const {_amount} = await priceProvider.convertFromUsd(encodedWethAddress, '344815771200')
        expect(_amount).to.closeTo(parseEther('1'), parseEther('0.00000001').toNumber())
      })
    })
  })

  describe('consult', function () {
    it('should get ETH->Token price', async function () {
      const tokenIn = encodedWethAddress
      const tokenOut = encodedMetAddress
      const amountIn = parseEther('1') // 1 ETH
      const {_amountOut} = await priceProvider.consult(tokenIn, tokenOut, amountIn)

      // @ts-ignore
      expect(_amountOut).to.closeTo(parseEther('721'), parseEther('0.1'))
    })

    it('should get Token->ETH price', async function () {
      const tokenIn = encodedWbtcAddress
      const tokenOut = encodedWethAddress
      const amountIn = parseUnits('1', 8) // 1 BTC
      const {_amountOut} = await priceProvider.consult(tokenIn, tokenOut, amountIn)
      // @ts-ignore
      expect(_amountOut).to.closeTo(parseEther('14.5'), parseEther('0.05'))
    })

    it('should get Token->Token price', async function () {
      const tokenIn = encodedWbtcAddress
      const tokenOut = encodedMetAddress
      const amountIn = parseUnits('1', 8) // 1 BTC
      const {_amountOut} = await priceProvider.consult(tokenIn, tokenOut, amountIn)
      // @ts-ignore
      expect(_amountOut).to.closeTo(parseEther('10467.5'), parseEther('0.05'))
    })
  })
})
