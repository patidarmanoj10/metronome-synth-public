/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable camelcase */
import {parseEther} from '@ethersproject/units'
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {expect} from 'chai'
import {ethers} from 'hardhat'
import {
  SyntheticToken,
  SyntheticToken__factory,
  DebtTokenMock,
  DebtTokenMock__factory,
  OracleMock__factory,
  OracleMock,
  ControllerMock,
  ControllerMock__factory,
} from '../typechain'

describe('SyntheticToken', function () {
  let deployer: SignerWithAddress
  let governor: SignerWithAddress
  let user: SignerWithAddress
  let treasury: SignerWithAddress
  let controllerMock: ControllerMock
  let vsAsset: SyntheticToken
  let debtToken: DebtTokenMock
  let oracle: OracleMock

  const name = 'Vesper Synth ETH'
  const symbol = 'vsETH'
  const interestRate = parseEther('0')

  beforeEach(async function () {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[deployer, governor, user, treasury] = await ethers.getSigners()

    const oracleMock = new OracleMock__factory(deployer)
    oracle = <OracleMock>await oracleMock.deploy()
    await oracle.deployed()

    const controllerMockFactory = new ControllerMock__factory(deployer)
    controllerMock = await controllerMockFactory.deploy(ethers.constants.AddressZero, oracle.address, treasury.address)
    await controllerMock.deployed()
    await controllerMock.transferGovernorship(governor.address)

    const debtTokenFactory = new DebtTokenMock__factory(deployer)
    debtToken = await debtTokenFactory.deploy()
    await debtToken.deployed()

    const syntheticTokenFactory = new SyntheticToken__factory(deployer)
    vsAsset = await syntheticTokenFactory.deploy()
    await vsAsset.deployed()

    await debtToken.initialize('vsETH Debt', 'vsETH-Debt', 18, controllerMock.address, vsAsset.address)
    await vsAsset.initialize(name, symbol, 18, controllerMock.address, debtToken.address, interestRate)

    vsAsset = vsAsset.connect(governor)

    await oracle.updateRate(vsAsset.address, parseEther('1')) // 1 vsAsset = $1
  })

  it('default values', async function () {
    expect(await vsAsset.totalSupply()).eq(0)
    expect(await vsAsset.name()).eq(name)
    expect(await vsAsset.symbol()).eq(symbol)
    expect(await vsAsset.decimals()).eq(18)
  })

  describe('mint', function () {
    it('should mint', async function () {
      expect(await vsAsset.balanceOf(user.address)).eq(0)
      const amount = parseEther('100')
      const call = vsAsset.interface.encodeFunctionData('mint', [user.address, amount])
      await controllerMock.mockCall(vsAsset.address, call)
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
      const call = vsAsset.interface.encodeFunctionData('mint', [user.address, max.add('1')])
      const tx = controllerMock.mockCall(vsAsset.address, call)

      // then
      await expect(tx).revertedWith('surpass-max-total-supply')
    })

    it('should revert if vsAsset is inactive', async function () {
      // given
      await vsAsset.toggleIsActive()

      // when
      const call = vsAsset.interface.encodeFunctionData('mint', [deployer.address, '1'])
      const tx = controllerMock.mockCall(vsAsset.address, call)

      // then
      await expect(tx).revertedWith('synthetic-is-inactive')
    })
  })

  describe('burn', function () {
    const amount = parseEther('100')

    beforeEach(async function () {
      const call = vsAsset.interface.encodeFunctionData('mint', [user.address, amount])
      await controllerMock.mockCall(vsAsset.address, call)
    })

    it('should burn', async function () {
      expect(await vsAsset.balanceOf(user.address)).eq(amount)

      const call = vsAsset.interface.encodeFunctionData('burn', [user.address, amount])
      await controllerMock.mockCall(vsAsset.address, call)

      expect(await vsAsset.balanceOf(user.address)).eq(0)
    })

    it('should revert if not controller', async function () {
      const tx = vsAsset.connect(user).burn(user.address, parseEther('10'))
      await expect(tx).revertedWith('not-controller')
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
      await expect(tx).revertedWith('not-governor')
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
      await expect(tx).revertedWith('not-governor')
    })
  })

  describe('toggleIsActive', function () {
    it('should update active flag', async function () {
      expect(await vsAsset.isActive()).eq(true)
      const tx = vsAsset.toggleIsActive()
      await expect(tx).emit(vsAsset, 'SyntheticTokenActiveUpdated').withArgs(true, false)
      expect(await vsAsset.isActive()).eq(false)
    })

    it('should revert if not governor', async function () {
      const tx = vsAsset.connect(user).toggleIsActive()
      await expect(tx).revertedWith('not-governor')
    })
  })

  describe('acrueInterest', function () {
    it('should mint accrued fee to treasury', async function () {
      const pricipal = parseEther('100')

      // given
      await vsAsset.updateInterestRate(parseEther('0.1')) // 10%

      const mintCall = vsAsset.interface.encodeFunctionData('mint', [user.address, pricipal])
      await controllerMock.mockCall(vsAsset.address, mintCall)
      await controllerMock.mockCall(debtToken.address, mintCall)

      // eslint-disable-next-line new-cap
      await debtToken.incrementBlockNumber(await vsAsset.BLOCKS_PER_YEAR())

      // when
      await vsAsset.accrueInterest()

      // then
      const totalCredit = await vsAsset.totalSupply()
      const totalDebt = await debtToken.totalSupply()
      const debtOfUser = await debtToken.balanceOf(user.address)
      const creditOfUser = await vsAsset.balanceOf(user.address)
      const creditOfTreasury = await vsAsset.balanceOf(treasury.address)
      // @ts-ignore
      expect(totalDebt).closeTo(parseEther('110'), parseEther('0.01'))
      expect(totalCredit).eq(totalDebt)
      // @ts-ignore
      expect(totalDebt).closeTo(debtOfUser, parseEther('0.000001'))
      expect(creditOfUser).eq(pricipal)
      expect(totalCredit).eq(creditOfUser.add(creditOfTreasury))
    })
  })
})
