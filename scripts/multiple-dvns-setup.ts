/* eslint-disable curly */
/* eslint-disable quotes */
/* eslint-disable max-len */
/* eslint-disable complexity */
/* eslint-disable prefer-arrow/prefer-arrow-functions */
import hre, {ethers} from 'hardhat'
import chalk from 'chalk'
import {
  saveForMultiSigBatchExecution,
  executeBatchUsingMultisig,
  proposeMultiSigTransaction,
} from '../deploy/helpers/safe'

const {log} = console

// ─── Constants ────────────────────────────────────────────────────────────────

const CONFIG_TYPE_EXECUTOR = 1 // ULN301 configType for executor
const CONFIG_TYPE_ULN = 2 // ULN301 configType for DVNs

const MAINNET = 'mainnet'
const OPTIMISM = 'optimism'
const BASE = 'base'
const HEMI = 'hemi'
const PLASMA = 'plasma'

const MS_USD = 'msUSD'
const MS_ETH = 'msETH'

// ─── Types ────────────────────────────────────────────────────────────────────

type DvnConfig = {
  requiredDVNs: string[] // sorted ascending by address value
  optionalDVNs: string[] // sorted ascending by address value
  optionalDVNThreshold: number
  blockConfirmations: number
}

type OftConfig = {
  label: string
  address: string
}

type ChainConfig = {
  lzEId: string // LZ V1 eId of this chain
  endpoint: string // LZ V1 endpoint address
  governor: string // Gnosis Safe address
  executor: string // executor address — verify from LZ docs before running
  maxMessageSize: number
  dvns: DvnConfig // DVN addresses on this chain
  ofts: OftConfig[]
  crossChainDispatcher?: string
}

type PathConfig = {
  local: string // hardhat network name
  remote: string // hardhat network name
  localOftLabel: string // must match an OftConfig.label in local chain
}

// ─── Chain Config ─────────────────────────────────────────────────────────────

const OPTIONAL_DVNS_THRESHOLD = 1
const BLOCK_CONFIRMATIONS = 15

