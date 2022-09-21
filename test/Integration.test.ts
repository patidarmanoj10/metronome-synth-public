/* eslint-disable camelcase */
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {expect} from 'chai'
import {parseEther, parseUnits} from 'ethers/lib/utils'
import {deployments, ethers, network} from 'hardhat'
import {toUSD} from '../helpers'
import {
  DepositToken,
  DepositToken__factory,
  SyntheticToken,
  SyntheticToken__factory,
  Pool,
  Pool__factory,
  NativeTokenGateway,
  NativeTokenGateway__factory,
  IERC20,
  IERC20__factory,
  DebtToken__factory,
  DebtToken,
} from '../typechain'
import {disableForking, enableForking, impersonateAccount, setTokenBalance} from './helpers'
import Address from '../helpers/address'

const {
  WAVAX_ADDRESS,
  WETH_ADDRESS,
  USDC_ADDRESS,
  DAI_ADDRESS,
  USDT_ADDRESS,
  CHAINLINK_PRICE_PROVIDER,
  USDC_USD_CHAINLINK_AGGREGATOR_ADDRESS,
  AAVE_USD_CHAINLINK_AGGREGATOR_ADDRESS,
  AVAX_USD_CHAINLINK_AGGREGATOR_ADDRESS,
  BTC_USD_CHAINLINK_AGGREGATOR_ADDRESS,
  CRV_USD_CHAINLINK_AGGREGATOR_ADDRESS,
  DAI_USD_CHAINLINK_AGGREGATOR_ADDRESS,
  ETH_USD_CHAINLINK_AGGREGATOR_ADDRESS,
  UNI_USD_CHAINLINK_AGGREGATOR_ADDRESS,
  USDT_USD_CHAINLINK_AGGREGATOR_ADDRESS,
  ONE_ORACLE_ADDRESS_PROVIDER,
  MASTER_ORACLE_ADDRESS,
  MS_USD_TOKEN_ORACLE_ADDRESS,
} = Address

