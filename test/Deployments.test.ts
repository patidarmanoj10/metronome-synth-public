/* eslint-disable camelcase */
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
} from '../typechain'

const {MET_ADDRESS, WETH_ADDRESS} = process.env

describe('Deployments', function () {
  let deployer: SignerWithAddress
  let governor: SignerWithAddress
  let mBox: MBox
  let treasury: Treasury
  let depositToken: DepositToken
  let mEth: SyntheticAsset
  let mEthDebtToken: DebtToken
  let oracle: OracleMock

  beforeEach(async function () {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[deployer, governor] = await ethers.getSigners()

    const {
      Oracle: {address: oracleAddress},
      MBox: {address: mboxAddress},
      Treasury: {address: treasuryAddress},
      DepositToken: {address: depositTokenAddress},
      mETH_SyntheticAsset: {address: mEthAddress},
      mETH_DebtToken: {address: mETHDebtTokenAddress},
    } = await deployments.fixture(['MBox', 'Treasury', 'DepositToken', 'mETH_SyntheticAsset', 'mEth_DebtToken'])

    mBox = MBox__factory.connect(mboxAddress, deployer)
    treasury = Treasury__factory.connect(treasuryAddress, deployer)
    depositToken = DepositToken__factory.connect(depositTokenAddress, deployer)
    mEth = SyntheticAsset__factory.connect(mEthAddress, deployer)
    mEthDebtToken = DebtToken__factory.connect(mETHDebtTokenAddress, deployer)
    oracle = OracleMock__factory.connect(oracleAddress, deployer)
  })

  it('mBOX should have correct params', async function () {
    expect(await mBox.treasury()).to.eq(treasury.address)
    expect(await mBox.depositToken()).to.eq(depositToken.address)
    expect(await mBox.syntheticAssets(0)).to.eq(mEth.address)
    expect(await mBox.oracle()).to.eq(oracle.address)
    expect(await mBox.governor()).to.eq(deployer.address)
    await mBox.connect(governor).acceptGovernorship()
    expect(await mBox.governor()).to.eq(governor.address)
  })

  it('treasury should have correct params', async function () {
    expect(await treasury.mBox()).to.eq(mBox.address)
    expect(await treasury.met()).to.eq(MET_ADDRESS)
    expect(await treasury.governor()).to.eq(deployer.address)
    await treasury.connect(governor).acceptGovernorship()
    expect(await treasury.governor()).to.eq(governor.address)
  })

  it('deposit token should have correct params', async function () {
    expect(await depositToken.mBox()).to.eq(mBox.address)
    expect(await depositToken.underlying()).to.eq(MET_ADDRESS)
    expect(await depositToken.governor()).to.eq(deployer.address)
    await depositToken.connect(governor).acceptGovernorship()
    expect(await depositToken.governor()).to.eq(governor.address)
  })

  it('mETH token should have correct params', async function () {
    expect(await mEth.mBox()).to.eq(mBox.address)
    expect(await mEth.debtToken()).to.eq(mEthDebtToken.address)
    expect(await mEth.underlying()).to.eq(WETH_ADDRESS)
    expect(await mEth.governor()).to.eq(deployer.address)
    await mEth.connect(governor).acceptGovernorship()
    expect(await mEth.governor()).to.eq(governor.address)
  })

  it('mETH debt token should have correct params', async function () {
    expect(await mEthDebtToken.mBox()).to.eq(mBox.address)
    expect(await mEthDebtToken.governor()).to.eq(deployer.address)
    await mEthDebtToken.connect(governor).acceptGovernorship()
    expect(await mEthDebtToken.governor()).to.eq(governor.address)
  })
})
