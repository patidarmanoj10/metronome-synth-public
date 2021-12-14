import {DeployResult} from 'hardhat-deploy/types'
import {HardhatRuntimeEnvironment} from 'hardhat/types'
import Address from '../../helpers/address'

const {MULTICALL_ADDRESS} = Address

export interface ContractConfig {
  alias: string
  contract: string
  adminContract: string
}

export const UpgradableContracts: {[key: string]: ContractConfig} = {
  Issuer: {alias: 'Issuer', contract: 'Issuer', adminContract: 'IssuerUpgrader'},
  VSynth: {alias: 'VSynth', contract: 'VSynth', adminContract: 'VSynthUpgrader'},
  Treasury: {alias: 'Treasury', contract: 'Treasury', adminContract: 'TreasuryUpgrader'},
  MetDepositToken: {alias: 'MetDepositToken', contract: 'DepositToken', adminContract: 'DepositTokenUpgrader'},
  VsEth: {alias: 'VsEth', contract: 'SyntheticAsset', adminContract: 'SyntheticAssetUpgrader'},
  VsEthDebtToken: {alias: 'VsEthDebtToken', contract: 'DebtToken', adminContract: 'DebtTokenUpgrader'},
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
