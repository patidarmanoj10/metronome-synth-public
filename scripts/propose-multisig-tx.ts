import {OperationType, MetaTransactionData} from '@safe-global/safe-core-sdk-types'
import {ethers} from 'ethers'
import Safe from '@safe-global/safe-core-sdk'
import SafeServiceClient from '@safe-global/safe-service-client'
import EthersAdapter from '@safe-global/safe-ethers-lib'
import dotenv from 'dotenv'

dotenv.config()

// const MAINNET_VESPER_SAFE_ = '0x9520b477Aa81180E6DdC006Fc09Fb6d3eb4e807A'
//const MAINNET_METRONOME_SAFE = '0xd1DE3F9CD4AE2F23DA941a67cA4C739f8dD9Af33'
const OP_METRONOME_SAFE = '0xE01Df4ac1E1e57266900E62C37F12C986495A618'

const main = async () => {
  // chain setup
  const safeAddress = OP_METRONOME_SAFE
  const chain = 'optimism'
  const provider = new ethers.providers.JsonRpcProvider('https://optimism.llamarpc.com')

  const delegate = ethers.Wallet.fromMnemonic(process.env.MNEMONIC!).connect(provider)
  const ethAdapter = new EthersAdapter({ethers, signerOrProvider: delegate})
  const safeSDK = await Safe.create({ethAdapter, safeAddress})
  const txServiceUrl = `https://safe-transaction-${chain}.safe.global`
  const safeClient = new SafeServiceClient({txServiceUrl, ethAdapter})
  const delegateAddress = await safeSDK.getEthAdapter().getSignerAddress()
  if (!delegateAddress) {
    throw Error('delegate signer did not set')
  }

  const iface = new ethers.utils.Interface(['function upgrade(address,address)'])
  const data = iface.encodeFunctionData('upgrade', [
    '0x017CBF62b53313d5eE3aD1288daA95CD39AA11fE',
    '0xb908cadb1906b44c3d163486d8ceb9b4370c476e',
  ])
  const txs: MetaTransactionData[] = [
    {
      to: '0xc9FfA23308D02DC9CfFE955FccE5ffD117A03B46',
      value: '0',
      data,
    },
  ]
  const safeTransactionData: MetaTransactionData[] = txs.map((tx) => ({...tx, operation: OperationType.Call}))

  const nonce = await safeClient.getNextNonce(safeAddress)
  const safeTransaction = await safeSDK.createTransaction({safeTransactionData, options: {nonce}})
  const safeTxHash = await safeSDK.getTransactionHash(safeTransaction)
  const {data: senderSignature} = await safeSDK.signTransactionHash(safeTxHash)

  await safeClient.proposeTransaction({
    safeAddress,
    safeTransactionData: safeTransaction.data,
    safeTxHash,
    senderAddress: delegateAddress,
    senderSignature,
  })
}

main().catch(console.log)
