/* eslint-disable camelcase */
import {parseEther} from '@ethersproject/units'
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {expect} from 'chai'
import {ethers} from 'hardhat'
import {DebtToken, DebtToken__factory} from '../typechain'

describe('DebtToken', function () {
  let deployer: SignerWithAddress
  let issuerMock: SignerWithAddress
  let user1: SignerWithAddress
  let user2: SignerWithAddress
  let debtToken: DebtToken
  const name = 'mETH Debt'
  const symbol = 'mEth-Debt'

  beforeEach(async function () {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[deployer, issuerMock, user1, user2] = await ethers.getSigners()

    const debtTokenFactory = new DebtToken__factory(deployer)
    debtToken = await debtTokenFactory.deploy()
    await debtToken.deployed()
    await debtToken.initialize(name, symbol, issuerMock.address)

    debtToken = debtToken.connect(issuerMock)
  })

  it('default values', async function () {
    expect(await debtToken.totalSupply()).to.eq(0)
    expect(await debtToken.name()).to.eq(name)
    expect(await debtToken.symbol()).to.eq(symbol)
    expect(await debtToken.decimals()).to.eq(18)
  })

  describe('mint', function () {
    it('should mint', async function () {
      expect(await debtToken.balanceOf(user1.address)).to.eq(0)
      const amount = parseEther('100')
      await debtToken.mint(user1.address, amount)
      expect(await debtToken.balanceOf(user1.address)).to.eq(amount)
    })

    it('should revert if not issuer', async function () {
      const tx = debtToken.connect(user1).mint(user1.address, parseEther('10'))
      await expect(tx).to.revertedWith('not-issuer')
    })
  })

  describe('when some token was minted', function () {
    const amount = parseEther('100')

    beforeEach('should mint', async function () {
      await debtToken.mint(user1.address, amount)
    })

    describe('burn', function () {
      it('should burn', async function () {
        expect(await debtToken.balanceOf(user1.address)).to.eq(amount)
        await debtToken.burn(user1.address, amount)
        expect(await debtToken.balanceOf(user1.address)).to.eq(0)
      })

      it('should revert if not issuer', async function () {
        const tx = debtToken.connect(user1).mint(user1.address, parseEther('10'))
        await expect(tx).to.revertedWith('not-issuer')
      })
    })

    describe('transfer', function () {
      it('should revert when transfering', async function () {
        const tx = debtToken.transfer(user2.address, parseEther('1'))
        await expect(tx).to.revertedWith('transfer-not-supported')
      })
    })

    describe('transferFrom', function () {
      it('should revert when transfering', async function () {
        const tx = debtToken.connect(user2).transferFrom(user1.address, user2.address, parseEther('1'))
        await expect(tx).to.revertedWith('transfer-not-supported')
      })
    })
  })
})
