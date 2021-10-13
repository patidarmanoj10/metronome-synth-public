import {DeployResult} from 'hardhat-deploy/types'
import {HardhatRuntimeEnvironment} from 'hardhat/types'

export const deterministic = async (
  {deployments: {deterministic: wrappedDeterministic}, getNamedAccounts}: HardhatRuntimeEnvironment,
  alias: string,
  contract?: string
): Promise<{
  address: string
  implementationAddress?: string | undefined
  deploy(): Promise<DeployResult>
}> => {
  const {deployer} = await getNamedAccounts()
  return await wrappedDeterministic(alias, {
    contract: contract || alias,
    from: deployer,
    log: true,
    proxy: {proxyContract: 'OpenZeppelinTransparentProxy'},
  })
}
