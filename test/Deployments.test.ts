/* eslint-disable camelcase */
import {Contract, ContractFactory} from '@ethersproject/contracts'
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {expect} from 'chai'
import {deployments, ethers} from 'hardhat'
import {
  DebtToken,
  DebtToken__factory,
  DepositToken,
  DepositToken__factory,
  MasterOracleMock__factory,
  SyntheticToken,
  SyntheticToken__factory,
  Treasury,
  Treasury__factory,
  TreasuryUpgrader,
  TreasuryUpgrader__factory,
  DepositTokenUpgrader,
  SyntheticTokenUpgrader,
  DebtTokenUpgrader,
  DepositTokenUpgrader__factory,
  SyntheticTokenUpgrader__factory,
  DebtTokenUpgrader__factory,
  UpgraderBase,
  Controller,
  Controller__factory,
  NativeTokenGateway,
  NativeTokenGateway__factory,
  ControllerUpgrader,
  ControllerUpgrader__factory,
  PoolRegistry__factory,
  PoolRegistry,
  PoolRegistryUpgrader,
  PoolRegistryUpgrader__factory,
} from '../typechain'
import {disableForking, enableForking} from './helpers'
import Address from '../helpers/address'
import {parseEther} from 'ethers/lib/utils'

const {USDC_ADDRESS, NATIVE_TOKEN_ADDRESS, WAVAX_ADDRESS, MASTER_ORACLE_ADDRESS} = Address

