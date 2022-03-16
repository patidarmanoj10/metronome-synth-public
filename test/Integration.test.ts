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
  Controller,
  Controller__factory,
  NativeTokenGateway,
  NativeTokenGateway__factory,
  IERC20,
  IERC20__factory,
} from '../typechain'
import {disableForking, enableForking, setTokenBalance} from './helpers'
import Address from '../helpers/address'

const {WAVAX_ADDRESS, WETH_ADDRESS, USDC_ADDRESS, DAI_ADDRESS, USDT_ADDRESS} = Address

describe('Integration tests', function () {
  let alice: SignerWithAddress
  let controller: Controller
  let nativeGateway: NativeTokenGateway
  let wavax: IERC20
  let weth: IERC20
  let usdc: IERC20
  let dai: IERC20
  let usdt: IERC20
  let vsdWAVAX: DepositToken
  let vsdWETH: DepositToken
  let vsdUSDC: DepositToken
  let vsdDAI: DepositToken
  let vsdUSDT: DepositToken
  let vsBTC: SyntheticToken
  let vsUSD: SyntheticToken
  let vsUNI: SyntheticToken
  let vsCRV: SyntheticToken
  let vsAAVE: SyntheticToken

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
      Controller: {address: controllerAddress},
      NativeTokenGateway: {address: wethGatewayAddress},
      WAVAXDepositToken: {address: wavaxDepositTokenAddress},
      WETHDepositToken: {address: wethDepositTokenAddress},
      USDCDepositToken: {address: usdcDepositTokenAddress},
      DAIDepositToken: {address: daiDepositTokenAddress},
      USDTDepositToken: {address: usdtDepositTokenAddress},
      VsBTCSynthetic: {address: vsBTCAddress},
      VsUSDSynthetic: {address: vsUSDAddress},
      VsUNISynthetic: {address: vsUNIAddress},
      VsCRVSynthetic: {address: vsCRVAddress},
      VsAAVESynthetic: {address: vsAAVEAddress},
    } = await deployments.fixture()

    controller = Controller__factory.connect(controllerAddress, alice)
    nativeGateway = NativeTokenGateway__factory.connect(wethGatewayAddress, alice)

    // vsdAssets
    vsdWAVAX = DepositToken__factory.connect(wavaxDepositTokenAddress, alice)
    vsdWETH = DepositToken__factory.connect(wethDepositTokenAddress, alice)
    vsdUSDC = DepositToken__factory.connect(usdcDepositTokenAddress, alice)
    vsdDAI = DepositToken__factory.connect(daiDepositTokenAddress, alice)
    vsdUSDT = DepositToken__factory.connect(usdtDepositTokenAddress, alice)

    // vsAssets
    vsBTC = SyntheticToken__factory.connect(vsBTCAddress, alice)
    vsUSD = SyntheticToken__factory.connect(vsUSDAddress, alice)
    vsUNI = SyntheticToken__factory.connect(vsUNIAddress, alice)
    vsCRV = SyntheticToken__factory.connect(vsCRVAddress, alice)
    vsAAVE = SyntheticToken__factory.connect(vsAAVEAddress, alice)
  })

  after(disableForking)

  it('should deposit NATIVE', async function () {
    // given
    const {_depositInUsd: before} = await controller.depositOf(alice.address)

    // when
    await nativeGateway.deposit(controller.address, {value: parseEther('0.1')})

    // then
    const {_depositInUsd: after} = await controller.depositOf(alice.address)

    if (network.config.chainId === 43114) {
      expect(after.sub(before)).closeTo(toUSD('7.24'), toUSD('1')) // Avalanche
    } else {
      expect(after.sub(before)).closeTo(toUSD('256.5'), toUSD('1')) // Mainnet
    }
  })

  it('should deposit WAVAX', async function () {
    const amount = parseEther('10')
    await setTokenBalance(wavax.address, alice.address, amount)
    const {_depositInUsd: before} = await controller.depositOf(alice.address)

    // when
    await wavax.approve(vsdWAVAX.address, ethers.constants.MaxUint256)
    await vsdWAVAX.deposit(amount, alice.address)

    // then
    const {_depositInUsd: after} = await controller.depositOf(alice.address)
    expect(after.sub(before)).closeTo(toUSD('724'), toUSD('5'))
  })

  it('should deposit WETH', async function () {
    // given
    const amount = parseEther('1')
    await setTokenBalance(weth.address, alice.address, amount)
    const {_depositInUsd: before} = await controller.depositOf(alice.address)

    // when
    await weth.approve(vsdWETH.address, ethers.constants.MaxUint256)
    await vsdWETH.deposit(amount, alice.address)

    // then
    const {_depositInUsd: after} = await controller.depositOf(alice.address)
    expect(after.sub(before)).closeTo(toUSD('2565'), toUSD('5'))
  })

  it('should deposit USDC', async function () {
    // given
    const amount = parseUnits('10000', 6)
    await setTokenBalance(usdc.address, alice.address, amount)
    const {_depositInUsd: before} = await controller.depositOf(alice.address)

    // when
    await usdc.approve(vsdUSDC.address, ethers.constants.MaxUint256)
    await vsdUSDC.deposit(amount, alice.address)

    // then
    const {_depositInUsd: after} = await controller.depositOf(alice.address)
    expect(after.sub(before)).closeTo(toUSD('10000'), toUSD('1'))
  })

  it('should deposit DAI', async function () {
    // given
    const amount = parseEther('10000')
    await setTokenBalance(dai.address, alice.address, amount)
    const {_depositInUsd: before} = await controller.depositOf(alice.address)

    // when
    await dai.approve(vsdDAI.address, ethers.constants.MaxUint256)
    await vsdDAI.deposit(parseEther('10000'), alice.address)

    // then
    const {_depositInUsd: after} = await controller.depositOf(alice.address)
    expect(after.sub(before)).closeTo(toUSD('10000'), toUSD('15'))
  })

  it('should deposit USDT', async function () {
    // given
    const amount = parseUnits('10000', 6)
    await setTokenBalance(usdt.address, alice.address, amount)
    const {_depositInUsd: before} = await controller.depositOf(alice.address)

    // when
    await usdt.approve(vsdUSDT.address, ethers.constants.MaxUint256)
    await vsdUSDT.deposit(amount, alice.address)

    // then
    const {_depositInUsd: after} = await controller.depositOf(alice.address)
    expect(after.sub(before)).closeTo(toUSD('10000'), toUSD('5'))
  })

  it('should check position after deposits', async function () {
    const {_depositInUsd, _debtInUsd} = await controller.debtPositionOf(alice.address)
    expect(_depositInUsd).closeTo(toUSD('33313'), toUSD('250'))
    expect(_debtInUsd).eq(0)
  })

  it('should mint vsBTC', async function () {
    // given
    const before = await controller.debtOf(alice.address)

    // when
    await vsBTC.issue(parseUnits('0.1', 8), alice.address)

    // then
    const after = await controller.debtOf(alice.address)
    expect(after.sub(before)).closeTo(toUSD('3877'), toUSD('10'))
  })

  it('should mint vsUSD', async function () {
    // given
    const before = await controller.debtOf(alice.address)

    // when
    await vsUSD.issue(parseEther('5000'), alice.address)

    // then
    const after = await controller.debtOf(alice.address)
    expect(after.sub(before)).eq(toUSD('5000'))
  })

  it('should mint vsUNI', async function () {
    // given
    const before = await controller.debtOf(alice.address)

    // when
    await vsUNI.issue(parseEther('100'), alice.address)

    // then
    const after = await controller.debtOf(alice.address)
    expect(after.sub(before)).closeTo(toUSD('859'), toUSD('1'))
  })

  it('should mint vsCRV', async function () {
    // given
    const before = await controller.debtOf(alice.address)

    // when
    await vsCRV.issue(parseEther('1000'), alice.address)

    // then
    const after = await controller.debtOf(alice.address)
    expect(after.sub(before)).closeTo(toUSD('1976'), toUSD('5'))
  })

  it('should mint vsAAVE', async function () {
    // given
    const before = await controller.debtOf(alice.address)

    // when
    await vsAAVE.issue(parseEther('10'), alice.address)

    // then
    const after = await controller.debtOf(alice.address)
    expect(after.sub(before)).closeTo(toUSD('1162'), toUSD('1'))
  })

  it('should check position after issuances', async function () {
    const {_depositInUsd, _debtInUsd} = await controller.debtPositionOf(alice.address)
    expect(_depositInUsd).closeTo(toUSD('33313'), toUSD('250'))
    expect(_debtInUsd).closeTo(toUSD('12875'), toUSD('100'))
  })
})
