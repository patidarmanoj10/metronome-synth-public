/* eslint-disable max-len */
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {expect} from 'chai'
import {Contract} from 'ethers'
import hre, {ethers} from 'hardhat'
import {loadFixture, setCode, time} from '@nomicfoundation/hardhat-network-helpers'
import {toUSD, parseEther, parseUnits} from '../helpers'
import {impersonateAccount, setTokenBalance} from './helpers/index'
import Address from '../helpers/address'
import {
  DepositToken,
  SyntheticToken,
  Pool,
  ERC20,
  DebtToken,
  IWETH,
  NativeTokenGateway,
  PoolRegistry,
  SmartFarmingManager,
  ProxyOFT,
} from '../typechain'
import Constants from '../helpers/constants'

let POOL_REGISTRY_ADDRESS: string
let USDC_DEPOSIT_ADDRESS: string
let USDT_DEPOSIT_ADDRESS: string
let WETH_DEPOSIT_ADDRESS: string
let MSUSD_DEBT_ADDRESS: string
let MSETH_DEBT_ADDRESS: string
let MSBTC_DEBT_ADDRESS: string
let MSUSD_SYNTHETIC_ADDRESS: string
let MSETH_SYNTHETIC_ADDRESS: string
let MSBTC_SYNTHETIC_ADDRESS: string
let NATIVE_TOKEN_GATEWAY_ADDRESS: string
let MSUSD_PROXYOFT_ADDRESS: string
let MSETH_PROXYOFT_ADDRESS: string
let SFM_ADDRESS: string

const {MaxUint256} = ethers.constants
const dust = toUSD('5')

const isNodeHardhat = hre.network.name === 'hardhat'

/**
 * This test suite exercises the state of the protocol after running deployment scripts on top of a forked chain
 * In summary:
 * 1) run hardhat node forking hemi
 * 2) run deployment scripts against localhost node
 * 3) run this test suite
 * See more: `../docs/deployment-e2e-tests.md`
 */
