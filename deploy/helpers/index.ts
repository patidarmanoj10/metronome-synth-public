import {BigNumber} from 'ethers'
import {DeployFunction, DeployResult} from 'hardhat-deploy/types'
import {HardhatRuntimeEnvironment} from 'hardhat/types'

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

export const deterministic = async (
  hre: HardhatRuntimeEnvironment,
  contractConfig: ContractConfig,
  salt?: string
): Promise<{
  address: string
  implementationAddress?: string | undefined
  deploy(): Promise<DeployResult>
}> => {
  const {
    deployments: {deterministic: wrappedDeterministic, getOrNull},
    getNamedAccounts,
  } = hre

  const {deployer} = await getNamedAccounts()
  const {alias, contract, adminContract} = contractConfig

  const upgrader = await getOrNull(adminContract)

  const viaAdminContract = !upgrader
    ? adminContract
    : {
        name: adminContract,
      }

  const {address, implementationAddress, deploy} = await wrappedDeterministic(alias, {
    contract,
    from: deployer,
    log: true,
    proxy: {
      proxyContract: 'OpenZeppelinTransparentProxy',
      viaAdminContract,
    },
    salt,
  })

  return {address, implementationAddress, deploy}
}

const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1)

interface OracleChainlinkProps {
  function: 'addOrUpdateAssetThatUsesChainlink'
  args: {aggregator: string; stalePeriod: number}
}

interface OracleUniV2Props {
  function: 'addOrUpdateAssetThatUsesUniswapV2'
  args: {underlying: string; stalePeriod: number}
}

interface OracleUniV3Props {
  function: 'addOrUpdateAssetThatUsesUniswapV3'
  args: {underlying: string}
}

interface OracleUSDPegProps {
  function: 'addOrUpdateUsdAsset'
  args?: Record<string, never>
}

interface SyntheticDeployFunctionProps {
  name: string
  symbol: string
  decimals: number
  interestRate: BigNumber
  maxTotalSupplyInUsd: BigNumber
  oracle: OracleChainlinkProps | OracleUniV2Props | OracleUniV3Props | OracleUSDPegProps
  salt: string
}

export const buildSyntheticDeployFunction = ({
  name,
  symbol,
  decimals,
  interestRate,
  maxTotalSupplyInUsd,
  oracle,
  salt,
}: SyntheticDeployFunctionProps): DeployFunction => {
  const debtAlias = `${capitalize(symbol)}Debt`
  const syntheticAlias = `${capitalize(symbol)}Synthetic`

  const deployFunction: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
    const {getNamedAccounts, deployments} = hre
    const {execute} = deployments
    const {deployer} = await getNamedAccounts()

    const {address: controllerAddress} = await deterministic(hre, UpgradableContracts.Controller)
    const {deploy: deployDebt} = await deterministic(
      hre,
      {
        ...UpgradableContracts.DebtToken,
        alias: debtAlias,
      },
      salt
    )

    const {deploy: deploySynthetic} = await deterministic(
      hre,
      {
        ...UpgradableContracts.SyntheticToken,
        alias: syntheticAlias,
      },
      salt
    )

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
      interestRate,
      maxTotalSupplyInUsd
    )

    await execute(
      UpgradableContracts.Controller.alias,
      {from: deployer, log: true},
      'addSyntheticToken',
      syntheticTokenAddress
    )

    const oracleArgs = [syntheticTokenAddress, ...Object.values(oracle.args || {})]
    await execute('DefaultOracle', {from: deployer, log: true}, oracle.function, ...oracleArgs)
  }

  deployFunction.tags = [syntheticAlias]

  return deployFunction
}

interface DepositDeployFunctionProps {
  underlyingAddress: string
  underlyingSymbol: string
  underlyingDecimals: number
  collateralizationRatio: BigNumber
  maxTotalSupplyInUsd: BigNumber
  oracle: OracleChainlinkProps | OracleUniV2Props | OracleUniV3Props | OracleUSDPegProps
  salt: string
}

export const buildDepositDeployFunction = ({
  underlyingAddress,
  underlyingSymbol,
  underlyingDecimals,
  collateralizationRatio,
  maxTotalSupplyInUsd,
  oracle,
  salt,
}: DepositDeployFunctionProps): DeployFunction => {
  const alias = `${underlyingSymbol}DepositToken`
  const symbol = `vsd${underlyingSymbol}`

  const deployFunction: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
    const {getNamedAccounts, deployments} = hre
    const {execute} = deployments
    const {deployer} = await getNamedAccounts()

    const {address: controllerAddress} = await deterministic(hre, UpgradableContracts.Controller)

    const {deploy} = await deterministic(hre, {...UpgradableContracts.DepositToken, alias}, salt)

    const {address: vsdAddress} = await deploy()

    await execute(
      alias,
      {from: deployer, log: true},
      'initialize',
      underlyingAddress,
      controllerAddress,
      symbol,
      underlyingDecimals,
      collateralizationRatio,
      maxTotalSupplyInUsd
    )

    await execute(UpgradableContracts.Controller.alias, {from: deployer, log: true}, 'addDepositToken', vsdAddress)

    const oracleArgs = [vsdAddress, ...Object.values(oracle.args || {})]
    await execute('DefaultOracle', {from: deployer, log: true}, oracle.function, ...oracleArgs)
  }

  deployFunction.tags = [alias]

  return deployFunction
}
