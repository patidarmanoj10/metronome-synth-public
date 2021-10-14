import {DeployResult} from 'hardhat-deploy/types'
import {HardhatRuntimeEnvironment} from 'hardhat/types'

export interface ContractConfig {
  alias: string
  contract: string
  adminContract: string
}

export const Contracts: {[key: string]: ContractConfig} = {
  MBox: {alias: 'MBox', contract: 'MBox', adminContract: 'MBoxUpgrader'},
  Treasury: {alias: 'Treasury', contract: 'Treasury', adminContract: 'TreasuryUpgrader'},
  DepositToken: {alias: 'DepositToken', contract: 'DepositToken', adminContract: 'DepositTokenUpgrader'},
  MEth: {alias: 'MEth', contract: 'SyntheticAsset', adminContract: 'SyntheticAssetUpgrader'},
  MEthDebtToken: {alias: 'MEthDebtToken', contract: 'DebtToken', adminContract: 'DebtTokenUpgrader'},
}

export const deterministic = async (
  {deployments: {deterministic: wrappedDeterministic}, getNamedAccounts}: HardhatRuntimeEnvironment,
  contractConfig: ContractConfig
): Promise<{
  address: string
  implementationAddress?: string | undefined
  deploy(): Promise<DeployResult>
}> => {
  const {deployer} = await getNamedAccounts()
  const {alias, contract, adminContract} = contractConfig
  return await wrappedDeterministic(alias, {
    contract: contract || alias,
    from: deployer,
    log: true,
    proxy: {
      proxyContract: 'OpenZeppelinTransparentProxy',
      viaAdminContract: adminContract,
    },
  })
}
