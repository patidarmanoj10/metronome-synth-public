import {Contract, ContractFactory} from '@ethersproject/contracts'
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {expect} from 'chai'
import {deployments, ethers} from 'hardhat'
import {
  DebtToken,
  DepositToken,
  SyntheticToken,
  Treasury,
  TreasuryUpgrader,
  DepositTokenUpgrader,
  SyntheticTokenUpgrader,
  DebtTokenUpgrader,
  UpgraderBase,
  Pool,
  NativeTokenGateway,
  PoolRegistry,
  PoolRegistryUpgrader,
  PoolUpgraderV2,
  FeeProvider,
  FeeProviderUpgrader,
} from '../typechain'
import {disableForking, enableForking, impersonateAccount} from './helpers'
import Address from '../helpers/address'
import {parseEther} from 'ethers/lib/utils'

const {USDC_ADDRESS, NATIVE_TOKEN_ADDRESS, WAVAX_ADDRESS, MASTER_ORACLE_ADDRESS, GNOSIS_SAFE_ADDRESS} = Address

describe('Deployments', function () {
  let deployer: SignerWithAddress
  let pool: Pool
  let poolUpgrader: PoolUpgraderV2
  let treasury: Treasury
  let treasuryUpgrader: TreasuryUpgrader
  let depositTokenUpgrader: DepositTokenUpgrader
  let msdUSDC: DepositToken
  let msdWAVAX: DepositToken
  let syntheticTokenUpgrader: SyntheticTokenUpgrader
  let msBTC: SyntheticToken
  let msUSD: SyntheticToken
  let debtTokenUpgrader: DebtTokenUpgrader
  let msBTCDebt: DebtToken
  let msUSDDebt: DebtToken
  let wethGateway: NativeTokenGateway
  let poolRegistry: PoolRegistry
  let poolRegistryUpgrader: PoolRegistryUpgrader
  let feeProvider: FeeProvider
  let feeProviderUpgrader: FeeProviderUpgrader

  // Note: Enabling fork to be able to use MultiCall contract
  before(enableForking)

  after(disableForking)

  beforeEach(async function () {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[deployer] = await ethers.getSigners()

    const {
      Pool: {address: poolAddress},
      PoolUpgraderV2: {address: poolUpgraderAddress},
      Treasury: {address: treasuryAddress},
      TreasuryUpgrader: {address: treasuryUpgraderAddress},
      DepositTokenUpgrader: {address: depositTokenUpgraderAddress},
      USDCDepositToken: {address: usdcDepositTokenAddress},
      WAVAXDepositToken: {address: wavaxDepositTokenAddress},
      SyntheticTokenUpgrader: {address: syntheticTokenUpgraderAddress},
      MsBTCSynthetic: {address: msBTCAddress},
      MsUSDSynthetic: {address: msUSDAddress},
      DebtTokenUpgrader: {address: debtTokenUpgraderAddress},
      MsBTCDebt: {address: msBTCDebtTokenAddress},
      MsUSDDebt: {address: msUSDDebtTokenAddress},
      NativeTokenGateway: {address: wethGatewayAddress},
      PoolRegistry: {address: poolRegistryAddress},
      PoolRegistryUpgrader: {address: poolRegistryUpgraderAddress},
      FeeProvider: {address: feeProviderAddress},
      FeeProviderUpgrader: {address: feeProviderUpgraderAddress},
    } = await deployments.fixture()

    pool = await ethers.getContractAt('Pool', poolAddress, deployer)
    poolUpgrader = await ethers.getContractAt('PoolUpgraderV2', poolUpgraderAddress, deployer)

    treasury = await ethers.getContractAt('Treasury', treasuryAddress, deployer)
    treasuryUpgrader = await ethers.getContractAt('TreasuryUpgrader', treasuryUpgraderAddress, deployer)

    wethGateway = await ethers.getContractAt('NativeTokenGateway', wethGatewayAddress, deployer)

    depositTokenUpgrader = await ethers.getContractAt('DepositTokenUpgrader', depositTokenUpgraderAddress, deployer)
    msdUSDC = await ethers.getContractAt('DepositToken', usdcDepositTokenAddress, deployer)
    msdWAVAX = await ethers.getContractAt('DepositToken', wavaxDepositTokenAddress, deployer)

    syntheticTokenUpgrader = await ethers.getContractAt(
      'SyntheticTokenUpgrader',
      syntheticTokenUpgraderAddress,
      deployer
    )
    msBTC = await ethers.getContractAt('SyntheticToken', msBTCAddress, deployer)
    msUSD = await ethers.getContractAt('SyntheticToken', msUSDAddress, deployer)

    debtTokenUpgrader = await ethers.getContractAt('DebtTokenUpgrader', debtTokenUpgraderAddress, deployer)
    msBTCDebt = await ethers.getContractAt('DebtToken', msBTCDebtTokenAddress, deployer)
    msUSDDebt = await ethers.getContractAt('DebtToken', msUSDDebtTokenAddress, deployer)

    poolRegistry = await ethers.getContractAt('PoolRegistry', poolRegistryAddress, deployer)
    poolRegistryUpgrader = await ethers.getContractAt('PoolRegistryUpgrader', poolRegistryUpgraderAddress, deployer)

    feeProvider = await ethers.getContractAt('FeeProvider', feeProviderAddress, deployer)
    feeProviderUpgrader = await ethers.getContractAt('FeeProviderUpgrader', feeProviderUpgraderAddress, deployer)
  })

  const upgradeTestCase = async function ({
    proxy,
    upgrader,
    newImplFactory,
    expectToFail,
  }: {
    proxy: Contract
    upgrader: UpgraderBase
    newImplFactory: ContractFactory
    expectToFail: boolean
  }) {
    // given
    const newImpl = await newImplFactory.deploy()
    await newImpl.deployed()

    const oldImpl = await upgrader.getProxyImplementation(proxy.address)
    expect(oldImpl).not.eq(newImpl.address)

    // when
    const proxyAdmin = await impersonateAccount(GNOSIS_SAFE_ADDRESS)
    const tx = upgrader.connect(proxyAdmin).upgrade(proxy.address, newImpl.address)

    // then
    if (expectToFail) {
      await expect(tx).reverted
    } else {
      await tx
      expect(await upgrader.getProxyImplementation(proxy.address)).eq(newImpl.address)
    }
  }

  describe('Pool', function () {
    it('should have correct params', async function () {
      expect(await pool.treasury()).eq(treasury.address)
      expect(await pool.governor()).eq(deployer.address)
      expect(await pool.proposedGovernor()).eq(ethers.constants.AddressZero)
    })

    it('should upgrade implementation', async function () {
      await upgradeTestCase({
        newImplFactory: await ethers.getContractFactory('Pool', deployer),
        proxy: pool,
        upgrader: poolUpgrader,
        expectToFail: false,
      })
    })

    it('should fail if implementation breaks storage', async function () {
      await upgradeTestCase({
        newImplFactory: await ethers.getContractFactory('MasterOracleMock', deployer),
        proxy: pool,
        upgrader: poolUpgrader,
        expectToFail: true,
      })
    })
  })

  describe('Treasury', function () {
    it('should have correct params', async function () {
      expect(await treasury.pool()).eq(pool.address)
      expect(await treasury.governor()).eq(deployer.address)
    })

    it('should upgrade implementation', async function () {
      await upgradeTestCase({
        newImplFactory: await ethers.getContractFactory('Treasury', deployer),
        proxy: treasury,
        upgrader: treasuryUpgrader,
        expectToFail: false,
      })
    })
  })

  describe('NativeTokenGateway', function () {
    it('should have correct params', async function () {
      expect(await wethGateway.nativeToken()).eq(NATIVE_TOKEN_ADDRESS)
      expect(await wethGateway.poolRegistry()).eq(poolRegistry.address)
    })
  })

  describe('DepositToken', function () {
    it('should have the same proxy admin', async function () {
      const msdUSDCProxyAdmin = await depositTokenUpgrader.getProxyAdmin(msdUSDC.address)
      const msdWAVAXProxyAdmin = await depositTokenUpgrader.getProxyAdmin(msdWAVAX.address)
      expect(msdUSDCProxyAdmin).eq(msdWAVAXProxyAdmin).eq(depositTokenUpgrader.address)
    })

    it('should have the same implementation', async function () {
      const msdUSDCImpl = await depositTokenUpgrader.getProxyImplementation(msdUSDC.address)
      const msdWAVAXImpl = await depositTokenUpgrader.getProxyImplementation(msdWAVAX.address)
      expect(msdUSDCImpl).eq(msdWAVAXImpl)
    })

    describe('USDC DepositToken', function () {
      it('token should have correct params', async function () {
        expect(await msdUSDC.pool()).eq(pool.address)
        expect(await msdUSDC.underlying()).eq(USDC_ADDRESS)
        expect(await msdUSDC.governor()).eq(deployer.address)
      })

      it('should upgrade implementation', async function () {
        await upgradeTestCase({
          newImplFactory: await ethers.getContractFactory('DepositToken', deployer),
          proxy: msdUSDC,
          upgrader: depositTokenUpgrader,
          expectToFail: false,
        })
      })

      it('should fail if implementation breaks storage', async function () {
        await upgradeTestCase({
          newImplFactory: await ethers.getContractFactory('MasterOracleMock', deployer),
          proxy: msdUSDC,
          upgrader: depositTokenUpgrader,
          expectToFail: true,
        })
      })
    })

    describe('WAVAX DepositToken', function () {
      it('token should have correct params', async function () {
        expect(await msdWAVAX.pool()).eq(pool.address)
        expect(await msdWAVAX.underlying()).eq(WAVAX_ADDRESS)
        expect(await msdWAVAX.governor()).eq(deployer.address)
        expect(await msdWAVAX.symbol()).eq('msdWAVAX-1')
        expect(await msdWAVAX.name()).eq('Metronome Synth WAVAX-Deposit')
      })

      it('should upgrade implementation', async function () {
        await upgradeTestCase({
          newImplFactory: await ethers.getContractFactory('DepositToken', deployer),
          proxy: msdWAVAX,
          upgrader: depositTokenUpgrader,
          expectToFail: false,
        })
      })

      it('should fail if implementation breaks storage', async function () {
        await upgradeTestCase({
          newImplFactory: await ethers.getContractFactory('MasterOracleMock', deployer),
          proxy: msdWAVAX,
          upgrader: depositTokenUpgrader,
          expectToFail: true,
        })
      })
    })
  })

  describe('SyntheticToken', function () {
    it('should have the same proxy admin', async function () {
      const msBTCDebtProxyAdmin = await debtTokenUpgrader.getProxyAdmin(msBTCDebt.address)
      const msUSDDebtProxyAdmin = await debtTokenUpgrader.getProxyAdmin(msUSDDebt.address)
      expect(msBTCDebtProxyAdmin).eq(msUSDDebtProxyAdmin).eq(debtTokenUpgrader.address)

      const msBTCProxyAdmin = await syntheticTokenUpgrader.getProxyAdmin(msBTC.address)
      const msUSDProxyAdmin = await syntheticTokenUpgrader.getProxyAdmin(msUSD.address)
      expect(msBTCProxyAdmin).eq(msUSDProxyAdmin).eq(syntheticTokenUpgrader.address)
    })

    it('should have the same implementation', async function () {
      const msBTCDebtImpl = await debtTokenUpgrader.getProxyImplementation(msBTCDebt.address)
      const msUSDDebtImpl = await debtTokenUpgrader.getProxyImplementation(msUSDDebt.address)
      expect(msBTCDebtImpl).eq(msUSDDebtImpl)

      const msBTCImpl = await syntheticTokenUpgrader.getProxyImplementation(msBTC.address)
      const msUSDImpl = await syntheticTokenUpgrader.getProxyImplementation(msUSD.address)
      expect(msBTCImpl).eq(msUSDImpl)
    })

    describe('msBTC SyntheticToken', function () {
      it('token should have correct params', async function () {
        expect(await msBTC.poolRegistry()).eq(poolRegistry.address)
        expect(await msBTC.isActive()).eq(true)
        expect(await msBTC.symbol()).eq('msBTC')
        expect(await msBTC.name()).eq('Metronome Synth BTC')
      })

      it('should upgrade implementation', async function () {
        await upgradeTestCase({
          newImplFactory: await ethers.getContractFactory('SyntheticToken', deployer),
          proxy: msBTC,
          upgrader: syntheticTokenUpgrader,
          expectToFail: false,
        })
      })

      it('should fail if implementation breaks storage', async function () {
        await upgradeTestCase({
          newImplFactory: await ethers.getContractFactory('MasterOracleMock', deployer),
          proxy: msBTC,
          upgrader: syntheticTokenUpgrader,
          expectToFail: true,
        })
      })
    })

    describe('msUSD SyntheticToken', function () {
      it('msUSD token should have correct params', async function () {
        expect(await msUSD.poolRegistry()).eq(poolRegistry.address)
        expect(await msUSD.isActive()).eq(true)
        expect(await msUSD.symbol()).eq('msUSD')
        expect(await msUSD.name()).eq('Metronome Synth USD')
      })

      it('should upgrade implementation', async function () {
        await upgradeTestCase({
          newImplFactory: await ethers.getContractFactory('SyntheticToken', deployer),
          proxy: msUSD,
          upgrader: syntheticTokenUpgrader,
          expectToFail: false,
        })
      })

      it('should fail if implementation breaks storage', async function () {
        await upgradeTestCase({
          newImplFactory: await ethers.getContractFactory('MasterOracleMock', deployer),
          proxy: msUSD,
          upgrader: syntheticTokenUpgrader,
          expectToFail: true,
        })
      })
    })
  })

  describe('DebtToken', function () {
    describe('msBTC DebtToken', function () {
      it('token should have correct params', async function () {
        expect(await msBTCDebt.pool()).eq(pool.address)
        expect(await msBTCDebt.governor()).eq(deployer.address)
        expect(await msBTCDebt.interestRate()).eq(parseEther('0'))
        expect(await msBTCDebt.maxTotalSupply()).eq(parseEther('25'))
        expect(await msBTCDebt.isActive()).eq(true)
        expect(await msBTCDebt.symbol()).eq('msBTC-Debt-1')
        expect(await msBTCDebt.name()).eq('Metronome Synth BTC-Debt')
      })

      it('should upgrade implementation', async function () {
        await upgradeTestCase({
          newImplFactory: await ethers.getContractFactory('DebtToken', deployer),
          proxy: msBTCDebt,
          upgrader: debtTokenUpgrader,
          expectToFail: false,
        })
      })

      it('should fail if implementation breaks storage', async function () {
        await upgradeTestCase({
          newImplFactory: await ethers.getContractFactory('MasterOracleMock', deployer),
          proxy: msBTCDebt,
          upgrader: debtTokenUpgrader,
          expectToFail: true,
        })
      })
    })

    describe('msUSD DebtToken', function () {
      it(' token should have correct params', async function () {
        expect(await msUSDDebt.pool()).eq(pool.address)
        expect(await msUSDDebt.governor()).eq(deployer.address)
        expect(await msUSDDebt.interestRate()).eq(parseEther('0'))
        expect(await msUSDDebt.maxTotalSupply()).eq(parseEther('50000'))
        expect(await msUSDDebt.isActive()).eq(true)
        expect(await msUSDDebt.symbol()).eq('msUSD-Debt-1')
        expect(await msUSDDebt.name()).eq('Metronome Synth USD-Debt')
      })

      it('should upgrade implementation', async function () {
        await upgradeTestCase({
          newImplFactory: await ethers.getContractFactory('DebtToken', deployer),
          proxy: msUSDDebt,
          upgrader: debtTokenUpgrader,
          expectToFail: false,
        })
      })

      it('should fail if implementation breaks storage', async function () {
        await upgradeTestCase({
          newImplFactory: await ethers.getContractFactory('MasterOracleMock', deployer),
          proxy: msUSDDebt,
          upgrader: debtTokenUpgrader,
          expectToFail: true,
        })
      })
    })
  })

  describe('PoolRegistry', function () {
    it('should have correct params', async function () {
      expect(await poolRegistry.governor()).eq(deployer.address)
      expect(await poolRegistry.masterOracle()).eq(MASTER_ORACLE_ADDRESS)
      expect(await poolRegistry.isPoolRegistered(pool.address)).true
      expect(await poolRegistry.nativeTokenGateway()).eq(wethGateway.address)
    })

    it('should upgrade implementation', async function () {
      await upgradeTestCase({
        newImplFactory: await ethers.getContractFactory('PoolRegistry', deployer),
        proxy: poolRegistry,
        upgrader: poolRegistryUpgrader,
        expectToFail: false,
      })
    })
  })

  describe('FeeProvider', function () {
    it('should have correct params', async function () {
      expect(await feeProvider.depositFee()).eq(parseEther('0'))
      expect(await feeProvider.issueFee()).eq(parseEther('0'))
      expect(await feeProvider.withdrawFee()).eq(parseEther('0'))
      expect(await feeProvider.repayFee()).eq(parseEther('0'))
      expect(await feeProvider.defaultSwapFee()).eq(parseEther('0.0025'))
      const {liquidatorIncentive, protocolFee} = await feeProvider.liquidationFees()
      expect(liquidatorIncentive).eq(parseEther('0.1'))
      expect(protocolFee).eq(parseEther('0.08'))
    })

    it('should upgrade implementation', async function () {
      await upgradeTestCase({
        newImplFactory: await ethers.getContractFactory('FeeProvider', deployer),
        proxy: feeProvider,
        upgrader: feeProviderUpgrader,
        expectToFail: false,
      })
    })

    it('should fail if implementation breaks storage', async function () {
      await upgradeTestCase({
        newImplFactory: await ethers.getContractFactory('MasterOracleMock', deployer),
        proxy: feeProvider,
        upgrader: feeProviderUpgrader,
        expectToFail: true,
      })
    })
  })
})
