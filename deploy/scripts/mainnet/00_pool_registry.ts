import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import {UpgradableContracts, deployUpgradable, updateParamIfNeeded} from '../../helpers'
import Address from '../../../helpers/address'

const {
  PoolRegistry: {alias: PoolRegistry},
} = UpgradableContracts

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  await deployUpgradable({
    hre,
    contractConfig: UpgradableContracts.PoolRegistry,
    initializeArgs: [Address.MASTER_ORACLE_ADDRESS, Address.FEE_COLLECTOR],
  })

  await updateParamIfNeeded(hre, {
    contract: PoolRegistry,
    readMethod: 'swapper',
    writeMethod: 'updateSwapper',
    writeArgs: [Address.SWAPPER],
  })
}

export default func
func.tags = [PoolRegistry]
