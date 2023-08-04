/* eslint-disable max-params */
import {ethers} from 'hardhat'
import {BigNumber} from 'ethers'

const LEVERAGE = 1
const FLASH_REPAY = 2

// TypeScript version of `CrossChainLib.sol`
export class CrossChainLib {
  public static encodeLeverageSwapPayload(
    smartFarmingManager: string,
    requestId: number | string,
    sgPoolId: number | string,
    account: string,
    amountOutMin: BigNumber | string
  ): string {
    const payload = ethers.utils.defaultAbiCoder.encode(
      ['address', 'uint256', 'uint256', 'address', 'uint256'],
      [smartFarmingManager, requestId, sgPoolId, account, amountOutMin]
    )

    return ethers.utils.defaultAbiCoder.encode(['uint8', 'bytes'], [LEVERAGE, payload])
  }

  public static encodeFlashRepaySwapPayload(
    smartFarmingManager: string,
    requestId: number | string,
    account: string,
    amountOutMin: BigNumber | string
  ): string {
    const payload = ethers.utils.defaultAbiCoder.encode(
      ['address', 'uint256', 'address', 'uint256'],
      [smartFarmingManager, requestId, account, amountOutMin]
    )

    return ethers.utils.defaultAbiCoder.encode(['uint8', 'bytes'], [FLASH_REPAY, payload])
  }

  public static encodeLeverageCallbackPayload(smartFarmingManager: string, requestId: number | string): string {
    const payload = ethers.utils.defaultAbiCoder.encode(['address', 'uint256'], [smartFarmingManager, requestId])
    return ethers.utils.defaultAbiCoder.encode(['uint8', 'bytes'], [LEVERAGE, payload])
  }

  public static encodeFlashRepayCallbackPayload(smartFarmingManager: string, requestId: number | string): string {
    const payload = ethers.utils.defaultAbiCoder.encode(['address', 'uint256'], [smartFarmingManager, requestId])
    return ethers.utils.defaultAbiCoder.encode(['uint8', 'bytes'], [FLASH_REPAY, payload])
  }
}
