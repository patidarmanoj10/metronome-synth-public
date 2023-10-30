/* eslint-disable camelcase */
import {ethers, BigNumber} from 'ethers'
import chalk from 'chalk'
import {DeployFunction} from 'hardhat-deploy/types'
import {HardhatRuntimeEnvironment} from 'hardhat/types'
import Address from '../../helpers/address'
import {executeUsingMultiSig, saveForMultiSigBatchExecution} from './multisig-helpers'

const {GNOSIS_SAFE_ADDRESS} = Address

const {log} = console
const {getAddress} = ethers.utils

interface ContractConfig {
  alias: string
  contract: string
  adminContract: string
}

interface UpgradableContractsConfig {
  PoolRegistry: ContractConfig
  Pool1: ContractConfig
  Pool2: ContractConfig
  Treasury_Pool1: ContractConfig
  Treasury_Pool2: ContractConfig
  DepositToken: ContractConfig
  SyntheticToken: ContractConfig
  DebtToken: ContractConfig
  MetRewardsDistributor: ContractConfig
  OpRewardsDistributor: ContractConfig
  FeeProvider_Pool1: ContractConfig
  FeeProvider_Pool2: ContractConfig
  ProxyOFT: ContractConfig
  SmartFarmingManager_Pool1: ContractConfig
  SmartFarmingManager_Pool2: ContractConfig
  Quoter: ContractConfig
  CrossChainDispatcher: ContractConfig
}

interface SyntheticDeployFunctionProps {
  name: string
  symbol: string
  decimals: number
  maxTotalSupply: BigNumber
}

interface DebtTokenDeployFunctionProps {
  poolAlias: string
  name: string
  symbol: string
  interestRate: BigNumber
  maxTotalSupply: BigNumber
}

interface DepositDeployFunctionProps {
  poolAlias: string
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
  // If true, doesn't add upgrade tx to batch but require multi sig to run it immediately
  // It's needed when a later script must execute after this upgrade (e.g., to interact to a new ABI fragment)
  force?: boolean
}

export const UpgradableContracts: UpgradableContractsConfig = {
  PoolRegistry: {alias: 'PoolRegistry', contract: 'PoolRegistry', adminContract: 'PoolRegistryUpgraderV2'},
  Pool1: {alias: 'Pool1', contract: 'contracts/Pool.sol:Pool', adminContract: 'PoolUpgraderV3'},
  Pool2: {alias: 'Pool2', contract: 'contracts/Pool.sol:Pool', adminContract: 'PoolUpgraderV3'},
  Treasury_Pool1: {alias: 'Treasury_Pool1', contract: 'Treasury', adminContract: 'TreasuryUpgrader'},
  Treasury_Pool2: {alias: 'Treasury_Pool2', contract: 'Treasury', adminContract: 'TreasuryUpgrader'},
  DepositToken: {alias: '', contract: 'DepositToken', adminContract: 'DepositTokenUpgrader'},
  SyntheticToken: {alias: '', contract: 'SyntheticToken', adminContract: 'SyntheticTokenUpgraderV2'},
  DebtToken: {alias: '', contract: 'DebtToken', adminContract: 'DebtTokenUpgrader'},
  MetRewardsDistributor: {
    alias: 'MetRewardsDistributor',
    contract: 'RewardsDistributor',
    adminContract: 'RewardsDistributorUpgrader',
  },
  OpRewardsDistributor: {
    alias: 'OpRewardsDistributor',
    contract: 'RewardsDistributor',
    adminContract: 'RewardsDistributorUpgrader',
  },
  FeeProvider_Pool1: {alias: 'FeeProvider_Pool1', contract: 'FeeProvider', adminContract: 'FeeProviderUpgrader'},
  FeeProvider_Pool2: {alias: 'FeeProvider_Pool2', contract: 'FeeProvider', adminContract: 'FeeProviderUpgrader'},
  ProxyOFT: {alias: '', contract: 'ProxyOFT', adminContract: 'ProxyOFTUpgrader'},
  SmartFarmingManager_Pool1: {
    alias: 'SmartFarmingManager_Pool1',
    contract: 'SmartFarmingManager',
    adminContract: 'SmartFarmingManagerUpgrader',
  },
  SmartFarmingManager_Pool2: {
    alias: 'SmartFarmingManager_Pool2',
    contract: 'SmartFarmingManager',
    adminContract: 'SmartFarmingManagerUpgrader',
  },
  Quoter: {alias: 'Quoter', contract: 'Quoter', adminContract: 'QuoterUpgrader'},
  CrossChainDispatcher: {
    alias: 'CrossChainDispatcher',
    contract: 'CrossChainDispatcher',
    adminContract: 'CrossChainDispatcherUpgraderV2',
  },
}