const chains: Record<string, ChainConfig> = {
  mainnet: {
    lzEId: '101',
    endpoint: '0x66A71Dcef29A0fFBDBE3c6a460a3B5BC225Cd675',
    governor: '0xd1DE3F9CD4AE2F23DA941a67cA4C739f8dD9Af33',
    executor: '0x173272739Bd7Aa6e4e214714048a9fE699453059',
    maxMessageSize: 10000,
    dvns: {
      requiredDVNs: [
        '0x380275805876Ff19055EA900CDb2B46a94ecF20D', // horizen-labs
        '0x589dEDbD617e0CBcB916A9223F4d1300c294236b', // lz
      ],
      optionalDVNs: [
        '0xa4fE5A5B9A846458a70Cd0748228aED3bF65c2cd', // canary
        '0xa59BA433ac34D2927232918Ef5B2eaAfcF130BA5', // nethermind
      ],
      optionalDVNThreshold: OPTIONAL_DVNS_THRESHOLD,
      blockConfirmations: BLOCK_CONFIRMATIONS,
    },
    ofts: [
      {label: 'msUSD', address: '0xF37982E3F33ac007C690eD6266F3402d24aA27Ea'},
      {label: 'msETH', address: '0x5c574153B195AE284C063a84fB9C73d9fd37955F'},
    ],
    crossChainDispatcher: '0x8BD81c99a2D349F6fB8E8a0B32C81704e3FE7302',
  },
  optimism: {
    lzEId: '111',
    endpoint: '0x3c2269811836af69497E5F486A85D7316753cf62',
    governor: '0xE01Df4ac1E1e57266900E62C37F12C986495A618',
    executor: '0x2D2ea0697bdbede3F01553D2Ae4B8d0c486B666e',
    maxMessageSize: 10000,
    dvns: {
      requiredDVNs: [
        '0x6A02D83e8d433304bba74EF1c427913958187142', // lz
        '0x9E930731cb4A6bf7eCc11F695A295c60bDd212eB', // horizen-labs
      ],
      optionalDVNs: [
        '0x5b6735c66d97479cCD18294fc96B3084EcB2fa3f', // canary
        '0xa7b5189bcA84Cd304D8553977c7C614329750d99', // nethermind
      ],
      optionalDVNThreshold: OPTIONAL_DVNS_THRESHOLD,
      blockConfirmations: BLOCK_CONFIRMATIONS,
    },
    ofts: [
      {label: 'msUSD', address: '0xc2C433D36d7184192E442a243b351a9e3055FD5f'},
      {label: 'msETH', address: '0x95dCFf2bfd19af97267B8c9D516206Dcc87EECDD'},
    ],
    crossChainDispatcher: '0xCEA698Cf2420433E21BeC006F1718216c6198B52',
  },
  base: {
    lzEId: '184',
    endpoint: '0xb6319cC6c8c27A8F5dAF0dD3DF91EA35C4720dd7',
    governor: '0xE01Df4ac1E1e57266900E62C37F12C986495A618',
    executor: '0x2CCA08ae69E0C44b18a57Ab2A87644234dAebaE4',
    maxMessageSize: 10000,
    dvns: {
      requiredDVNs: [
        '0x9e059a54699a285714207b43B055483E78FAac25', // lz
        '0xa7b5189bcA84Cd304D8553977c7C614329750d99', // horizen-labs
      ],
      optionalDVNs: [
        '0x554833698Ae0FB22ECC90B01222903fD62CA4B47', // canary
        '0xcd37CA043f8479064e10635020c65FfC005d36f6', // nethermind
      ],
      optionalDVNThreshold: OPTIONAL_DVNS_THRESHOLD,
      blockConfirmations: BLOCK_CONFIRMATIONS,
    },
    ofts: [
      {label: 'msUSD', address: '0x2AF13BF84F8B452cB86839330F514Cc5c2899217'},
      {label: 'msETH', address: '0x30EAc06D1e495411eE15cB59714Eb9DA29fc200e'},
    ],
    crossChainDispatcher: '0x3A04BF2cAca1345D475e0241B465C0EA4d4Ce950',
  },
  hemi: {
    lzEId: '329',
    endpoint: '0xb6319cC6c8c27A8F5dAF0dD3DF91EA35C4720dd7',
    governor: '0x468F87DB090Bc61C690CD86430B5407675B99242',
    executor: '0x4208D6E27538189bB48E603D6123A94b8Abe0A0b',
    maxMessageSize: 10000,
    dvns: {
      requiredDVNs: [
        '0x282b3386571f7f794450d5789911a9804FA346b4', // lz
        '0x38179D3BFa6Ef1d69A8A7b0b671BA3D8836B2AE8', // horizen-labs
      ],
      optionalDVNs: [
        '0x07C05EaB7716AcB6f83ebF6268F8EECDA8892Ba1', // nethermind
        '0x396dC0A78F789586E2982fCCD830C5954C193F3c', // canary
      ],
      optionalDVNThreshold: OPTIONAL_DVNS_THRESHOLD,
      blockConfirmations: BLOCK_CONFIRMATIONS,
    },
    ofts: [
      {label: 'msUSD', address: '0x182C58c10FA565d9d9A3b929294b8803F38463a1'},
      {label: 'msETH', address: '0x4661407fC224E5432D7f528a20EF8906E453A8f3'},
    ],
    crossChainDispatcher: '0x8EF55277fa3c722F5b042Bb9B569eB7444FfeF1e',
  },
  plasma: {
    lzEId: '383',
    endpoint: '0xb6319cC6c8c27A8F5dAF0dD3DF91EA35C4720dd7',
    governor: '0xE01Df4ac1E1e57266900E62C37F12C986495A618',
    executor: '0x4208D6E27538189bB48E603D6123A94b8Abe0A0b',
    maxMessageSize: 10000,
    dvns: {
      requiredDVNs: [
        '0x282b3386571f7f794450d5789911a9804FA346b4', // lz
        '0xd4CE45957FBCb88b868ad2c759C7DB9BC2741e56', // horizen-labs
      ],
      optionalDVNs: [
        '0x2465eE263149A18d61c9224244c61a5871dc0473', // canary
        '0xa51cE237FaFA3052D5d3308Df38A024724Bb1274', // nethermind
      ],
      optionalDVNThreshold: OPTIONAL_DVNS_THRESHOLD,
      blockConfirmations: BLOCK_CONFIRMATIONS,
    },
    ofts: [
      {label: 'msUSD', address: '0xCBfa3f8a32ab63E461B6BBFda881ef01EB4eF75D'},
      {label: 'msETH', address: '0x43e31e9Fb5aE89f81b84A24F7E1590e452a4eD61'},
    ],
    crossChainDispatcher: '0x73cFe9fdee48bd68A75C9Ec838F2781D13AccA62',
  },
}

// ─── Paths ────────────────────────────────────────────────────────────────────
// One entry per direction per OFT. DVN addresses come from the local chain's
// sendDvns / receiveDvns config above.

