/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable camelcase */
import {parseEther, parseUnits} from '@ethersproject/units'
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {expect} from 'chai'
import {ethers} from 'hardhat'
import {UniswapV2PriceProvider, UniswapV2PriceProvider__factory} from '../../typechain'
import {DEFAULT_TWAP_PERIOD, enableForking, disableForking, increaseTime} from '../helpers'
import Address from '../../helpers/address'

const {MET_ADDRESS, DAI_ADDRESS, USDC_ADDRESS, WETH_ADDRESS, UNISWAP_V2_ROUTER02_ADDRESS, WBTC_ADDRESS} = Address

const abi = new ethers.utils.AbiCoder()
const encodedMetAddress = abi.encode(['address'], [MET_ADDRESS])
const encodedWbtcAddress = abi.encode(['address'], [WBTC_ADDRESS])
const encodedWethAddress = abi.encode(['address'], [WETH_ADDRESS])

describe('UniswapV2PriceProvider', function () {
  let snapshotId: string
  let deployer: SignerWithAddress
  let user: SignerWithAddress
  let priceProviderFactory: UniswapV2PriceProvider__factory
  let priceProvider: UniswapV2PriceProvider

  before(enableForking)

  after(disableForking)

  beforeEach(async function () {
    snapshotId = await ethers.provider.send('evm_snapshot', [])
    ;[deployer, user] = await ethers.getSigners()

    priceProviderFactory = new UniswapV2PriceProvider__factory(deployer)
    priceProvider = await priceProviderFactory.deploy(UNISWAP_V2_ROUTER02_ADDRESS, DAI_ADDRESS, DEFAULT_TWAP_PERIOD)
    await priceProvider.deployed()

    await increaseTime(DEFAULT_TWAP_PERIOD)
    await priceProvider.update(encodedMetAddress)
    await priceProvider.update(encodedWbtcAddress)
    await priceProvider.update(encodedWethAddress)
  })

  afterEach(async function () {
    await ethers.provider.send('evm_revert', [snapshotId])
  })

  describe('convertToUsd', function () {
    it('should convert MET to USD', async function () {
      const {_amountInUsd} = await priceProvider.convertToUsd(encodedMetAddress, parseEther('1'))
      expect(_amountInUsd).eq('480514770')
    })

    it('should convert WBTC to USD', async function () {
      const {_amountInUsd} = await priceProvider.convertToUsd(encodedWbtcAddress, parseUnits('1', 8))
      expect(_amountInUsd).eq('5018624222484')
    })

    it('should convert ETH to USD', async function () {
      const {_amountInUsd} = await priceProvider.convertToUsd(encodedWethAddress, parseEther('1'))
      expect(_amountInUsd).eq('344975562440')
    })
  })

  describe('convertFromUsd', function () {
    it('should convert USD to MET', async function () {
      const {_amount} = await priceProvider.convertFromUsd(encodedMetAddress, '480514770')
      expect(_amount).closeTo(parseEther('1'), parseEther('0.000000001').toNumber())
    })

    it('should convert USD to WBTC', async function () {
      const {_amount} = await priceProvider.convertFromUsd(encodedWbtcAddress, '5018624222484')
      expect(_amount).closeTo(parseUnits('1', 8), 1)
    })

    it('should convert USD to ETH', async function () {
      const {_amount} = await priceProvider.convertFromUsd(encodedWethAddress, '344975562440')
      expect(_amount).closeTo(parseEther('1'), parseEther('0.00000000001').toNumber())
    })
  })

  describe('updateTwapPeriod', function () {
    it('should revert if not governor', async function () {
      const tx = priceProvider.connect(user).updateTwapPeriod(1)
      await expect(tx).revertedWith('not-the-governor')
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
        const VSP_TOKEN_ADDRESS = '0x1b40183EFB4Dd766f11bDa7A7c3AD8982e998421'
        expect((await priceProvider.oracleDataOf(VSP_TOKEN_ADDRESS)).blockTimestampLast).eq(0)

        // when
        const encodedTokenAddress = abi.encode(['address'], [VSP_TOKEN_ADDRESS])
        await priceProvider.update(encodedTokenAddress)

        // then
        expect((await priceProvider.oracleDataOf(VSP_TOKEN_ADDRESS)).blockTimestampLast).not.eq(0)
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
        const VSP_TOKEN_ADDRESS = '0x1b40183EFB4Dd766f11bDa7A7c3AD8982e998421'
        expect((await priceProvider.oracleDataOf(VSP_TOKEN_ADDRESS)).blockTimestampLast).eq(0)

        // when
        const encodedTokenAddress = abi.encode(['address'], [VSP_TOKEN_ADDRESS])
        await priceProvider.update(encodedTokenAddress)

        // then
        expect((await priceProvider.oracleDataOf(VSP_TOKEN_ADDRESS)).blockTimestampLast).not.eq(0)
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
      priceProvider = await priceProviderFactory.deploy(UNISWAP_V2_ROUTER02_ADDRESS, USDC_ADDRESS, DEFAULT_TWAP_PERIOD)
      await priceProvider.deployed()

      await priceProvider.update(encodedMetAddress)
      await priceProvider.update(encodedWbtcAddress)
      await priceProvider.update(encodedWethAddress)
    })

    describe('convertToUsd', function () {
      it('should convert MET to USD', async function () {
        const {_amountInUsd} = await priceProvider.convertToUsd(encodedMetAddress, parseEther('1'))
        expect(_amountInUsd).eq('482300500')
      })

      it('should convert WBTC to USD', async function () {
        const {_amountInUsd} = await priceProvider.convertToUsd(encodedWbtcAddress, parseUnits('1', 8))
        expect(_amountInUsd).eq('5037275432900')
      })

      it('should convert ETH to USD', async function () {
        const {_amountInUsd} = await priceProvider.convertToUsd(encodedWethAddress, parseEther('1'))
        expect(_amountInUsd).eq('346257629300')
      })
    })

    describe('convertFromUsd', function () {
      it('should convert USD to MET', async function () {
        const {_amount} = await priceProvider.convertFromUsd(encodedMetAddress, '482300500')
        expect(_amount).closeTo(parseEther('1'), parseEther('0.000001').toNumber())
      })

      it('should convert USD to WBTC', async function () {
        const {_amount} = await priceProvider.convertFromUsd(encodedWbtcAddress, '5037275432900')
        expect(_amount).closeTo(parseUnits('1', 8), 1)
      })

      it('should convert USD to ETH', async function () {
        const {_amount} = await priceProvider.convertFromUsd(encodedWethAddress, '346257629300')
        expect(_amount).closeTo(parseEther('1'), parseEther('0.00000000001').toNumber())
      })
    })
  })

  describe('convert', function () {
    it('should get ETH->Token price', async function () {
      const tokenIn = encodedWethAddress
      const tokenOut = encodedMetAddress
      const amountIn = parseEther('1') // 1 ETH
      const {_amountOut} = await priceProvider.convert(tokenIn, tokenOut, amountIn)

      // @ts-ignore
      expect(_amountOut).closeTo(parseEther('718'), parseEther('0.1'))
    })

    it('should get Token->ETH price', async function () {
      const tokenIn = encodedWbtcAddress
      const tokenOut = encodedWethAddress
      const amountIn = parseUnits('1', 8) // 1 BTC
      const {_amountOut} = await priceProvider.convert(tokenIn, tokenOut, amountIn)
      // @ts-ignore
      expect(_amountOut).closeTo(parseEther('14.5'), parseEther('0.05'))
    })

    it('should get Token->Token price', async function () {
      const tokenIn = encodedWbtcAddress
      const tokenOut = encodedMetAddress
      const amountIn = parseUnits('1', 8) // 1 BTC
      const {_amountOut} = await priceProvider.convert(tokenIn, tokenOut, amountIn)
      // @ts-ignore
      expect(_amountOut).closeTo(parseEther('10444'), parseEther('0.3'))
    })
  })
})
