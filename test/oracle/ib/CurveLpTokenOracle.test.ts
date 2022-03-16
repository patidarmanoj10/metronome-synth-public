/* eslint-disable camelcase */
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {expect} from 'chai'
import {ethers} from 'hardhat'
import {CurveLpTokenOracle, CurveLpTokenOracle__factory} from '../../../typechain'
import {enableForking, disableForking} from '../../helpers'
import Address from '../../../helpers/address'
import {toUSD} from '../../../helpers'

const {CURVE_ADDRESS_PROVIDER_ADDRESS, CURVE_3CRV_ADDRESS} = Address

describe('CurveLpTokenOracle', function () {
  let snapshotId: string
  let deployer: SignerWithAddress
  let ibOracle: CurveLpTokenOracle

  before(enableForking)

  after(disableForking)

  beforeEach(async function () {
    snapshotId = await ethers.provider.send('evm_snapshot', [])
    ;[deployer] = await ethers.getSigners()

    const ibOracleFactory = new CurveLpTokenOracle__factory(deployer)
    ibOracle = await ibOracleFactory.deploy(CURVE_ADDRESS_PROVIDER_ADDRESS)
    await ibOracle.deployed()
  })

  afterEach(async function () {
    await ethers.provider.send('evm_revert', [snapshotId])
  })

  it('getPriceInUsd', async function () {
    const price = await ibOracle.getPriceInUsd(CURVE_3CRV_ADDRESS)
    expect(price).closeTo(toUSD('1.02'), toUSD('0.001')) // 1 cDAI ~= $0.021
  })
})
