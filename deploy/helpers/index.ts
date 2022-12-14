import {BigNumber} from 'ethers'
import {DeployFunction} from 'hardhat-deploy/types'
import {HardhatRuntimeEnvironment} from 'hardhat/types'

interface ContractConfig {
  alias: string
  contract: string
  adminContract: string
}

interface UpgradableContractsConfig {
  PoolRegistry: ContractConfig
  Pool: ContractConfig
  Treasury: ContractConfig
  DepositToken: ContractConfig
  SyntheticToken: ContractConfig
  DebtToken: ContractConfig
  MetRewardsDistributor: ContractConfig
}

interface SyntheticDeployFunctionProps {
  name: string
  symbol: string
  decimals: number
  interestRate: BigNumber
  maxTotalSupply: BigNumber
}

interface DepositDeployFunctionProps {
  underlyingAddress: string
  underlyingSymbol: string
  underlyingDecimals: number
  collateralFactor: BigNumber
  maxTotalSupply: BigNumber
}

interface DeployUpgradableFunctionProps {
  hre: HardhatRuntimeEnvironment
  contractConfig: ContractConfig
  initializeArgs: unknown[]
}

export const UpgradableContracts: UpgradableContractsConfig = {
  PoolRegistry: {alias: 'PoolRegistry', contract: 'PoolRegistry', adminContract: 'PoolRegistryUpgrader'},
  Pool: {alias: 'Pool', contract: 'Pool', adminContract: 'PoolUpgrader'},
  Treasury: {alias: 'Treasury', contract: 'Treasury', adminContract: 'TreasuryUpgrader'},
  DepositToken: {alias: '', contract: 'DepositToken', adminContract: 'DepositTokenUpgrader'},
  SyntheticToken: {alias: '', contract: 'SyntheticToken', adminContract: 'SyntheticTokenUpgrader'},
  DebtToken: {alias: '', contract: 'DebtToken', adminContract: 'DebtTokenUpgrader'},
  MetRewardsDistributor: {
    alias: 'MetRewardsDistributor',
    contract: 'RewardsDistributor',
    adminContract: 'RewardsDistributorUpgrader',
  },
}

const {
  DepositToken: DepositTokenConfig,
  DebtToken: DebtTokenConfig,
  SyntheticToken: SyntheticTokenConfig,
  Pool: {alias: Pool},
  PoolRegistry: {alias: PoolRegistry},
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
  maxTotalSupply,
}: SyntheticDeployFunctionProps): DeployFunction => {
  const debtAlias = `${capitalize(symbol)}Debt`
  const syntheticAlias = `${capitalize(symbol)}Synthetic`

  const deployFunction: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
    const {getNamedAccounts, deployments} = hre
    const {execute, get, read, getOrNull} = deployments
    const {deployer} = await getNamedAccounts()

    const {address: poolRegistryAddress} = await get(PoolRegistry)
    const {address: poolAddress} = await get(Pool)
    const poolId = await read(PoolRegistry, 'idOfPool', poolAddress)

    const wasDeployed = !!(await getOrNull(syntheticAlias))

    const {address: syntheticTokenAddress} = await deployUpgradable({
      hre,
      contractConfig: {
        ...SyntheticTokenConfig,
        alias: syntheticAlias,
      },
      initializeArgs: [name, symbol, decimals, poolRegistryAddress],
    })

    const {address: debtTokenAddress} = await deployUpgradable({
      hre,
      contractConfig: {
        ...DebtTokenConfig,
        alias: debtAlias,
      },
      initializeArgs: [
        `${name}-Debt`,
        `${symbol}-Debt-${poolId}`,
        poolAddress,
        syntheticTokenAddress,
        interestRate,
        maxTotalSupply,
      ],
    })

    if (!wasDeployed) {
      await execute(Pool, {from: deployer, log: true}, 'addDebtToken', debtTokenAddress)
    }
  }

  deployFunction.tags = [syntheticAlias]
  deployFunction.dependencies = [Pool]

  return deployFunction
}

export const buildDepositDeployFunction = ({
  underlyingAddress,
  underlyingSymbol,
  underlyingDecimals,
  collateralFactor,
  maxTotalSupply,
}: DepositDeployFunctionProps): DeployFunction => {
  const alias = `${underlyingSymbol}DepositToken`

  const deployFunction: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
    const {getNamedAccounts, deployments} = hre
    const {execute, get, read, getOrNull} = deployments
    const {deployer} = await getNamedAccounts()

    const {address: poolAddress} = await get(Pool)
    const poolId = await read(PoolRegistry, 'idOfPool', poolAddress)

    const wasDeployed = !!(await getOrNull(alias))

    const name = `Metronome Synth ${underlyingSymbol}-Deposit`
    const symbol = `msd${underlyingSymbol}-${poolId}`

    const {address: msdAddress} = await deployUpgradable({
      hre,
      contractConfig: {...DepositTokenConfig, alias},
      initializeArgs: [
        underlyingAddress,
        poolAddress,
        name,
        symbol,
        underlyingDecimals,
        collateralFactor,
        maxTotalSupply,
      ],
    })

    if (!wasDeployed) {
      await execute(Pool, {from: deployer, log: true}, 'addDepositToken', msdAddress)
    }
  }

  deployFunction.tags = [alias]
  deployFunction.dependencies = [Pool]

  return deployFunction
}
