import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import {UpgradableContracts, deployUpgradable, updateParamIfNeeded} from '../../helpers'
import {parseEther} from '../../../helpers'
import Address from '../../../helpers/address'

const {GNOSIS_SAFE_ADDRESS} = Address

const MsETHSynthetic = 'MsETHSynthetic'
const MsUSDSynthetic = 'MsUSDSynthetic'
const MsBTCSynthetic = 'MsBTCSynthetic'

const {
  AMO: {alias: AMO},
  PoolRegistry: {alias: PoolRegistry},
} = UpgradableContracts

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {deployments} = hre
  const {get} = deployments

  // The Vesper contracts weren't deployed to Hemi yet
  // const {address: poolRegistryAddress} = await get(PoolRegistry)

  // const {address: amoAddress} = await deployUpgradable({
  //   hre,
  //   contractConfig: UpgradableContracts.AMO,
  //   initializeArgs: [poolRegistryAddress],
  // })

  // Update params for msETH
  await updateParamIfNeeded(hre, {
    contractAlias: MsETHSynthetic,
    readMethod: 'amo',
    writeMethod: 'updateAmo',
    writeArgs: [GNOSIS_SAFE_ADDRESS],
  })

  await updateParamIfNeeded(hre, {
    contractAlias: MsETHSynthetic,
    readMethod: 'maxAmoSupply',
    writeMethod: 'updateMaxAmoSupply',
    writeArgs: [parseEther('3').toString()],
  })

  // Update params for msUSD
  await updateParamIfNeeded(hre, {
    contractAlias: MsUSDSynthetic,
    readMethod: 'amo',
    writeMethod: 'updateAmo',
    writeArgs: [GNOSIS_SAFE_ADDRESS],
  })

  await updateParamIfNeeded(hre, {
    contractAlias: MsUSDSynthetic,
    readMethod: 'maxAmoSupply',
    writeMethod: 'updateMaxAmoSupply',
    writeArgs: [parseEther('10000').toString()],
  })

  // Update params for msBTC
  await updateParamIfNeeded(hre, {
    contractAlias: MsBTCSynthetic,
    readMethod: 'amo',
    writeMethod: 'updateAmo',
    writeArgs: [GNOSIS_SAFE_ADDRESS],
  })

  await updateParamIfNeeded(hre, {
    contractAlias: MsBTCSynthetic,
    readMethod: 'maxAmoSupply',
    writeMethod: 'updateMaxAmoSupply',
    writeArgs: [parseEther('100').toString()],
  })
}

export default func
func.tags = [AMO]
func.dependencies = [PoolRegistry]
