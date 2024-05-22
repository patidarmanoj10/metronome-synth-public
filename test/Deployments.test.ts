import {Contract} from '@ethersproject/contracts'
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {expect} from 'chai'
import {deployments, ethers} from 'hardhat'
import {
  DebtToken,
  DepositToken,
  SyntheticToken,
  Treasury,
  Pool,
  NativeTokenGateway,
  PoolRegistry,
  FeeProvider,
  RewardsDistributor,
  UpgraderBase,
  SmartFarmingManager,
  Quoter,
  CrossChainDispatcher,
} from '../typechain'
import {disableForking, enableForking, impersonateAccount} from './helpers'
import Address from '../helpers/address'
import {parseEther} from 'ethers/lib/utils'
import {getStorageAt} from '@nomicfoundation/hardhat-network-helpers'

const {USDC_ADDRESS, NATIVE_TOKEN_ADDRESS, MASTER_ORACLE_ADDRESS} = Address

describe('Deployments', function () {
  let deployer: SignerWithAddress
  let poolRegistry: PoolRegistry
  let quoter: Quoter
  let crossChainDispatcher: CrossChainDispatcher
  let wethGateway: NativeTokenGateway
  let pool1: Pool
  let feeProvider1: FeeProvider
  let treasury1: Treasury
  let smartFarmingManager1: SmartFarmingManager
  let pool2: Pool
  let feeProvider2: FeeProvider
  let treasury2: Treasury
  let smartFarmingManager2: SmartFarmingManager
  let msdUSDC: DepositToken
  let msdWETH: DepositToken
  let msBTC: SyntheticToken
  let msUSD: SyntheticToken
  let msBTCDebt: DebtToken
  let msUSDDebt: DebtToken
  let rewardsDistributor: RewardsDistributor

  // Note: Enabling fork to be able to use MultiCall contract
  before(enableForking)

  after(disableForking)

  beforeEach(async function () {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[deployer] = await ethers.getSigners()

    const {
      Pool1: {address: pool1Address},
      Pool2: {address: pool2Address},
      Treasury_Pool1: {address: treasury1Address},
      Treasury_Pool2: {address: treasury2Address},
      USDCDepositToken_Pool1: {address: usdcDepositTokenAddress},
      WETHDepositToken_Pool1: {address: wethDepositTokenAddress},
      MsBTCSynthetic: {address: msBTCAddress},
      MsUSDSynthetic: {address: msUSDAddress},
      MsBTCDebt_Pool1: {address: msBTCDebtTokenAddress},
      MsUSDDebt_Pool1: {address: msUSDDebtTokenAddress},
      NativeTokenGateway: {address: wethGatewayAddress},
      PoolRegistry: {address: poolRegistryAddress},
      FeeProvider_Pool1: {address: feeProvider1Address},
      FeeProvider_Pool2: {address: feeProvider2Address},
      MetRewardsDistributor: {address: rewardsDistributorAddress},
      SmartFarmingManager_Pool1: {address: smartFarmingManager1Address},
      SmartFarmingManager_Pool2: {address: smartFarmingManager2Address},
      Quoter: {address: quoterAddress},
      CrossChainDispatcher: {address: crossChainDispatcherAddress},
    } = await deployments.fixture()

    pool1 = <Pool>await ethers.getContractAt('contracts/Pool.sol:Pool', pool1Address, deployer)
    pool2 = <Pool>await ethers.getContractAt('contracts/Pool.sol:Pool', pool2Address, deployer)

    treasury1 = await ethers.getContractAt('Treasury', treasury1Address, deployer)
    treasury2 = await ethers.getContractAt('Treasury', treasury2Address, deployer)

    wethGateway = await ethers.getContractAt('NativeTokenGateway', wethGatewayAddress, deployer)

    msdUSDC = await ethers.getContractAt('DepositToken', usdcDepositTokenAddress, deployer)
    msdWETH = await ethers.getContractAt('DepositToken', wethDepositTokenAddress, deployer)

    msBTC = await ethers.getContractAt('SyntheticToken', msBTCAddress, deployer)
    msUSD = await ethers.getContractAt('SyntheticToken', msUSDAddress, deployer)

    msBTCDebt = await ethers.getContractAt('DebtToken', msBTCDebtTokenAddress, deployer)
    msUSDDebt = await ethers.getContractAt('DebtToken', msUSDDebtTokenAddress, deployer)

    poolRegistry = await ethers.getContractAt('PoolRegistry', poolRegistryAddress, deployer)

    feeProvider1 = await ethers.getContractAt('FeeProvider', feeProvider1Address, deployer)
    feeProvider2 = await ethers.getContractAt('FeeProvider', feeProvider2Address, deployer)

    smartFarmingManager1 = await ethers.getContractAt('SmartFarmingManager', smartFarmingManager1Address, deployer)
    smartFarmingManager2 = await ethers.getContractAt('SmartFarmingManager', smartFarmingManager2Address, deployer)

    rewardsDistributor = await ethers.getContractAt('RewardsDistributor', rewardsDistributorAddress, deployer)
    quoter = await ethers.getContractAt('Quoter', quoterAddress, deployer)
    crossChainDispatcher = await ethers.getContractAt('CrossChainDispatcher', crossChainDispatcherAddress, deployer)
  })

  const getProxyAdmin = async function (proxy: Contract): Promise<UpgraderBase> {
    const ADMIN_SLOT = '0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103'
    const bytes32 = await getStorageAt(proxy.address, ADMIN_SLOT)
    const address = ethers.utils.defaultAbiCoder.decode(['address'], bytes32).toString()
    return await ethers.getContractAt('UpgraderBase', address, deployer)
  }

  const getProxyImplementation = async function (proxy: Contract): Promise<string> {
    const upgrader = await getProxyAdmin(proxy)
    return await upgrader.getProxyImplementation(proxy.address)
  }

  const upgradeTestCase = async function ({
    proxy,
    newImplArtifact,
    expectToFail,
  }: {
    proxy: Contract
    newImplArtifact: string
    expectToFail: boolean
  }) {
    // given
    const newImplFactory = await ethers.getContractFactory(newImplArtifact, deployer)
    const newImpl = await newImplFactory.deploy()
    await newImpl.deployed()

    const upgrader = await getProxyAdmin(proxy)

    const oldImpl = await upgrader.getProxyImplementation(proxy.address)
    expect(oldImpl).not.eq(newImpl.address)

    // when
    const owner = await impersonateAccount(await upgrader.owner())
    const tx = upgrader.connect(owner).upgrade(proxy.address, newImpl.address)

    // then
    if (expectToFail) {
      await expect(tx).reverted
    } else {
      await tx
      expect(await upgrader.getProxyImplementation(proxy.address)).eq(newImpl.address)
    }
  }

  describe('Pool', function () {
    it('should have the same proxy admin', async function () {
      const pool1ProxyAdmin = await getProxyAdmin(pool1)
      const pool2ProxyAdmin = await getProxyAdmin(pool2)
      expect(pool1ProxyAdmin.address).eq(pool2ProxyAdmin.address)
    })

    it('should have the same implementation', async function () {
      const pool1Impl = await getProxyImplementation(pool1)
      const pool2Impl = await getProxyImplementation(pool2)
      expect(pool1Impl).eq(pool2Impl)
    })

    it('should have correct params', async function () {
      expect(await pool1.treasury()).eq(treasury1.address)
      expect(await pool1.governor()).eq(deployer.address)
      expect(await pool1.proposedGovernor()).eq(ethers.constants.AddressZero)
    })

    it('should upgrade implementation', async function () {
      await upgradeTestCase({newImplArtifact: 'contracts/Pool.sol:Pool', proxy: pool1, expectToFail: false})
    })

    it('should fail if implementation breaks storage', async function () {
      await upgradeTestCase({newImplArtifact: 'MasterOracleMock', proxy: pool1, expectToFail: true})
    })
  })

  describe('Treasury', function () {
    it('should have the same proxy admin', async function () {
      const treasury1ProxyAdmin = await getProxyAdmin(treasury1)
      const treasury2ProxyAdmin = await getProxyAdmin(treasury2)
      expect(treasury1ProxyAdmin.address).eq(treasury2ProxyAdmin.address)
    })

    it('should have the same implementation', async function () {
      const treasury1Impl = await getProxyImplementation(treasury1)
      const treasury2Impl = await getProxyImplementation(treasury2)
      expect(treasury1Impl).eq(treasury2Impl)
    })

    it('should have correct params', async function () {
      expect(await treasury1.pool()).eq(pool1.address)
      expect(await treasury1.governor()).eq(deployer.address)
    })

    it('should upgrade implementation', async function () {
      await upgradeTestCase({newImplArtifact: 'Treasury', proxy: treasury1, expectToFail: false})
    })
  })

  describe('NativeTokenGateway', function () {
    it('should have correct params', async function () {
      expect(await wethGateway.nativeToken()).eq(NATIVE_TOKEN_ADDRESS)
      expect(await wethGateway.poolRegistry()).eq(poolRegistry.address)
    })
  })

  describe('DepositToken', function () {
    it('should have the same proxy admin', async function () {
      const msdUSDCProxyAdmin = await getProxyAdmin(msdUSDC)
      const msdWETHProxyAdmin = await getProxyAdmin(msdWETH)
      expect(msdUSDCProxyAdmin.address).eq(msdWETHProxyAdmin.address)
    })

    it('should have the same implementation', async function () {
      const msdUSDCImpl = await getProxyImplementation(msdUSDC)
      const msdWETHImpl = await getProxyImplementation(msdWETH)
      expect(msdUSDCImpl).eq(msdWETHImpl)
    })

    describe('USDC DepositToken', function () {
      it('token should have correct params', async function () {
        expect(await msdUSDC.pool()).eq(pool1.address)
        expect(await msdUSDC.underlying()).eq(USDC_ADDRESS)
        expect(await msdUSDC.governor()).eq(deployer.address)
      })

      it('should upgrade implementation', async function () {
        await upgradeTestCase({newImplArtifact: 'DepositToken', proxy: msdUSDC, expectToFail: false})
      })

      it('should fail if implementation breaks storage', async function () {
        await upgradeTestCase({newImplArtifact: 'MasterOracleMock', proxy: msdUSDC, expectToFail: true})
      })
    })

    describe('WETH DepositToken', function () {
      it('token should have correct params', async function () {
        expect(await msdWETH.pool()).eq(pool1.address)
        expect(await msdWETH.underlying()).eq(NATIVE_TOKEN_ADDRESS)
        expect(await msdWETH.governor()).eq(deployer.address)
        expect(await msdWETH.symbol()).eq('msdWETH-1')
        expect(await msdWETH.name()).eq('Metronome Synth WETH-Deposit')
      })

      it('should upgrade implementation', async function () {
        await upgradeTestCase({newImplArtifact: 'DepositToken', proxy: msdWETH, expectToFail: false})
      })

      it('should fail if implementation breaks storage', async function () {
        await upgradeTestCase({newImplArtifact: 'MasterOracleMock', proxy: msdWETH, expectToFail: true})
      })
    })
  })

  describe('SyntheticToken', function () {
    it('should have the same proxy admin', async function () {
      const msBTCDebtProxyAdmin = await getProxyAdmin(msBTCDebt)
      const msUSDDebtProxyAdmin = await getProxyAdmin(msUSDDebt)
      expect(msBTCDebtProxyAdmin.address).eq(msUSDDebtProxyAdmin.address)

      const msBTCProxyAdmin = await getProxyAdmin(msBTC)
      const msUSDProxyAdmin = await getProxyAdmin(msUSD)
      expect(msBTCProxyAdmin.address).eq(msUSDProxyAdmin.address)
    })

    it('should have the same implementation', async function () {
      const msBTCDebtImpl = await getProxyImplementation(msBTCDebt)
      const msUSDDebtImpl = await getProxyImplementation(msUSDDebt)
      expect(msBTCDebtImpl).eq(msUSDDebtImpl)

      const msBTCImpl = await getProxyImplementation(msBTC)
      const msUSDImpl = await getProxyImplementation(msUSD)
      expect(msBTCImpl).eq(msUSDImpl)
    })

    describe('msBTC SyntheticToken', function () {
      it('token should have correct params', async function () {
        expect(await msBTC.poolRegistry()).eq(poolRegistry.address)
        expect(await msBTC.isActive()).eq(true)
        expect(await msBTC.symbol()).eq('msBTC')
        expect(await msBTC.name()).eq('Metronome Synth BTC')
      })

      it('should upgrade implementation', async function () {
        await upgradeTestCase({newImplArtifact: 'SyntheticToken', proxy: msBTC, expectToFail: false})
      })

      it('should fail if implementation breaks storage', async function () {
        await upgradeTestCase({newImplArtifact: 'MasterOracleMock', proxy: msBTC, expectToFail: true})
      })
    })

    describe('msUSD SyntheticToken', function () {
      it('msUSD token should have correct params', async function () {
        expect(await msUSD.poolRegistry()).eq(poolRegistry.address)
        expect(await msUSD.isActive()).eq(true)
        expect(await msUSD.symbol()).eq('msUSD')
        expect(await msUSD.name()).eq('Metronome Synth USD')
      })

      it('should upgrade implementation', async function () {
        await upgradeTestCase({newImplArtifact: 'SyntheticToken', proxy: msUSD, expectToFail: false})
      })

      it('should fail if implementation breaks storage', async function () {
        await upgradeTestCase({newImplArtifact: 'MasterOracleMock', proxy: msUSD, expectToFail: true})
      })
    })
  })

  describe('DebtToken', function () {
    describe('msBTC DebtToken', function () {
      it('token should have correct params', async function () {
        expect(await msBTCDebt.pool()).eq(pool1.address)
        expect(await msBTCDebt.governor()).eq(deployer.address)
        expect(await msBTCDebt.interestRate()).eq(parseEther('0.01'))
        expect(await msBTCDebt.maxTotalSupply()).eq(parseEther('16'))
        expect(await msBTCDebt.isActive()).eq(true)
        expect(await msBTCDebt.symbol()).eq('msBTC-Debt-1')
        expect(await msBTCDebt.name()).eq('Metronome Synth BTC-Debt')
      })

      it('should upgrade implementation', async function () {
        await upgradeTestCase({newImplArtifact: 'DebtToken', proxy: msBTCDebt, expectToFail: false})
      })

      it('should fail if implementation breaks storage', async function () {
        await upgradeTestCase({newImplArtifact: 'MasterOracleMock', proxy: msBTCDebt, expectToFail: true})
      })
    })

    describe('msUSD DebtToken', function () {
      it('token should have correct params', async function () {
        expect(await msUSDDebt.pool()).eq(pool1.address)
        expect(await msUSDDebt.governor()).eq(deployer.address)
        expect(await msUSDDebt.interestRate()).eq(parseEther('0.01'))
        expect(await msUSDDebt.maxTotalSupply()).eq(parseEther('750000'))
        expect(await msUSDDebt.isActive()).eq(true)
        expect(await msUSDDebt.symbol()).eq('msUSD-Debt-1')
        expect(await msUSDDebt.name()).eq('Metronome Synth USD-Debt')
      })

      it('should upgrade implementation', async function () {
        await upgradeTestCase({newImplArtifact: 'DebtToken', proxy: msUSDDebt, expectToFail: false})
      })

      it('should fail if implementation breaks storage', async function () {
        await upgradeTestCase({newImplArtifact: 'MasterOracleMock', proxy: msUSDDebt, expectToFail: true})
      })
    })
  })

  describe('PoolRegistry', function () {
    it('should have correct params', async function () {
      expect(await poolRegistry.governor()).eq(deployer.address)
      expect(await poolRegistry.masterOracle()).eq(MASTER_ORACLE_ADDRESS)
      expect(await poolRegistry.isPoolRegistered(pool1.address)).true
      expect(await poolRegistry.nativeTokenGateway()).eq(wethGateway.address)
    })

    it('should upgrade implementation', async function () {
      await upgradeTestCase({newImplArtifact: 'PoolRegistry', proxy: poolRegistry, expectToFail: false})
    })
  })

  describe('FeeProvider', function () {
    it('should have the same proxy admin', async function () {
      const feeProvider1ProxyAdmin = await getProxyAdmin(feeProvider1)
      const feeProvider2ProxyAdmin = await getProxyAdmin(feeProvider2)
      expect(feeProvider1ProxyAdmin.address).eq(feeProvider2ProxyAdmin.address)
    })

    it('should have the same implementation', async function () {
      const feeProvider1Impl = await getProxyImplementation(feeProvider1)
      const feeProvider2Impl = await getProxyImplementation(feeProvider2)
      expect(feeProvider1Impl).eq(feeProvider2Impl)
    })

    it('should have correct params', async function () {
      expect(await feeProvider1.depositFee()).eq(parseEther('0'))
      expect(await feeProvider1.issueFee()).eq(parseEther('0'))
      expect(await feeProvider1.withdrawFee()).eq(parseEther('0'))
      expect(await feeProvider1.repayFee()).eq(parseEther('0'))
      expect(await feeProvider1.defaultSwapFee()).eq(parseEther('0.0025'))
      const {liquidatorIncentive, protocolFee} = await feeProvider1.liquidationFees()
      expect(liquidatorIncentive).eq(parseEther('0.1'))
      expect(protocolFee).eq(parseEther('0.08'))
    })

    it('should upgrade implementation', async function () {
      await upgradeTestCase({newImplArtifact: 'FeeProvider', proxy: feeProvider1, expectToFail: false})
    })

    it('should fail if implementation breaks storage', async function () {
      await upgradeTestCase({newImplArtifact: 'MasterOracleMock', proxy: feeProvider1, expectToFail: true})
    })
  })

  describe('RewardsDistributor', function () {
    it('should have correct params', async function () {
      expect(await rewardsDistributor.pool()).eq(pool1.address)
    })

    it('should upgrade implementation', async function () {
      await upgradeTestCase({newImplArtifact: 'RewardsDistributor', proxy: rewardsDistributor, expectToFail: false})
    })

    it('should fail if implementation breaks storage', async function () {
      await upgradeTestCase({newImplArtifact: 'MasterOracleMock', proxy: rewardsDistributor, expectToFail: true})
    })
  })

  describe('SmartFarmingManager', function () {
    it('should have the same proxy admin', async function () {
      const smartFarmingManager1ProxyAdmin = await getProxyAdmin(smartFarmingManager1)
      const smartFarmingManager2ProxyAdmin = await getProxyAdmin(smartFarmingManager2)
      expect(smartFarmingManager1ProxyAdmin.address).eq(smartFarmingManager2ProxyAdmin.address)
    })

    it('should have the same implementation', async function () {
      const smartFarmingManager1Impl = await getProxyImplementation(smartFarmingManager1)
      const smartFarmingManager2Impl = await getProxyImplementation(smartFarmingManager2)
      expect(smartFarmingManager1Impl).eq(smartFarmingManager2Impl)
    })

    it('should have correct params', async function () {
      expect(await smartFarmingManager1.pool()).eq(pool1.address)
      expect(await smartFarmingManager1.crossChainRequestsLength()).eq(0)
    })

    it('should upgrade implementation', async function () {
      await upgradeTestCase({newImplArtifact: 'SmartFarmingManager', proxy: smartFarmingManager1, expectToFail: false})
    })

    it('should fail if implementation breaks storage', async function () {
      await upgradeTestCase({newImplArtifact: 'MasterOracleMock', proxy: smartFarmingManager1, expectToFail: true})
    })
  })

  describe('Quoter', function () {
    it('should have correct params', async function () {
      expect(await quoter.poolRegistry()).eq(poolRegistry.address)
    })

    it('should upgrade implementation', async function () {
      await upgradeTestCase({newImplArtifact: 'Quoter', proxy: quoter, expectToFail: false})
    })

    it('should fail if implementation breaks storage', async function () {
      await upgradeTestCase({newImplArtifact: 'MasterOracleMock', proxy: quoter, expectToFail: true})
    })
  })

  describe('CrossChainDispatcher', function () {
    it('should have correct params', async function () {
      expect(await crossChainDispatcher.poolRegistry()).eq(poolRegistry.address)
      expect(await crossChainDispatcher.isBridgingActive()).eq(false)
    })

    it('should upgrade implementation', async function () {
      await upgradeTestCase({newImplArtifact: 'CrossChainDispatcher', proxy: crossChainDispatcher, expectToFail: false})
    })

    it('should fail if implementation breaks storage', async function () {
      await upgradeTestCase({newImplArtifact: 'MasterOracleMock', proxy: crossChainDispatcher, expectToFail: true})
    })
  })
})