describe.skip('E2E tests (next hemi release)', function () {
  let governor: SignerWithAddress
  let alice: SignerWithAddress
  let bob: SignerWithAddress
  let weth: IWETH
  let usdc: ERC20
  let usdt: ERC20
  let masterOracle: Contract
  let poolRegistry: PoolRegistry
  let nativeGateway: NativeTokenGateway
  let smartFarmingManager: SmartFarmingManager
  let pool: Pool
  let msdWETH: DepositToken
  let msdUSDC: DepositToken
  let msdUSDT: DepositToken

  let msUSDDebt: DebtToken
  let msETHDebt: DebtToken
  let msBTCDebt: DebtToken
  let msUSD: SyntheticToken
  let msETH: SyntheticToken
  let msBTC: SyntheticToken
  let msUSDProxyOFT: ProxyOFT
  let msETHProxyOFT: ProxyOFT

  async function fixture() {
    // Note: Using dynamic import otherwise test will fail when `/deployments/localhost` doesn't exist
    ;({address: POOL_REGISTRY_ADDRESS} = await import('../deployments/localhost/PoolRegistry.json'))
    ;({address: WETH_DEPOSIT_ADDRESS} = await import('../deployments/localhost/WETHDepositToken_Pool1.json'))
    ;({address: USDC_DEPOSIT_ADDRESS} = await import('../deployments/localhost/USDCDepositToken_Pool1.json'))
    ;({address: USDT_DEPOSIT_ADDRESS} = await import('../deployments/localhost/USDTDepositToken_Pool1.json'))
    ;({address: MSUSD_DEBT_ADDRESS} = await import('../deployments/localhost/MsUSDDebt_Pool1.json'))
    ;({address: MSETH_DEBT_ADDRESS} = await import('../deployments/localhost/MsETHDebt_Pool1.json'))
    ;({address: MSBTC_DEBT_ADDRESS} = await import('../deployments/localhost/MsBTCDebt_Pool1.json'))
    ;({address: MSUSD_SYNTHETIC_ADDRESS} = await import('../deployments/localhost/MsUSDSynthetic.json'))
    ;({address: MSETH_SYNTHETIC_ADDRESS} = await import('../deployments/localhost/MsETHSynthetic.json'))
    ;({address: MSBTC_SYNTHETIC_ADDRESS} = await import('../deployments/localhost/MsBTCSynthetic.json'))
    ;({address: MSUSD_PROXYOFT_ADDRESS} = await import('../deployments/localhost/MsUSDProxyOFT.json'))
    ;({address: MSETH_PROXYOFT_ADDRESS} = await import('../deployments/localhost/MsETHProxyOFT.json'))
    ;({address: NATIVE_TOKEN_GATEWAY_ADDRESS} = await import('../deployments/localhost/NativeTokenGateway.json'))
    ;({address: SFM_ADDRESS} = await import('../deployments/localhost/SmartFarmingManager_Pool1.json'))

    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[, alice, bob] = await ethers.getSigners()
    weth = await ethers.getContractAt('IWETH', Address.WETH_ADDRESS, alice)
    usdc = await ethers.getContractAt('ERC20', Address.USDC_ADDRESS, alice)
    usdt = await ethers.getContractAt('ERC20', Address.USDT_ADDRESS, alice)

    poolRegistry = await ethers.getContractAt('PoolRegistry', POOL_REGISTRY_ADDRESS, alice)
    governor = await impersonateAccount(await poolRegistry.governor())
    nativeGateway = await ethers.getContractAt('NativeTokenGateway', NATIVE_TOKEN_GATEWAY_ADDRESS, alice)

    const [pool1Address] = await poolRegistry.getPools()
    pool = <Pool>await ethers.getContractAt('contracts/Pool.sol:Pool', pool1Address, alice)

    msdWETH = await ethers.getContractAt('DepositToken', WETH_DEPOSIT_ADDRESS, alice)
    msdUSDC = await ethers.getContractAt('DepositToken', USDC_DEPOSIT_ADDRESS, alice) // 6 decimals
    msdUSDT = await ethers.getContractAt('DepositToken', USDT_DEPOSIT_ADDRESS, alice) // 6 decimals

    msUSDDebt = await ethers.getContractAt('DebtToken', MSUSD_DEBT_ADDRESS, alice)
    msETHDebt = await ethers.getContractAt('DebtToken', MSETH_DEBT_ADDRESS, alice)
    msBTCDebt = await ethers.getContractAt('DebtToken', MSBTC_DEBT_ADDRESS, alice)

    msUSD = await ethers.getContractAt('SyntheticToken', MSUSD_SYNTHETIC_ADDRESS, alice)
    msETH = await ethers.getContractAt('SyntheticToken', MSETH_SYNTHETIC_ADDRESS, alice)
    msBTC = await ethers.getContractAt('SyntheticToken', MSBTC_SYNTHETIC_ADDRESS, alice)

    msUSDProxyOFT = await ethers.getContractAt('ProxyOFT', MSUSD_PROXYOFT_ADDRESS, alice)
    msETHProxyOFT = await ethers.getContractAt('ProxyOFT', MSETH_PROXYOFT_ADDRESS, alice)

    smartFarmingManager = await ethers.getContractAt('SmartFarmingManager', SFM_ADDRESS, alice)

    await setTokenBalance(weth.address, alice.address, parseUnits('20', 18))
    await setTokenBalance(usdc.address, alice.address, parseUnits('10,000', 6))
    // Note: Setting balance for USDT is not working
    // await setTokenBalance(usdt.address, alice.address, parseUnits('10,000', 6))

    await weth.connect(alice).approve(msdWETH.address, MaxUint256)
    await usdc.connect(alice).approve(msdUSDC.address, MaxUint256)
    await usdc.connect(alice).approve(msdUSDT.address, MaxUint256)

    const masterOracleGovernor = await impersonateAccount(Address.MASTER_ORACLE_GOVERNOR_ADDRESS)
    masterOracle = new ethers.Contract(
      Address.MASTER_ORACLE_ADDRESS,
      ['function defaultOracle() view returns(address)', 'function getPriceInUsd(address) view returns(uint256)'],
      masterOracleGovernor
    )

    if (!(await pool.doesDebtTokenExist(msBTCDebt.address))) {
      await pool.connect(governor).addDebtToken(msBTCDebt.address)
    }

    // These well-known accounts have delegated code which reverts when receiving ETH
    await setCode(alice.address, '0x00')
    await setCode(bob.address, '0x00')
  }

  beforeEach(async function () {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[, alice, bob] = await ethers.getSigners()
    await loadFixture(fixture)

    if (isNodeHardhat) {
      throw Error('This test suite must be run against localhost node')
    }

    if (process.env.DEPLOYER) {
      // See more: https://github.com/wighawag/hardhat-deploy/issues/152#issuecomment-1402298376
      await impersonateAccount(process.env.DEPLOYER)
    }
  })

  describe('initial setup', function () {
    it('should have correct addresses', async function () {
      expect(POOL_REGISTRY_ADDRESS).eq(await pool.poolRegistry())
      expect(SFM_ADDRESS).eq(await pool.smartFarmingManager())
      expect(pool.address).eq(await smartFarmingManager.pool())

      expect(WETH_DEPOSIT_ADDRESS).eq(await pool.depositTokenOf(weth.address))
      expect(USDC_DEPOSIT_ADDRESS).eq(await pool.depositTokenOf(usdc.address))
      expect(USDT_DEPOSIT_ADDRESS).eq(await pool.depositTokenOf(usdt.address))

      expect(MSUSD_SYNTHETIC_ADDRESS).eq(await msUSDProxyOFT.token())
      expect(MSETH_SYNTHETIC_ADDRESS).eq(await msETHProxyOFT.token())

      expect(MSUSD_DEBT_ADDRESS).eq(await pool.debtTokenOf(msUSD.address))
      expect(MSETH_DEBT_ADDRESS).eq(await pool.debtTokenOf(msETH.address))

      expect(MSUSD_PROXYOFT_ADDRESS).eq(await msUSD.proxyOFT())
      expect(MSETH_PROXYOFT_ADDRESS).eq(await msETH.proxyOFT())
    })

    it('should get prices for all assets', async function () {
      expect(await masterOracle.getPriceInUsd(weth.address)).gt(0)
      expect(await masterOracle.getPriceInUsd(usdc.address)).gt(0)
      expect(await masterOracle.getPriceInUsd(usdt.address)).gt(0)
      expect(await masterOracle.getPriceInUsd(msUSD.address)).gt(0)
      expect(await masterOracle.getPriceInUsd(msETH.address)).gt(0)
      expect(await masterOracle.getPriceInUsd(msBTC.address)).gt(0)
    })
  })

  describe('synth end to end sanity tests', function () {
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

    it('should deposit USDC', async function () {
      // given
      const amount = parseUnits('1', 6)

      // when
      const tx = () => msdUSDC.deposit(amount, alice.address)

      // then
      await expect(tx).changeTokenBalance(msdUSDC, alice, amount)
    })

    // Note: Setting balance for USDT is not working
    it.skip('should deposit USDT', async function () {
      // given
      const amount = parseUnits('1', 6)

      // when
      const tx = () => msdUSDT.deposit(amount, alice.address)

      // then
      await expect(tx).changeTokenBalance(msdUSDT, alice, amount)
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

    it('should issue msETH', async function () {
      // given
      await msdUSDC.deposit(parseUnits('10,000', await usdc.decimals()), alice.address)

      // when
      const amount = parseEther('1')
      const tx = () => msETHDebt.issue(amount, alice.address)

      // then
      await expect(tx).changeTokenBalance(msETH, alice, amount)
    })

    it('should issue msBTC', async function () {
      // given
      await msdUSDC.deposit(parseUnits('10,000', await usdc.decimals()), alice.address)

      // when
      const amount = parseUnits('0.01', 8)
      const tx = () => msBTCDebt.issue(amount, alice.address)

      // then
      await expect(tx).changeTokenBalance(msBTC, alice, amount)
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

    describe('cross-chain operations', function () {
      it('should not revert when transferring msETH to another chain', async function () {
        // given
        await msdWETH.deposit(parseEther('1'), alice.address)
        const amount = parseEther('0.1')
        await msETHDebt.issue(amount, alice.address)

        // when-then
        await msETHProxyOFT['sendFrom(address,uint16,address,uint256)'](
          alice.address,
          Constants.LZ_MAINNET_CHAIN_ID,
          alice.address,
          amount,
          {
            value: parseEther('0.5'),
          }
        )
      })
    })
  })
})
