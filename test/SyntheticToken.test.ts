/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable camelcase */
import {parseEther} from '@ethersproject/units'
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {expect} from 'chai'
import {ethers} from 'hardhat'
import {
  SyntheticToken,
  SyntheticToken__factory,
  DebtToken,
  DebtToken__factory,
  MasterOracleMock__factory,
  MasterOracleMock,
  ERC20Mock__factory,
  ERC20Mock,
  DepositToken__factory,
  DepositToken,
} from '../typechain'
import {toUSD} from '../helpers'
import {FakeContract, MockContract, smock} from '@defi-wonderland/smock'
import {setBalance} from '@nomicfoundation/hardhat-network-helpers'

const {MaxUint256} = ethers.constants

describe('SyntheticToken', function () {
  let deployer: SignerWithAddress
  let governor: SignerWithAddress
  let user: SignerWithAddress
  let treasury: SignerWithAddress
  let feeCollector: SignerWithAddress
  let poolRegistryMock: FakeContract
  let poolMock: MockContract
  let met: ERC20Mock
  let msdMET: DepositToken
  let msUSD: SyntheticToken
  let msUSDDebt: DebtToken
  let masterOracleMock: MasterOracleMock

  const metCR = parseEther('0.5') // 50%
  const name = 'Metronome Synth ETH'
  const symbol = 'msETH'
  const interestRate = parseEther('0')

  beforeEach(async function () {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[deployer, governor, user, treasury, feeCollector] = await ethers.getSigners()

    poolRegistryMock = await smock.fake('PoolRegistry')
    await setBalance(poolRegistryMock.address, parseEther('10'))

    const masterOracleMockFactory = new MasterOracleMock__factory(deployer)
    masterOracleMock = await masterOracleMockFactory.deploy()
    await masterOracleMock.deployed()

    const erc20MockFactory = new ERC20Mock__factory(deployer)
    met = await erc20MockFactory.deploy('Metronome', 'MET', 18)
    await met.deployed()

    const depositTokenFactory = new DepositToken__factory(deployer)
    msdMET = await depositTokenFactory.deploy()
    await msdMET.deployed()

    const debtTokenFactory = new DebtToken__factory(deployer)
    msUSDDebt = await debtTokenFactory.deploy()
    await msUSDDebt.deployed()

    const syntheticTokenFactory = new SyntheticToken__factory(deployer)
    msUSD = await syntheticTokenFactory.deploy()
    await msUSD.deployed()

    const poolMockFactory = await smock.mock('PoolMock')
    poolMock = await poolMockFactory.deploy(
      msdMET.address,
      masterOracleMock.address,
      msUSD.address,
      msUSDDebt.address,
      poolRegistryMock.address
    )
    await poolMock.deployed()
    await poolMock.transferGovernorship(governor.address)
    await poolMock.updateTreasury(treasury.address)
    await setBalance(poolMock.address, parseEther('10'))

    await msdMET.initialize(met.address, poolMock.address, 'msdMET', 18, metCR, MaxUint256)
    await msUSD.initialize(name, symbol, 18, poolRegistryMock.address)
    await msUSDDebt.initialize('msUSD Debt', 'msUSD-Debt', poolMock.address, msUSD.address, interestRate, MaxUint256)

    await masterOracleMock.updatePrice(msUSD.address, toUSD('1'))
    await masterOracleMock.updatePrice(msdMET.address, toUSD('1'))

    poolRegistryMock.governor.returns(governor.address)
    poolRegistryMock.feeCollector.returns(feeCollector.address)
    poolRegistryMock.masterOracle.returns(masterOracleMock.address)
    poolRegistryMock.poolExists.returns((address: string) => address == poolMock.address)
    poolMock.isSyntheticTokenExists.returns((address: string) => address == msUSD.address)
    poolMock.isDebtTokenExists.returns((address: string) => address == msUSDDebt.address)
  })

  it('default values', async function () {
    expect(await msUSD.totalSupply()).eq(0)
    expect(await msUSD.name()).eq(name)
    expect(await msUSD.symbol()).eq(symbol)
    expect(await msUSD.decimals()).eq(18)
  })

  describe('mint', function () {
    it('should mint', async function () {
      expect(await msUSD.balanceOf(user.address)).eq(0)
      const amount = parseEther('100')
      await msUSD.connect(poolMock.wallet).mint(user.address, amount)
      expect(await msUSD.balanceOf(user.address)).eq(amount)
    })

    it('should revert if not authorized', async function () {
      const tx = msUSD.connect(user).mint(user.address, parseEther('10'))
      await expect(tx).reverted
    })

    it('should revert if surpass max supply in usd', async function () {
      // given
      await msUSD.connect(governor).updateMaxTotalSupplyInUsd(toUSD('100'))

      // when
      const tx = msUSD.connect(poolMock.wallet).mint(user.address, parseEther('101'))

      // then
      await expect(tx).revertedWith('surpass-max-synth-supply')
    })

    it('should revert if msAsset is inactive', async function () {
      // given
      await msUSD.connect(governor).toggleIsActive()

      // when
      const tx = msUSD.connect(poolMock.wallet).mint(deployer.address, '1')

      // then
      await expect(tx).revertedWith('synthetic-inactive')
    })
  })

  describe('burn', function () {
    const amount = parseEther('100')

    beforeEach(async function () {
      await msUSD.connect(poolMock.wallet).mint(user.address, amount)
    })

    it('should burn', async function () {
      expect(await msUSD.balanceOf(user.address)).eq(amount)
      await msUSD.connect(poolMock.wallet).burn(user.address, amount)
      expect(await msUSD.balanceOf(user.address)).eq(0)
    })

    it('should revert if not authorized', async function () {
      const tx = msUSD.connect(user).burn(user.address, parseEther('10'))
      await expect(tx).reverted
    })
  })

  describe('toggleIsActive', function () {
    it('should update active flag', async function () {
      expect(await msUSD.isActive()).eq(true)
      const tx = msUSD.connect(governor).toggleIsActive()
      await expect(tx).emit(msUSD, 'SyntheticTokenActiveUpdated').withArgs(true, false)
      expect(await msUSD.isActive()).eq(false)
    })

    it('should revert if not governor', async function () {
      const tx = msUSD.connect(user).toggleIsActive()
      await expect(tx).revertedWith('not-governor')
    })
  })

  describe('updateMaxTotalSupplyInUsd', function () {
    it('should update collateralization ratio', async function () {
      const before = await msUSD.maxTotalSupplyInUsd()
      const after = before.div('2')
      const tx = msUSD.connect(governor).updateMaxTotalSupplyInUsd(after)
      await expect(tx).emit(msUSD, 'MaxTotalSupplyUpdated').withArgs(before, after)
      expect(await msUSD.maxTotalSupplyInUsd()).eq(after)
    })

    it('should revert if using the current value', async function () {
      const currentMaxTotalSupplyInUsd = await msUSD.maxTotalSupplyInUsd()
      const tx = msUSD.connect(governor).updateMaxTotalSupplyInUsd(currentMaxTotalSupplyInUsd)
      await expect(tx).revertedWith('new-same-as-current')
    })

    it('should revert if not governor', async function () {
      const tx = msUSD.connect(user).updateMaxTotalSupplyInUsd(parseEther('10'))
      await expect(tx).revertedWith('not-governor')
    })
  })
})
