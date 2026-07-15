/* eslint-disable camelcase */
/* eslint-disable max-len */
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {expect} from 'chai'
import {Contract} from 'ethers'
import hre, {ethers} from 'hardhat'
import {loadFixture, time} from '@nomicfoundation/hardhat-network-helpers'
import {DataServiceWrapper, WrapperBuilder} from '@redstone-finance/evm-connector'
import {parseEther, parseUnits} from '../helpers'
import {impersonateAccount, setTokenBalance, disableForking, enableForking} from './helpers'
import Address from '../helpers/address'
import {DepositToken, SyntheticToken, Pool, PoolRegistry, IOperator, Operator, IERC20, DebtToken} from '../typechain'
import {address as POOL_REGISTRY_ADDRESS} from '../deployments/hemi/PoolRegistry.json'
import {address as OPERATOR_ADDRESS} from '../deployments/hemi/Operator.json'
import {address as MSETH_SYNTHETIC_ADDRESS} from '../deployments/hemi/MsETHSynthetic.json'
import {address as MSETH_DEBT_ADDRESS} from '../deployments/hemi/MsETHDebt_Pool1_Proxy.json'

const {MaxUint256} = ethers.constants

const isNodeHardhat = hre.network.name === 'hardhat'

const masterOracleAbi = [
  'function getPriceInUsd(address) view returns(uint256)',
  'function updateTokenOracle(address token_, address oracle_) external',
]

const priceProviderAbi = [
  'function tokensOf(bytes32 feedId_) external view returns (address[] memory tokens_)',
  'function updateFeed(bytes32 feedId_, address[] memory tokens_) external',
  'function updatePrice(bytes32[] memory dataFeedIds_) external',
  'function getUniqueSignersThreshold() external view returns (uint8)',
  'function getDataServiceId() external view returns (string memory)',
  'function getPriceInUsd(address token_) external view returns (uint256 _priceInUsd, uint256 _lastUpdatedAt)',
]

const RED_STONE_PRICE_PROVIDER = '0x7b8A1D28Ef8d09b442c6070316D92401fBAD36BF'

// NOTE: RedStone pull token feed name. Usually it is same as token symbol.
const TOKEN_FEED_NAME = 'rsETH'
const TOKEN_USD_FEED_ID = ethers.utils.formatBytes32String(TOKEN_FEED_NAME) // i.e., bytes32("RSETH")

// NOTE: This test file has configured based on following criteria
// - Synth token is deployed i.e. msETH
// - Debt token is deployed i.e. msETHDebt
// - Deposit token is NOT deployed
// - Collateral token address on given chain is known
// Updated variables given below to test other collaterals
const COLLATERAL_ADDRESS = '0xc3eACf0612346366Db554C991D7858716db09f58' // rsETH on Hemi
const SYNTH_TOKEN_ADDRESS = MSETH_SYNTHETIC_ADDRESS
const DEBT_TOKEN_ADDRESS = MSETH_DEBT_ADDRESS

/**
 * The goal of this test suite is to test integration of pull oracle(RedStonePriceProvider) with Synth
 */
