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

const config: HardhatUserConfig = {
  defaultNetwork: 'hardhat',
  networks: {
    localhost: {
      saveDeployments: true,
    },
    hardhat: {
      // Note: No need to fork yet
      // forking: {
      //   url: process.env.NODE_URL,
      //   blockNumber: process.env.BLOCK_NUMBER ? parseInt(process.env.BLOCK_NUMBER) : undefined,
      // },
      saveDeployments: true,
    },
    mainnet: {
      url: process.env.NODE_URL,
      chainId: 1,
      gas: 6700000,
    },
    polygon: {
      url: process.env.NODE_URL,
      chainId: 137,
      gas: 11700000,
    },
  },
  paths: {
    deploy: 'deploy/scripts',
    deployments: 'deployments',
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
  },
}

export default config
