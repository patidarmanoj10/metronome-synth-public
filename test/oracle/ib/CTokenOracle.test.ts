/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable camelcase */
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {expect} from 'chai'
import {ethers} from 'hardhat'
import {
  ATokenOracle,
  CTokenOracle__factory,
  DefaultOracle,
  DefaultOracle__factory,
  ICToken,
  ICToken__factory,
} from '../../../typechain'
import {enableForking, disableForking} from '../../helpers'
import Address from '../../../helpers/address'
import {parseEther} from 'ethers/lib/utils'

const {DAI_ADDRESS, CDAI_ADDRESS} = Address

describe('CTokenOracle', function () {
  let snapshotId: string
  let deployer: SignerWithAddress
  let underlyingOracle: DefaultOracle
  let ibOracle: ATokenOracle
  let cDAI: ICToken

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

    const ibOracleFactory = new CTokenOracle__factory(deployer)
    ibOracle = await ibOracleFactory.deploy(underlyingOracle.address)
    await ibOracle.deployed()

    cDAI = ICToken__factory.connect(CDAI_ADDRESS, deployer)
  })

  afterEach(async function () {
    await ethers.provider.send('evm_revert', [snapshotId])
  })

  it('convertToUsd', async function () {
    const cDaiAmount = parseEther('1')
      .mul(parseEther('1'))
      .div(await cDAI.exchangeRateStored())
    const usdAmount = await ibOracle.convertToUsd(cDAI.address, cDaiAmount)

    // @ts-ignore
    expect(usdAmount).closeTo(parseEther('1'), parseEther('0.0000001'))
  })

  it('convertFromUsd', async function () {
    const usdAmount = parseEther('1')
    const cDaiAmount = await ibOracle.convertFromUsd(cDAI.address, usdAmount)

    const oneDaiInCDAI = parseEther('1')
      .mul(parseEther('1'))
      .div(await cDAI.exchangeRateStored())
    expect(cDaiAmount).eq(oneDaiInCDAI)
  })
})
