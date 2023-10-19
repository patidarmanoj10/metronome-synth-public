import {OperationType, MetaTransactionData} from '@safe-global/safe-core-sdk-types'
import {ethers} from 'ethers'
import Safe from '@safe-global/safe-core-sdk'
import SafeServiceClient from '@safe-global/safe-service-client'
import EthersAdapter from '@safe-global/safe-ethers-lib'
import dotenv from 'dotenv'

dotenv.config()

const MAINNET_VESPER_SAFE_ = '0x9520b477Aa81180E6DdC006Fc09Fb6d3eb4e807A'
const MAINNET_METRONOME_SAFE_ = '0xd1DE3F9CD4AE2F23DA941a67cA4C739f8dD9Af33'
const OP_METRONOME_SAFE_ = '0xE01Df4ac1E1e57266900E62C37F12C986495A618'

const main = async () => {
  // chain setup
  const safeAddress = OP_METRONOME_SAFE_
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

  // TODO: Use `encodeFunctionData` instead
  const txs: MetaTransactionData[] = [
    // mainnet
    // {
    //   to: '0x8BD81c99a2D349F6fB8E8a0B32C81704e3FE7302', // CCD mainnet
    //   value: '0',
    //   // toggleBridgingIsActive()
    //   data: '0x833667df',
    // },
    {
      to: '0xCEA698Cf2420433E21BeC006F1718216c6198B52', // CCD op
      value: '0',
      // toggleBridgingIsActive()
      data: '0x833667df',
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
