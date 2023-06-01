import {BigNumber} from 'ethers'
import {DeployFunction} from 'hardhat-deploy/types'
import {HardhatRuntimeEnvironment} from 'hardhat/types'
import Address from '../../helpers/address'
import {executeUsingMultiSig, saveForMultiSigBatchExecution} from './multisig-helpers'

const {GNOSIS_SAFE_ADDRESS} = Address

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
      from: deployer,
      log: true,
      proxy: {
        owner: GNOSIS_SAFE_ADDRESS,
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

  if (actualImpl !== implementationAddress) {
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
