import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import {UpgradableContracts, deployUpgradable, updateParamIfNeeded} from '../../helpers'

const {
  Quoter: {alias: Quoter},
  PoolRegistry: {alias: PoolRegistry},
} = UpgradableContracts

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {deployments} = hre
  const {get} = deployments

  const {address: poolRegistryAddress} = await get(PoolRegistry)

  const {address: quoterAddress} = await deployUpgradable({
    hre,
    contractConfig: UpgradableContracts.Quoter,
    initializeArgs: [poolRegistryAddress],
  })

  await updateParamIfNeeded(hre, {
    contract: PoolRegistry,
    readMethod: 'quoter',
    writeMethod: 'updateQuoter',
    writeArgs: [quoterAddress],
  })
}

export default func
func.tags = [Quoter]
func.dependencies = [PoolRegistry]
