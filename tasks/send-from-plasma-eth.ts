/* eslint-disable no-console */
import {task} from 'hardhat/config'
import '@nomiclabs/hardhat-ethers'
import {ethers} from 'ethers'
import type {ProxyOFT} from '../typechain'
import Constants from '../helpers/constants'

task('send-from-plasma-eth', 'Send msUSD from Plasma to ETH').setAction(async (taskArgs, hre) => {
  // msUSD Proxy OFT address on Plasma mainnet
  const MSUSD_OFT_PLASMA_ADDRESS = '0xCBfa3f8a32ab63E461B6BBFda881ef01EB4eF75D'

  const msUSDAmount = ethers.utils.parseEther('0.05') // 0.05 msUSD
  const destinationChainId = Constants.LZ_MAINNET_CHAIN_ID

  // Get environment variables
  const rpcUrl = process.env.PLASMA_NODE_URL
  if (!rpcUrl) {
    throw new Error('PLASMA_NODE_URL environment variable not set')
  }

  const mnemonic = process.env.MNEMONIC
  if (!mnemonic) {
    throw new Error('MNEMONIC environment variable not set')
  }

  // Setup provider and wallet
  const provider = new ethers.providers.JsonRpcProvider(rpcUrl)
  const wallet = ethers.Wallet.fromMnemonic(mnemonic).connect(provider)

  const proxyOft = (await hre.ethers.getContractAt('ProxyOFT', MSUSD_OFT_PLASMA_ADDRESS, wallet)) as ProxyOFT

  try {
    const fee = await proxyOft['estimateSendFee(uint16,address,uint256)'](
      destinationChainId,
      wallet.address,
      msUSDAmount
    )
    console.log('Native fee for transaction', fee)

    await proxyOft.callStatic['sendFrom(address,uint16,address,uint256)'](
      wallet.address,
      destinationChainId,
      wallet.address,
      msUSDAmount,
      {value: fee}
    )
    console.log('CallStatic executed without issue')

    const tx = await proxyOft['sendFrom(address,uint16,address,uint256)'](
      wallet.address,
      destinationChainId,
      wallet.address,
      msUSDAmount,
      {value: fee}
    )

    console.log(`Transaction hash: ${tx.hash}\n`)

    // Wait for confirmation
    const receipt = await tx.wait()
    console.log(`Transaction confirmed in block: ${receipt.blockNumber}\n`)
  } catch (error) {
    console.error(`Error: ${error}\n`)
    throw error
  }
})
