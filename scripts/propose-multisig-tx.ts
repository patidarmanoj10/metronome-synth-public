import {OperationType, MetaTransactionData} from '@safe-global/safe-core-sdk-types'
import {ethers} from 'ethers'
import Safe from '@safe-global/safe-core-sdk'
import SafeServiceClient from '@safe-global/safe-service-client'
import EthersAdapter from '@safe-global/safe-ethers-lib'

const main = async () => {
  const safeAddress = '0x9520b477Aa81180E6DdC006Fc09Fb6d3eb4e807A' // Vesper Safe
  const provider = new ethers.providers.JsonRpcProvider('https://eth.connect.bloq.cloud/v1/witness-open-trouble')
  const delegate = ethers.Wallet.fromMnemonic(process.env.MNEMONIC!).connect(provider)
  const ethAdapter = new EthersAdapter({ethers, signerOrProvider: delegate})
  const safeSDK = await Safe.create({ethAdapter, safeAddress})
  const chain = 'mainnet'
  const txServiceUrl = `https://safe-transaction-${chain}.safe.global`
  const safeClient = new SafeServiceClient({txServiceUrl, ethAdapter})
  const delegateAddress = await safeSDK.getEthAdapter().getSignerAddress()
  if (!delegateAddress) {
    throw Error('delegate signer did not set')
  }

  // TODO: Use `encodeFunctionData` instead
  const txs: MetaTransactionData[] = [
    {
      to: '0xf9231D28B34CD77A08542f73ca87c4411B1b8B56', // AaveV3_Sommelier_Xy_RETH_WETH
      value: '0',
      // updateSwapper(0x229f19942612A8dbdec3643CB23F88685CCd56A5)
      data: '0xd3033c39000000000000000000000000229f19942612a8dbdec3643cb23f88685ccd56a5',
    },
    {
      to: '0x1572f7f1a5e4c2168ab007efc0a817750e814682', // AaveV3_Vesper_Xy_CBETH_WETH
      value: '0',
      // updateSwapper(0x229f19942612A8dbdec3643CB23F88685CCd56A5)
      data: '0xd3033c39000000000000000000000000229f19942612a8dbdec3643cb23f88685ccd56a5',
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
