/* eslint-disable camelcase */
import {parseEther} from '@ethersproject/units'
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {expect} from 'chai'
import {ethers} from 'hardhat'
import {SyntheticAsset, SyntheticAsset__factory, DebtToken, DebtToken__factory} from '../typechain'

describe('SyntheticAsset', function () {
  let deployer: SignerWithAddress
  let governor: SignerWithAddress
  let user: SignerWithAddress
  let mBoxMock: SignerWithAddress
  let mAsset: SyntheticAsset
  let debtToken: DebtToken
  const name = 'Metronome ETH'
  const symbol = 'mEth'
  const collateralizationRatio = parseEther('1.5')

  beforeEach(async function () {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[deployer, governor, user, mBoxMock] = await ethers.getSigners()

    const debtTokenFactory = new DebtToken__factory(deployer)
    debtToken = await debtTokenFactory.deploy()
    await debtToken.deployed()
    await debtToken.initialize('mETH Debt', 'mEth-Debt', mBoxMock.address)

    const mETHFactory = new SyntheticAsset__factory(deployer)
    mAsset = await mETHFactory.deploy()
    await mAsset.deployed()
    await mAsset.initialize(name, symbol, mBoxMock.address, debtToken.address, collateralizationRatio)

    await mAsset.transferGovernorship(governor.address)
    await mAsset.connect(governor).acceptGovernorship()
    mAsset = mAsset.connect(governor)
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
      await mAsset.connect(mBoxMock).mint(user.address, amount)
      expect(await mAsset.balanceOf(user.address)).to.eq(amount)
    })

    it('should revert if not mbox', async function () {
      const tx = mAsset.connect(user).mint(user.address, parseEther('10'))
      await expect(tx).to.revertedWith('not-mbox')
    })

    it('should revert if surpass max total supply', async function () {
      // given
      expect(await mAsset.totalSupply()).to.eq(0)
      const max = parseEther('100')
      await mAsset.updateMaxTotalSupply(max)

      // when
      const tx = mAsset.connect(mBoxMock).mint(deployer.address, max.add('1'))

      // then
      await expect(tx).to.revertedWith('surpass-max-total-supply')
    })

    it('should revert if mAsset is inactive', async function () {
      // given
      await mAsset.updateIsActive(false)

      // when
      const tx = mAsset.connect(mBoxMock).mint(deployer.address, '1')

      // then
      await expect(tx).to.revertedWith('synthetic-asset-is-inactive')
    })
  })

  describe('burn', function () {
    const amount = parseEther('100')

    beforeEach(async function () {
      await mAsset.connect(mBoxMock).mint(user.address, amount)
    })

    it('should burn', async function () {
      expect(await mAsset.balanceOf(user.address)).to.eq(amount)
      await mAsset.connect(mBoxMock).burn(user.address, amount)
      expect(await mAsset.balanceOf(user.address)).to.eq(0)
    })

    it('should revert if not mbox', async function () {
      const tx = mAsset.connect(user).burn(user.address, parseEther('10'))
      await expect(tx).to.revertedWith('not-mbox')
    })
  })

  describe('updateCollateralizationRatio', function () {
    it('should update collateralization ratio', async function () {
      const before = await mAsset.collateralizationRatio()
      const after = before.mul('2')
      const tx = mAsset.updateCollateralizationRatio(after)
      await expect(tx).to.emit(mAsset, 'CollateralizationRatioUpdated').withArgs(before, after)
      expect(await mAsset.collateralizationRatio()).to.eq(after)
    })

    it('should revert if not governor', async function () {
      const tx = mAsset.connect(user).updateCollateralizationRatio(parseEther('10'))
      await expect(tx).to.revertedWith('not-the-governor')
    })

    it('should revert if < 100%', async function () {
      const tx = mAsset.updateCollateralizationRatio(parseEther('1').sub('1'))
      await expect(tx).to.revertedWith('collaterization-ratio-lt-100%')
    })
  })

  describe('updateMaxTotalSupply', function () {
    it('should update collateralization ratio', async function () {
      const before = await mAsset.maxTotalSupply()
      const after = before.div('2')
      const tx = mAsset.updateMaxTotalSupply(after)
      await expect(tx).to.emit(mAsset, 'MaxTotalSupplyUpdated').withArgs(before, after)
      expect(await mAsset.maxTotalSupply()).to.eq(after)
    })

    it('should revert if not governor', async function () {
      const tx = mAsset.connect(user).updateMaxTotalSupply(parseEther('10'))
      await expect(tx).to.revertedWith('not-the-governor')
    })
  })

  describe('updateIsActive', function () {
    it('should update active flag', async function () {
      expect(await mAsset.isActive()).to.eq(true)
      const tx = mAsset.updateIsActive(false)
      await expect(tx).to.emit(mAsset, 'SyntheticAssetActiveUpdated').withArgs(true, false)
      expect(await mAsset.isActive()).to.eq(false)
    })

    it('should revert if not governor', async function () {
      const tx = mAsset.connect(user).updateIsActive(false)
      await expect(tx).to.revertedWith('not-the-governor')
    })
  })
})
