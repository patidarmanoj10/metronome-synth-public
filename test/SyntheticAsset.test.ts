/* eslint-disable camelcase */
import {parseEther} from '@ethersproject/units'
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {expect} from 'chai'
import {ethers} from 'hardhat'
import {
  SyntheticAsset,
  SyntheticAsset__factory,
  DebtToken,
  DebtToken__factory,
  OracleMock__factory,
  OracleMock,
} from '../typechain'

describe('SyntheticAsset', function () {
  let deployer: SignerWithAddress
  let governor: SignerWithAddress
  let user: SignerWithAddress
  let issuerMock: SignerWithAddress
  let vsAsset: SyntheticAsset
  let debtToken: DebtToken
  let oracle: OracleMock

  const name = 'Vesper Synths ETH'
  const symbol = 'vsEth'
  const collateralizationRatio = parseEther('1.5')

  beforeEach(async function () {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[deployer, governor, user, issuerMock] = await ethers.getSigners()

    const oracleMock = new OracleMock__factory(deployer)
    oracle = <OracleMock>await oracleMock.deploy()
    await oracle.deployed()

    const debtTokenFactory = new DebtToken__factory(deployer)
    debtToken = await debtTokenFactory.deploy()
    await debtToken.deployed()
    await debtToken.initialize('vsETH Debt', 'vsEth-Debt', 18, issuerMock.address)

    const vsETHFactory = new SyntheticAsset__factory(deployer)
    vsAsset = await vsETHFactory.deploy()
    await vsAsset.deployed()
    await vsAsset.initialize(
      name,
      symbol,
      18,
      issuerMock.address,
      debtToken.address,
      collateralizationRatio,
      oracle.address
    )

    await vsAsset.transferGovernorship(governor.address)
    await vsAsset.connect(governor).acceptGovernorship()
    vsAsset = vsAsset.connect(governor)

    await oracle.updateRate(vsAsset.address, parseEther('1')) // 1 vsAsset = $1
  })

  it('default values', async function () {
    expect(await vsAsset.totalSupply()).to.eq(0)
    expect(await vsAsset.name()).to.eq(name)
    expect(await vsAsset.symbol()).to.eq(symbol)
    expect(await vsAsset.collateralizationRatio()).to.eq(collateralizationRatio)
    expect(await vsAsset.decimals()).to.eq(18)
  })

  describe('mint', function () {
    it('should mint', async function () {
      expect(await vsAsset.balanceOf(user.address)).to.eq(0)
      const amount = parseEther('100')
      await vsAsset.connect(issuerMock).mint(user.address, amount)
      expect(await vsAsset.balanceOf(user.address)).to.eq(amount)
    })

    it('should revert if not issuer', async function () {
      const tx = vsAsset.connect(user).mint(user.address, parseEther('10'))
      await expect(tx).to.revertedWith('not-issuer')
    })

    it('should revert if surpass max total supply', async function () {
      // given
      expect(await vsAsset.totalSupply()).to.eq(0)
      const max = parseEther('100')
      await vsAsset.updateMaxTotalSupplyInUsd(max)

      // when
      const tx = vsAsset.connect(issuerMock).mint(deployer.address, max.add('1'))

      // then
      await expect(tx).to.revertedWith('surpass-max-total-supply')
    })

    it('should revert if vsAsset is inactive', async function () {
      // given
      await vsAsset.toggleIsActive()

      // when
      const tx = vsAsset.connect(issuerMock).mint(deployer.address, '1')

      // then
      await expect(tx).to.revertedWith('synthetic-asset-is-inactive')
    })
  })

  describe('burn', function () {
    const amount = parseEther('100')

    beforeEach(async function () {
      await vsAsset.connect(issuerMock).mint(user.address, amount)
    })

    it('should burn', async function () {
      expect(await vsAsset.balanceOf(user.address)).to.eq(amount)
      await vsAsset.connect(issuerMock).burn(user.address, amount)
      expect(await vsAsset.balanceOf(user.address)).to.eq(0)
    })

    it('should revert if not issuer', async function () {
      const tx = vsAsset.connect(user).burn(user.address, parseEther('10'))
      await expect(tx).to.revertedWith('not-issuer')
    })
  })

  describe('updateCollateralizationRatio', function () {
    it('should update collateralization ratio', async function () {
      const before = await vsAsset.collateralizationRatio()
      const after = before.mul('2')
      const tx = vsAsset.updateCollateralizationRatio(after)
      await expect(tx).to.emit(vsAsset, 'CollateralizationRatioUpdated').withArgs(before, after)
      expect(await vsAsset.collateralizationRatio()).to.eq(after)
    })

    it('should revert if not governor', async function () {
      const tx = vsAsset.connect(user).updateCollateralizationRatio(parseEther('10'))
      await expect(tx).to.revertedWith('not-the-governor')
    })

    it('should revert if < 100%', async function () {
      const tx = vsAsset.updateCollateralizationRatio(parseEther('1').sub('1'))
      await expect(tx).to.revertedWith('collaterization-ratio-lt-100%')
    })
  })

  describe('updateMaxTotalSupplyInUsd', function () {
    it('should update collateralization ratio', async function () {
      const before = await vsAsset.maxTotalSupplyInUsd()
      const after = before.div('2')
      const tx = vsAsset.updateMaxTotalSupplyInUsd(after)
      await expect(tx).to.emit(vsAsset, 'MaxTotalSupplyUpdated').withArgs(before, after)
      expect(await vsAsset.maxTotalSupplyInUsd()).to.eq(after)
    })

    it('should revert if not governor', async function () {
      const tx = vsAsset.connect(user).updateMaxTotalSupplyInUsd(parseEther('10'))
      await expect(tx).to.revertedWith('not-the-governor')
    })
  })

  describe('toggleIsActive', function () {
    it('should update active flag', async function () {
      expect(await vsAsset.isActive()).to.eq(true)
      const tx = vsAsset.toggleIsActive()
      await expect(tx).to.emit(vsAsset, 'SyntheticAssetActiveUpdated').withArgs(true, false)
      expect(await vsAsset.isActive()).to.eq(false)
    })

    it('should revert if not governor', async function () {
      const tx = vsAsset.connect(user).toggleIsActive()
      await expect(tx).to.revertedWith('not-the-governor')
    })
  })
})
