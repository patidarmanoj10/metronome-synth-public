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
  Pool: ContractConfig
  Treasury: ContractConfig
  DepositToken: ContractConfig
  SyntheticToken: ContractConfig
  DebtToken: ContractConfig
  MetRewardsDistributor: ContractConfig
  OpRewardsDistributor: ContractConfig
  FeeProvider: ContractConfig
  ProxyOFT: ContractConfig
  SmartFarmingManager: ContractConfig
  Quoter: ContractConfig
  CrossChainDispatcher: ContractConfig
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
  // If true, doesn't add upgrade tx to batch but require multi sig to run it immediately
  // It's needed when a later script needs to interact to a new ABI fragment
  forceUpgrade?: boolean
}

export const UpgradableContracts: UpgradableContractsConfig = {
  PoolRegistry: {alias: 'PoolRegistry', contract: 'PoolRegistry', adminContract: 'PoolRegistryUpgrader'},
  Pool: {alias: 'Pool', contract: 'contracts/Pool.sol:Pool', adminContract: 'PoolUpgraderV2'},
  Treasury: {alias: 'Treasury', contract: 'Treasury', adminContract: 'TreasuryUpgrader'},
  DepositToken: {alias: '', contract: 'DepositToken', adminContract: 'DepositTokenUpgrader'},
  SyntheticToken: {alias: '', contract: 'SyntheticToken', adminContract: 'SyntheticTokenUpgrader'},
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
  FeeProvider: {alias: 'FeeProvider', contract: 'FeeProvider', adminContract: 'FeeProviderUpgrader'},
  ProxyOFT: {alias: '', contract: 'ProxyOFT', adminContract: 'ProxyOFTUpgrader'},
  SmartFarmingManager: {
    alias: 'SmartFarmingManager',
    contract: 'SmartFarmingManager',
    adminContract: 'SmartFarmingManagerUpgrader',
  },
  Quoter: {alias: 'Quoter', contract: 'Quoter', adminContract: 'QuoterUpgrader'},
  CrossChainDispatcher: {
    alias: 'CrossChainDispatcher',
    contract: 'CrossChainDispatcher',
    adminContract: 'CrossChainDispatcherUpgrader',
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
  forceUpgrade,
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

  const deployFunction = () =>
    deploy(alias, {
      contract,
      from: deployer,
      log: true,
      proxy: {
        owner: GNOSIS_SAFE_ADDRESS,
        proxyContract: 'OpenZeppelinTransparentProxy',
        viaAdminContract: adminContract,
        implementationName: alias === contract || alias === 'Pool' ? undefined : contract,
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
    if (forceUpgrade) {
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
  // It deploy the new implementation contract, updates the deployment JSON files but isn't properly calling `upgrade()`
  // See more: https://github.com/wighawag/hardhat-deploy/issues/284#issuecomment-1139971427
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
    const {deployments} = hre
    const {execute, get, read, getOrNull, catchUnknownSigner} = deployments

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
      const governor = await read(Pool, 'governor')

      const multiSigTx = await catchUnknownSigner(
        execute(Pool, {from: governor, log: true}, 'addDebtToken', debtTokenAddress),
        {log: true}
      )

      if (multiSigTx) {
        await saveForMultiSigBatchExecution(multiSigTx)
      }
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
    const {deployments} = hre
    const {execute, get, read, getOrNull, catchUnknownSigner} = deployments

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
      const governor = await read(Pool, 'governor')

      const multiSigTx = await catchUnknownSigner(
        execute(Pool, {from: governor, log: true}, 'addDepositToken', msdAddress),
        {log: true}
      )

      if (multiSigTx) {
        await saveForMultiSigBatchExecution(multiSigTx)
      }
    }
  }

  deployFunction.tags = [alias]
  deployFunction.dependencies = [Pool]

  return deployFunction
}

export const updateParamIfNeeded = async (
  hre: HardhatRuntimeEnvironment,
  {
    contract,
    readMethod,
    readArgs,
    writeMethod,
    writeArgs,
    // Note: Usually we have getter and setter functions to check if a param needs to be updated or not
    // but there are edge cases where it isn't true, e.g,: `function isPoolRegistered(address) view returns (bool)`
    // This function is used on such cases where comparison isn't straightforward
    // eslint-disable-next-line no-shadow, @typescript-eslint/no-explicit-any
    isCurrentValueUpdated = (currentValue: any, newValue: any) => currentValue.toString() === newValue.toString(),
  }: {
    contract: string
    readMethod: string
    readArgs?: string[]
    writeMethod: string
    writeArgs?: string[]
    // eslint-disable-next-line no-shadow, @typescript-eslint/no-explicit-any
    isCurrentValueUpdated?: (currentValue: any, newValue: any) => boolean
  }
): Promise<void> => {
  const {deployments} = hre
  const {read, execute, catchUnknownSigner} = deployments

  try {
    const currentValue = readArgs ? await read(contract, readMethod, ...readArgs) : await read(contract, readMethod)

    if (!isCurrentValueUpdated(currentValue, writeArgs)) {
      // Note: Assumes all governable contracts have the same governor as `PoolRegistry`
      const governor = await read(PoolRegistry, 'governor')

      const doExecute = async () => {
        return writeArgs
          ? execute(contract, {from: governor, log: true}, writeMethod, ...writeArgs)
          : execute(contract, {from: governor, log: true}, writeMethod)
      }

      const multiSigTx = await catchUnknownSigner(doExecute, {
        log: true,
      })

      if (multiSigTx) {
        await saveForMultiSigBatchExecution(multiSigTx)
      }
    }
  } catch (e) {
    log(chalk.red(`The function ${contract}.${writeMethod}() failed.`))
    log(chalk.red('It is probably due to calling a newly implemented function'))
    log(chalk.red('If it is the case, run deployment scripts again after having the contracts upgraded'))
  }
}
