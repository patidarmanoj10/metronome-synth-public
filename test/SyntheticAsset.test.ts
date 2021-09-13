/* eslint-disable camelcase */
import {parseEther} from '@ethersproject/units'
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {expect} from 'chai'
import {ethers} from 'hardhat'
import {SyntheticAsset, SyntheticAsset__factory, Debt, Debt__factory} from '../typechain'
import {WETH} from './helpers'

describe('SyntheticAsset', function () {
  let deployer: SignerWithAddress
  let user: SignerWithAddress
  let mAsset: SyntheticAsset
  let debtToken: Debt
  const name = 'Metronome ETH'
  const symbol = 'mEth'
  const collateralizationRatio = parseEther('1.5')
  const underlyingAsset = WETH

  beforeEach(async function () {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[deployer, user] = await ethers.getSigners()

    const debtTokenFactory = new Debt__factory(deployer)
    debtToken = await debtTokenFactory.deploy('mETH Debt', 'mEth-Debt')
    await debtToken.deployed()

    const mETHFactory = new SyntheticAsset__factory(deployer)
    mAsset = await mETHFactory.deploy(name, symbol, underlyingAsset, debtToken.address, collateralizationRatio)
    await mAsset.deployed()
  })

  it('default values', async function () {
    expect(await mAsset.totalSupply()).to.eq(0)
    expect(await mAsset.name()).to.eq(name)
    expect(await mAsset.symbol()).to.eq(symbol)
    expect(await mAsset.collateralizationRatio()).to.eq(collateralizationRatio)
    expect(await mAsset.decimals()).to.eq(18)
  })

  describe('mint', function () {
    it('should mint', async function () {
      expect(await mAsset.balanceOf(user.address)).to.eq(0)
      const amount = parseEther('100')
      await mAsset.mint(user.address, amount)
      expect(await mAsset.balanceOf(user.address)).to.eq(amount)
    })

    it('should revert if not owner', async function () {
      const tx = mAsset.connect(user).mint(user.address, parseEther('10'))
      await expect(tx).to.revertedWith('Ownable: caller is not the owner')
    })
  })

  describe('setCollateralizationRatio', function () {
    it('should update collateralization ratio', async function () {
      const before = await mAsset.collateralizationRatio()
      const after = before.mul('2')
      await mAsset.setCollateralizationRatio(after)
      expect(await mAsset.collateralizationRatio()).to.eq(after)
    })

    it('should revert if not owner', async function () {
      const tx = mAsset.connect(user).setCollateralizationRatio(parseEther('10'))
      await expect(tx).to.revertedWith('Ownable: caller is not the owner')
    })

    it('should revert if < 100%', async function () {
      const tx = mAsset.setCollateralizationRatio(parseEther('0.99'))
      await expect(tx).to.revertedWith('collaterization-ratio-lt-100%')
    })
  })
})
