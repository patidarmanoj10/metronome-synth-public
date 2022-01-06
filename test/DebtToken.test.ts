/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable camelcase */
import {parseEther} from '@ethersproject/units'
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {expect} from 'chai'
import {ethers} from 'hardhat'
import {DebtTokenMock, DebtTokenMock__factory, SyntheticAssetMock, SyntheticAssetMock__factory} from '../typechain'
import {BLOCKS_PER_YEAR} from './helpers'

describe('DebtToken', function () {
  let deployer: SignerWithAddress
  let controllerMock: SignerWithAddress
  let user1: SignerWithAddress
  let user2: SignerWithAddress
  let debtToken: DebtTokenMock
  let syntheticAssetMock: SyntheticAssetMock

  const name = 'vsETH Debt'
  const symbol = 'vsEth-Debt'
  const interestRate = parseEther('0')

  beforeEach(async function () {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[deployer, controllerMock, user1, user2] = await ethers.getSigners()

    const syntheticAssetMockFactory = new SyntheticAssetMock__factory(deployer)
    syntheticAssetMock = await syntheticAssetMockFactory.deploy('Vesper Synth ETH', 'vsETH', interestRate)

    const debtTokenMockFactory = new DebtTokenMock__factory(deployer)
    debtToken = await debtTokenMockFactory.deploy()
    await debtToken.deployed()
    await debtToken.initialize(name, symbol, 18, controllerMock.address, syntheticAssetMock.address)

    debtToken = debtToken.connect(controllerMock)
  })

  it('default values', async function () {
    expect(await debtToken.totalSupply()).eq(0)
    expect(await debtToken.name()).eq(name)
    expect(await debtToken.symbol()).eq(symbol)
    expect(await debtToken.decimals()).eq(18)
  })

  describe('mint', function () {
    it('should mint', async function () {
      expect(await debtToken.balanceOf(user1.address)).eq(0)
      const amount = parseEther('100')
      await debtToken.mint(user1.address, amount)
      expect(await debtToken.balanceOf(user1.address)).eq(amount)
    })

    it('should revert if not controller', async function () {
      const tx = debtToken.connect(user1).mint(user1.address, parseEther('10'))
      await expect(tx).revertedWith('not-controller')
    })
  })

  describe('when some token was minted', function () {
    const amount = parseEther('100')

    beforeEach('should mint', async function () {
      await debtToken.mint(user1.address, amount)
    })

    describe('burn', function () {
      it('should burn', async function () {
        expect(await debtToken.balanceOf(user1.address)).eq(amount)
        await debtToken.burn(user1.address, amount)
        expect(await debtToken.balanceOf(user1.address)).eq(0)
      })

      it('should revert if not controller', async function () {
        const tx = debtToken.connect(user1).mint(user1.address, parseEther('10'))
        await expect(tx).revertedWith('not-controller')
      })
    })

    describe('transfer', function () {
      it('should revert when transfering', async function () {
        const tx = debtToken.transfer(user2.address, parseEther('1'))
        await expect(tx).revertedWith('transfer-not-supported')
      })
    })

    describe('transferFrom', function () {
      it('should revert when transfering', async function () {
        const tx = debtToken.connect(user2).transferFrom(user1.address, user2.address, parseEther('1'))
        await expect(tx).revertedWith('transfer-not-supported')
      })
    })
  })

  describe('accrueInterest', function () {
    const principal = parseEther('100')

    it('should accrue interest', async function () {
      // given
      await debtToken.mint(user1.address, principal)

      // when
      await syntheticAssetMock.updateInterestRate(parseEther('0.02')) // 2%
      await debtToken.setBlockNumber((await ethers.provider.getBlockNumber()) + BLOCKS_PER_YEAR)
      await debtToken.accrueInterest()

      // then
      const totalDebt = await debtToken.totalSupply()
      const debtOfUser = await debtToken.balanceOf(user1.address)
      // @ts-ignore
      expect(totalDebt).closeTo(debtOfUser, parseEther('0.0001'))
      // @ts-ignore
      expect(totalDebt).closeTo(parseEther('102'), parseEther('0.0001'))
    })

    it('should not accrue interest if rate is 0', async function () {
      // given
      await debtToken.mint(user1.address, principal)

      // when
      await syntheticAssetMock.updateInterestRate(parseEther('0'))
      await debtToken.setBlockNumber(BLOCKS_PER_YEAR)
      await debtToken.accrueInterest()

      // then
      const totalDebt = await debtToken.totalSupply()
      const debtOfUser = await debtToken.balanceOf(user1.address)
      expect(totalDebt).eq(debtOfUser)
      expect(totalDebt).eq(principal)
    })

    it('should accrue interest after changing interest rate', async function () {
      // given
      await debtToken.mint(user1.address, principal)

      // when
      // 1st year 10% interest + 2nd year 50% interest
      await syntheticAssetMock.updateInterestRate(parseEther('0.1')) // 10%
      await debtToken.setBlockNumber((await ethers.provider.getBlockNumber()) + BLOCKS_PER_YEAR)
      await debtToken.accrueInterest()

      await syntheticAssetMock.updateInterestRate(parseEther('0.5')) // 50%
      await debtToken.setBlockNumber((await ethers.provider.getBlockNumber()) + BLOCKS_PER_YEAR)
      await debtToken.accrueInterest()

      // then
      const totalDebt = await debtToken.totalSupply()
      const debtOfUser = await debtToken.balanceOf(user1.address)
      // @ts-ignore
      expect(totalDebt).closeTo(debtOfUser, parseEther('0.0001'))
      // @ts-ignore
      expect(totalDebt).closeTo(parseEther('165'), parseEther('0.001'))
    })

    it('should stop accruing interest after changing interest rate to 0', async function () {
      // given
      await debtToken.mint(user1.address, principal)

      // when
      // 1st year 10% interest + 2nd year 50% interest
      await syntheticAssetMock.updateInterestRate(parseEther('0.1')) // 10%
      await debtToken.setBlockNumber(BLOCKS_PER_YEAR)
      await debtToken.accrueInterest()

      await syntheticAssetMock.updateInterestRate(parseEther('0'))
      await debtToken.setBlockNumber(BLOCKS_PER_YEAR)
      await debtToken.accrueInterest()

      // then
      const totalDebt = await debtToken.totalSupply()
      const debtOfUser = await debtToken.balanceOf(user1.address)
      // @ts-ignore
      expect(totalDebt).closeTo(debtOfUser, parseEther('0.0001'))
      // @ts-ignore
      expect(totalDebt).closeTo(parseEther('110'), parseEther('0.1'))
    })
  })
})
