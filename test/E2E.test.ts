/* eslint-disable new-cap */
/* eslint-disable max-len */
/* eslint-disable camelcase */
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {expect} from 'chai'
import {Contract} from 'ethers'
import hre, {ethers} from 'hardhat'
import {loadFixture, time} from '@nomicfoundation/hardhat-network-helpers'
import {toUSD, parseEther, parseUnits} from '../helpers'
import {disableForking, enableForking} from './helpers'
import {impersonateAccount, setTokenBalance} from './helpers/index'
import Address from '../helpers/address'
import {
  DepositToken,
  SyntheticToken,
  Pool,
  ERC20,
  DebtToken,
  DepositToken__factory,
  SyntheticToken__factory,
  DebtToken__factory,
  Pool__factory,
  PoolRegistry__factory,
  ERC20__factory,
  IWETH,
  IWETH__factory,
  NativeTokenGateway,
  PoolRegistry,
  NativeTokenGateway__factory,
} from '../typechain'
import {address as POOL_REGISTRY_ADDRESS} from '../deployments/mainnet/PoolRegistry.json'
import {address as USDC_DEPOSIT_ADDRESS} from '../deployments/mainnet/USDCDepositToken.json'
import {address as DAI_DEPOSIT_ADDRESS} from '../deployments/mainnet/DAIDepositToken.json'
import {address as WBTC_DEPOSIT_ADDRESS} from '../deployments/mainnet/WBTCDepositToken.json'
import {address as FRAX_DEPOSIT_ADDRESS} from '../deployments/mainnet/FRAXDepositToken.json'
import {address as WETH_DEPOSIT_ADDRESS} from '../deployments/mainnet/WETHDepositToken.json'
import {address as VAFRAX_DEPOSIT_ADDRESS} from '../deployments/mainnet/vaFRAXDepositToken.json'
import {address as VAUSDC_DEPOSIT_ADDRESS} from '../deployments/mainnet/vaUSDCDepositToken.json'
import {address as VAETH_DEPOSIT_ADDRESS} from '../deployments/mainnet/vaETHDepositToken.json'
import {address as MSUSD_DEBT_ADDRESS} from '../deployments/mainnet/MsUSDDebt.json'
import {address as MSBTC_DEBT_ADDRESS} from '../deployments/mainnet/MsBTCDebt.json'
import {address as MSETH_DEBT_ADDRESS} from '../deployments/mainnet/MsETHDebt.json'
import {address as MSUSD_SYNTHETIC_ADDRESS} from '../deployments/mainnet/MsUSDSynthetic.json'
import {address as MSBTC_SYNTHETIC_ADDRESS} from '../deployments/mainnet/MsBTCSynthetic.json'
import {address as MSETH_SYNTHETIC_ADDRESS} from '../deployments/mainnet/MsETHSynthetic.json'
import {address as NATIVE_TOKEN_GATEWAY_ADDRESS} from '../deployments/mainnet/NativeTokenGateway.json'
import {address as SRFXETH_DEPOSIT_ADDRESS} from '../deployments/mainnet/sfrxETHDepositToken.json'
import {address as VASTETH_DEPOSIT_ADDRESS} from '../deployments/mainnet/vaSTETHDepositToken.json'
import {address as VARETH_DEPOSIT_ADDRESS} from '../deployments/mainnet/vaRETHDepositToken.json'
// WIP
// import {address as VACBETH_DEPOSIT_ADDRESS} from '../deployments/mainnet/vaCBETHDepositToken.json'

const {MaxUint256} = ethers.constants
const dust = toUSD('20')

const isNodeHardhat = hre.network.name === 'hardhat'

