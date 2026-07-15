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

  // waiting for the tx completion before broadcasting a new one (avoids same-nonce errors on Base)
  await new Promise((r) => setTimeout(r, (Number(process.env.WAIT_SECONDS_BETWEEN_TXS) || 0) * 1000))

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
