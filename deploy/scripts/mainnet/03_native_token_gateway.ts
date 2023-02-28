import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import Address from '../../../helpers/address'
import {UpgradableContracts} from '../../helpers'
import {saveForMultiSigBatchExecution} from '../../helpers/multisig-helpers'

const {
  PoolRegistry: {alias: PoolRegistry},
} = UpgradableContracts

const {NATIVE_TOKEN_ADDRESS} = Address

const NativeTokenGateway = 'NativeTokenGateway'

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {getNamedAccounts, deployments} = hre
  const {deploy, get, read, execute, catchUnknownSigner} = deployments
  const {deployer} = await getNamedAccounts()

  const {address: poolRegistryAddress} = await get(PoolRegistry)

  const {address: nativeTokenGatewayAddress} = await deploy(NativeTokenGateway, {
    from: deployer,
    log: true,
    args: [poolRegistryAddress, NATIVE_TOKEN_ADDRESS],
  })

  const currentGateway = await read(PoolRegistry, 'nativeTokenGateway')

  if (currentGateway !== nativeTokenGatewayAddress) {
    const governor = await read(PoolRegistry, 'governor')

    const multiSigTx = await catchUnknownSigner(
      execute(PoolRegistry, {from: governor, log: true}, 'updateNativeTokenGateway', nativeTokenGatewayAddress),
      {log: true}
    )

    if (multiSigTx) {
      await saveForMultiSigBatchExecution(multiSigTx)
    }
  }
}

export default func
func.tags = [NativeTokenGateway]
