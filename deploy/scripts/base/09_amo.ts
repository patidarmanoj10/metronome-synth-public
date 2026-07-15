import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import {UpgradableContracts, deployUpgradable, updateParamIfNeeded} from '../../helpers'
import {parseEther} from '../../../helpers'

const MsUSDSynthetic = 'MsUSDSynthetic'
const MsETHSynthetic = 'MsETHSynthetic'

const {
  AMO: {alias: AMO},
  PoolRegistry: {alias: PoolRegistry},
} = UpgradableContracts

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {deployments} = hre
  const {get} = deployments

  const {address: poolRegistryAddress} = await get(PoolRegistry)

  const {address: amoAddress} = await deployUpgradable({
    hre,
    contractConfig: UpgradableContracts.AMO,
    initializeArgs: [poolRegistryAddress],
  })

  // Update params for msUSD
  await updateParamIfNeeded(hre, {
    contractAlias: MsUSDSynthetic,
    readMethod: 'amo',
    writeMethod: 'updateAmo',
    writeArgs: [amoAddress],
  })

  await updateParamIfNeeded(hre, {
    contractAlias: MsUSDSynthetic,
    readMethod: 'maxAmoSupply',
    writeMethod: 'updateMaxAmoSupply',
    writeArgs: [parseEther('1000').toString()],
  })

  // Update params for msETH
  await updateParamIfNeeded(hre, {
    contractAlias: MsETHSynthetic,
    readMethod: 'amo',
    writeMethod: 'updateAmo',
    writeArgs: [amoAddress],
  })

  await updateParamIfNeeded(hre, {
    contractAlias: MsETHSynthetic,
    readMethod: 'maxAmoSupply',
    writeMethod: 'updateMaxAmoSupply',
    writeArgs: [parseEther('5000').toString()],
  })
}

export default func
func.tags = [AMO]
func.dependencies = [PoolRegistry]
