import {OperationType, SafeTransactionData, MetaTransactionData} from '@safe-global/safe-core-sdk-types'
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

  public async proposeTransaction(tx: MetaTransactionData): Promise<string> {
    const {safeClient, safeSDK} = this
    const delegateAddress = await this.safeSDK.getEthAdapter().getSignerAddress()
    if (!delegateAddress) {
      throw Error('delegate signer did not set')
    }

    const nonce = await safeClient.getNextNonce(safeAddress)

    const safeTransactionData: SafeTransactionData = {
      ...tx,
      operation: OperationType.Call,
      safeTxGas: 0,
      baseGas: 0,
      gasPrice: 0,
      gasToken: ethers.constants.AddressZero,
      refundReceiver: ethers.constants.AddressZero,
      nonce,
    }

    const safeTransaction = await safeSDK.createTransaction({safeTransactionData})
    const contractTransactionHash = await safeSDK.getTransactionHash(safeTransaction)
    const {data: senderSignature} = await safeSDK.signTransactionHash(contractTransactionHash)

    await safeClient.proposeTransaction({
      safeAddress: safeSDK.getAddress(),
      safeTransactionData,
      safeTxHash: contractTransactionHash,
      senderAddress: delegateAddress,
      senderSignature,
    })

    return contractTransactionHash
  }
}

export class GnosisSafeInitializer {
  public static async init(hre: HardhatRuntimeEnvironment, delegate: Signer): Promise<GnosisSafe> {
    const ethAdapter = new EthersAdapter({ethers, signerOrProvider: delegate})
    const safeSDK = await Safe.create({ethAdapter, safeAddress})
    const {name: targetChain} = hre.network
    const txServiceUrl = `https://safe-transaction-${targetChain}.safe.global`
    const safeClient = new SafeServiceClient({txServiceUrl, ethAdapter})
    return new GnosisSafe(safeClient, safeSDK)
  }
}