const {
  DepositToken: DepositTokenConfig,
  DebtToken: DebtTokenConfig,
  SyntheticToken: SyntheticTokenConfig,
  PoolRegistry: {alias: PoolRegistry},
} = UpgradableContracts

const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1)

export const deployUpgradable = async ({
  hre,
  contractConfig,
  initializeArgs,
  force,
}: DeployUpgradableFunctionProps): Promise<{
  address: string
  implementationAddress?: string | undefined
}> => {
  const {
    deployments: {deploy, read, get, execute, catchUnknownSigner},
    getNamedAccounts,
  } = hre
  const {deployer} = await getNamedAccounts()
  const {alias, contract, adminContract} = contractConfig

  const implementationName = alias === contract ? undefined : contract

  const deployFunction = () =>
    deploy(alias, {
      contract,
      from: deployer,
      log: true,
      proxy: {
        owner: GNOSIS_SAFE_ADDRESS,
        proxyContract: 'OpenZeppelinTransparentProxy',
        viaAdminContract: adminContract,
        implementationName: contract.match(/Pool.sol/) ? 'Pool' : implementationName,
        execute: {
          init: {
            methodName: 'initialize',
            args: initializeArgs,
          },
        },
      },
    })

  const multiSigDeployTx = await catchUnknownSigner(deployFunction, {log: true})

  if (multiSigDeployTx) {
    if (force) {
      await executeUsingMultiSig(hre, multiSigDeployTx)

      // Note: This second run will update `deployments/`, this will be necessary for later scripts that need new ABI
      // Refs: https://github.com/wighawag/hardhat-deploy/issues/178#issuecomment-918088504
      await deployFunction()
    } else {
      await saveForMultiSigBatchExecution(multiSigDeployTx)
    }
  }

  const {address, implementation: implementationAddress} = await get(alias)

  // Note: `hardhat-deploy` is partially not working when upgrading an implementation used by many proxies
  // because it deploys the new implementation, updates the deployment JSON files but isn't properly calling `upgrade()`
  // See more: https://github.com/wighawag/hardhat-deploy/issues/284#issuecomment-1139971427
  const usesManyProxies = [
    'DepositToken',
    'DebtToken',
    'SyntheticToken',
    'Pool',
    'Treasury',
    'FeeProvider',
    'SmartFarmingManager',
  ].includes(contract)

  if (usesManyProxies) {
    const actualImpl = await read(adminContract, 'getProxyImplementation', address)

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    if (getAddress(actualImpl) !== getAddress(implementationAddress!)) {
      const multiSigUpgradeTx = await catchUnknownSigner(
        execute(adminContract, {from: GNOSIS_SAFE_ADDRESS, log: true}, 'upgrade', address, implementationAddress),
        {log: true}
      )

      if (multiSigUpgradeTx) {
        await saveForMultiSigBatchExecution(multiSigUpgradeTx)
      }
    }
  }

  return {address, implementationAddress}
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const defaultIsCurrentValueUpdated = (currentValue: any, newValue: any) =>
  currentValue.toString() === newValue.toString()

// eslint-disable-next-line complexity
export const updateParamIfNeeded = async (
  hre: HardhatRuntimeEnvironment,
  {
    contractAlias,
    readMethod,
    readArgs,
    writeMethod,
    writeArgs,
    // Note: Usually we have getter and setter functions to check if a param needs to be updated or not
    // but there are edge cases where it isn't true, e.g,: `function isPoolRegistered(address) view returns (bool)`
    // This function is used on such cases where comparison isn't straightforward
    isCurrentValueUpdated = defaultIsCurrentValueUpdated,
    force,
  }: {
    contractAlias: string
    readMethod: string
    readArgs?: string[]
    writeMethod: string
    writeArgs?: string[]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    isCurrentValueUpdated?: (currentValue: any, newValue: any) => boolean
    // If true, doesn't add upgrade tx to batch but require multi sig to run it immediately
    // It's needed when a later script must execute after the execution of this call
    force?: boolean
  }
): Promise<void> => {
  const {deployments} = hre
  const {read, execute, catchUnknownSigner} = deployments

  try {
    const currentValue = readArgs
      ? await read(contractAlias, readMethod, ...readArgs)
      : await read(contractAlias, readMethod)

    const {isArray} = Array

    // Checks if overriding `isCurrentValueUpdated()` is required
    const isOverrideRequired =
      !writeArgs ||
      (!isArray(currentValue) && writeArgs.length > 1) ||
      (isArray(currentValue) && writeArgs.length != currentValue.length)

    if (isOverrideRequired && isCurrentValueUpdated === defaultIsCurrentValueUpdated) {
      const e = Error(`You must override 'isCurrentValueUpdated()' function for ${contractAlias}.${writeMethod}()`)
      log(chalk.red(e.message))
      throw e
    }

    // Update value if needed
    if (!isCurrentValueUpdated(currentValue, writeArgs)) {
      const governor = await read(contractAlias, 'governor')

      const doExecute = async () => {
        return writeArgs
          ? execute(contractAlias, {from: governor, log: true}, writeMethod, ...writeArgs)
          : execute(contractAlias, {from: governor, log: true}, writeMethod)
      }

      const multiSigTx = await catchUnknownSigner(doExecute, {
        log: true,
      })

      if (multiSigTx) {
        if (force) {
          await executeUsingMultiSig(hre, multiSigTx)
        } else {
          await saveForMultiSigBatchExecution(multiSigTx)
        }
      }
    }
  } catch (e) {
    log(chalk.red(`The function ${contractAlias}.${writeMethod}() failed.`))
    log(chalk.red('It is probably due to calling a newly implemented function'))
    log(chalk.red('If it is the case, run deployment scripts again after having the contracts upgraded'))
  }
}

export const buildSyntheticTokenDeployFunction = ({
  name,
  symbol,
  decimals,
  maxTotalSupply,
}: SyntheticDeployFunctionProps): DeployFunction => {
  const syntheticAlias = `${capitalize(symbol)}Synthetic`

  const deployFunction: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
    const {deployments} = hre
    const {get} = deployments

    const {address: poolRegistryAddress} = await get(PoolRegistry)

    await deployUpgradable({
      hre,
      contractConfig: {
        ...SyntheticTokenConfig,
        alias: syntheticAlias,
      },
      initializeArgs: [name, symbol, decimals, poolRegistryAddress],
    })

    await updateParamIfNeeded(hre, {
      contractAlias: syntheticAlias,
      readMethod: 'maxTotalSupply',
      writeMethod: 'updateMaxTotalSupply',
      writeArgs: [maxTotalSupply.toString()],
    })
  }

  deployFunction.tags = [syntheticAlias]
  deployFunction.dependencies = [PoolRegistry]

  return deployFunction
}

