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
  OracleMock,
  OracleMock__factory,
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
} from '../typechain'
import {disableForking, enableForking} from './helpers'

const {MET_ADDRESS} = process.env

describe('Deployments', function () {
  let deployer: SignerWithAddress
  let governor: SignerWithAddress
  let mBox: MBox
  let mBoxUpgrader: MBoxUpgrader
  let treasury: Treasury
  let treasuryUpgrader: TreasuryUpgrader
  let depositToken: DepositToken
  let depositTokenUpgrader: DepositTokenUpgrader
  let mEth: SyntheticAsset
  let syntheticAssetUpgrader: SyntheticAssetUpgrader
  let mEthDebtToken: DebtToken
  let debtTokenUpgrader: DebtTokenUpgrader
  let oracle: OracleMock

  // Note: Enabling fork to be able to use MultiCall contract
  before(enableForking)

  after(disableForking)

  beforeEach(async function () {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[deployer, governor] = await ethers.getSigners()

    const {
      Oracle: {address: oracleAddress},
      MBox: {address: mboxAddress},
      MBoxUpgrader: {address: mBoxUpgraderAddress},
      Treasury: {address: treasuryAddress},
      TreasuryUpgrader: {address: treasuryUpgraderAddress},
      DepositToken: {address: depositTokenAddress},
      DepositTokenUpgrader: {address: depositTokenUpgraderAddress},
      MEth: {address: mEthAddress},
      SyntheticAssetUpgrader: {address: syntheticAssetUpgraderAddress},
      MEthDebtToken: {address: mETHDebtTokenAddress},
      DebtTokenUpgrader: {address: debtTokenUpgraderAddress},
    } = await deployments.fixture()

    mBox = MBox__factory.connect(mboxAddress, deployer)
    mBoxUpgrader = MBoxUpgrader__factory.connect(mBoxUpgraderAddress, deployer)

    treasury = Treasury__factory.connect(treasuryAddress, deployer)
    treasuryUpgrader = TreasuryUpgrader__factory.connect(treasuryUpgraderAddress, deployer)

    depositToken = DepositToken__factory.connect(depositTokenAddress, deployer)
    depositTokenUpgrader = DepositTokenUpgrader__factory.connect(depositTokenUpgraderAddress, deployer)

    mEth = SyntheticAsset__factory.connect(mEthAddress, deployer)
    syntheticAssetUpgrader = SyntheticAssetUpgrader__factory.connect(syntheticAssetUpgraderAddress, deployer)

    mEthDebtToken = DebtToken__factory.connect(mETHDebtTokenAddress, deployer)
    debtTokenUpgrader = DebtTokenUpgrader__factory.connect(debtTokenUpgraderAddress, deployer)

    oracle = OracleMock__factory.connect(oracleAddress, deployer)
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

  describe('MBox', function () {
    it('should have correct params', async function () {
      expect(await mBox.treasury()).to.eq(treasury.address)
      expect(await mBox.depositToken()).to.eq(depositToken.address)
      expect(await mBox.syntheticAssets(0)).to.eq(mEth.address)
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
      expect(await treasury.met()).to.eq(MET_ADDRESS)
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

    it('should fail if implementation breaks storage', async function () {
      await upgradeTestcase({
        newImplfactory: new OracleMock__factory(deployer),
        proxy: treasury,
        upgrader: treasuryUpgrader,
        expectToFail: true,
      })
    })
  })

  describe('DepositToken', function () {
    it('deposit token should have correct params', async function () {
      expect(await depositToken.mBox()).to.eq(mBox.address)
      expect(await depositToken.underlying()).to.eq(MET_ADDRESS)
      expect(await depositToken.governor()).to.eq(deployer.address)
      await depositToken.connect(governor).acceptGovernorship()
      expect(await depositToken.governor()).to.eq(governor.address)
    })

    it('should upgrade implementation', async function () {
      await upgradeTestcase({
        newImplfactory: new DepositToken__factory(deployer),
        proxy: depositToken,
        upgrader: depositTokenUpgrader,
        expectToFail: false,
      })
    })

    it('should fail if implementation breaks storage', async function () {
      await upgradeTestcase({
        newImplfactory: new OracleMock__factory(deployer),
        proxy: depositToken,
        upgrader: depositTokenUpgrader,
        expectToFail: true,
      })
    })
  })

  describe('SyntheticAsset', function () {
    it('mETH token should have correct params', async function () {
      expect(await mEth.mBox()).to.eq(mBox.address)
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
      expect(await mEthDebtToken.mBox()).to.eq(mBox.address)
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
