/* eslint-disable max-params */
import {ethers} from 'hardhat'
import {BigNumber} from 'ethers'

const LEVERAGE = 1
const FLASH_REPAY = 2

// TypeScript version of `CrossChainLib.sol`
export class CrossChainLib {
  public static encodeLeverageSwapPayload(
    srcSmartFarmingManager: string,
    dstProxyOFT: string,
    requestId: number | string,
    sgPoolId: number | string,
    account: string,
    amountOutMin: BigNumber | string,
    callbackTxNativeFee: BigNumber | string
  ): string {
    const payload = ethers.utils.defaultAbiCoder.encode(
      ['address', 'address', 'uint256', 'uint256', 'address', 'uint256', 'uint256'],
      [srcSmartFarmingManager, dstProxyOFT, requestId, sgPoolId, account, amountOutMin, callbackTxNativeFee]
    )

    return ethers.utils.defaultAbiCoder.encode(['uint8', 'bytes'], [LEVERAGE, payload])
  }

  public static encodeFlashRepaySwapPayload(
    srcSmartFarmingManager: string,
    dstProxyOFT: string,
    requestId: number | string,
    account: string,
    amountOutMin: BigNumber | string,
    callbackTxNativeFee: BigNumber | string
  ): string {
    const payload = ethers.utils.defaultAbiCoder.encode(
      ['address', 'address', 'uint256', 'address', 'uint256', 'uint256'],
      [srcSmartFarmingManager, dstProxyOFT, requestId, account, amountOutMin, callbackTxNativeFee]
    )

    return ethers.utils.defaultAbiCoder.encode(['uint8', 'bytes'], [FLASH_REPAY, payload])
  }

  public static encodeLeverageCallbackPayload(srcSmartFarmingManager: string, requestId: number | string): string {
    const payload = ethers.utils.defaultAbiCoder.encode(['address', 'uint256'], [srcSmartFarmingManager, requestId])
    return ethers.utils.defaultAbiCoder.encode(['uint8', 'bytes'], [LEVERAGE, payload])
  }

  public static encodeFlashRepayCallbackPayload(
    srcProxyOFT: string,
    srcSmartFarmingManager: string,
    requestId: number | string
  ): string {
    const payload = ethers.utils.defaultAbiCoder.encode(
      ['address', 'address', 'uint256'],
      [srcProxyOFT, srcSmartFarmingManager, requestId]
    )
    return ethers.utils.defaultAbiCoder.encode(['uint8', 'bytes'], [FLASH_REPAY, payload])
  }

  public static encodeLzArgs(
    dstChainId: number | string,
    callbackNativeFee: BigNumber | string,
    swapTxGasLimit_: BigNumber | string
  ): string {
    return ethers.utils.defaultAbiCoder.encode(
      ['uint16', 'uint256', 'uint64'],
      [dstChainId, callbackNativeFee, swapTxGasLimit_]
    )
  }
}
