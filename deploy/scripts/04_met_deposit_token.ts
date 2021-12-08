import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {DeployFunction} from 'hardhat-deploy/types'
import {UpgradableContracts, deterministic} from '../helpers'
import Address from '../../helpers/address'

const {MET_ADDRESS} = Address
const {alias: MetDepositToken} = UpgradableContracts.MetDepositToken
const Oracle = 'Oracle'

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {getNamedAccounts, deployments} = hre
  const {get, execute} = deployments
  const {deployer, governor} = await getNamedAccounts()

  const oracle = await get(Oracle)

  const {address: issuerAddress} = await deterministic(hre, UpgradableContracts.Issuer)
  const {deploy} = await deterministic(hre, UpgradableContracts.MetDepositToken)

  await deploy()

  const symbol = 'vSynths-MET'
  const decimals = 18 // Same as MET

  await execute(
    MetDepositToken,
    {from: deployer, log: true},
    'initialize',
    MET_ADDRESS,
    issuerAddress,
    oracle.address,
    symbol,
    decimals
  )
  await execute(MetDepositToken, {from: deployer, log: true}, 'transferGovernorship', governor)
}

export default func
func.tags = [MetDepositToken]
