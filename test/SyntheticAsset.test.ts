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
  let controllerMock: SignerWithAddress
  let vsAsset: SyntheticAsset
  let debtToken: DebtToken
  let oracle: OracleMock

  const name = 'Vesper Synth ETH'
  const symbol = 'vsEth'
  const collateralizationRatio = parseEther('1.5')
  const interestRate = parseEther('0')

  beforeEach(async function () {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[deployer, governor, user, controllerMock] = await ethers.getSigners()

    const oracleMock = new OracleMock__factory(deployer)
    oracle = <OracleMock>await oracleMock.deploy()
    await oracle.deployed()

    const debtTokenFactory = new DebtToken__factory(deployer)
    debtToken = await debtTokenFactory.deploy()
    await debtToken.deployed()

    const syntheticAssetFactory = new SyntheticAsset__factory(deployer)
    vsAsset = await syntheticAssetFactory.deploy()
    await vsAsset.deployed()

    await debtToken.initialize('vsETH Debt', 'vsEth-Debt', 18, controllerMock.address, vsAsset.address)
    await vsAsset.initialize(
      name,
      symbol,
      18,
      controllerMock.address,
      debtToken.address,
      collateralizationRatio,
      oracle.address,
      interestRate
    )

    await vsAsset.transferGovernorship(governor.address)
    await vsAsset.connect(governor).acceptGovernorship()
    vsAsset = vsAsset.connect(governor)

    await oracle.updateRate(vsAsset.address, parseEther('1')) // 1 vsAsset = $1
  })

  it('default values', async function () {
    expect(await vsAsset.totalSupply()).eq(0)
    expect(await vsAsset.name()).eq(name)
    expect(await vsAsset.symbol()).eq(symbol)
    expect(await vsAsset.collateralizationRatio()).eq(collateralizationRatio)
    expect(await vsAsset.decimals()).eq(18)
  })

  describe('mint', function () {
    it('should mint', async function () {
      expect(await vsAsset.balanceOf(user.address)).eq(0)
      const amount = parseEther('100')
      await vsAsset.connect(controllerMock).mint(user.address, amount)
      expect(await vsAsset.balanceOf(user.address)).eq(amount)
    })

    it('should revert if not controller', async function () {
      const tx = vsAsset.connect(user).mint(user.address, parseEther('10'))
      await expect(tx).revertedWith('not-controller')
    })

    it('should revert if surpass max total supply', async function () {
      // given
      expect(await vsAsset.totalSupply()).eq(0)
      const max = parseEther('100')
      await vsAsset.updateMaxTotalSupplyInUsd(max)

      // when
      const tx = vsAsset.connect(controllerMock).mint(deployer.address, max.add('1'))

      // then
      await expect(tx).revertedWith('surpass-max-total-supply')
    })

    it('should revert if vsAsset is inactive', async function () {
      // given
      await vsAsset.toggleIsActive()

      // when
      const tx = vsAsset.connect(controllerMock).mint(deployer.address, '1')

      // then
      await expect(tx).revertedWith('synthetic-asset-is-inactive')
    })
  })

  describe('burn', function () {
    const amount = parseEther('100')

    beforeEach(async function () {
      await vsAsset.connect(controllerMock).mint(user.address, amount)
    })

    it('should burn', async function () {
      expect(await vsAsset.balanceOf(user.address)).eq(amount)
      await vsAsset.connect(controllerMock).burn(user.address, amount)
      expect(await vsAsset.balanceOf(user.address)).eq(0)
    })

    it('should revert if not controller', async function () {
      const tx = vsAsset.connect(user).burn(user.address, parseEther('10'))
      await expect(tx).revertedWith('not-controller')
    })
  })

  describe('updateCollateralizationRatio', function () {
    it('should update collateralization ratio', async function () {
      const before = await vsAsset.collateralizationRatio()
      const after = before.mul('2')
      const tx = vsAsset.updateCollateralizationRatio(after)
      await expect(tx).emit(vsAsset, 'CollateralizationRatioUpdated').withArgs(before, after)
      expect(await vsAsset.collateralizationRatio()).eq(after)
    })

    it('should revert if not governor', async function () {
      const tx = vsAsset.connect(user).updateCollateralizationRatio(parseEther('10'))
      await expect(tx).revertedWith('not-the-governor')
    })

    it('should revert if < 100%', async function () {
      const tx = vsAsset.updateCollateralizationRatio(parseEther('1').sub('1'))
      await expect(tx).revertedWith('collaterization-ratio-lt-100%')
    })
  })

  describe('updateMaxTotalSupplyInUsd', function () {
    it('should update collateralization ratio', async function () {
      const before = await vsAsset.maxTotalSupplyInUsd()
      const after = before.div('2')
      const tx = vsAsset.updateMaxTotalSupplyInUsd(after)
      await expect(tx).emit(vsAsset, 'MaxTotalSupplyUpdated').withArgs(before, after)
      expect(await vsAsset.maxTotalSupplyInUsd()).eq(after)
    })

    it('should revert if not governor', async function () {
      const tx = vsAsset.connect(user).updateMaxTotalSupplyInUsd(parseEther('10'))
      await expect(tx).revertedWith('not-the-governor')
    })
  })

  describe('updateInterestRate', function () {
    it('should update interest rate', async function () {
      const before = await vsAsset.interestRate()
      const after = parseEther('0.5')
      const tx = vsAsset.updateInterestRate(after)
      await expect(tx).emit(vsAsset, 'InterestRateUpdated').withArgs(before, after)
      expect(await vsAsset.interestRate()).eq(after)
    })

    it('should revert if not governor', async function () {
      const tx = vsAsset.connect(user).updateInterestRate(parseEther('0.12'))
      await expect(tx).revertedWith('not-the-governor')
    })
  })

  describe('toggleIsActive', function () {
    it('should update active flag', async function () {
      expect(await vsAsset.isActive()).eq(true)
      const tx = vsAsset.toggleIsActive()
      await expect(tx).emit(vsAsset, 'SyntheticAssetActiveUpdated').withArgs(true, false)
      expect(await vsAsset.isActive()).eq(false)
    })

    it('should revert if not governor', async function () {
      const tx = vsAsset.connect(user).toggleIsActive()
      await expect(tx).revertedWith('not-the-governor')
    })
  })
})