// Note: This test suite might be used in order to check all system is working properly
// Skipping this since CI forks mainnet and these tests run against avalanche's fork
describe.skip('Integration tests', function () {
  let alice: SignerWithAddress
  let pool: Pool
  let nativeGateway: NativeTokenGateway
  let wavax: IERC20
  let weth: IERC20
  let usdc: IERC20
  let dai: IERC20
  let usdt: IERC20
  let msdWAVAX: DepositToken
  let msdWETH: DepositToken
  let msdUSDC: DepositToken
  let msdDAI: DepositToken
  let msdUSDT: DepositToken
  let msBTC: SyntheticToken
  let msUSD: SyntheticToken
  let msUNI: SyntheticToken
  let msCRV: SyntheticToken
  let msAAVE: SyntheticToken
  let msBTCDebt: DebtToken
  let msUSDDebt: DebtToken
  let msUNIDebt: DebtToken
  let msCRVDebt: DebtToken
  let msAAVEDebt: DebtToken

  before(async function () {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[, , alice] = await ethers.getSigners()

    await enableForking()

    wavax = IERC20__factory.connect(WAVAX_ADDRESS, alice)
    weth = IERC20__factory.connect(WETH_ADDRESS, alice)
    usdc = IERC20__factory.connect(USDC_ADDRESS, alice)
    dai = IERC20__factory.connect(DAI_ADDRESS, alice)
    usdt = IERC20__factory.connect(USDT_ADDRESS, alice)

    const {
      Pool: {address: poolAddress},
      NativeTokenGateway: {address: wethGatewayAddress},
      WAVAXDepositToken: {address: wavaxDepositTokenAddress},
      WETHDepositToken: {address: wethDepositTokenAddress},
      USDCDepositToken: {address: usdcDepositTokenAddress},
      DAIDepositToken: {address: daiDepositTokenAddress},
      USDTDepositToken: {address: usdtDepositTokenAddress},
      MsBTCSynthetic: {address: msBTCAddress},
      MsUSDSynthetic: {address: msUSDAddress},
      MsUNISynthetic: {address: msUNIAddress},
      MsCRVSynthetic: {address: msCRVAddress},
      MsAAVESynthetic: {address: msAAVEAddress},
      MsBTCDebt: {address: msBTCDebtAddress},
      MsUSDDebt: {address: msUSDDebtAddress},
      MsUNIDebt: {address: msUNIDebtAddress},
      MsCRVDebt: {address: msCRVDebtAddress},
      MsAAVEDebt: {address: msAAVEDebtAddress},
    } = await deployments.fixture()

    pool = Pool__factory.connect(poolAddress, alice)
    nativeGateway = NativeTokenGateway__factory.connect(wethGatewayAddress, alice)

    // msdAssets
    msdWAVAX = DepositToken__factory.connect(wavaxDepositTokenAddress, alice)
    msdWETH = DepositToken__factory.connect(wethDepositTokenAddress, alice)
    msdUSDC = DepositToken__factory.connect(usdcDepositTokenAddress, alice)
    msdDAI = DepositToken__factory.connect(daiDepositTokenAddress, alice)
    msdUSDT = DepositToken__factory.connect(usdtDepositTokenAddress, alice)

    // msAssets
    msBTC = SyntheticToken__factory.connect(msBTCAddress, alice)
    msUSD = SyntheticToken__factory.connect(msUSDAddress, alice)
    msUNI = SyntheticToken__factory.connect(msUNIAddress, alice)
    msCRV = SyntheticToken__factory.connect(msCRVAddress, alice)
    msAAVE = SyntheticToken__factory.connect(msAAVEAddress, alice)

    // msAssets-Debts
    msBTCDebt = DebtToken__factory.connect(msBTCDebtAddress, alice)
    msUSDDebt = DebtToken__factory.connect(msUSDDebtAddress, alice)
    msUNIDebt = DebtToken__factory.connect(msUNIDebtAddress, alice)
    msCRVDebt = DebtToken__factory.connect(msCRVDebtAddress, alice)
    msAAVEDebt = DebtToken__factory.connect(msAAVEDebtAddress, alice)

    // OneOracle contracts
    const addressProvider = new ethers.Contract(
      ONE_ORACLE_ADDRESS_PROVIDER,
      ['function governor() view returns(address)'],
      alice
    )
    const governor = await impersonateAccount(await addressProvider.governor())
    const masterOracle = new ethers.Contract(
      MASTER_ORACLE_ADDRESS,
      ['function updateTokenOracle(address,address)'],
      governor
    )
    const chainlinkPriceProvider = new ethers.Contract(
      CHAINLINK_PRICE_PROVIDER,
      ['function updateAggregator(address,address)'],
      governor
    )

    await chainlinkPriceProvider.updateAggregator(msdUSDC.address, USDC_USD_CHAINLINK_AGGREGATOR_ADDRESS)
    await chainlinkPriceProvider.updateAggregator(msdWAVAX.address, AVAX_USD_CHAINLINK_AGGREGATOR_ADDRESS)
    await chainlinkPriceProvider.updateAggregator(msdWETH.address, ETH_USD_CHAINLINK_AGGREGATOR_ADDRESS)
    await chainlinkPriceProvider.updateAggregator(msdDAI.address, DAI_USD_CHAINLINK_AGGREGATOR_ADDRESS)
    await chainlinkPriceProvider.updateAggregator(msdUSDT.address, USDT_USD_CHAINLINK_AGGREGATOR_ADDRESS)
    await chainlinkPriceProvider.updateAggregator(msBTC.address, BTC_USD_CHAINLINK_AGGREGATOR_ADDRESS)
    await chainlinkPriceProvider.updateAggregator(msUNI.address, UNI_USD_CHAINLINK_AGGREGATOR_ADDRESS)
    await chainlinkPriceProvider.updateAggregator(msCRV.address, CRV_USD_CHAINLINK_AGGREGATOR_ADDRESS)
    await chainlinkPriceProvider.updateAggregator(msAAVE.address, AAVE_USD_CHAINLINK_AGGREGATOR_ADDRESS)

    await masterOracle.updateTokenOracle(msUSD.address, MS_USD_TOKEN_ORACLE_ADDRESS)
  })

  after(disableForking)

  it('should deposit NATIVE', async function () {
    // given
    const {_depositInUsd: before} = await pool.depositOf(alice.address)

    // when
    await nativeGateway.deposit(pool.address, {value: parseEther('0.1')})

    // then
    const {_depositInUsd: after} = await pool.depositOf(alice.address)

    expect(after.sub(before)).closeTo(toUSD('1.87'), toUSD('1'))
  })

  it('should deposit WAVAX', async function () {
    const amount = parseEther('10')
    await setTokenBalance(wavax.address, alice.address, amount)
    const {_depositInUsd: before} = await pool.depositOf(alice.address)

    // when
    await wavax.approve(msdWAVAX.address, ethers.constants.MaxUint256)
    await msdWAVAX.deposit(amount, alice.address)

    // then
    const {_depositInUsd: after} = await pool.depositOf(alice.address)
    expect(after.sub(before)).closeTo(toUSD('187'), toUSD('5'))
  })

  it('should deposit WETH', async function () {
    // given
    const amount = parseEther('1')
    await setTokenBalance(weth.address, alice.address, amount)
    const {_depositInUsd: before} = await pool.depositOf(alice.address)

    // when
    await weth.approve(msdWETH.address, ethers.constants.MaxUint256)
    await msdWETH.deposit(amount, alice.address)

    // then
    const {_depositInUsd: after} = await pool.depositOf(alice.address)
    expect(after.sub(before)).closeTo(toUSD('1570'), toUSD('5'))
  })

  it('should deposit USDC', async function () {
    // given
    const amount = parseUnits('10000', 6)
    await setTokenBalance(usdc.address, alice.address, amount)
    const {_depositInUsd: before} = await pool.depositOf(alice.address)

    // when
    await usdc.approve(msdUSDC.address, ethers.constants.MaxUint256)
    await msdUSDC.deposit(amount, alice.address)

    // then
    const {_depositInUsd: after} = await pool.depositOf(alice.address)
    expect(after.sub(before)).closeTo(toUSD('10000'), toUSD('1'))
  })

  it('should deposit DAI', async function () {
    // given
    const amount = parseEther('10000')
    await setTokenBalance(dai.address, alice.address, amount)
    const {_depositInUsd: before} = await pool.depositOf(alice.address)

    // when
    await dai.approve(msdDAI.address, ethers.constants.MaxUint256)
    await msdDAI.deposit(parseEther('10000'), alice.address)

    // then
    const {_depositInUsd: after} = await pool.depositOf(alice.address)
    expect(after.sub(before)).closeTo(toUSD('10000'), toUSD('15'))
  })

  it('should deposit USDT', async function () {
    // given
    const amount = parseUnits('10000', 6)
    await setTokenBalance(usdt.address, alice.address, amount)
    const {_depositInUsd: before} = await pool.depositOf(alice.address)

    // when
    await usdt.approve(msdUSDT.address, ethers.constants.MaxUint256)
    await msdUSDT.deposit(amount, alice.address)

    // then
    const {_depositInUsd: after} = await pool.depositOf(alice.address)
    expect(after.sub(before)).closeTo(toUSD('10000'), toUSD('5'))
  })

  it('should check position after deposits', async function () {
    const {_depositInUsd, _debtInUsd} = await pool.debtPositionOf(alice.address)
    expect(_depositInUsd).closeTo(toUSD('31758'), toUSD('250'))
    expect(_debtInUsd).eq(0)
  })

  it('should mint msBTC', async function () {
    // given
    const before = await pool.debtOf(alice.address)

    // when
    await msBTCDebt.issue(parseUnits('0.1', 8), alice.address)

    // then
    const after = await pool.debtOf(alice.address)
    expect(after.sub(before)).closeTo(toUSD('1899'), toUSD('10'))
  })

  it('should mint msUSD', async function () {
    // given
    const before = await pool.debtOf(alice.address)

    // when
    await msUSDDebt.issue(parseEther('5000'), alice.address)

    // then
    const after = await pool.debtOf(alice.address)
    expect(after.sub(before)).eq(toUSD('5000'))
  })

  it('should mint msUNI', async function () {
    // given
    const before = await pool.debtOf(alice.address)

    // when
    await msUNIDebt.issue(parseEther('100'), alice.address)

    // then
    const after = await pool.debtOf(alice.address)
    expect(after.sub(before)).closeTo(toUSD('599'), toUSD('1'))
  })

  it('should mint msCRV', async function () {
    // given
    const before = await pool.debtOf(alice.address)

    // when
    await msCRVDebt.issue(parseEther('1000'), alice.address)

    // then
    const after = await pool.debtOf(alice.address)
    expect(after.sub(before)).closeTo(toUSD('1097'), toUSD('5'))
  })

  it('should mint msAAVE', async function () {
    // given
    const before = await pool.debtOf(alice.address)

    // when
    await msAAVEDebt.issue(parseEther('10'), alice.address)

    // then
    const after = await pool.debtOf(alice.address)
    expect(after.sub(before)).closeTo(toUSD('850'), toUSD('1'))
  })

  it('should check position after issuances', async function () {
    const {_depositInUsd, _debtInUsd} = await pool.debtPositionOf(alice.address)
    expect(_depositInUsd).closeTo(toUSD('31758'), toUSD('250'))
    expect(_debtInUsd).closeTo(toUSD('9447'), toUSD('100'))
  })
})
