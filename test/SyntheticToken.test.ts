/* eslint-disable camelcase */
import {parseEther} from '@ethersproject/units'
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {expect} from 'chai'
import {ethers} from 'hardhat'
import {
  SyntheticToken,
  DebtToken,
  MasterOracleMock,
  ERC20Mock,
  DepositToken,
  PoolMock,
  PoolMock__factory,
  FeeProvider,
} from '../typechain'
import {toUSD} from '../helpers'
import {FakeContract, MockContract, smock} from '@defi-wonderland/smock'
import {setBalance} from '@nomicfoundation/hardhat-network-helpers'

const {MaxUint256, AddressZero} = ethers.constants

describe('SyntheticToken', function () {
  let deployer: SignerWithAddress
  let governor: SignerWithAddress
  let user: SignerWithAddress
  let treasury: SignerWithAddress
  let feeCollector: SignerWithAddress
  let poolRegistryMock: FakeContract
  let poolMock: MockContract<PoolMock>
  let met: ERC20Mock
  let msdMET: DepositToken
  let msUSD: SyntheticToken
  let msUSDDebt: DebtToken
  let masterOracleMock: MasterOracleMock
  let feeProvider: FeeProvider

  const metCF = parseEther('0.5') // 50%
  const name = 'Metronome Synth ETH'
  const symbol = 'msETH'
  const interestRate = parseEther('0')

  beforeEach(async function () {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[deployer, governor, user, treasury, feeCollector] = await ethers.getSigners()

    poolRegistryMock = await smock.fake('PoolRegistry')
    await setBalance(poolRegistryMock.address, parseEther('10'))

    const masterOracleMockFactory = await ethers.getContractFactory('MasterOracleMock', deployer)
    masterOracleMock = await masterOracleMockFactory.deploy()
    await masterOracleMock.deployed()

    const erc20MockFactory = await ethers.getContractFactory('ERC20Mock', deployer)
    met = await erc20MockFactory.deploy('Metronome', 'MET', 18)
    await met.deployed()

    const depositTokenFactory = await ethers.getContractFactory('DepositToken', deployer)
    msdMET = await depositTokenFactory.deploy()
    await msdMET.deployed()

    const debtTokenFactory = await ethers.getContractFactory('DebtToken', deployer)
    msUSDDebt = await debtTokenFactory.deploy()
    await msUSDDebt.deployed()

    const syntheticTokenFactory = await ethers.getContractFactory('SyntheticToken', deployer)
    msUSD = await syntheticTokenFactory.deploy()
    await msUSD.deployed()

    const esMET = await smock.fake('IESMET')

    const feeProviderFactory = await ethers.getContractFactory('FeeProvider', deployer)
    feeProvider = await feeProviderFactory.deploy()
    await feeProvider.deployed()
    await feeProvider.initialize(poolRegistryMock.address, esMET.address)

    const poolMockFactory = await smock.mock<PoolMock__factory>('PoolMock')
    poolMock = await poolMockFactory.deploy(
      msdMET.address,
      masterOracleMock.address,
      msUSD.address,
      msUSDDebt.address,
      poolRegistryMock.address,
      feeProvider.address
    )
    await poolMock.deployed()
    await poolMock.transferGovernorship(governor.address)
    await poolMock.updateTreasury(treasury.address)
    await setBalance(poolMock.address, parseEther('10'))

    await msdMET.initialize(
      met.address,
      poolMock.address,
      'Metronome Synth MET-Deposit',
      'msdMET',
      18,
      metCF,
      MaxUint256
    )
    await msUSD.initialize(name, symbol, 18, poolRegistryMock.address)
    await msUSDDebt.initialize('msUSD Debt', 'msUSD-Debt', poolMock.address, msUSD.address, interestRate, MaxUint256)

    await masterOracleMock.updatePrice(msUSD.address, toUSD('1'))
    await masterOracleMock.updatePrice(msdMET.address, toUSD('1'))

    poolRegistryMock.governor.returns(governor.address)
    poolRegistryMock.feeCollector.returns(feeCollector.address)
    poolRegistryMock.masterOracle.returns(masterOracleMock.address)
    poolRegistryMock.isPoolRegistered.returns((address: string) => address == poolMock.address)
    poolMock.doesSyntheticTokenExist.returns((address: string) => address == msUSD.address)
    poolMock.doesDebtTokenExist.returns((address: string) => address == msUSDDebt.address)
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

    it('should mint and increase totalBridgedIn', async function () {
      // given
      const proxyOFT = await smock.fake('IProxyOFT')
      await setBalance(proxyOFT.address, parseEther('10'))
      await msUSD.connect(governor).updateProxyOFT(proxyOFT.address)
      await msUSD.connect(governor).updateMaxBridgingBalance(parseEther('500'))
      const amount = parseEther('100')
      expect(await msUSD.totalBridgedIn()).eq(0)

      // when
      await msUSD.connect(proxyOFT.wallet).mint(user.address, amount)

      // then
      expect(await msUSD.totalBridgedIn()).eq(amount)
    })

    it('should revert when maxBridgingBalance is met', async function () {
      // given
      const proxyOFT = await smock.fake('IProxyOFT')
      await setBalance(proxyOFT.address, parseEther('10'))
      await msUSD.connect(governor).updateProxyOFT(proxyOFT.address)
      await msUSD.connect(governor).updateMaxBridgingBalance(parseEther('500'))
      const amount = parseEther('550')
      expect(await msUSD.totalBridgedIn()).eq(0)

      // when
      const tx = msUSD.connect(proxyOFT.wallet).mint(user.address, amount)

      // then
      await expect(tx).revertedWithCustomError(msUSD, 'SurpassMaxBridgingBalance')
    })

    it('should revert if not authorized', async function () {
      const tx = msUSD.connect(user).mint(user.address, parseEther('10'))
      await expect(tx).reverted
    })

    it('should revert if surpass max supply in usd', async function () {
      // given
      await msUSD.connect(governor).updateMaxTotalSupply(parseEther('100'))

      // when
      const tx = msUSD.connect(poolMock.wallet).mint(user.address, parseEther('101'))

      // then
      await expect(tx).revertedWithCustomError(msUSD, 'SurpassMaxSynthSupply')
    })

    it('should revert if msAsset is inactive', async function () {
      // given
      await msUSD.connect(governor).toggleIsActive()

      // when
      const tx = msUSD.connect(poolMock.wallet).mint(deployer.address, '1')

      // then
      await expect(tx).revertedWithCustomError(msUSD, 'SyntheticIsInactive')
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

    it('should burn and increase totalBridgedOut', async function () {
      // given
      const proxyOFT = await smock.fake('IProxyOFT')
      await setBalance(proxyOFT.address, parseEther('10'))
      await msUSD.connect(governor).updateProxyOFT(proxyOFT.address)
      await msUSD.connect(governor).updateMaxBridgingBalance(parseEther('500'))
      expect(await msUSD.totalBridgedOut()).eq(0)

      // when
      await msUSD.connect(proxyOFT.wallet).burn(user.address, amount)

      // then
      expect(await msUSD.totalBridgedOut()).eq(amount)
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
      await expect(tx).emit(msUSD, 'SyntheticTokenActiveUpdated').withArgs(false)
      expect(await msUSD.isActive()).eq(false)
    })

    it('should revert if not governor', async function () {
      const tx = msUSD.connect(user).toggleIsActive()
      await expect(tx).revertedWithCustomError(msUSD, 'SenderIsNotGovernor')
    })
  })

  describe('updateMaxTotalSupply', function () {
    it('should update collateral factor', async function () {
      const before = await msUSD.maxTotalSupply()
      const after = before.div('2')
      const tx = msUSD.connect(governor).updateMaxTotalSupply(after)
      await expect(tx).emit(msUSD, 'MaxTotalSupplyUpdated').withArgs(before, after)
      expect(await msUSD.maxTotalSupply()).eq(after)
    })

    it('should revert if using the current value', async function () {
      const currentMaxTotalSupply = await msUSD.maxTotalSupply()
      const tx = msUSD.connect(governor).updateMaxTotalSupply(currentMaxTotalSupply)
      await expect(tx).revertedWithCustomError(msUSD, 'NewValueIsSameAsCurrent')
    })

    it('should revert if not governor', async function () {
      const tx = msUSD.connect(user).updateMaxTotalSupply(parseEther('10'))
      await expect(tx).revertedWithCustomError(msUSD, 'SenderIsNotGovernor')
    })
  })

  describe('updateMaxBridgingBalance', function () {
    it('should update maxBridgingBalance', async function () {
      const before = await msUSD.maxBridgingBalance()
      const after = parseEther('500') // 500 synths
      const tx = msUSD.connect(governor).updateMaxBridgingBalance(after)
      await expect(tx).emit(msUSD, 'MaxBridgingBalanceUpdated').withArgs(before, after)
      expect(await msUSD.maxBridgingBalance()).eq(after)
    })

    it('should revert if using the current value', async function () {
      const currentMaxBridgingBalance = await msUSD.maxBridgingBalance()
      const tx = msUSD.connect(governor).updateMaxBridgingBalance(currentMaxBridgingBalance)
      await expect(tx).revertedWithCustomError(msUSD, 'NewValueIsSameAsCurrent')
    })

    it('should revert if not governor', async function () {
      const tx = msUSD.connect(user).updateMaxBridgingBalance(parseEther('500'))
      await expect(tx).revertedWithCustomError(msUSD, 'SenderIsNotGovernor')
    })
  })

  describe('updateProxyOFT', function () {
    it('should update proxyOFT', async function () {
      const before = await msUSD.proxyOFT()
      const proxyOFT = await smock.fake('IProxyOFT')
      const after = proxyOFT.address
      const tx = msUSD.connect(governor).updateProxyOFT(after)
      await expect(tx).emit(msUSD, 'ProxyOFTUpdated').withArgs(before, after)
      expect(await msUSD.proxyOFT()).eq(after)
    })

    it('should revert if using the null address', async function () {
      const tx = msUSD.connect(governor).updateProxyOFT(AddressZero)
      await expect(tx).revertedWithCustomError(msUSD, 'AddressIsNull')
    })

    it('should revert if using the current value', async function () {
      const proxyOFT = await smock.fake('IProxyOFT')
      await msUSD.connect(governor).updateProxyOFT(proxyOFT.address)
      const currentProxyOFT = await msUSD.proxyOFT()
      const tx = msUSD.connect(governor).updateProxyOFT(currentProxyOFT)
      await expect(tx).revertedWithCustomError(msUSD, 'NewValueIsSameAsCurrent')
    })

    it('should revert if not governor', async function () {
      const proxyOFT = await smock.fake('IProxyOFT')
      const tx = msUSD.connect(user).updateProxyOFT(proxyOFT.address)
      await expect(tx).revertedWithCustomError(msUSD, 'SenderIsNotGovernor')
    })
  })
})