const paths: PathConfig[] = [
  // ─── msUSD ──────────────────────────────────────────────────────────────────

  // mainnet ↔ base
  {local: MAINNET, remote: BASE, localOftLabel: MS_USD},
  {local: BASE, remote: MAINNET, localOftLabel: MS_USD},

  // // mainnet ↔ optimism
  {local: MAINNET, remote: OPTIMISM, localOftLabel: MS_USD},
  {local: OPTIMISM, remote: MAINNET, localOftLabel: MS_USD},

  // mainnet ↔ hemi
  {local: MAINNET, remote: HEMI, localOftLabel: MS_USD},
  {local: HEMI, remote: MAINNET, localOftLabel: MS_USD},

  // mainnet ↔ plasma
  {local: MAINNET, remote: PLASMA, localOftLabel: MS_USD},
  {local: PLASMA, remote: MAINNET, localOftLabel: MS_USD},

  // base ↔ optimism
  {local: BASE, remote: OPTIMISM, localOftLabel: MS_USD},
  {local: OPTIMISM, remote: BASE, localOftLabel: MS_USD},

  // base ↔ hemi
  {local: BASE, remote: HEMI, localOftLabel: MS_USD},
  {local: HEMI, remote: BASE, localOftLabel: MS_USD},

  // base ↔ plasma
  {local: BASE, remote: PLASMA, localOftLabel: MS_USD},
  {local: PLASMA, remote: BASE, localOftLabel: MS_USD},

  // optimism ↔ hemi
  {local: OPTIMISM, remote: HEMI, localOftLabel: MS_USD},
  {local: HEMI, remote: OPTIMISM, localOftLabel: MS_USD},

  // optimism ↔ plasma
  {local: OPTIMISM, remote: PLASMA, localOftLabel: MS_USD},
  {local: PLASMA, remote: OPTIMISM, localOftLabel: MS_USD},

  // hemi ↔ plasma
  {local: HEMI, remote: PLASMA, localOftLabel: MS_USD},
  {local: PLASMA, remote: HEMI, localOftLabel: MS_USD},

  // ─── msETH ──────────────────────────────────────────────────────────────────

  // mainnet ↔ base
  {local: MAINNET, remote: BASE, localOftLabel: MS_ETH},
  {local: BASE, remote: MAINNET, localOftLabel: MS_ETH},

  // mainnet ↔ optimism
  {local: MAINNET, remote: OPTIMISM, localOftLabel: MS_ETH},
  {local: OPTIMISM, remote: MAINNET, localOftLabel: MS_ETH},

  // mainnet ↔ hemi
  {local: MAINNET, remote: HEMI, localOftLabel: MS_ETH},
  {local: HEMI, remote: MAINNET, localOftLabel: MS_ETH},

  // mainnet ↔ plasma
  {local: MAINNET, remote: PLASMA, localOftLabel: MS_ETH},
  {local: PLASMA, remote: MAINNET, localOftLabel: MS_ETH},

  // base ↔ optimism
  {local: BASE, remote: OPTIMISM, localOftLabel: MS_ETH},
  {local: OPTIMISM, remote: BASE, localOftLabel: MS_ETH},

  // base ↔ hemi
  {local: BASE, remote: HEMI, localOftLabel: MS_ETH},
  {local: HEMI, remote: BASE, localOftLabel: MS_ETH},

  // base ↔ plasma
  {local: BASE, remote: PLASMA, localOftLabel: MS_ETH},
  {local: PLASMA, remote: BASE, localOftLabel: MS_ETH},

  // optimism ↔ hemi
  {local: OPTIMISM, remote: HEMI, localOftLabel: MS_ETH},
  {local: HEMI, remote: OPTIMISM, localOftLabel: MS_ETH},

  // optimism ↔ plasma
  {local: OPTIMISM, remote: PLASMA, localOftLabel: MS_ETH},
  {local: PLASMA, remote: OPTIMISM, localOftLabel: MS_ETH},

  // hemi ↔ plasma
  {local: HEMI, remote: PLASMA, localOftLabel: MS_ETH},
  {local: PLASMA, remote: HEMI, localOftLabel: MS_ETH},
]

// ─── ABIs ─────────────────────────────────────────────────────────────────────

const ENDPOINT_ABI = [
  'function latestVersion() view returns (uint16)',
  'function getSendVersion(address ua) view returns (uint16)',
  'function getReceiveVersion(address ua) view returns (uint16)',
  'function getConfig(uint16 _version, uint16 _chainId, address _ua, uint _configType) view returns (bytes)',
]

