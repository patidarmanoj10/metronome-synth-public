/* eslint-disable camelcase */
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {expect} from 'chai'
import {ethers} from 'hardhat'
import {
  CTokenOracle,
  CTokenOracle__factory,
  DefaultOracle,
  DefaultOracle__factory,
  ICToken,
  ICToken__factory,
} from '../../../typechain'
import {enableForking, disableForking, toUSD} from '../../helpers'
import Address from '../../../helpers/address'

const {DAI_ADDRESS, CDAI_ADDRESS, USDC_ADDRESS, CUSDC_ADDRESS} = Address

describe('CTokenOracle', function () {
  let snapshotId: string
  let deployer: SignerWithAddress
  let underlyingOracle: DefaultOracle
  let ibOracle: CTokenOracle
  let cDAI: ICToken
  let cUSDC: ICToken

  before(enableForking)

  after(disableForking)

  beforeEach(async function () {
    snapshotId = await ethers.provider.send('evm_snapshot', [])
    ;[deployer] = await ethers.getSigners()

    const underlyingOracleFactory = new DefaultOracle__factory(deployer)
    underlyingOracle = await underlyingOracleFactory.deploy()
    await underlyingOracle.deployed()

    // Note: mocking DAI/USDC prices always to 1
    await underlyingOracle.addOrUpdateUsdAsset(DAI_ADDRESS)
    await underlyingOracle.addOrUpdateUsdAsset(USDC_ADDRESS)

    const ibOracleFactory = new CTokenOracle__factory(deployer)
    ibOracle = await ibOracleFactory.deploy(underlyingOracle.address)
    await ibOracle.deployed()

    cDAI = ICToken__factory.connect(CDAI_ADDRESS, deployer)
    cUSDC = ICToken__factory.connect(CUSDC_ADDRESS, deployer)
  })

  afterEach(async function () {
    await ethers.provider.send('evm_revert', [snapshotId])
  })

  it('getPriceInUsd (18 decimals underlying)', async function () {
    const price = await ibOracle.getPriceInUsd(cDAI.address)
    expect(price).closeTo(toUSD('0.021'), toUSD('0.001')) // 1 cDAI ~= $0.021
  })

  it('getPriceInUsd (6 decimals underlying)', async function () {
    const price = await ibOracle.getPriceInUsd(cUSDC.address)
    expect(price).closeTo(toUSD('0.022'), toUSD('0.001')) // 1 cUSDC ~= $0.021
  })
})
