import {OperationType, MetaTransactionData} from '@safe-global/safe-core-sdk-types'
import Address from '../../helpers/address'
import {ethers} from 'hardhat'
import Safe from '@safe-global/safe-core-sdk'
import SafeServiceClient from '@safe-global/safe-service-client'
import EthersAdapter from '@safe-global/safe-ethers-lib'
import {Signer} from 'ethers'
import {HardhatRuntimeEnvironment} from 'hardhat/types'

const {GNOSIS_SAFE_ADDRESS: safeAddress} = Address

export class GnosisSafe {
  constructor(protected safeClient: SafeServiceClient, protected safeSDK: Safe) {}

  // Based on https://github.com/safe-global/safe-core-sdk/blob/main/playground/propose-transaction.ts
  public async proposeTransaction(txs: MetaTransactionData[]): Promise<string> {
    const {safeClient, safeSDK} = this
    const delegateAddress = await this.safeSDK.getEthAdapter().getSignerAddress()
    if (!delegateAddress) {
      throw Error('delegate signer did not set')
    }

    const safeTransactionData: MetaTransactionData[] = txs.map((tx) => ({...tx, operation: OperationType.Call}))

    const safeTransaction = await safeSDK.createTransaction({safeTransactionData})
    const safeTxHash = await safeSDK.getTransactionHash(safeTransaction)
    const {data: senderSignature} = await safeSDK.signTransactionHash(safeTxHash)

    await safeClient.proposeTransaction({
      safeAddress: safeSDK.getAddress(),
      safeTransactionData: safeTransaction.data,
      safeTxHash,
      senderAddress: delegateAddress,
      senderSignature,
    })

    return safeTxHash
  }
}

export class GnosisSafeInitializer {
  public static async init(hre: HardhatRuntimeEnvironment, delegate: Signer): Promise<GnosisSafe> {
    const ethAdapter = new EthersAdapter({ethers, signerOrProvider: delegate})
    const safeSDK = await Safe.create({ethAdapter, safeAddress})
    const {name: chain} = hre.network
    const txServiceUrl = `https://safe-transaction-${chain}.safe.global`
    const safeClient = new SafeServiceClient({txServiceUrl, ethAdapter})
    return new GnosisSafe(safeClient, safeSDK)
  }
}
