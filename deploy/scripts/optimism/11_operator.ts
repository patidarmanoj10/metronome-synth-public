import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import {UpgradableContracts, updateParamIfNeeded} from '../../helpers'

const Operator = 'Operator'

const {
  PoolRegistry: {alias: PoolRegistry},
} = UpgradableContracts

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {getNamedAccounts, deployments} = hre
  const {deploy} = deployments
  const {deployer} = await getNamedAccounts()

  const {address: operatorAddress} = await deploy(Operator, {
    from: deployer,
    log: true,
    args: [],
  })

  await updateParamIfNeeded(hre, {
    contractAlias: PoolRegistry,
    readMethod: 'operator',
    writeMethod: 'updateOperator',
    // writeArgs: [operatorAddress],
    writeArgs: [hre.ethers.constants.AddressZero],
  })
}

export default func
func.tags = [Operator]
