import hre from 'hardhat'
import fs from 'fs'
import Address from '../helpers/address'

// Use: `npx hardhat run scripts/report.ts --network <network>`
const main = async () => {
  const network = hre.network.name
  console.log(`===== ${network.toUpperCase()}`)

  const oracle = await hre.ethers.getContractAt('IMasterOracle', Address.MASTER_ORACLE_ADDRESS)

  const syntheticTokensFiles = fs
    .readdirSync(`./deployments/${network}`)
    .filter((f) => f.match(/.*Synthetic.*Proxy.json/g))
    .filter((f) => !f.match(/DOGE/g))

  for (const file of syntheticTokensFiles) {
    const {address} = await import(`../deployments/${network}/${file}`)
    const contract = await hre.ethers.getContractAt('SyntheticToken', address)
    const decimals = await contract.decimals()
    const symbol = await contract.symbol()
    const totalSupply = await contract.totalSupply()
    const totalSupplyInUsd = await oracle.quoteTokenToUsd(contract.address, totalSupply)
    console.log(
      `${symbol},${hre.ethers.utils.formatUnits(totalSupply, decimals)},${hre.ethers.utils.formatEther(
        totalSupplyInUsd
      )}`
    )
  }

  const debtTokensFiles = fs
    .readdirSync(`./deployments/${network}`)
    .filter((f) => f.match(/.*Debt.*Proxy.json/g))
    .filter((f) => !f.match(/DOGE/g))

  for (const file of debtTokensFiles) {
    const {address} = await import(`../deployments/${network}/${file}`)
    const contract = await hre.ethers.getContractAt('DebtToken', address)
    const decimals = await contract.decimals()
    const symbol = await contract.symbol()
    const totalSupply = await contract.totalSupply()
    const totalSupplyInUsd = await oracle.quoteTokenToUsd(await contract.syntheticToken(), totalSupply)
    console.log(
      `${symbol},${hre.ethers.utils.formatUnits(totalSupply, decimals)},${hre.ethers.utils.formatEther(
        totalSupplyInUsd
      )}`
    )
  }

  const depositTokensFiles = fs
    .readdirSync(`./deployments/${network}`)
    .filter((f) => f.match(/.*DepositToken.*Proxy.json/g))

  for (const file of depositTokensFiles) {
    const {address} = await import(`../deployments/${network}/${file}`)
    const contract = await hre.ethers.getContractAt('DepositToken', address)
    const decimals = await contract.decimals()
    const symbol = await contract.symbol()
    const totalSupply = await contract.totalSupply()
    const totalSupplyInUsd = await oracle.quoteTokenToUsd(await contract.underlying(), totalSupply)
    console.log(
      `${symbol},${hre.ethers.utils.formatUnits(totalSupply, decimals)},${hre.ethers.utils.formatEther(
        totalSupplyInUsd
      )}`
    )
  }
}

main().catch(console.log)