export const buildDebtTokenDeployFunction = ({
  poolAlias,
  name,
  symbol,
  interestRate,
  maxTotalSupply,
}: DebtTokenDeployFunctionProps): DeployFunction => {
  const debtAlias = `${capitalize(symbol)}Debt_${poolAlias}`
  const syntheticAlias = `${capitalize(symbol)}Synthetic`

  const deployFunction: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
    const {deployments} = hre
    const {get, read} = deployments

    const {address: poolAddress} = await get(poolAlias)
    const poolId = await read(PoolRegistry, 'idOfPool', poolAddress)

    const {address: syntheticTokenAddress} = await get(syntheticAlias)

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

    await updateParamIfNeeded(hre, {
      contractAlias: poolAlias,
      readMethod: 'doesDebtTokenExist',
      readArgs: [debtTokenAddress],
      writeMethod: 'addDebtToken',
      writeArgs: [debtTokenAddress],
      isCurrentValueUpdated: (currentValue: boolean) => currentValue,
    })
  }

  deployFunction.tags = [debtAlias]
  deployFunction.dependencies = [poolAlias]

  return deployFunction
}

export const buildDepositTokenDeployFunction = ({
  poolAlias,
  underlyingAddress,
  underlyingSymbol,
  underlyingDecimals,
  collateralFactor,
  maxTotalSupply,
}: DepositDeployFunctionProps): DeployFunction => {
  const alias = `${capitalize(underlyingSymbol)}DepositToken_${poolAlias}`

  const deployFunction: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
    const {deployments} = hre
    const {get, read} = deployments

    const {address: poolAddress} = await get(poolAlias)
    const poolId = await read(PoolRegistry, 'idOfPool', poolAddress)

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

    await updateParamIfNeeded(hre, {
      contractAlias: poolAlias,
      readMethod: 'doesDepositTokenExist',
      readArgs: [msdAddress],
      writeMethod: 'addDepositToken',
      writeArgs: [msdAddress],
      isCurrentValueUpdated: (currentValue: boolean) => currentValue,
    })
  }

  deployFunction.tags = [alias]
  deployFunction.dependencies = [poolAlias]

  return deployFunction
}
