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
  DefaultOracleMock__factory,
  DefaultOracle,
  DefaultOracle__factory,
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
  UniswapV3PriceProvider,
  UniswapV2LikePriceProvider,
  ChainlinkPriceProvider,
  ChainlinkPriceProvider__factory,
  UniswapV2LikePriceProvider__factory,
  UniswapV3PriceProvider__factory,
  Controller,
  Controller__factory,
  WETHGateway,
  WETHGateway__factory,
  ControllerUpgrader,
  ControllerUpgrader__factory,
  MasterOracle__factory,
  MasterOracle,
  MasterOracleUpgrader__factory,
  MasterOracleUpgrader,
} from '../typechain'
import {disableForking, enableForking} from './helpers'
import Address from '../helpers/address'
import {parseEther} from 'ethers/lib/utils'

const {USDC_ADDRESS, NATIVE_TOKEN_ADDRESS, WAVAX_ADDRESS} = Address

describe('Deployments', function () {
  let deployer: SignerWithAddress
  let governor: SignerWithAddress
  let uniswapV3PriceProvider: UniswapV3PriceProvider
  let uniswapV2LikePriceProvider: UniswapV2LikePriceProvider
  let chainlinkPriceProvider: ChainlinkPriceProvider
  let defaultOracle: DefaultOracle
  let masterOracle: MasterOracle
  let masterOracleUpgrader: MasterOracleUpgrader
  let controller: Controller
  let controllerUpgrader: ControllerUpgrader
  let treasury: Treasury
  let treasuryUpgrader: TreasuryUpgrader
  let depositTokenUpgrader: DepositTokenUpgrader
  let vsdUSDC: DepositToken
  let vsdWAVAX: DepositToken
  let syntheticTokenUpgrader: SyntheticTokenUpgrader
  let vsBTC: SyntheticToken
  let vsUSD: SyntheticToken
  let debtTokenUpgrader: DebtTokenUpgrader
  let vsBTCDebt: DebtToken
  let vsUSDDebt: DebtToken
  let wethGateway: WETHGateway

  // Note: Enabling fork to be able to use MultiCall contract
  before(enableForking)

  after(disableForking)

  beforeEach(async function () {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[deployer, governor] = await ethers.getSigners()

    const {
      UniswapV3PriceProvider: {address: uniswapV3PriceProviderAddress},
      UniswapV2LikePriceProvider: {address: uniswapV2LikePriceProviderAddress},
      ChainlinkPriceProvider: {address: chainlinkPriceProviderAddress},
      DefaultOracle: {address: defaultOracleAddress},
      MasterOracle: {address: masterOracleAddress},
      MasterOracleUpgrader: {address: masterOracleUpgraderAddress},
      Controller: {address: controllerAddress},
      ControllerUpgrader: {address: controllerUpgraderAddress},
      Treasury: {address: treasuryAddress},
      TreasuryUpgrader: {address: treasuryUpgraderAddress},
      DepositTokenUpgrader: {address: depositTokenUpgraderAddress},
      USDCDepositToken: {address: usdcDepositTokenAddress},
      WAVAXDepositToken: {address: wavaxDepositTokenAddress},
      SyntheticTokenUpgrader: {address: syntheticTokenUpgraderAddress},
      VsBTCSynthetic: {address: vsBTCAddress},
      VsUSDSynthetic: {address: vsUSDAddress},
      DebtTokenUpgrader: {address: debtTokenUpgraderAddress},
      VsBTCDebt: {address: vsBTCDebtTokenAddress},
      VsUSDDebt: {address: vsUSDDebtTokenAddress},
      WETHGateway: {address: wethGatewayAddress},
    } = await deployments.fixture()

    uniswapV3PriceProvider = UniswapV3PriceProvider__factory.connect(uniswapV3PriceProviderAddress, deployer)
    uniswapV2LikePriceProvider = UniswapV2LikePriceProvider__factory.connect(
      uniswapV2LikePriceProviderAddress,
      deployer
    )
    chainlinkPriceProvider = ChainlinkPriceProvider__factory.connect(chainlinkPriceProviderAddress, deployer)
    defaultOracle = DefaultOracle__factory.connect(defaultOracleAddress, deployer)

    masterOracle = MasterOracle__factory.connect(masterOracleAddress, deployer)
    masterOracleUpgrader = MasterOracleUpgrader__factory.connect(masterOracleUpgraderAddress, deployer)

    controller = Controller__factory.connect(controllerAddress, deployer)
    controllerUpgrader = ControllerUpgrader__factory.connect(controllerUpgraderAddress, deployer)

    treasury = Treasury__factory.connect(treasuryAddress, deployer)
    treasuryUpgrader = TreasuryUpgrader__factory.connect(treasuryUpgraderAddress, deployer)

    wethGateway = WETHGateway__factory.connect(wethGatewayAddress, deployer)

    depositTokenUpgrader = DepositTokenUpgrader__factory.connect(depositTokenUpgraderAddress, deployer)
    vsdUSDC = DepositToken__factory.connect(usdcDepositTokenAddress, deployer)
    vsdWAVAX = DepositToken__factory.connect(wavaxDepositTokenAddress, deployer)

    syntheticTokenUpgrader = SyntheticTokenUpgrader__factory.connect(syntheticTokenUpgraderAddress, deployer)
    vsBTC = SyntheticToken__factory.connect(vsBTCAddress, deployer)
    vsUSD = SyntheticToken__factory.connect(vsUSDAddress, deployer)

    debtTokenUpgrader = DebtTokenUpgrader__factory.connect(debtTokenUpgraderAddress, deployer)
    vsBTCDebt = DebtToken__factory.connect(vsBTCDebtTokenAddress, deployer)
    vsUSDDebt = DebtToken__factory.connect(vsUSDDebtTokenAddress, deployer)
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

  describe('DefaultOracle', function () {
    it('should have correct params', async function () {
      const Protocol = {
        NONE: 0,
        UNISWAP_V3: 1,
        UNISWAP_V2: 2,
        CHAINLINK: 3,
      }

      expect(await defaultOracle.providerByProtocol(Protocol.UNISWAP_V3)).eq(uniswapV3PriceProvider.address)
      expect(await defaultOracle.providerByProtocol(Protocol.UNISWAP_V2)).eq(uniswapV2LikePriceProvider.address)
      expect(await defaultOracle.providerByProtocol(Protocol.CHAINLINK)).eq(chainlinkPriceProvider.address)

      expect(await defaultOracle.governor()).eq(deployer.address)
      await defaultOracle.connect(governor).acceptGovernorship()
      expect(await defaultOracle.governor()).eq(governor.address)
    })
  })

  describe('MasterOracle', function () {
    it('should have correct params', async function () {
      expect(await masterOracle.defaultOracle()).eq(defaultOracle.address)
      expect(await masterOracle.governor()).eq(deployer.address)
      await masterOracle.connect(governor).acceptGovernorship()
      expect(await masterOracle.governor()).eq(governor.address)
    })

    it('should upgrade implementation', async function () {
      await upgradeTestcase({
        newImplfactory: new MasterOracle__factory(deployer),
        proxy: masterOracle,
        upgrader: masterOracleUpgrader,
        expectToFail: false,
      })
    })

    it('should fail if implementation breaks storage', async function () {
      await upgradeTestcase({
        newImplfactory: new DefaultOracleMock__factory(deployer),
        proxy: masterOracle,
        upgrader: masterOracleUpgrader,
        expectToFail: true,
      })
    })
  })

  describe('Controller', function () {
    it('should have correct params', async function () {
      expect(await controller.treasury()).eq(treasury.address)
      expect(await controller.masterOracle()).eq(masterOracle.address)
      expect(await controller.governor()).eq(deployer.address)
      await controller.connect(governor).acceptGovernorship()
      expect(await controller.governor()).eq(governor.address)
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
        newImplfactory: new DefaultOracleMock__factory(deployer),
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

  describe('WETHGateway', function () {
    it('should have correct params', async function () {
      expect(await wethGateway.weth()).eq(NATIVE_TOKEN_ADDRESS)

      expect(await controller.governor()).eq(deployer.address)
      await defaultOracle.connect(governor).acceptGovernorship()
      expect(await defaultOracle.governor()).eq(governor.address)
    })
  })

  describe('DepositToken', function () {
    describe('USDC DepositToken', function () {
      it('token should have correct params', async function () {
        expect(await vsdUSDC.controller()).eq(controller.address)
        expect(await vsdUSDC.underlying()).eq(USDC_ADDRESS)
        expect(await vsdUSDC.governor()).eq(deployer.address)
      })

      it('should upgrade implementation', async function () {
        await upgradeTestcase({
          newImplfactory: new DepositToken__factory(deployer),
          proxy: vsdUSDC,
          upgrader: depositTokenUpgrader,
          expectToFail: false,
        })
      })

      it('should fail if implementation breaks storage', async function () {
        await upgradeTestcase({
          newImplfactory: new DefaultOracleMock__factory(deployer),
          proxy: vsdUSDC,
          upgrader: depositTokenUpgrader,
          expectToFail: true,
        })
      })
    })

    describe('WAVAX DepositToken', function () {
      it('token should have correct params', async function () {
        expect(await vsdWAVAX.controller()).eq(controller.address)
        expect(await vsdWAVAX.underlying()).eq(WAVAX_ADDRESS)
        expect(await vsdWAVAX.governor()).eq(deployer.address)
      })

      it('should upgrade implementation', async function () {
        await upgradeTestcase({
          newImplfactory: new DepositToken__factory(deployer),
          proxy: vsdWAVAX,
          upgrader: depositTokenUpgrader,
          expectToFail: false,
        })
      })

      it('should fail if implementation breaks storage', async function () {
        await upgradeTestcase({
          newImplfactory: new DefaultOracleMock__factory(deployer),
          proxy: vsdWAVAX,
          upgrader: depositTokenUpgrader,
          expectToFail: true,
        })
      })
    })
  })

  describe('SyntheticToken', function () {
    describe('vsBTC SyntheticToken', function () {
      it('token should have correct params', async function () {
        expect(await vsBTC.controller()).eq(controller.address)
        expect(await vsBTC.debtToken()).eq(vsBTCDebt.address)
        expect(await vsBTC.governor()).eq(deployer.address)
        expect(await vsBTC.interestRate()).eq(parseEther('0'))
      })

      it('should upgrade implementation', async function () {
        await upgradeTestcase({
          newImplfactory: new SyntheticToken__factory(deployer),
          proxy: vsBTC,
          upgrader: syntheticTokenUpgrader,
          expectToFail: false,
        })
      })

      it('should fail if implementation breaks storage', async function () {
        await upgradeTestcase({
          newImplfactory: new DefaultOracleMock__factory(deployer),
          proxy: vsBTC,
          upgrader: syntheticTokenUpgrader,
          expectToFail: true,
        })
      })
    })

    describe('vsUSD SyntheticToken', function () {
      it('vsUSD token should have correct params', async function () {
        expect(await vsUSD.controller()).eq(controller.address)
        expect(await vsUSD.debtToken()).eq(vsUSDDebt.address)
        expect(await vsUSD.governor()).eq(deployer.address)
        expect(await vsUSD.interestRate()).eq(parseEther('0'))
      })

      it('should upgrade implementation', async function () {
        await upgradeTestcase({
          newImplfactory: new SyntheticToken__factory(deployer),
          proxy: vsUSD,
          upgrader: syntheticTokenUpgrader,
          expectToFail: false,
        })
      })

      it('should fail if implementation breaks storage', async function () {
        await upgradeTestcase({
          newImplfactory: new DefaultOracleMock__factory(deployer),
          proxy: vsUSD,
          upgrader: syntheticTokenUpgrader,
          expectToFail: true,
        })
      })
    })
  })

  describe('DebtToken', function () {
    describe('vsBTC DebtToken', function () {
      it('token should have correct params', async function () {
        expect(await vsBTCDebt.controller()).eq(controller.address)
        expect(await vsBTCDebt.governor()).eq(deployer.address)
      })

      it('should upgrade implementation', async function () {
        await upgradeTestcase({
          newImplfactory: new DebtToken__factory(deployer),
          proxy: vsBTCDebt,
          upgrader: debtTokenUpgrader,
          expectToFail: false,
        })
      })

      it('should fail if implementation breaks storage', async function () {
        await upgradeTestcase({
          newImplfactory: new DefaultOracleMock__factory(deployer),
          proxy: vsBTCDebt,
          upgrader: debtTokenUpgrader,
          expectToFail: true,
        })
      })
    })

    describe('vsUSD DebtToken', function () {
      it(' token should have correct params', async function () {
        expect(await vsUSDDebt.controller()).eq(controller.address)
        expect(await vsUSDDebt.governor()).eq(deployer.address)
      })

      it('should upgrade implementation', async function () {
        await upgradeTestcase({
          newImplfactory: new DebtToken__factory(deployer),
          proxy: vsUSDDebt,
          upgrader: debtTokenUpgrader,
          expectToFail: false,
        })
      })

      it('should fail if implementation breaks storage', async function () {
        await upgradeTestcase({
          newImplfactory: new DefaultOracleMock__factory(deployer),
          proxy: vsUSDDebt,
          upgrader: debtTokenUpgrader,
          expectToFail: true,
        })
      })
    })
  })
})