describe('E2E tests', function () {
  let governor: SignerWithAddress
  let alice: SignerWithAddress
  let bob: SignerWithAddress
  let usdc: ERC20
  let dai: ERC20
  let wbtc: ERC20
  let frax: ERC20
  let weth: IWETH
  let vaFRAX: ERC20
  let vaUSDC: ERC20
  let vaETH: ERC20
  let sfrxETH: ERC20
  let vaSTETH: ERC20
  let vaRETH: ERC20
  let vaCBETH: ERC20
  let masterOracle: Contract
  let poolRegistry: PoolRegistry
  let nativeGateway: NativeTokenGateway
  let pool: Pool
  let msdUSDC: DepositToken
  let msdWBTC: DepositToken
  let msdDAI: DepositToken
  let msdFRAX: DepositToken
  let msdWETH: DepositToken
  let msdVaFRAX: DepositToken
  let msdVaUSDC: DepositToken
  let msdVaETH: DepositToken
  let msdSfrxETH: DepositToken
  let msdVaSTETH: DepositToken
  let msdVaRETH: DepositToken
  let msdVaCBETH: DepositToken
  let msUSDDebt: DebtToken
  let msBTCDebt: DebtToken
  let msETHDebt: DebtToken
  let msUSD: SyntheticToken
  let msBTC: SyntheticToken
  let msETH: SyntheticToken

  if (isNodeHardhat) {
    before(enableForking)

    after(disableForking)
  }

  async function fixture() {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[, alice, bob] = await ethers.getSigners()
    usdc = ERC20__factory.connect(Address.USDC_ADDRESS, alice)
    dai = ERC20__factory.connect(Address.DAI_ADDRESS, alice)
    wbtc = ERC20__factory.connect(Address.WBTC_ADDRESS, alice)
    frax = ERC20__factory.connect(Address.FRAX_ADDRESS, alice)
    weth = IWETH__factory.connect(Address.WETH_ADDRESS, alice)
    vaFRAX = ERC20__factory.connect(Address.VAFRAX_ADDRESS, alice)
    vaUSDC = ERC20__factory.connect(Address.VAUSDC_ADDRESS, alice)
    vaETH = ERC20__factory.connect(Address.VAETH_ADDRESS, alice)
    sfrxETH = ERC20__factory.connect(Address.SFRXETH_ADDRESS, alice)
    vaSTETH = ERC20__factory.connect(Address.VASTETH_ADDRESS, alice)
    vaRETH = ERC20__factory.connect(Address.VARETH_ADDRESS, alice)
    vaCBETH = ERC20__factory.connect(Address.VACBETH_ADDRESS, alice)

    poolRegistry = PoolRegistry__factory.connect(POOL_REGISTRY_ADDRESS, alice)
    governor = await impersonateAccount(await poolRegistry.governor())
    nativeGateway = NativeTokenGateway__factory.connect(NATIVE_TOKEN_GATEWAY_ADDRESS, alice)

    const [pool1Address] = await poolRegistry.getPools()
    pool = Pool__factory.connect(pool1Address, alice)

    msdUSDC = DepositToken__factory.connect(USDC_DEPOSIT_ADDRESS, alice) // 6 decimals.
    msdDAI = DepositToken__factory.connect(DAI_DEPOSIT_ADDRESS, alice) // 8 decimals
    msdWBTC = DepositToken__factory.connect(WBTC_DEPOSIT_ADDRESS, alice)
    msdFRAX = DepositToken__factory.connect(FRAX_DEPOSIT_ADDRESS, alice)
    msdWETH = DepositToken__factory.connect(WETH_DEPOSIT_ADDRESS, alice)
    msdVaFRAX = DepositToken__factory.connect(VAFRAX_DEPOSIT_ADDRESS, alice)
    msdVaUSDC = DepositToken__factory.connect(VAUSDC_DEPOSIT_ADDRESS, alice)
    msdVaETH = DepositToken__factory.connect(VAETH_DEPOSIT_ADDRESS, alice)
    msdSfrxETH = DepositToken__factory.connect(SRFXETH_DEPOSIT_ADDRESS, alice)
    msdVaSTETH = DepositToken__factory.connect(VASTETH_DEPOSIT_ADDRESS, alice)
    msdVaRETH = DepositToken__factory.connect(VARETH_DEPOSIT_ADDRESS, alice)
    // WIP
    // msdVaCBETH = DepositToken__factory.connect(VACBETH_DEPOSIT_ADDRESS, alice)

    msUSDDebt = DebtToken__factory.connect(MSUSD_DEBT_ADDRESS, alice)
    msBTCDebt = DebtToken__factory.connect(MSBTC_DEBT_ADDRESS, alice)
    msETHDebt = DebtToken__factory.connect(MSETH_DEBT_ADDRESS, alice)

    msUSD = SyntheticToken__factory.connect(MSUSD_SYNTHETIC_ADDRESS, alice)
    msBTC = SyntheticToken__factory.connect(MSBTC_SYNTHETIC_ADDRESS, alice)
    msETH = SyntheticToken__factory.connect(MSETH_SYNTHETIC_ADDRESS, alice)

    await setTokenBalance(usdc.address, alice.address, parseUnits('10,000', 6))
    await setTokenBalance(dai.address, alice.address, parseUnits('10,000', 18))
    await setTokenBalance(wbtc.address, alice.address, parseUnits('10', 8))
    await setTokenBalance(frax.address, alice.address, parseUnits('10,000', 18))
    await setTokenBalance(weth.address, alice.address, parseUnits('20', 18))
    await setTokenBalance(vaFRAX.address, alice.address, parseUnits('10', 18))
    await setTokenBalance(vaUSDC.address, alice.address, parseUnits('10', 18))
    await setTokenBalance(vaETH.address, alice.address, parseUnits('20', 18))
    await setTokenBalance(sfrxETH.address, alice.address, parseUnits('20', 18))
    await setTokenBalance(vaSTETH.address, alice.address, parseUnits('20', 18))
    await setTokenBalance(vaRETH.address, alice.address, parseUnits('20', 18))
    await setTokenBalance(vaCBETH.address, alice.address, parseUnits('20', 18))

    await usdc.connect(alice).approve(msdUSDC.address, MaxUint256)
    await dai.connect(alice).approve(msdDAI.address, MaxUint256)
    await wbtc.connect(alice).approve(msdWBTC.address, MaxUint256)
    await frax.connect(alice).approve(msdFRAX.address, MaxUint256)
    await weth.connect(alice).approve(msdWETH.address, MaxUint256)
    await vaFRAX.connect(alice).approve(msdVaFRAX.address, MaxUint256)
    await vaUSDC.connect(alice).approve(msdVaUSDC.address, MaxUint256)
    await vaETH.connect(alice).approve(msdVaETH.address, MaxUint256)
    await sfrxETH.connect(alice).approve(msdSfrxETH.address, MaxUint256)
    await vaSTETH.connect(alice).approve(msdVaSTETH.address, MaxUint256)
    await vaRETH.connect(alice).approve(msdVaRETH.address, MaxUint256)
    // WIP
    // await vaCBETH.connect(alice).approve(msdVaCBETH.address, MaxUint256)

    const masterOracleGovernor = await impersonateAccount(Address.MASTER_ORACLE_GOVERNOR_ADDRESS)
    masterOracle = new ethers.Contract(
      Address.MASTER_ORACLE_ADDRESS,
      ['function defaultOracle() view returns(address)', 'function getPriceInUsd(address) view returns(uint256)'],
      masterOracleGovernor
    )
    const defaultOracle = new ethers.Contract(
      await masterOracle.defaultOracle(),
      ['function updateDefaultStalePeriod(uint256)'],
      masterOracleGovernor
    )
    await defaultOracle.updateDefaultStalePeriod(ethers.constants.MaxUint256)
  }

  beforeEach(async function () {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[, alice, bob] = await ethers.getSigners()
    await loadFixture(fixture)

    if (!isNodeHardhat && process.env.DEPLOYER) {
      // See more: https://github.com/wighawag/hardhat-deploy/issues/152#issuecomment-1402298376
      await impersonateAccount(process.env.DEPLOYER)
    }
  })

  describe('initial setup', function () {
    it('should have correct addresses', async function () {
      expect(POOL_REGISTRY_ADDRESS).eq(await pool.poolRegistry())
      expect(USDC_DEPOSIT_ADDRESS).eq(await pool.depositTokenOf(usdc.address))
      expect(DAI_DEPOSIT_ADDRESS).eq(await pool.depositTokenOf(dai.address))
      expect(WBTC_DEPOSIT_ADDRESS).eq(await pool.depositTokenOf(wbtc.address))
      expect(FRAX_DEPOSIT_ADDRESS).eq(await pool.depositTokenOf(frax.address))
      expect(WETH_DEPOSIT_ADDRESS).eq(await pool.depositTokenOf(weth.address))
      expect(VAETH_DEPOSIT_ADDRESS).eq(await pool.depositTokenOf(vaETH.address))
      expect(VAFRAX_DEPOSIT_ADDRESS).eq(await pool.depositTokenOf(vaFRAX.address))
      expect(VAUSDC_DEPOSIT_ADDRESS).eq(await pool.depositTokenOf(vaUSDC.address))
      expect(SRFXETH_DEPOSIT_ADDRESS).eq(await pool.depositTokenOf(sfrxETH.address))
      expect(VASTETH_DEPOSIT_ADDRESS).eq(await pool.depositTokenOf(vaSTETH.address))
      expect(VARETH_DEPOSIT_ADDRESS).eq(await pool.depositTokenOf(vaRETH.address))
      // WIP
      // expect(VACBETH_DEPOSIT_ADDRESS).eq(await pool.depositTokenOf(vaCBETH.address))
      expect(MSUSD_DEBT_ADDRESS).eq(await pool.debtTokenOf(msUSD.address))
      expect(MSBTC_DEBT_ADDRESS).eq(await pool.debtTokenOf(msBTC.address))
      expect(MSETH_DEBT_ADDRESS).eq(await pool.debtTokenOf(msETH.address))
    })

    it('should get prices for all assets', async function () {
      expect(await masterOracle.getPriceInUsd(usdc.address)).gt(0)
      expect(await masterOracle.getPriceInUsd(dai.address)).gt(0)
      expect(await masterOracle.getPriceInUsd(wbtc.address)).gt(0)
      expect(await masterOracle.getPriceInUsd(frax.address)).gt(0)
      expect(await masterOracle.getPriceInUsd(weth.address)).gt(0)
      expect(await masterOracle.getPriceInUsd(vaFRAX.address)).gt(0)
      expect(await masterOracle.getPriceInUsd(vaUSDC.address)).gt(0)
      expect(await masterOracle.getPriceInUsd(vaETH.address)).gt(0)
      expect(await masterOracle.getPriceInUsd(msUSD.address)).gt(0)
      expect(await masterOracle.getPriceInUsd(msBTC.address)).gt(0)
      expect(await masterOracle.getPriceInUsd(msETH.address)).gt(0)
      expect(await masterOracle.getPriceInUsd(sfrxETH.address)).gt(0)
      expect(await masterOracle.getPriceInUsd(vaSTETH.address)).gt(0)
      expect(await masterOracle.getPriceInUsd(vaRETH.address)).gt(0)
      expect(await masterOracle.getPriceInUsd(vaCBETH.address)).gt(0)
    })
  })

  describe('synth mainnet end to end sanity tests', function () {
    it('should deposit USDC', async function () {
      // given
      const amount = parseUnits('1', 6)

      // when
      const tx = () => msdUSDC.deposit(amount, alice.address)

      // then
      await expect(tx).changeTokenBalance(msdUSDC, alice, amount)
    })

    it('should deposit DAI', async function () {
      // given
      const amount = parseUnits('1', 18)

      // when
      const tx = () => msdDAI.deposit(amount, alice.address)

      // then
      await expect(tx).changeTokenBalance(msdDAI, alice, amount)
    })

    it('should deposit FRAX', async function () {
      // given
      const amount = parseUnits('1', 18)

      // when
      const tx = () => msdFRAX.deposit(amount, alice.address)

      // then
      await expect(tx).changeTokenBalance(msdFRAX, alice, amount)
    })

    it('should deposit WBTC', async function () {
      // given
      const amount = parseUnits('1', 8)

      // when
      const tx = () => msdWBTC.deposit(amount, alice.address)

      // then
      await expect(tx).changeTokenBalance(msdWBTC, alice, amount)
    })

    it('should deposit WETH', async function () {
      // given
      const amount = parseUnits('1', 18)

      // when
      const tx = () => msdWETH.deposit(amount, alice.address)

      // then
      await expect(tx).changeTokenBalance(msdWETH, alice, amount)
    })

    it('should deposit WETH using ETH', async function () {
      // given
      const amount = parseUnits('1', 18)

      // when
      const tx = () => nativeGateway.deposit(pool.address, {value: amount})

      // then
      await expect(tx).changeTokenBalance(msdWETH, alice, amount)
    })

    it('should deposit vaFRAX', async function () {
      // given
      const amount = parseUnits('1', 18)

      // when
      const tx = () => msdVaFRAX.deposit(amount, alice.address)

      // then
      await expect(tx).changeTokenBalance(msdVaFRAX, alice, amount)
    })

    it('should deposit vaUSDC', async function () {
      // given
      const amount = parseUnits('1', 18)

      // when
      const tx = () => msdVaUSDC.deposit(amount, alice.address)

      // then
      await expect(tx).changeTokenBalance(msdVaUSDC, alice, amount)
    })

    it('should deposit vaETH', async function () {
      // given
      const amount = parseUnits('1', 18)

      // when
      const tx = () => msdVaETH.deposit(amount, alice.address)

      // then
      await expect(tx).changeTokenBalance(msdVaETH, alice, amount)
    })

    it('should deposit sfrxETH', async function () {
      // given
      const amount = parseUnits('1', 18)

      // when
      const tx = () => msdSfrxETH.deposit(amount, alice.address)

      // then
      await expect(tx).changeTokenBalance(msdSfrxETH, alice, amount)
    })

    it('should deposit vaSTETH', async function () {
      // given
      const amount = parseUnits('1', 18)

      // when
      const tx = () => msdVaSTETH.deposit(amount, alice.address)

      // then
      await expect(tx).changeTokenBalance(msdVaSTETH, alice, amount)
    })

    it('should deposit vaRETH', async function () {
      // given
      const amount = parseUnits('1', 18)

      // when
      const tx = () => msdVaRETH.deposit(amount, alice.address)

      // then
      await expect(tx).changeTokenBalance(msdVaRETH, alice, amount)
    })

    // WIP
    it.skip('should deposit vaCBETH', async function () {
      // given
      const amount = parseUnits('1', 18)

      // when
      const tx = () => msdVaCBETH.deposit(amount, alice.address)

      // then
      await expect(tx).changeTokenBalance(msdVaCBETH, alice, amount)
    })

    it('should issue msUSD', async function () {
      // given
      await msdUSDC.deposit(parseUnits('10', await usdc.decimals()), alice.address)

      // when
      const amount = parseUnits('1', 6)
      const tx = () => msUSDDebt.issue(amount, alice.address)

      // then
      await expect(tx).changeTokenBalance(msUSD, alice, amount)
    })

    it('should issue msBTC', async function () {
      // given
      await msdUSDC.deposit(parseUnits('10', await usdc.decimals()), alice.address)

      // when
      const amount = parseUnits('1', 8)
      const tx = () => msBTCDebt.issue(amount, alice.address)

      // then
      await expect(tx).changeTokenBalance(msBTC, alice, amount)
    })

    it('should issue msETH', async function () {
      // given
      await msdUSDC.deposit(parseUnits('10,000', await usdc.decimals()), alice.address)

      // when
      const amount = parseEther('1')
      const tx = () => msETHDebt.issue(amount, alice.address)

      // then
      await expect(tx).changeTokenBalance(msETH, alice, amount)
    })

    it('should increase debt by the time', async function () {
      // given
      await msdUSDC.deposit(parseUnits('500', await usdc.decimals()), alice.address)
      await msUSDDebt.issue(parseEther('100'), alice.address)
      const debtBefore = await msUSDDebt.balanceOf(alice.address)

      // when
      const interestRate = parseEther('0.02') // 2%
      await msUSDDebt.connect(governor).updateInterestRate(interestRate)
      await time.increase(time.duration.years(1))
      await msUSDDebt.accrueInterest()

      // then
      const expectedDebt = debtBefore.mul(parseEther('1').add(interestRate)).div(parseEther('1'))
      expect(await pool.debtOf(alice.address)).closeTo(expectedDebt, parseEther('0.01'))
    })

    it('should liquidate unhealthy position', async function () {
      // given
      await msdUSDC.deposit(parseUnits('400', await usdc.decimals()), alice.address)
      await msUSDDebt.connect(governor).updateInterestRate(parseEther('0')) // 0%
      const {_issuableInUsd} = await pool.debtPositionOf(alice.address)
      await msUSDDebt.issue(_issuableInUsd, alice.address)
      await msUSDDebt.connect(governor).updateInterestRate(parseEther('0.5')) // 50%
      await time.increase(time.duration.minutes(10))
      await msUSDDebt.accrueInterest()
      expect((await pool.debtPositionOf(alice.address))._isHealthy).false

      // when
      await msdUSDC.deposit(parseUnits('400', await usdc.decimals()), bob.address)
      await msUSDDebt.connect(bob).issue(parseEther('100'), bob.address)
      const amountToRepay = parseEther('50') // repay all user's debt
      const tx = await pool.connect(bob).liquidate(msUSD.address, alice.address, amountToRepay, msdUSDC.address)

      // then
      await expect(tx).emit(pool, 'PositionLiquidated')
    })

    it('should swap', async function () {
      // given
      await msdUSDC.deposit(parseUnits('10', await usdc.decimals()), alice.address)
      await msUSDDebt.issue(parseEther('1'), alice.address)
      const debtBefore = await pool.debtOf(alice.address)
      expect(await msUSD.balanceOf(alice.address)).gt(0)
      expect(await msETH.balanceOf(alice.address)).eq(0)

      // when
      await pool.swap(msUSD.address, msETH.address, await msUSD.balanceOf(alice.address))

      // then
      expect(await msUSD.balanceOf(alice.address)).eq(0)
      expect(await msETH.balanceOf(alice.address)).gt(0)
      const debtsAfter = await pool.debtOf(alice.address)
      expect(debtsAfter).closeTo(debtBefore, parseEther('0.0001'))
    })

    it('should repay', async function () {
      // given
      await msdUSDC.deposit(parseUnits('10', await usdc.decimals()), alice.address)
      const debtBefore = await msUSDDebt.balanceOf(alice.address)
      const debtToIssue = parseEther('1')
      await msUSDDebt.issue(debtToIssue, alice.address)
      const msUSDDebtBalance = await msUSDDebt.balanceOf(alice.address)
      const expectedDebt = debtBefore.add(debtToIssue)
      expect(await pool.debtOf(alice.address)).closeTo(expectedDebt, dust)
      expect(await msUSD.balanceOf(alice.address)).closeTo(expectedDebt, dust)

      // when
      const debtToRepay = parseEther('0.5')
      const repayFee = parseEther('0')
      const debtPlusRepayFee = debtToRepay.mul(parseEther('1').add(repayFee)).div(parseEther('1'))
      await msUSDDebt.repay(alice.address, debtPlusRepayFee)

      // then
      expect(await msUSDDebt.balanceOf(alice.address)).lt(msUSDDebtBalance)
    })

    it('should revert if repaying using wrong synthetic asset', async function () {
      // given
      await msdUSDC.deposit(parseUnits('10', await usdc.decimals()), alice.address)
      const debtBefore = await msUSDDebt.balanceOf(alice.address)
      const debtToIssue = parseEther('1')
      await msUSDDebt.issue(debtToIssue, alice.address)
      const expectedDebt = debtBefore.add(debtToIssue)
      expect(await pool.debtOf(alice.address)).closeTo(expectedDebt, dust)
      expect(await msUSD.balanceOf(alice.address)).closeTo(expectedDebt, dust)
      await pool.swap(msUSD.address, msETH.address, await msUSD.balanceOf(alice.address))

      // when
      const tx = msUSDDebt.repay(alice.address, 10) // pay 10 wei

      // then
      await expect(tx).revertedWithCustomError(msUSDDebt, 'BurnAmountExceedsBalance')
    })

    it('should withdraw', async function () {
      await msdUSDC.deposit(parseUnits('10', await usdc.decimals()), alice.address)
      await msUSDDebt.issue(parseEther('1'), alice.address)

      // when
      const amount = await msdUSDC.unlockedBalanceOf(alice.address)
      await msdUSDC.withdraw(amount, alice.address)

      // then
      const {_depositInUsd: depositAfter} = await pool.depositOf(alice.address)
      expect(depositAfter).closeTo(0, dust)
    })
  })
})
