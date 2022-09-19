/* eslint-disable arrow-body-style */
import {BigNumber} from 'ethers'
import {DeployFunction} from 'hardhat-deploy/types'
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

interface SyntheticDeployFunctionProps {
  name: string
  symbol: string
  decimals: number
  interestRate: BigNumber
  maxTotalSupplyInUsd: BigNumber
}

interface DepositDeployFunctionProps {
  underlyingAddress: string
  underlyingSymbol: string
  underlyingDecimals: number
  collateralizationRatio: BigNumber
  maxTotalSupplyInUsd: BigNumber
}

interface DeployUpgradableFunctionProps {
  hre: HardhatRuntimeEnvironment
  contractConfig: ContractConfig
  initializeArgs: unknown[]
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

const {
  DepositToken: DepositTokenConfig,
  DebtToken: DebtTokenConfig,
  SyntheticToken: SyntheticTokenConfig,
  Controller: {alias: Controller},
} = UpgradableContracts

const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1)

export const deployUpgradable = async ({
  hre,
  contractConfig,
  initializeArgs,
}: DeployUpgradableFunctionProps): Promise<{
  address: string
  implementationAddress?: string | undefined
}> => {
  const {
    deployments: {deploy, read, execute},
    getNamedAccounts,
  } = hre

  const {deployer} = await getNamedAccounts()
  const {alias, contract, adminContract} = contractConfig

  const {address, implementation: implementationAddress} = await deploy(alias, {
    from: deployer,
    log: true,
    proxy: {
      proxyContract: 'OpenZeppelinTransparentProxy',
      viaAdminContract: adminContract,
      implementationName: alias === contract ? undefined : contract,
      execute: {
        init: {
          methodName: 'initialize',
          args: initializeArgs,
        },
      },
    },
  })

  // Note: `hardhat-deploy` is partially not working when upgrading an implementation used by many proxies
  // It deploy the new implementation contract, updates the deployment JSON files but isn't properly calling `upgrade()`
  // See more: https://github.com/wighawag/hardhat-deploy/issues/284#issuecomment-1139971427
  const actualImpl = await read(adminContract, 'getProxyImplementation', address)
  if (actualImpl !== implementationAddress) {
    await execute(adminContract, {from: deployer, log: true}, 'upgrade', address, implementationAddress)
  }

  return {address, implementationAddress}
}

export const buildSyntheticDeployFunction = ({
  name,
  symbol,
  decimals,
  interestRate,
  maxTotalSupplyInUsd,
}: SyntheticDeployFunctionProps): DeployFunction => {
  const debtAlias = `${capitalize(symbol)}Debt`
  const syntheticAlias = `${capitalize(symbol)}Synthetic`

  const deployFunction: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
    const {getNamedAccounts, deployments} = hre
    const {execute, get, getOrNull} = deployments
    const {deployer} = await getNamedAccounts()

    const {address: controllerAddress} = await get(Controller)

    const wasDeployed = !!(await getOrNull(syntheticAlias))

    const {address: syntheticTokenAddress} = await deployUpgradable({
      hre,
      contractConfig: {
        ...SyntheticTokenConfig,
        alias: syntheticAlias,
      },
      initializeArgs: [name, symbol, decimals, controllerAddress, interestRate, maxTotalSupplyInUsd],
    })

    const {address: debtTokenAddress} = await deployUpgradable({
      hre,
      contractConfig: {
        ...DebtTokenConfig,
        alias: debtAlias,
      },
      initializeArgs: [`${name}-Debt`, `${symbol}-Debt`, controllerAddress, syntheticTokenAddress],
    })

    if (!wasDeployed) {
      await execute(Controller, {from: deployer, log: true}, 'addDebtToken', debtTokenAddress)
    }
  }

  deployFunction.tags = [syntheticAlias]
  deployFunction.dependencies = [Controller]

  return deployFunction
}

export const buildDepositDeployFunction = ({
  underlyingAddress,
  underlyingSymbol,
  underlyingDecimals,
  collateralizationRatio,
  maxTotalSupplyInUsd,
}: DepositDeployFunctionProps): DeployFunction => {
  const alias = `${underlyingSymbol}DepositToken`
  const symbol = `msd${underlyingSymbol}`

  const deployFunction: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
    const {getNamedAccounts, deployments} = hre
    const {execute, get, getOrNull} = deployments
    const {deployer} = await getNamedAccounts()

    const {address: controllerAddress} = await get(Controller)

    const wasDeployed = !!(await getOrNull(alias))

    const {address: msdAddress} = await deployUpgradable({
      hre,
      contractConfig: {...DepositTokenConfig, alias},
      initializeArgs: [
        underlyingAddress,
        controllerAddress,
        symbol,
        underlyingDecimals,
        collateralizationRatio,
        maxTotalSupplyInUsd,
      ],
    })

    if (!wasDeployed) {
      await execute(Controller, {from: deployer, log: true}, 'addDepositToken', msdAddress)
    }
  }

  deployFunction.tags = [alias]
  deployFunction.dependencies = [Controller]

  return deployFunction
}

export const transferGovernorshipIfNeeded = async (
  hre: HardhatRuntimeEnvironment,
  contractAlias: string
): Promise<void> => {
  const {getNamedAccounts, deployments} = hre
  const {execute, read} = deployments
  const {deployer, governor} = await getNamedAccounts()

  const current = await Promise.all([
    await read(contractAlias, 'governor'),
    await read(contractAlias, 'proposedGovernor'),
  ])

  if (!current.includes(governor)) {
    await execute(contractAlias, {from: deployer, log: true}, 'transferGovernorship', governor)
  }
}