describe('Deployments', function () {
  let deployer: SignerWithAddress
  let controller: Controller
  let controllerUpgrader: ControllerUpgrader
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

  // Note: Enabling fork to be able to use MultiCall contract
  before(enableForking)

  after(disableForking)

  beforeEach(async function () {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[deployer] = await ethers.getSigners()

    const {
      Controller: {address: controllerAddress},
      ControllerUpgrader: {address: controllerUpgraderAddress},
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
    } = await deployments.fixture()

    controller = Controller__factory.connect(controllerAddress, deployer)
    controllerUpgrader = ControllerUpgrader__factory.connect(controllerUpgraderAddress, deployer)

    treasury = Treasury__factory.connect(treasuryAddress, deployer)
    treasuryUpgrader = TreasuryUpgrader__factory.connect(treasuryUpgraderAddress, deployer)

    wethGateway = NativeTokenGateway__factory.connect(wethGatewayAddress, deployer)

    depositTokenUpgrader = DepositTokenUpgrader__factory.connect(depositTokenUpgraderAddress, deployer)
    msdUSDC = DepositToken__factory.connect(usdcDepositTokenAddress, deployer)
    msdWAVAX = DepositToken__factory.connect(wavaxDepositTokenAddress, deployer)

    syntheticTokenUpgrader = SyntheticTokenUpgrader__factory.connect(syntheticTokenUpgraderAddress, deployer)
    msBTC = SyntheticToken__factory.connect(msBTCAddress, deployer)
    msUSD = SyntheticToken__factory.connect(msUSDAddress, deployer)

    debtTokenUpgrader = DebtTokenUpgrader__factory.connect(debtTokenUpgraderAddress, deployer)
    msBTCDebt = DebtToken__factory.connect(msBTCDebtTokenAddress, deployer)
    msUSDDebt = DebtToken__factory.connect(msUSDDebtTokenAddress, deployer)

    poolRegistry = PoolRegistry__factory.connect(poolRegistryAddress, deployer)
    poolRegistryUpgrader = PoolRegistryUpgrader__factory.connect(poolRegistryUpgraderAddress, deployer)
  })

  const upgradeTestcase = async function ({
    proxy,
    upgrader,
    newImplfactory,
    expectToFail,
  }: {
    proxy: Contract
    upgrader: UpgraderBase
    newImplfactory: ContractFactory
    expectToFail: boolean
  }) {
    // given
    const newImpl = await newImplfactory.deploy()
    await newImpl.deployed()

    const oldImpl = await upgrader.getProxyImplementation(proxy.address)
    expect(oldImpl).not.eq(newImpl.address)

    // when
    const tx = upgrader.upgrade(proxy.address, newImpl.address)

    // then
    if (expectToFail) {
      await expect(tx).reverted
    } else {
      await tx
      expect(await upgrader.getProxyImplementation(proxy.address)).eq(newImpl.address)
    }
  }

  describe('Controller', function () {
    it('should have correct params', async function () {
      expect(await controller.treasury()).eq(treasury.address)
      expect(await controller.masterOracle()).eq(MASTER_ORACLE_ADDRESS)
      expect(await controller.governor()).eq(deployer.address)
      expect(await controller.proposedGovernor()).eq(ethers.constants.AddressZero)
    })

    it('should upgrade implementation', async function () {
      await upgradeTestcase({
        newImplfactory: new Controller__factory(deployer),
        proxy: controller,
        upgrader: controllerUpgrader,
        expectToFail: false,
      })
    })

    it('should fail if implementation breaks storage', async function () {
      await upgradeTestcase({
        newImplfactory: new MasterOracleMock__factory(deployer),
        proxy: controller,
        upgrader: controllerUpgrader,
        expectToFail: true,
      })
    })
  })

  describe('Treasury', function () {
    it('should have correct params', async function () {
      expect(await treasury.controller()).eq(controller.address)
      expect(await treasury.governor()).eq(deployer.address)
    })

    it('should upgrade implementation', async function () {
      await upgradeTestcase({
        newImplfactory: new Treasury__factory(deployer),
        proxy: treasury,
        upgrader: treasuryUpgrader,
        expectToFail: false,
      })
    })
  })

  describe('NativeTokenGateway', function () {
    it('should have correct params', async function () {
      expect(await wethGateway.nativeToken()).eq(NATIVE_TOKEN_ADDRESS)
      expect(await wethGateway.governor()).eq(deployer.address)
      expect(await wethGateway.proposedGovernor()).eq(ethers.constants.AddressZero)
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
        expect(await msdUSDC.controller()).eq(controller.address)
        expect(await msdUSDC.underlying()).eq(USDC_ADDRESS)
        expect(await msdUSDC.governor()).eq(deployer.address)
      })

      it('should upgrade implementation', async function () {
        await upgradeTestcase({
          newImplfactory: new DepositToken__factory(deployer),
          proxy: msdUSDC,
          upgrader: depositTokenUpgrader,
          expectToFail: false,
        })
      })

      it('should fail if implementation breaks storage', async function () {
        await upgradeTestcase({
          newImplfactory: new MasterOracleMock__factory(deployer),
          proxy: msdUSDC,
          upgrader: depositTokenUpgrader,
          expectToFail: true,
        })
      })
    })

    describe('WAVAX DepositToken', function () {
      it('token should have correct params', async function () {
        expect(await msdWAVAX.controller()).eq(controller.address)
        expect(await msdWAVAX.underlying()).eq(WAVAX_ADDRESS)
        expect(await msdWAVAX.governor()).eq(deployer.address)
      })

      it('should upgrade implementation', async function () {
        await upgradeTestcase({
          newImplfactory: new DepositToken__factory(deployer),
          proxy: msdWAVAX,
          upgrader: depositTokenUpgrader,
          expectToFail: false,
        })
      })

      it('should fail if implementation breaks storage', async function () {
        await upgradeTestcase({
          newImplfactory: new MasterOracleMock__factory(deployer),
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
        expect(await msBTC.controller()).eq(controller.address)
        expect(await msBTC.governor()).eq(deployer.address)
        expect(await msBTC.interestRate()).eq(parseEther('0'))
      })

      it('should upgrade implementation', async function () {
        await upgradeTestcase({
          newImplfactory: new SyntheticToken__factory(deployer),
          proxy: msBTC,
          upgrader: syntheticTokenUpgrader,
          expectToFail: false,
        })
      })

      it('should fail if implementation breaks storage', async function () {
        await upgradeTestcase({
          newImplfactory: new MasterOracleMock__factory(deployer),
          proxy: msBTC,
          upgrader: syntheticTokenUpgrader,
          expectToFail: true,
        })
      })
    })

    describe('msUSD SyntheticToken', function () {
      it('msUSD token should have correct params', async function () {
        expect(await msUSD.controller()).eq(controller.address)
        expect(await msUSD.governor()).eq(deployer.address)
        expect(await msUSD.interestRate()).eq(parseEther('0'))
      })

      it('should upgrade implementation', async function () {
        await upgradeTestcase({
          newImplfactory: new SyntheticToken__factory(deployer),
          proxy: msUSD,
          upgrader: syntheticTokenUpgrader,
          expectToFail: false,
        })
      })

      it('should fail if implementation breaks storage', async function () {
        await upgradeTestcase({
          newImplfactory: new MasterOracleMock__factory(deployer),
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
        expect(await msBTCDebt.controller()).eq(controller.address)
        expect(await msBTCDebt.governor()).eq(deployer.address)
      })

      it('should upgrade implementation', async function () {
        await upgradeTestcase({
          newImplfactory: new DebtToken__factory(deployer),
          proxy: msBTCDebt,
          upgrader: debtTokenUpgrader,
          expectToFail: false,
        })
      })

      it('should fail if implementation breaks storage', async function () {
        await upgradeTestcase({
          newImplfactory: new MasterOracleMock__factory(deployer),
          proxy: msBTCDebt,
          upgrader: debtTokenUpgrader,
          expectToFail: true,
        })
      })
    })

    describe('msUSD DebtToken', function () {
      it(' token should have correct params', async function () {
        expect(await msUSDDebt.controller()).eq(controller.address)
        expect(await msUSDDebt.governor()).eq(deployer.address)
      })

      it('should upgrade implementation', async function () {
        await upgradeTestcase({
          newImplfactory: new DebtToken__factory(deployer),
          proxy: msUSDDebt,
          upgrader: debtTokenUpgrader,
          expectToFail: false,
        })
      })

      it('should fail if implementation breaks storage', async function () {
        await upgradeTestcase({
          newImplfactory: new MasterOracleMock__factory(deployer),
          proxy: msUSDDebt,
          upgrader: debtTokenUpgrader,
          expectToFail: true,
        })
      })
    })

    describe('PoolRegistry', function () {
      it('should have correct params', async function () {
        expect(await poolRegistry.governor()).eq(deployer.address)
      })

      it('should upgrade implementation', async function () {
        await upgradeTestcase({
          newImplfactory: new PoolRegistry__factory(deployer),
          proxy: poolRegistry,
          upgrader: poolRegistryUpgrader,
          expectToFail: false,
        })
      })
    })
  })
})
