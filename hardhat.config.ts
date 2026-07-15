import {HardhatUserConfig} from 'hardhat/types'
import '@nomicfoundation/hardhat-toolbox'
import 'hardhat-deploy'
import 'hardhat-log-remover'
import 'hardhat-contract-sizer'
import 'hardhat-spdx-license-identifier'
import './tasks/create-release'
import './tasks/impersonate-deployer'
import './tasks/update-owner-and-governor'
import './tasks/send-from-eth-plasma'
import './tasks/send-from-plasma-eth'
import 'hardhat-network-metadata'
import dotenv from 'dotenv'

dotenv.config()

const accounts = process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY!] : undefined
const deployer = process.env.DEPLOYER || 0

// Using random wallets instead of well-kwon "test test ... junk"
// because of on-chain addresses were delegated to contracts that reject ETH
const testAccounts = {mnemonic: 'absurd ride hammer base can pave one attack disorder olympic unable refuse'}

// Hardhat do not support adding chainId at runtime. Only way to set it in hardhat-config.js
// More info https://github.com/NomicFoundation/hardhat/issues/2167
function resolveChainId() {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const FORK_CHAIN = process.env.FORK_CHAIN || 'mainnet'
  const deploy = ['deploy/scripts/mainnet']

  if (FORK_CHAIN == 'mainnet') {
    return {chainId: 1, deploy}
  }
  if (FORK_CHAIN == 'optimism') {
    return {chainId: 10, deploy: ['deploy/scripts/optimism']}
  }
  if (FORK_CHAIN == 'base') {
    return {chainId: 8453, deploy: ['deploy/scripts/base']}
  }
  if (FORK_CHAIN == 'hemi') {
    return {chainId: 43111, deploy: ['deploy/scripts/hemi']}
  }
  if (FORK_CHAIN == 'plasma') {
    return {chainId: 9745, deploy: ['deploy/scripts/plasma']}
  }

  return {chainId: 31337, deploy}
}
const {chainId, deploy} = resolveChainId()

const config: HardhatUserConfig = {
  defaultNetwork: 'hardhat',
  networks: {
    localhost: {
      saveDeployments: true,
      autoImpersonate: true,
      chainId,
      deploy,
    },
    hardhat: {
      // Note: Forking is being made from those test suites that need it
      saveDeployments: true,
      chainId,
      deploy,
      hardfork: 'cancun',
      initialBaseFeePerGas: 0,
      accounts: testAccounts,
      chains: {
        // See: https://hardhat.org/hardhat-network/docs/guides/forking-other-networks#using-a-custom-hardfork-history
        1923: {hardforkHistory: {cancun: 1}},
        43111: {hardforkHistory: {cancun: 1}},
        9745: {hardforkHistory: {cancun: 1}},
        8453: {hardforkHistory: {cancun: 1}},
      },
    },
    mainnet: {
      url: process.env.MAINNET_NODE_URL,
      chainId: 1,
      gas: 6700000,
      accounts,
      deploy: ['deploy/scripts/mainnet'],
    },
    optimism: {
      url: process.env.OPTIMISM_NODE_URL || '',
      chainId: 10,
      gas: 8000000,
      deploy: ['deploy/scripts/optimism'],
      accounts,
    },
    base: {
      url: process.env.BASE_NODE_URL || '',
      chainId: 8453,
      gas: 8000000,
      deploy: ['deploy/scripts/base'],
      accounts,
    },
    hemi: {
      url: process.env.HEMI_NODE_URL || '',
      chainId: 43111,
      gas: 8000000,
      deploy: ['deploy/scripts/hemi'],
      accounts,
      metadata: {
        safeApi: 'https://safe-transaction-hemi.safe.global/api',
      },
    },
    plasma: {
      url: process.env.PLASMA_NODE_URL || '',
      chainId: 9745,
      gas: 8000000,
      deploy: ['deploy/scripts/plasma'],
      accounts,
      metadata: {
        safeApi: 'https://safe-transaction-plasma.safe.global/api',
      },
    },
  },
  namedAccounts: {
    deployer,
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
    compilers: [
      {
        version: '0.8.9',
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
          outputSelection: {
            '*': {
              '*': ['storageLayout'],
            },
          },
        },
      },
      {
        version: '0.8.24',
        settings: {
          evmVersion: 'cancun',
          optimizer: {
            enabled: true,
            runs: 200,
          },
          outputSelection: {
            '*': {
              '*': ['storageLayout'],
            },
          },
        },
      },
    ],
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY || 'noApiKeyNeeded',
    // Hemi is not on Etherscan's V2 chainlist; it uses its own Blockscout explorer.
    // Contract verification on Hemi is done via `node scripts/verify-hemi.js`, which POSTs
    // the standard-JSON to Routescan's Hemi API (explorer.hemi.xyz's Blockscout blocks
    // programmatic verification behind a Cloudflare challenge). This customChains entry is
    // kept only to document the Blockscout endpoints for reference.
    customChains: [
      {
        network: 'hemi',
        chainId: 43111,
        urls: {
          apiURL: 'https://explorer.hemi.xyz/api',
          browserURL: 'https://explorer.hemi.xyz',
        },
      },
    ],
  },
  spdxLicenseIdentifier: {
    overwrite: false,
    runOnCompile: true,
  },
  typechain: {
    outDir: 'typechain',
  },
  mocha: {
    timeout: 200000,
    // Note: We can enable parallelism here instead of using the `--parallel`
    // flag on npm script but it would make coverage to fail
    // parallel: true
  },
}

export default config
