import fs from 'fs'
import {exit} from 'process'
import {MetaTransactionData} from '@safe-global/safe-core-sdk-types'
import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {encodeMulti, MetaTransaction} from 'ethers-multisend'
import {impersonateAccount} from '../../test/helpers'
import {GnosisSafeInitializer} from './gnosis-safe'
import Address from '../../helpers/address'
import chalk from 'chalk'

const MULTI_SIG_TXS_FILE = 'multisig.batch.tmp.json'

type MultiSigTx = {
  from: string
  to?: string | undefined
  value?: string | undefined
  data?: string | undefined
}

const {log} = console

export const batchTransactions = (transactions: MetaTransactionData[]): MetaTransaction => {
  const multiSendAddress = Address.GNOSIS_MULTISEND_ADDRESS
  const tx = encodeMulti(transactions, multiSendAddress)
  return tx
}

const proposeMultiSigTransaction = async (
  hre: HardhatRuntimeEnvironment,
  transaction: MetaTransactionData
): Promise<string> => {
  const {getNamedAccounts} = hre
  const {deployer} = await getNamedAccounts()
  const delegate = await hre.ethers.getSigner(deployer)

  const gnosisSafe = await GnosisSafeInitializer.init(hre, delegate)
  const contractTransactionHash = await gnosisSafe.proposeTransaction(transaction)
  return contractTransactionHash
}

export const executeUsingMultiSig = async (hre: HardhatRuntimeEnvironment, tx: MultiSigTx): Promise<void> => {
  const {from, to, data, value} = tx
  if (!to || !data) {
    throw Error('The `to` and `data` args can not be null')
  }

  if (['hardhat', 'localhost'].includes(hre.network.name)) {
    const w = await impersonateAccount(from)
    await w.sendTransaction({to, data})
  } else {
    if (tx.from !== Address.GNOSIS_SAFE_ADDRESS) {
      throw Error(`Trying to propose a multi-sig transaction but sender ('${from}') isn't the safe address.`)
    }

    const hash = await proposeMultiSigTransaction(hre, {to, data, value: value || '0'})
    log(chalk.blue(`MultiSig tx '${hash}' was proposed.`))
    log(chalk.blue('Wait for tx to confirm (at least 2 confirmations is recommended).'))
    log(chalk.blue('After confirmation, you must run the deployment again.'))
    log(chalk.blue('That way the `hardhat-deploy` will be able to catch the changes and update `deployments/` files.'))
    exit()
  }
}

export const executeBatchUsingMultisig = async (hre: HardhatRuntimeEnvironment): Promise<void> => {
  if (!fs.existsSync(MULTI_SIG_TXS_FILE)) {
    return
  }

  const file = fs.readFileSync(MULTI_SIG_TXS_FILE)

  const transactions = JSON.parse(file.toString())

  if (['hardhat', 'localhost'].includes(hre.network.name)) {
    for (const tx of transactions) {
      await executeUsingMultiSig(hre, tx)
    }
  } else {
    const {to, data, value} = batchTransactions(transactions)
    const tx = {from: Address.GNOSIS_SAFE_ADDRESS, to, data, value}
    await proposeMultiSigTransaction(hre, tx)
  }

  fs.unlinkSync(MULTI_SIG_TXS_FILE)
}

export const saveForMultiSigBatchExecution = async ({from, to, data, value}: MultiSigTx): Promise<void> => {
  if (!fs.existsSync(MULTI_SIG_TXS_FILE)) {
    fs.closeSync(fs.openSync(MULTI_SIG_TXS_FILE, 'w'))
  }

  const file = fs.readFileSync(MULTI_SIG_TXS_FILE)

  const newTx = {
    from,
    to,
    data,
    value: value || '0',
  }

  if (file.length == 0) {
    fs.writeFileSync(MULTI_SIG_TXS_FILE, JSON.stringify([newTx]))
  } else {
    const current = JSON.parse(file.toString()) as MultiSigTx[]

    const alreadyStored = current.find(
      (i: MultiSigTx) => i.to == newTx.to && i.data == newTx.data && i.from == newTx.from && i.value == newTx.value
    )

    if (alreadyStored) {
      return
    }

    const json = [...current, newTx]
    fs.writeFileSync(MULTI_SIG_TXS_FILE, JSON.stringify(json))
  }
}