const OFT_ABI = [
  'function setSendVersion(uint16) external',
  'function setReceiveVersion(uint16) external',
  'function setConfig(uint16 _version, uint16 _chainId, uint _configType, bytes _config) external',
]

const CROSS_CHAIN_DISPATCHER_ABI = [
  'function isDestinationChainSupported(uint16) view returns (bool)',
  'function toggleDestinationChainIsActive(uint16) external',
]

// ─── Encoding ─────────────────────────────────────────────────────────────────

function sortAddresses(addresses: string[]): string[] {
  return [...addresses].sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : 1))
}

function encodeExecutorConfig(maxMessageSize: number, executor: string): string {
  return ethers.utils.defaultAbiCoder.encode(
    ['tuple(uint32 maxMessageSize, address executor)'],
    [{maxMessageSize, executor}]
  )
}

function encodeUlnConfig(cfg: DvnConfig): string {
  const requiredDVNs = sortAddresses(cfg.requiredDVNs)
  const optionalDVNs = sortAddresses(cfg.optionalDVNs)
  return ethers.utils.defaultAbiCoder.encode(
    [
      'tuple(uint64 confirmations, uint8 requiredDVNCount, uint8 optionalDVNCount, uint8 optionalDVNThreshold, address[] requiredDVNs, address[] optionalDVNs)',
    ],
    [
      {
        confirmations: cfg.blockConfirmations,
        requiredDVNCount: requiredDVNs.length,
        optionalDVNCount: optionalDVNs.length,
        optionalDVNThreshold: cfg.optionalDVNThreshold,
        requiredDVNs,
        optionalDVNs,
      },
    ]
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

// Use: npx hardhat run scripts/multiple-dvns-setup.ts --network <network>
async function main() {
  const networkName = hre.network.name
  const chainConfig = chains[networkName]

  if (!chainConfig) {
    throw new Error(`No config for network '${networkName}'. Supported: ${Object.keys(chains).join(', ')}`)
  }

  if (!chainConfig.executor) {
    throw new Error(`Missing executor address for ${networkName}. Fill it in the chains config before running.`)
  }

  const matchingPaths = paths.filter((p) => p.local === networkName)
  if (matchingPaths.length === 0) {
    log(chalk.yellow(`No paths configured for ${networkName}. Add entries to the paths array.`))
    return
  }

  const dvnsEmpty = chainConfig.dvns.requiredDVNs.length < 2 && chainConfig.dvns.optionalDVNs.length < 2
  if (dvnsEmpty) {
    throw new Error(
      `No enough DVNs configured for ${networkName}. Fill sendDvns.requiredDVNs or optionalDVNs in the chains config before running.`
    )
  }

  const endpoint = await ethers.getContractAt(ENDPOINT_ABI, chainConfig.endpoint)
  const latestVersion = Number((await endpoint.latestVersion()).toString())
  const sendVersion = latestVersion - 1
  const receiveVersion = latestVersion

  log(chalk.blue(`\nNetwork: ${networkName}`))
  log(chalk.blue(`Endpoint: ${chainConfig.endpoint}`))
  log(chalk.blue(`ULN301 send version: ${sendVersion}, receive version: ${receiveVersion}`))

  const oftInterface = new ethers.utils.Interface(OFT_ABI)
  let txCount = 0

  const enqueueTx = async (description: string, to: string, data: string) => {
    log(chalk.green(`  + ${description}`))
    await saveForMultiSigBatchExecution({from: chainConfig.governor, to, data, value: '0'})
    txCount++
  }

  for (const path of matchingPaths) {
    const remoteConfig = chains[path.remote]
    if (!remoteConfig) throw new Error(`No config for remote network '${path.remote}'`)

    const localOft = chainConfig.ofts.find((o) => o.label === path.localOftLabel)
    if (!localOft) throw new Error(`No OFT labeled '${path.localOftLabel}' in ${networkName} config`)

    log(chalk.blue(`\n[${localOft.label}] ${localOft.address}`))
    log(chalk.blue(`  remote eId: ${remoteConfig.lzEId} (${path.remote})`))

    const currentSendVersion = Number((await endpoint.getSendVersion(localOft.address)).toString())
    const currentReceiveVersion = Number((await endpoint.getReceiveVersion(localOft.address)).toString())

    // ── Send version ──────────────────────────────────────────────────────────

    if (currentSendVersion !== sendVersion) {
      await enqueueTx(
        `setSendVersion(${sendVersion})`,
        localOft.address,
        oftInterface.encodeFunctionData('setSendVersion', [sendVersion])
      )
    } else {
      log(chalk.gray(`  Send version already ULN301 (${sendVersion})`))
    }

    // ── Receive version ───────────────────────────────────────────────────────

    if (currentReceiveVersion !== receiveVersion) {
      await enqueueTx(
        `setReceiveVersion(${receiveVersion})`,
        localOft.address,
        oftInterface.encodeFunctionData('setReceiveVersion', [receiveVersion])
      )
    } else {
      log(chalk.gray(`  Receive version already ULN301 (${receiveVersion})`))
    }

    const tryGetConfig = async (version: number, chainId: string, configType: number): Promise<string | null> => {
      try {
        return await endpoint.getConfig(version, chainId, localOft.address, configType)
      } catch {
        return null
      }
    }

    // ── Executor config ───────────────────────────────────────────────────────

    const desiredExec = encodeExecutorConfig(chainConfig.maxMessageSize, chainConfig.executor)
    const currentExec = await tryGetConfig(sendVersion, remoteConfig.lzEId, CONFIG_TYPE_EXECUTOR)

    if (currentExec !== desiredExec) {
      await enqueueTx(
        `setConfig(executor)`,
        localOft.address,
        oftInterface.encodeFunctionData('setConfig', [
          sendVersion,
          remoteConfig.lzEId,
          CONFIG_TYPE_EXECUTOR,
          desiredExec,
        ])
      )
    } else {
      log(chalk.gray(`  Executor config already set`))
    }

    // ── Send DVN config ───────────────────────────────────────────────────────

    const desiredSendUln = encodeUlnConfig(chainConfig.dvns)
    const currentSendUln = await tryGetConfig(sendVersion, remoteConfig.lzEId, CONFIG_TYPE_ULN)

    if (currentSendUln !== desiredSendUln) {
      await enqueueTx(
        `setConfig(DVNs: ${chainConfig.dvns.requiredDVNs.length} required, ${chainConfig.dvns.optionalDVNs.length} optional)`,
        localOft.address,
        oftInterface.encodeFunctionData('setConfig', [sendVersion, remoteConfig.lzEId, CONFIG_TYPE_ULN, desiredSendUln])
      )
    } else {
      log(chalk.gray(`  Send DVN config already set`))
    }

    // ── Receive DVN config ────────────────────────────────────────────────────

    const desiredRecvUln = encodeUlnConfig(chainConfig.dvns)
    const currentRecvUln = await tryGetConfig(receiveVersion, remoteConfig.lzEId, CONFIG_TYPE_ULN)

    if (currentRecvUln !== desiredRecvUln) {
      await enqueueTx(
        `setConfig(DVNs: ${chainConfig.dvns.requiredDVNs.length} required, ${chainConfig.dvns.optionalDVNs.length} optional)`,
        localOft.address,
        oftInterface.encodeFunctionData('setConfig', [
          receiveVersion,
          remoteConfig.lzEId,
          CONFIG_TYPE_ULN,
          desiredRecvUln,
        ])
      )
    } else {
      log(chalk.gray(`  Receive DVN config already set`))
    }
  }

  // ── Enable all destination chains on CrossChainDispatcher ──────────────

  if (chainConfig.crossChainDispatcher) {
    const ccd = await ethers.getContractAt(CROSS_CHAIN_DISPATCHER_ABI, chainConfig.crossChainDispatcher)
    const ccdInterface = new ethers.utils.Interface(CROSS_CHAIN_DISPATCHER_ABI)

    const destinationChains = Object.entries(chains)
      .filter(([name]) => name !== networkName)
      .map(([name, config]) => ({name, lzEId: config.lzEId}))

    log(chalk.blue(`\nCrossChainDispatcher: ${chainConfig.crossChainDispatcher}`))

    for (const {name, lzEId} of destinationChains) {
      const isSupported = await ccd.isDestinationChainSupported(lzEId)
      if (!isSupported) {
        await enqueueTx(
          `toggleDestinationChainIsActive(${lzEId}) — enable ${name}`,
          chainConfig.crossChainDispatcher,
          ccdInterface.encodeFunctionData('toggleDestinationChainIsActive', [lzEId])
        )
      } else {
        log(chalk.gray(`  ${name} (${lzEId}) already enabled as destination chain`))
      }
    }
  }

  if (txCount === 0) {
    log(chalk.green('\nAll configs are already up to date. Nothing to do.'))
    return
  }

  log(chalk.blue(`\nProposing ${txCount} transaction(s) to Gnosis Safe (${chainConfig.governor})...`))
  await executeBatchUsingMultisig(hre)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