describe.skip('E2E pull oracle tests (@hemi)', function () {
  let alice: SignerWithAddress
  let bob: SignerWithAddress
  let collateral: IERC20
  let masterOracle: Contract
  let pullPriceProvider: Contract
  let poolRegistry: PoolRegistry
  let pool: Pool
  let operator: Operator
  let depositToken: DepositToken
  let synthToken: SyntheticToken
  let debtToken: DebtToken

  if (isNodeHardhat) {
    before(async function () {
      await enableForking('hemi')
    })

    after(disableForking)
  }

  async function fixture() {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[, alice, bob] = await ethers.getSigners()

    collateral = await ethers.getContractAt('IERC20', COLLATERAL_ADDRESS, alice)
    poolRegistry = await ethers.getContractAt('PoolRegistry', POOL_REGISTRY_ADDRESS, alice)

    const [pool1Address] = await poolRegistry.getPools()
    pool = <Pool>await ethers.getContractAt('contracts/Pool.sol:Pool', pool1Address, alice)
    const poolGovernor = await impersonateAccount(await pool.governor())

    // Deploy impl and proxy for token
    depositToken = await (await ethers.getContractFactory('DepositToken')).deploy()
    depositToken = await depositToken.deployed()
    const proxy = await (
      await ethers.getContractFactory('TransparentUpgradeableProxy')
    ).deploy(depositToken.address, bob.address, '0x')
    depositToken = await ethers.getContractAt('DepositToken', proxy.address, alice)
    await depositToken.initialize(
      collateral.address,
      pool.address,
      'msdToken',
      'MSDT',
      18,
      parseEther('0.8'),
      parseEther('100')
    )

    await depositToken.connect(poolGovernor).updateMaxTotalSupply(parseEther('1000'))
    await pool.connect(poolGovernor).addDepositToken(depositToken.address)

    synthToken = await ethers.getContractAt('SyntheticToken', SYNTH_TOKEN_ADDRESS, alice)
    debtToken = await ethers.getContractAt('DebtToken', DEBT_TOKEN_ADDRESS, alice)

    operator = await ethers.getContractAt('Operator', OPERATOR_ADDRESS)

    await setTokenBalance(collateral.address, alice.address, parseUnits('20', 18))
    expect(await collateral.balanceOf(alice.address)).gt(0)

    await collateral.connect(alice).approve(depositToken.address, MaxUint256)

    const masterOracleGovernor = await impersonateAccount(Address.MASTER_ORACLE_GOVERNOR_ADDRESS)
    masterOracle = new ethers.Contract(Address.MASTER_ORACLE_ADDRESS, masterOracleAbi, masterOracleGovernor)

    pullPriceProvider = new ethers.Contract(RED_STONE_PRICE_PROVIDER, priceProviderAbi, masterOracleGovernor)
    // update pull oracle feed to support msETH and WETH
    await pullPriceProvider.updateFeed(TOKEN_USD_FEED_ID, [synthToken.address, collateral.address])

    // use pull oracle for msETH and WETH
    await masterOracle.updateTokenOracle(synthToken.address, pullPriceProvider.address)
    await masterOracle.updateTokenOracle(collateral.address, pullPriceProvider.address)

    // RedStone library updates price based on current server time.
    // update block.timestamp so that it is same as current server time.
    const currentTimestamp = parseInt((Date.now() / 1000).toFixed())
    await time.increaseTo(currentTimestamp)
  }

  beforeEach(async function () {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[, alice] = await ethers.getSigners()
    await loadFixture(fixture)

    if (process.env.DEPLOYER) {
      await impersonateAccount(process.env.DEPLOYER)
    }
  })

  describe('synth hemi pull oracle end to end tests', function () {
    it('should update price via direct contract call', async function () {
      // given
      const amount = parseEther('1')
      await depositToken.deposit(amount, alice.address)
      // if price is expired then call will fail
      const tx = pool.debtPositionOf(alice.address)
      await expect(tx).revertedWith('invalid-token-price')

      // when
      const wrappedPriceProvider = WrapperBuilder.wrap(pullPriceProvider).usingDataService({
        dataPackagesIds: [TOKEN_FEED_NAME],
      })
      // update price by directly calling priceProvider
      await wrappedPriceProvider.updatePrice([TOKEN_USD_FEED_ID])

      // then
      const priceInUsd = await masterOracle.getPriceInUsd(synthToken.address)
      const {_depositInUsd} = await pool.debtPositionOf(alice.address)
      expect(_depositInUsd).eq(amount.mul(priceInUsd).div(parseEther('1')))
    })

    it('should use operator to update oracle price and read calls', async function () {
      const amount = parseEther('1')
      await depositToken.deposit(amount, alice.address)
      const tx = pool.debtPositionOf(alice.address)
      // revert due to expired price
      await expect(tx).revertedWith('invalid-token-price')

      const dataService = new DataServiceWrapper({
        dataServiceId: 'redstone-primary-prod',
        dataPackagesIds: [TOKEN_FEED_NAME],
      })

      const populatedTransaction = await dataService
        .overwriteEthersContract(pullPriceProvider)
        .populateTransaction.updatePrice([TOKEN_USD_FEED_ID])
      const updatePriceCallData = populatedTransaction.data
      // test should fail when data is undefined
      if (!updatePriceCallData) {
        throw new Error('updatePriceCallData is undefined')
      }

      const readDebtPositionCallData = pool.interface.encodeFunctionData('debtPositionOf', [alice.address])
      const getPriceCallData = masterOracle.interface.encodeFunctionData('getPriceInUsd', [synthToken.address])
      const calls: IOperator.CallStruct[] = [
        {target: pullPriceProvider.address, value: 0, callData: updatePriceCallData},
        {target: pool.address, value: 0, callData: readDebtPositionCallData},
        {target: masterOracle.address, value: 0, callData: getPriceCallData},
      ]

      // notice this is callStatic
      const [, debtPosition, ethPrice] = await operator.callStatic.execute(calls)

      const [isHealthy, depositInUsd, debtInUsd, issuableLimitInUsd, issuableInUsd] =
        ethers.utils.defaultAbiCoder.decode(['bool', 'uint256', 'uint256', 'uint256', 'uint256'], debtPosition)

      const amountInUSD = amount.mul(ethPrice).div(parseEther('1'))
      const collateralFactor = await depositToken.collateralFactor()
      const limitInUSD = amountInUSD.mul(collateralFactor).div(parseEther('1'))

      expect([isHealthy, depositInUsd, debtInUsd, issuableLimitInUsd, issuableInUsd]).deep.eq([
        true,
        amountInUSD,
        0,
        limitInUSD,
        limitInUSD,
      ])
    })

    it('should deposit rsETH and issue msETH', async function () {
      // given
      await depositToken.deposit(parseEther('2'), alice.address)
      const wrappedPriceProvider = WrapperBuilder.wrap(pullPriceProvider).usingDataService({
        dataPackagesIds: [TOKEN_FEED_NAME],
      })
      await wrappedPriceProvider.updatePrice([TOKEN_USD_FEED_ID])

      // when
      const amount = parseEther('1')
      const tx = () => debtToken.issue(amount, alice.address)

      // then
      await expect(tx).changeTokenBalance(synthToken, alice, amount)
    })
  })
})
