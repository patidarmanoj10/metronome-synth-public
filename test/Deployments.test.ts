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
  MBox,
  MBox__factory,
  OracleMock__factory,
  Oracle,
  Oracle__factory,
  SyntheticAsset,
  SyntheticAsset__factory,
  Treasury,
  Treasury__factory,
  MBoxUpgrader,
  MBoxUpgrader__factory,
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
  let mBox: MBox
  let mBoxUpgrader: MBoxUpgrader
  let treasury: Treasury
  let treasuryUpgrader: TreasuryUpgrader
  let metDepositToken: DepositToken
  let depositTokenUpgrader: DepositTokenUpgrader
  let mEth: SyntheticAsset
  let syntheticAssetUpgrader: SyntheticAssetUpgrader
  let mEthDebtToken: DebtToken
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
      MBox: {address: mboxAddress},
      MBoxUpgrader: {address: mBoxUpgraderAddress},
      Treasury: {address: treasuryAddress},
      TreasuryUpgrader: {address: treasuryUpgraderAddress},
      MetDepositToken: {address: metDepositTokenAddress},
      DepositTokenUpgrader: {address: depositTokenUpgraderAddress},
      MEth: {address: mEthAddress},
      SyntheticAssetUpgrader: {address: syntheticAssetUpgraderAddress},
      MEthDebtToken: {address: mETHDebtTokenAddress},
      DebtTokenUpgrader: {address: debtTokenUpgraderAddress},
    } = await deployments.fixture()

    uniswapV3PriceProvider = UniswapV3PriceProvider__factory.connect(uniswapV3PriceProviderAddress, deployer)
    uniswapV2PriceProvider = UniswapV2PriceProvider__factory.connect(uniswapV2PriceProviderAddress, deployer)
    chainlinkPriceProvider = ChainlinkPriceProvider__factory.connect(chainlinkPriceProviderAddress, deployer)
    oracle = Oracle__factory.connect(oracleAddress, deployer)

    issuer = Issuer__factory.connect(issuerAddress, deployer)
    issuerUpgrader = IssuerUpgrader__factory.connect(issuerUpgraderAddress, deployer)

    mBox = MBox__factory.connect(mboxAddress, deployer)
    mBoxUpgrader = MBoxUpgrader__factory.connect(mBoxUpgraderAddress, deployer)

    treasury = Treasury__factory.connect(treasuryAddress, deployer)
    treasuryUpgrader = TreasuryUpgrader__factory.connect(treasuryUpgraderAddress, deployer)

    metDepositToken = DepositToken__factory.connect(metDepositTokenAddress, deployer)
    depositTokenUpgrader = DepositTokenUpgrader__factory.connect(depositTokenUpgraderAddress, deployer)

    mEth = SyntheticAsset__factory.connect(mEthAddress, deployer)
    syntheticAssetUpgrader = SyntheticAssetUpgrader__factory.connect(syntheticAssetUpgraderAddress, deployer)

    mEthDebtToken = DebtToken__factory.connect(mETHDebtTokenAddress, deployer)
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

      expect(await mBox.governor()).to.eq(deployer.address)
      await oracle.connect(governor).acceptGovernorship()
      expect(await oracle.governor()).to.eq(governor.address)
    })
  })

  describe('Issuer', function () {
    it('should have correct params', async function () {
      expect(await issuer.mBox()).to.eq(mBox.address)
      expect(await issuer.met()).to.eq(await metDepositToken.underlying())
      expect(await issuer.syntheticAssets(0)).to.eq(mEth.address)
      expect(await issuer.mEth()).to.eq(mEth.address)
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

  describe('MBox', function () {
    it('should have correct params', async function () {
      expect(await mBox.treasury()).to.eq(treasury.address)
      expect(await mBox.issuer()).to.eq(issuer.address)
      expect(await mBox.oracle()).to.eq(oracle.address)
      expect(await mBox.governor()).to.eq(deployer.address)
      await mBox.connect(governor).acceptGovernorship()
      expect(await mBox.governor()).to.eq(governor.address)
    })

    it('should upgrade implementation', async function () {
      await upgradeTestcase({
        newImplfactory: new MBox__factory(deployer),
        proxy: mBox,
        upgrader: mBoxUpgrader,
        expectToFail: false,
      })
    })

    it('should fail if implementation breaks storage', async function () {
      await upgradeTestcase({
        newImplfactory: new OracleMock__factory(deployer),
        proxy: mBox,
        upgrader: mBoxUpgrader,
        expectToFail: true,
      })
    })
  })

  describe('Treasury', function () {
    it('should have correct params', async function () {
      expect(await treasury.mBox()).to.eq(mBox.address)
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
    it('mETH token should have correct params', async function () {
      expect(await mEth.issuer()).to.eq(issuer.address)
      expect(await mEth.debtToken()).to.eq(mEthDebtToken.address)
      expect(await mEth.governor()).to.eq(deployer.address)
      await mEth.connect(governor).acceptGovernorship()
      expect(await mEth.governor()).to.eq(governor.address)
    })

    it('should upgrade implementation', async function () {
      await upgradeTestcase({
        newImplfactory: new SyntheticAsset__factory(deployer),
        proxy: mEth,
        upgrader: syntheticAssetUpgrader,
        expectToFail: false,
      })
    })

    it('should fail if implementation breaks storage', async function () {
      await upgradeTestcase({
        newImplfactory: new OracleMock__factory(deployer),
        proxy: mEth,
        upgrader: syntheticAssetUpgrader,
        expectToFail: true,
      })
    })
  })

  describe('DebtToken', function () {
    it('mETH debt token should have correct params', async function () {
      expect(await mEthDebtToken.issuer()).to.eq(issuer.address)
      expect(await mEthDebtToken.governor()).to.eq(deployer.address)
      await mEthDebtToken.connect(governor).acceptGovernorship()
      expect(await mEthDebtToken.governor()).to.eq(governor.address)
    })

    it('should upgrade implementation', async function () {
      await upgradeTestcase({
        newImplfactory: new DebtToken__factory(deployer),
        proxy: mEthDebtToken,
        upgrader: debtTokenUpgrader,
        expectToFail: false,
      })
    })

    it('should fail if implementation breaks storage', async function () {
      await upgradeTestcase({
        newImplfactory: new OracleMock__factory(deployer),
        proxy: mEthDebtToken,
        upgrader: debtTokenUpgrader,
        expectToFail: true,
      })
    })
  })
})
