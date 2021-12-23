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
  VSynth,
  VSynth__factory,
  OracleMock__factory,
  Oracle,
  Oracle__factory,
  SyntheticAsset,
  SyntheticAsset__factory,
  Treasury,
  Treasury__factory,
  VSynthUpgrader,
  VSynthUpgrader__factory,
  TreasuryUpgrader,
  TreasuryUpgrader__factory,
  DepositTokenUpgrader,
  SyntheticAssetUpgrader,
  DebtTokenUpgrader,
  DepositTokenUpgrader__factory,
  SyntheticAssetUpgrader__factory,
  DebtTokenUpgrader__factory,
  UpgraderBase,
  UniswapV3PriceProvider,
  UniswapV2PriceProvider,
  ChainlinkPriceProvider,
  ChainlinkPriceProvider__factory,
  UniswapV2PriceProvider__factory,
  UniswapV3PriceProvider__factory,
  Issuer,
  IssuerUpgrader,
  IssuerUpgrader__factory,
  Issuer__factory,
} from '../typechain'
import {disableForking, enableForking} from './helpers'
import Address from '../helpers/address'
import {parseEther} from 'ethers/lib/utils'

const {MET_ADDRESS} = Address

describe('Deployments', function () {
  let deployer: SignerWithAddress
  let governor: SignerWithAddress
  let uniswapV3PriceProvider: UniswapV3PriceProvider
  let uniswapV2PriceProvider: UniswapV2PriceProvider
  let chainlinkPriceProvider: ChainlinkPriceProvider
  let oracle: Oracle
  let issuer: Issuer
  let issuerUpgrader: IssuerUpgrader
  let vSynth: VSynth
  let vSynthUpgrader: VSynthUpgrader
  let treasury: Treasury
  let treasuryUpgrader: TreasuryUpgrader
  let metDepositToken: DepositToken
  let depositTokenUpgrader: DepositTokenUpgrader
  let vsEth: SyntheticAsset
  let syntheticAssetUpgrader: SyntheticAssetUpgrader
  let vsEthDebtToken: DebtToken
  let debtTokenUpgrader: DebtTokenUpgrader

  // Note: Enabling fork to be able to use MultiCall contract
  before(enableForking)

  after(disableForking)

  beforeEach(async function () {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[deployer, governor] = await ethers.getSigners()

    const {
      UniswapV3PriceProvider: {address: uniswapV3PriceProviderAddress},
      UniswapV2PriceProvider: {address: uniswapV2PriceProviderAddress},
      ChainlinkPriceProvider: {address: chainlinkPriceProviderAddress},
      Oracle: {address: oracleAddress},
      Issuer: {address: issuerAddress},
      IssuerUpgrader: {address: issuerUpgraderAddress},
      VSynth: {address: vSynthAddress},
      VSynthUpgrader: {address: vSynthUpgraderAddress},
      Treasury: {address: treasuryAddress},
      TreasuryUpgrader: {address: treasuryUpgraderAddress},
      MetDepositToken: {address: metDepositTokenAddress},
      DepositTokenUpgrader: {address: depositTokenUpgraderAddress},
      VsEth: {address: vsEthAddress},
      SyntheticAssetUpgrader: {address: syntheticAssetUpgraderAddress},
      VsEthDebtToken: {address: vsETHDebtTokenAddress},
      DebtTokenUpgrader: {address: debtTokenUpgraderAddress},
    } = await deployments.fixture()

    uniswapV3PriceProvider = UniswapV3PriceProvider__factory.connect(uniswapV3PriceProviderAddress, deployer)
    uniswapV2PriceProvider = UniswapV2PriceProvider__factory.connect(uniswapV2PriceProviderAddress, deployer)
    chainlinkPriceProvider = ChainlinkPriceProvider__factory.connect(chainlinkPriceProviderAddress, deployer)
    oracle = Oracle__factory.connect(oracleAddress, deployer)

    issuer = Issuer__factory.connect(issuerAddress, deployer)
    issuerUpgrader = IssuerUpgrader__factory.connect(issuerUpgraderAddress, deployer)

    vSynth = VSynth__factory.connect(vSynthAddress, deployer)
    vSynthUpgrader = VSynthUpgrader__factory.connect(vSynthUpgraderAddress, deployer)

    treasury = Treasury__factory.connect(treasuryAddress, deployer)
    treasuryUpgrader = TreasuryUpgrader__factory.connect(treasuryUpgraderAddress, deployer)

    metDepositToken = DepositToken__factory.connect(metDepositTokenAddress, deployer)
    depositTokenUpgrader = DepositTokenUpgrader__factory.connect(depositTokenUpgraderAddress, deployer)

    vsEth = SyntheticAsset__factory.connect(vsEthAddress, deployer)
    syntheticAssetUpgrader = SyntheticAssetUpgrader__factory.connect(syntheticAssetUpgraderAddress, deployer)

    vsEthDebtToken = DebtToken__factory.connect(vsETHDebtTokenAddress, deployer)
    debtTokenUpgrader = DebtTokenUpgrader__factory.connect(debtTokenUpgraderAddress, deployer)
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
    expect(oldImpl).to.not.eq(newImpl.address)

    // when
    const tx = upgrader.upgrade(proxy.address, newImpl.address)

    // then
    if (expectToFail) {
      await expect(tx).to.reverted
    } else {
      await tx
      expect(await upgrader.getProxyImplementation(proxy.address)).to.eq(newImpl.address)
    }
  }

  describe('Oracle', function () {
    it('should have correct params', async function () {
      const Protocol = {
        NONE: 0,
        UNISWAP_V3: 1,
        UNISWAP_V2: 2,
        CHAINLINK: 3,
      }

      expect(await oracle.providerByProtocol(Protocol.UNISWAP_V3)).to.eq(uniswapV3PriceProvider.address)
      expect(await oracle.providerByProtocol(Protocol.UNISWAP_V2)).to.eq(uniswapV2PriceProvider.address)
      expect(await oracle.providerByProtocol(Protocol.CHAINLINK)).to.eq(chainlinkPriceProvider.address)

      expect(await vSynth.governor()).to.eq(deployer.address)
      await oracle.connect(governor).acceptGovernorship()
      expect(await oracle.governor()).to.eq(governor.address)
    })
  })

  describe('Issuer', function () {
    it('should have correct params', async function () {
      expect(await issuer.vSynth()).to.eq(vSynth.address)
      expect(await issuer.met()).to.eq(await metDepositToken.underlying())
      expect(await issuer.syntheticAssets(0)).to.eq(vsEth.address)
      expect(await issuer.vsEth()).to.eq(vsEth.address)
      expect(await issuer.oracle()).to.eq(oracle.address)
      expect(await issuer.governor()).to.eq(deployer.address)
      await issuer.connect(governor).acceptGovernorship()
      expect(await issuer.governor()).to.eq(governor.address)
    })

    it('should upgrade implementation', async function () {
      await upgradeTestcase({
        newImplfactory: new Issuer__factory(deployer),
        proxy: issuer,
        upgrader: issuerUpgrader,
        expectToFail: false,
      })
    })

    it('should fail if implementation breaks storage', async function () {
      await upgradeTestcase({
        newImplfactory: new OracleMock__factory(deployer),
        proxy: issuer,
        upgrader: issuerUpgrader,
        expectToFail: true,
      })
    })
  })

  describe('VSynth', function () {
    it('should have correct params', async function () {
      expect(await vSynth.treasury()).to.eq(treasury.address)
      expect(await vSynth.issuer()).to.eq(issuer.address)
      expect(await vSynth.oracle()).to.eq(oracle.address)
      expect(await vSynth.governor()).to.eq(deployer.address)
      await vSynth.connect(governor).acceptGovernorship()
      expect(await vSynth.governor()).to.eq(governor.address)
    })

    it('should upgrade implementation', async function () {
      await upgradeTestcase({
        newImplfactory: new VSynth__factory(deployer),
        proxy: vSynth,
        upgrader: vSynthUpgrader,
        expectToFail: false,
      })
    })

    it('should fail if implementation breaks storage', async function () {
      await upgradeTestcase({
        newImplfactory: new OracleMock__factory(deployer),
        proxy: vSynth,
        upgrader: vSynthUpgrader,
        expectToFail: true,
      })
    })
  })

  describe('Treasury', function () {
    it('should have correct params', async function () {
      expect(await treasury.vSynth()).to.eq(vSynth.address)
      expect(await treasury.governor()).to.eq(deployer.address)
      await treasury.connect(governor).acceptGovernorship()
      expect(await treasury.governor()).to.eq(governor.address)
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

  describe('DepositToken', function () {
    it('deposit token should have correct params', async function () {
      expect(await metDepositToken.issuer()).to.eq(issuer.address)
      expect(await metDepositToken.oracle()).to.eq(oracle.address)
      expect(await metDepositToken.underlying()).to.eq(MET_ADDRESS)
      expect(await metDepositToken.governor()).to.eq(deployer.address)
      await metDepositToken.connect(governor).acceptGovernorship()
      expect(await metDepositToken.governor()).to.eq(governor.address)
    })

    it('should upgrade implementation', async function () {
      await upgradeTestcase({
        newImplfactory: new DepositToken__factory(deployer),
        proxy: metDepositToken,
        upgrader: depositTokenUpgrader,
        expectToFail: false,
      })
    })

    it('should fail if implementation breaks storage', async function () {
      await upgradeTestcase({
        newImplfactory: new OracleMock__factory(deployer),
        proxy: metDepositToken,
        upgrader: depositTokenUpgrader,
        expectToFail: true,
      })
    })
  })

  describe('SyntheticAsset', function () {
    it('vsETH token should have correct params', async function () {
      expect(await vsEth.issuer()).to.eq(issuer.address)
      expect(await vsEth.debtToken()).to.eq(vsEthDebtToken.address)
      expect(await vsEth.governor()).to.eq(deployer.address)
      expect(await vsEth.interestRate()).to.eq(parseEther('0'))
      await vsEth.connect(governor).acceptGovernorship()
      expect(await vsEth.governor()).to.eq(governor.address)
    })

    it('should upgrade implementation', async function () {
      await upgradeTestcase({
        newImplfactory: new SyntheticAsset__factory(deployer),
        proxy: vsEth,
        upgrader: syntheticAssetUpgrader,
        expectToFail: false,
      })
    })

    it('should fail if implementation breaks storage', async function () {
      await upgradeTestcase({
        newImplfactory: new OracleMock__factory(deployer),
        proxy: vsEth,
        upgrader: syntheticAssetUpgrader,
        expectToFail: true,
      })
    })
  })

  describe('DebtToken', function () {
    it('vsETH debt token should have correct params', async function () {
      expect(await vsEthDebtToken.issuer()).to.eq(issuer.address)
      expect(await vsEthDebtToken.governor()).to.eq(deployer.address)
      await vsEthDebtToken.connect(governor).acceptGovernorship()
      expect(await vsEthDebtToken.governor()).to.eq(governor.address)
    })

    it('should upgrade implementation', async function () {
      await upgradeTestcase({
        newImplfactory: new DebtToken__factory(deployer),
        proxy: vsEthDebtToken,
        upgrader: debtTokenUpgrader,
        expectToFail: false,
      })
    })

    it('should fail if implementation breaks storage', async function () {
      await upgradeTestcase({
        newImplfactory: new OracleMock__factory(deployer),
        proxy: vsEthDebtToken,
        upgrader: debtTokenUpgrader,
        expectToFail: true,
      })
    })
  })
})
