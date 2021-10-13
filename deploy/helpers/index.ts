import {DeployResult} from 'hardhat-deploy/types'
import {HardhatRuntimeEnvironment} from 'hardhat/types'

export interface ContractConfig {
  alias: string
  contract: string
}

export const Contracts = {
  MBox: {alias: 'MBox', contract: 'MBox'},
  Treasury: {alias: 'Treasury', contract: 'Treasury'},
  DepositToken: {alias: 'DepositToken', contract: 'DepositToken'},
  MEth: {alias: 'MEth', contract: 'SyntheticAsset'},
  MEthDebtToken: {alias: 'MEthDebtToken', contract: 'DebtToken'},
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
  const {alias, contract} = contractConfig
  return await wrappedDeterministic(alias, {
    contract: contract || alias,
    from: deployer,
    log: true,
    proxy: {proxyContract: 'OpenZeppelinTransparentProxy'},
  })
}
