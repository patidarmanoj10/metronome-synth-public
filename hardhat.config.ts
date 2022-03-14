import {HardhatUserConfig} from 'hardhat/types'
import '@nomiclabs/hardhat-waffle'
import '@nomiclabs/hardhat-ethers'
import 'solidity-coverage'
import 'hardhat-deploy'
import 'hardhat-log-remover'
import 'hardhat-gas-reporter'
import 'hardhat-contract-sizer'
import '@typechain/hardhat'
import 'hardhat-spdx-license-identifier'
import dotenv from 'dotenv'

dotenv.config()

const accounts = process.env.MNEMONIC ? {mnemonic: process.env.MNEMONIC} : undefined

const config: HardhatUserConfig = {
  defaultNetwork: 'hardhat',
  networks: {
    localhost: {
      saveDeployments: true,
      accounts,
    },
    hardhat: {
      // Note: Forking is being made from those test suites that need it
      // forking: {
      //   url: process.env.NODE_URL,
      //   blockNumber: process.env.BLOCK_NUMBER ? parseInt(process.env.BLOCK_NUMBER) : undefined,
      // },
      saveDeployments: true,
      accounts,
      chainId: process.env.CHAIN_ID ? parseInt(process.env.CHAIN_ID) : 1,
    },
    mainnet: {
      url: process.env.NODE_URL,
      chainId: 1,
      gas: 6700000,
      accounts,
      deploy: 'deploy/scripts/mainnet',
    },
    avalanche: {
      url: process.env.NODE_URL,
      chainId: 43114,
      gas: 8000000,
      accounts,
    },
  },
  paths: {
    // Note: Uses avalanche folder as default
    deploy: 'deploy/scripts/avalanche',
  },
  namedAccounts: {
    deployer: process.env.DEPLOYER || 0,
    governor: process.env.GOVERNOR || 1,
  },
  contractSizer: {
    alphaSort: true,
    runOnCompile: process.env.RUN_CONTRACT_SIZER === 'true',
    disambiguatePaths: false,
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS === 'true',
    outputFile: 'gas-report.txt',
    noColors: true,
    excludeContracts: ['mock/'],
  },
  solidity: {
    version: '0.8.9',
    settings: {
      optimizer: {
        enabled: true,
        runs: 100,
      },
      outputSelection: {
        '*': {
          '*': ['storageLayout'],
        },
      },
    },
  },
  spdxLicenseIdentifier: {
    overwrite: true,
    runOnCompile: true,
  },
  mocha: {
    timeout: 200000,
    // Note: We can enable parallelism here instead of using the `--parallel`
    // flag on npm script but it would make coverage to fail
    // parallel: true
  },
}

export default config
