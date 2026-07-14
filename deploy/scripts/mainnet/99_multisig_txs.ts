import {DeployFunction} from 'hardhat-deploy/types'
import {executeBatchUsingMultisig} from '../../helpers/safe'

const func: DeployFunction = executeBatchUsingMultisig

export default func
func.tags = ['MultisigTxs']
func.runAtTheEnd = true
