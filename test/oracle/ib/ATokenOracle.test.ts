/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable camelcase */
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {expect} from 'chai'
import {ethers} from 'hardhat'
import {
  ATokenOracle,
  ATokenOracle__factory,
  DefaultOracle,
  DefaultOracle__factory,
  IAToken,
  IAToken__factory,
} from '../../../typechain'
import {enableForking, disableForking, toUSD} from '../../helpers'
import Address from '../../../helpers/address'

const {DAI_ADDRESS, ADAI_ADDRESS} = Address

describe('ATokenOracle', function () {
  let snapshotId: string
  let deployer: SignerWithAddress
  let underlyingOracle: DefaultOracle
  let ibOracle: ATokenOracle
  let aDAI: IAToken

  before(enableForking)

  after(disableForking)

  beforeEach(async function () {
    snapshotId = await ethers.provider.send('evm_snapshot', [])
    ;[deployer] = await ethers.getSigners()

    const underlyingOracleFactory = new DefaultOracle__factory(deployer)
    underlyingOracle = await underlyingOracleFactory.deploy()
    await underlyingOracle.deployed()

    // Note: mocking DAI price always to 1
    await underlyingOracle.addOrUpdateUsdAsset(DAI_ADDRESS)

    const ibOracleFactory = new ATokenOracle__factory(deployer)
    ibOracle = await ibOracleFactory.deploy(underlyingOracle.address)
    await ibOracle.deployed()

    aDAI = IAToken__factory.connect(ADAI_ADDRESS, deployer)
  })

  afterEach(async function () {
    await ethers.provider.send('evm_revert', [snapshotId])
  })

  it('getPriceInUsd', async function () {
    const price = await ibOracle.getPriceInUsd(aDAI.address)
    expect(price).eq(toUSD('1'))
  })
})
