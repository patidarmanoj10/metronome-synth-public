import {DeployFunction} from 'hardhat-deploy/types'
import {executeBatchUsingMultisig} from '../../helpers/multisig-helpers'

const func: DeployFunction = executeBatchUsingMultisig

export default func
func.tags = ['MultisigTxs']
func.runAtTheEnd = true
