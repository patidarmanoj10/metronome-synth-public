import {BigNumber} from 'ethers'
import {DeployFunction, DeployResult} from 'hardhat-deploy/types'
import {HardhatRuntimeEnvironment} from 'hardhat/types'
import Address from '../../helpers/address'

const {MULTICALL_ADDRESS} = Address

interface ContractConfig {
  alias: string
  contract: string
  adminContract: string
}

interface UpgradableContractsConfig {
  MasterOracle: ContractConfig
  Controller: ContractConfig
  Treasury: ContractConfig
  DepositToken: ContractConfig
  SyntheticToken: ContractConfig
  DebtToken: ContractConfig
  VspRewardsDistributor: ContractConfig
}

export const UpgradableContracts: UpgradableContractsConfig = {
  MasterOracle: {alias: 'MasterOracle', contract: 'MasterOracle', adminContract: 'MasterOracleUpgrader'},
  Controller: {alias: 'Controller', contract: 'Controller', adminContract: 'ControllerUpgrader'},
  Treasury: {alias: 'Treasury', contract: 'Treasury', adminContract: 'TreasuryUpgrader'},
  DepositToken: {alias: '', contract: 'DepositToken', adminContract: 'DepositTokenUpgrader'},
  SyntheticToken: {alias: '', contract: 'SyntheticToken', adminContract: 'SyntheticTokenUpgrader'},
  DebtToken: {alias: '', contract: 'DebtToken', adminContract: 'DebtTokenUpgrader'},
  VspRewardsDistributor: {
    alias: 'VspRewardsDistributor',
    contract: 'RewardsDistributor',
    adminContract: 'RewardsDistributorUpgrader',
  },
}

const updateMulticallIfNeeded = async (
  {deployments: {read, execute}, getNamedAccounts}: HardhatRuntimeEnvironment,
  contractConfig: ContractConfig
): Promise<void> => {
  const {deployer} = await getNamedAccounts()
  const {adminContract} = contractConfig

  const multicallAddress = await read(adminContract, 'multicall')

  if (multicallAddress != MULTICALL_ADDRESS) {
    await execute(adminContract, {from: deployer, log: true}, 'updateMulticall', MULTICALL_ADDRESS)
  }
}

export const deterministic = async (
  hre: HardhatRuntimeEnvironment,
  contractConfig: ContractConfig
): Promise<{
  address: string
  implementationAddress?: string | undefined
  deploy(): Promise<DeployResult>
}> => {
  const {
    deployments: {deterministic: wrappedDeterministic},
    getNamedAccounts,
  } = hre
  const {deployer} = await getNamedAccounts()
  const {alias, contract, adminContract} = contractConfig
  const {
    address,
    implementationAddress,
    deploy: deployContract,
  } = await wrappedDeterministic(alias, {
    contract: contract || alias,
    from: deployer,
    log: true,
    proxy: {
      proxyContract: 'OpenZeppelinTransparentProxy',
      viaAdminContract: adminContract,
    },
  })

  const deploy = async (): Promise<DeployResult> => {
    const result = await deployContract()

    // Note: `hardhat-deploy` doesn't support constructor args to a custom ProxyAdmin contract
    // There is an open PR to address this: https://github.com/wighawag/hardhat-deploy/pull/142
    // As workaround, we check if the default multicall contract (ethereum mainnet) is the same as the desired
    // and update it if needed
    await updateMulticallIfNeeded(hre, contractConfig)
    return result
  }

  return {address, implementationAddress, deploy}
}

const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1)

interface OracleProps {
  function:
    | 'addOrUpdateAssetThatUsesChainlink'
    | 'addOrUpdateAssetThatUsesUniswapV2'
    | 'addOrUpdateAssetThatUsesUniswapV3'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  args: any[]
}

interface SyntheticDeployFunctionProps {
  name: string
  symbol: string
  decimals: number
  interestRate: BigNumber
  oracle: OracleProps
}

export const buildSyntheticDeployFunction = ({
  name,
  symbol,
  decimals,
  interestRate,
  oracle,
}: SyntheticDeployFunctionProps): DeployFunction => {
  const debtAlias = `${capitalize(symbol)}Debt`
  const syntheticAlias = `${capitalize(symbol)}Synthetic`

  const deployFunction: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
    const {getNamedAccounts, deployments} = hre
    const {execute} = deployments
    const {deployer} = await getNamedAccounts()

    const {address: controllerAddress} = await deterministic(hre, UpgradableContracts.Controller)
    const {deploy: deployDebt} = await deterministic(hre, {
      ...UpgradableContracts.DebtToken,
      alias: debtAlias,
    })

    const {deploy: deploySynthetic} = await deterministic(hre, {
      ...UpgradableContracts.SyntheticToken,
      alias: syntheticAlias,
    })

    const {address: debtTokenAddress} = await deployDebt()

    const {address: syntheticTokenAddress} = await deploySynthetic()

    await execute(
      debtAlias,
      {from: deployer, log: true},
      'initialize',
      `${name}-Debt`,
      `${symbol}-Debt`,
      decimals,
      controllerAddress,
      syntheticTokenAddress
    )

    await execute(
      syntheticAlias,
      {from: deployer, log: true},
      'initialize',
      name,
      symbol,
      decimals,
      controllerAddress,
      debtTokenAddress,
      interestRate
    )

    await execute(
      UpgradableContracts.Controller.alias,
      {from: deployer, log: true},
      'addSyntheticToken',
      syntheticTokenAddress
    )

    await execute('DefaultOracle', {from: deployer, log: true}, oracle.function, syntheticTokenAddress, ...oracle.args)
  }

  deployFunction.tags = [syntheticAlias]

  return deployFunction
}

interface DepositDeployFunctionProps {
  underlyingAddress: string
  underlyingSymbol: string
  underlyingDecimals: number
  collateralizationRatio: BigNumber
  oracle: OracleProps
}

export const buildDepositDeployFunction = ({
  underlyingAddress,
  underlyingSymbol,
  underlyingDecimals,
  collateralizationRatio,
  oracle,
}: DepositDeployFunctionProps): DeployFunction => {
  const alias = `${underlyingSymbol}DepositToken`
  const symbol = `vs${underlyingSymbol}-Deposit`

  const deployFunction: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
    const {getNamedAccounts, deployments} = hre
    const {execute} = deployments
    const {deployer} = await getNamedAccounts()

    const {address: controllerAddress} = await deterministic(hre, UpgradableContracts.Controller)

    const {deploy} = await deterministic(hre, {...UpgradableContracts.DepositToken, alias})

    const {address: depositTokenAddress} = await deploy()

    await execute(
      alias,
      {from: deployer, log: true},
      'initialize',
      underlyingAddress,
      controllerAddress,
      symbol,
      underlyingDecimals,
      collateralizationRatio
    )

    await execute(
      UpgradableContracts.Controller.alias,
      {from: deployer, log: true},
      'addDepositToken',
      depositTokenAddress
    )

    await execute('DefaultOracle', {from: deployer, log: true}, oracle.function, depositTokenAddress, ...oracle.args)
  }

  deployFunction.tags = [alias]

  return deployFunction
}
