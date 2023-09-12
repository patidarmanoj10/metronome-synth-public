import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {expect} from 'chai'
import {ethers} from 'hardhat'
import {loadFixture, setStorageAt} from '@nomicfoundation/hardhat-network-helpers'
import {toUSD, parseEther, parseUnits} from '../helpers'
import {disableForking, enableForking, setTokenBalance} from './helpers'
import Address from '../helpers/address'
import {
  DepositToken,
  SyntheticToken,
  Pool,
  IERC20,
  DebtToken,
  MasterOracleMock,
  PoolRegistry,
  FeeProvider,
} from '../typechain'

const {MaxUint256} = ethers.constants

const INTEREST_RATE = parseEther('0')

async function fixture() {
  const [deployer, feeCollector, alice, bob] = await ethers.getSigners()

  const poolRegistryFactory = await ethers.getContractFactory('PoolRegistry', deployer)
  const poolFactory = await ethers.getContractFactory('contracts/Pool.sol:Pool', deployer)
  const masterOracleFactory = await ethers.getContractFactory('MasterOracleMock', deployer)
  const treasuryFactory = await ethers.getContractFactory('Treasury', deployer)
  const depositTokenFactory = await ethers.getContractFactory('DepositToken', deployer)
  const debtTokenFactory = await ethers.getContractFactory('DebtToken', deployer)
  const syntheticTokenFactory = await ethers.getContractFactory('SyntheticToken', deployer)
  const feeProviderFactory = await ethers.getContractFactory('FeeProvider', deployer)

  const dai = await ethers.getContractAt('IERC20', Address.DAI_ADDRESS, alice)
  const met = await ethers.getContractAt('IERC20', Address.MET_ADDRESS, alice)

  const masterOracle = await masterOracleFactory.deploy()
  await masterOracle.deployed()

  const poolRegistry = await poolRegistryFactory.deploy()
  await poolRegistry.deployed()
  await setStorageAt(poolRegistry.address, 0, 0) // Undo initialization made by constructor

  const feeProvider = await feeProviderFactory.deploy()
  await feeProvider.deployed()
  await setStorageAt(feeProvider.address, 0, 0) // Undo initialization made by constructor
  await feeProvider.initialize(poolRegistry.address, Address.ESMET)

  // Set fee discount tiers
  const newTiers = [
    {min: parseEther('10'), discount: parseEther('0.1')},
    {min: parseEther('20'), discount: parseEther('0.2')},
  ]
  await feeProvider.updateTiers(newTiers)

  const msETH = await syntheticTokenFactory.deploy()
  await msETH.deployed()
  await setStorageAt(msETH.address, 0, 0) // Undo initialization made by constructor

  const msDOGE = await syntheticTokenFactory.deploy()
  await msDOGE.deployed()
  await setStorageAt(msDOGE.address, 0, 0) // Undo initialization made by constructor

  const msUSD = await syntheticTokenFactory.deploy()
  await msUSD.deployed()
  await setStorageAt(msUSD.address, 0, 0) // Undo initialization made by constructor

  // Pool A: Deposit [MET,DAI], Mint [msETH,msDOGE,msUSD]
  const poolA = await poolFactory.deploy()
  await poolA.deployed()
  await setStorageAt(poolA.address, 0, 0) // Undo initialization made by constructor

  const treasuryA = await treasuryFactory.deploy()
  await treasuryA.deployed()
  await setStorageAt(treasuryA.address, 0, 0) // Undo initialization made by constructor

  const msdMET_A = await depositTokenFactory.deploy()
  await msdMET_A.deployed()
  await setStorageAt(msdMET_A.address, 0, 0) // Undo initialization made by constructor

  const msdDAI_A = await depositTokenFactory.deploy()
  await msdDAI_A.deployed()
  await setStorageAt(msdDAI_A.address, 0, 0) // Undo initialization made by constructor

  const msETH_Debt_A = await debtTokenFactory.deploy()
  await msETH_Debt_A.deployed()
  await setStorageAt(msETH_Debt_A.address, 0, 0) // Undo initialization made by constructor

  const msDOGE_Debt_A = await debtTokenFactory.deploy()
  await msDOGE_Debt_A.deployed()
  await setStorageAt(msDOGE_Debt_A.address, 0, 0) // Undo initialization made by constructor

  const msUSD_Debt_A = await debtTokenFactory.deploy()
  await msUSD_Debt_A.deployed()
  await setStorageAt(msUSD_Debt_A.address, 0, 0) // Undo initialization made by constructor

  // Pool B: Deposit [DAI], Mint [msUSD]
  const poolB = await poolFactory.deploy()
  await poolB.deployed()
  await setStorageAt(poolB.address, 0, 0) // Undo initialization made by constructor

  const treasuryB = await treasuryFactory.deploy()
  await treasuryB.deployed()
  await setStorageAt(treasuryB.address, 0, 0) // Undo initialization made by constructor

  const msdDAI_B = await depositTokenFactory.deploy()
  await msdDAI_B.deployed()
  await setStorageAt(msdDAI_B.address, 0, 0) // Undo initialization made by constructor

  const msUSD_Debt_B = await debtTokenFactory.deploy()
  await msUSD_Debt_B.deployed()
  await setStorageAt(msUSD_Debt_B.address, 0, 0) // Undo initialization made by constructor

  await poolRegistry.initialize(masterOracle.address, feeCollector.address)
  await msUSD.initialize('Metronome Synth USD', 'msUSD', 18, poolRegistry.address)
  await msETH.initialize('Metronome Synth ETH', 'msETH', 18, poolRegistry.address)
  await msDOGE.initialize('Metronome Synth DOGE', 'msDOGE', 18, poolRegistry.address)

  await poolA.initialize(poolRegistry.address)
  await poolA.updateFeeProvider(feeProvider.address)
  await treasuryA.initialize(poolA.address)
  await msdMET_A.initialize(
    met.address,
    poolA.address,
    'Metronome Synth MET-Deposit',
    'msdMET-A',
    18,
    parseEther('0.5'),
    MaxUint256
  )
  await msdDAI_A.initialize(
    dai.address,
    poolA.address,
    'Metronome Synth DAI-Deposit',
    'msdDAI-A',
    18,
    parseEther('0.5'),
    MaxUint256
  )
  await msETH_Debt_A.initialize('msETH Debt A', 'msETH-Debt-A', poolA.address, msETH.address, INTEREST_RATE, MaxUint256)
  await msDOGE_Debt_A.initialize(
    'msDOGE Debt A',
    'msDOGE-Debt-A',
    poolA.address,
    msDOGE.address,
    INTEREST_RATE,
    MaxUint256
  )
  await msUSD_Debt_A.initialize('msUSD Debt A', 'msUSD-Debt A', poolA.address, msUSD.address, INTEREST_RATE, MaxUint256)
  await poolA.updateMaxLiquidable(parseEther('1')) // 100%
  await poolA.updateTreasury(treasuryA.address)
  await poolA.addDepositToken(msdMET_A.address)
  await poolA.addDepositToken(msdDAI_A.address)
  await poolA.addDebtToken(msETH_Debt_A.address)
  await poolA.addDebtToken(msDOGE_Debt_A.address)
  await poolA.addDebtToken(msUSD_Debt_A.address)

  await poolB.initialize(poolRegistry.address)
  await poolB.updateFeeProvider(feeProvider.address)
  await treasuryB.initialize(poolB.address)
  await msdDAI_B.initialize(
    dai.address,
    poolB.address,
    'Metronome Synth DAI-Deposit',
    'msdDAI B',
    18,
    parseEther('0.8'),
    MaxUint256
  )
  await msUSD_Debt_B.initialize('msUSD Debt B', 'msUSD-Debt-B', poolB.address, msUSD.address, INTEREST_RATE, MaxUint256)
  await poolB.updateMaxLiquidable(parseEther('1')) // 100%
  await poolB.updateTreasury(treasuryB.address)
  await poolB.addDepositToken(msdDAI_B.address)
  await poolB.addDebtToken(msUSD_Debt_B.address)

  await poolRegistry.registerPool(poolA.address)
  await poolRegistry.registerPool(poolB.address)

  await masterOracle.updatePrice(dai.address, toUSD('1'))
  await masterOracle.updatePrice(met.address, toUSD('4'))
  await masterOracle.updatePrice(msETH.address, toUSD('1,000'))
  await masterOracle.updatePrice(msDOGE.address, toUSD('0.05'))
  await masterOracle.updatePrice(msUSD.address, toUSD('1'))

  // mint some collaterals to users
  await setTokenBalance(dai.address, alice.address, parseUnits('10,000', 18))
  await setTokenBalance(met.address, alice.address, parseUnits('10,000', 18))
  await setTokenBalance(dai.address, bob.address, parseUnits('10,000', 18))
  await setTokenBalance(met.address, bob.address, parseUnits('10,000', 18))

  return {
    dai,
    met,
    masterOracle,
    poolRegistry,
    feeProvider,
    msETH,
    msDOGE,
    msUSD,
    treasuryA,
    poolA,
    msdMET_A,
    msdDAI_A,
    msETH_Debt_A,
    msDOGE_Debt_A,
    msUSD_Debt_A,
    treasuryB,
    poolB,
    msdDAI_B,
    msUSD_Debt_B,
  }
}

describe('Integration tests', function () {
  let feeCollector: SignerWithAddress
  let alice: SignerWithAddress
  let bob: SignerWithAddress
  let dai: IERC20
  let met: IERC20
  let masterOracle: MasterOracleMock
  let poolRegistry: PoolRegistry
  let feeProvider: FeeProvider
  let msETH: SyntheticToken
  let msDOGE: SyntheticToken
  let msUSD: SyntheticToken
  let poolA: Pool
  let msdMET_A: DepositToken
  let msdDAI_A: DepositToken
  let msETH_Debt_A: DebtToken
  let msDOGE_Debt_A: DebtToken
  let msUSD_Debt_A: DebtToken
  let poolB: Pool
  let msdDAI_B: DepositToken
  let msUSD_Debt_B: DebtToken

  before(enableForking)

  after(disableForking)

  beforeEach(async function () {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[, feeCollector, alice, bob] = await ethers.getSigners()
    ;({
      dai,
      met,
      masterOracle,
      poolRegistry,
      feeProvider,
      msETH,
      msDOGE,
      msUSD,
      poolA,
      msdMET_A,
      msdDAI_A,
      msETH_Debt_A,
      msDOGE_Debt_A,
      msUSD_Debt_A,
      poolB,
      msdDAI_B,
      msUSD_Debt_B,
    } = await loadFixture(fixture))
  })

  describe('deposit', function () {
    beforeEach('should deposit', async function () {
      // given
      await dai.connect(alice).approve(msdDAI_A.address, MaxUint256)
      await met.connect(alice).approve(msdMET_A.address, MaxUint256)
      await dai.connect(bob).approve(msdDAI_B.address, MaxUint256)

      // when
      await msdDAI_A.connect(alice).deposit(parseEther('1,000'), alice.address)
      await msdMET_A.connect(alice).deposit(parseEther('1,000'), alice.address)
      await msdDAI_B.connect(bob).deposit(parseEther('5,000'), bob.address)

      // then
      expect((await poolA.depositOf(alice.address))._depositInUsd).eq(toUSD('5,000'))
      expect((await poolA.depositOf(bob.address))._depositInUsd).eq(0)
      expect((await poolB.depositOf(alice.address))._depositInUsd).eq(0)
      expect((await poolB.depositOf(bob.address))._depositInUsd).eq(toUSD('5,000'))
    })

    describe('issue', function () {
      beforeEach('should issue', async function () {
        // when
        await msETH_Debt_A.connect(alice).issue(parseEther('1'), alice.address)
        await msDOGE_Debt_A.connect(alice).issue(parseEther('10,000'), alice.address)
        await msUSD_Debt_A.connect(alice).issue(parseEther('500'), alice.address)
        await msUSD_Debt_B.connect(bob).issue(parseEther('2,000'), bob.address)

        // then
        expect(await poolA.debtOf(alice.address)).eq(toUSD('2,000'))
        expect(await poolB.debtOf(alice.address)).eq(0)
        expect(await poolA.debtOf(bob.address)).eq(0)
        expect(await poolB.debtOf(bob.address)).eq(toUSD('2,000'))
      })

      describe('swap', function () {
        beforeEach('should swap', async function () {
          // given
          const debtsBefore = await Promise.all([
            await poolA.debtOf(alice.address),
            await poolB.debtOf(alice.address),
            await poolA.debtOf(bob.address),
            await poolB.debtOf(bob.address),
          ])

          // when
          // alice swaps all her synths for msUSD
          await poolA.connect(alice).swap(msETH.address, msUSD.address, await msETH.balanceOf(alice.address))
          await poolA.connect(alice).swap(msDOGE.address, msUSD.address, await msDOGE.balanceOf(alice.address))
          expect(await msETH.totalSupply()).eq(0)
          expect(await msDOGE.totalSupply()).eq(0)
          expect(await msUSD.totalSupply()).eq(parseEther('4,000'))
          // bob swaps all his msUSD for msETH
          await poolA.connect(bob).swap(msUSD.address, msETH.address, await msUSD.balanceOf(bob.address))
          expect(await msUSD.totalSupply()).eq(parseEther('2,000'))
          expect(await msETH.totalSupply()).eq(parseEther('2'))

          // then
          const debtsAfter = await Promise.all([
            await poolA.debtOf(alice.address),
            await poolB.debtOf(alice.address),
            await poolA.debtOf(bob.address),
            await poolB.debtOf(bob.address),
          ])
          expect(debtsAfter).deep.eq(debtsBefore)
        })

        it('should verify swap fee', async function () {
          const defaultSwapFee = await feeProvider.defaultSwapFee()
          expect(await feeProvider.swapFeeFor(alice.address)).eq(defaultSwapFee)

          const esMET = await ethers.getContractAt('IESMET', Address.ESMET, alice)
          await met.connect(alice).approve(esMET.address, parseEther('100'))
          await esMET.connect(alice).lock(parseEther('10'), 8 * 24 * 60 * 60)
          await expect(await esMET.balanceOf(alice.address)).gt(0)
          expect(await feeProvider.swapFeeFor(alice.address)).lt(defaultSwapFee)
        })

        describe('repay', function () {
          beforeEach('should repay', async function () {
            // given
            expect(await poolA.debtOf(alice.address)).eq(toUSD('2,000'))
            expect(await poolB.debtOf(alice.address)).eq(0)
            expect(await poolA.debtOf(bob.address)).eq(0)
            expect(await poolB.debtOf(bob.address)).eq(toUSD('2,000'))
            expect(await msUSD_Debt_A.balanceOf(alice.address)).eq(toUSD('500'))
            expect(await msUSD_Debt_B.balanceOf(bob.address)).eq(toUSD('2,000'))
            const repayFee = await feeProvider.repayFee()

            // when
            // alice pays part of bob's msUSD debt
            const bobDebtToRepay = parseEther('500')
            const bobDebtPlusRepayFee = bobDebtToRepay.mul(parseEther('1').add(repayFee)).div(parseEther('1'))
            await msUSD_Debt_B.connect(alice).repay(bob.address, bobDebtPlusRepayFee)
            // bob pays all alice's msETH debt
            const aliceDebtToRepay = parseEther('1')
            const aliceDebtPlusRepayFee = aliceDebtToRepay.mul(parseEther('1').add(repayFee)).div(parseEther('1'))
            await msETH_Debt_A.connect(bob).repay(alice.address, aliceDebtPlusRepayFee)

            // then
            expect(await msUSD_Debt_B.balanceOf(bob.address)).eq(toUSD('1,500'))
            expect(await msETH_Debt_A.balanceOf(alice.address)).eq(0)
          })

          it('should revert if repaying using wrong synthetic asset', async function () {
            // given
            expect(await poolA.debtOf(alice.address)).eq(toUSD('1,000'))
            expect(await msETH_Debt_A.balanceOf(alice.address)).eq(0)
            expect(await msETH.balanceOf(bob.address)).closeTo(parseEther('1'), parseEther('0.2'))

            // when
            const tx = msETH_Debt_A.connect(bob).repay(alice.address, parseEther('0.1'))

            // then
            await expect(tx).rejectedWith('BurnAmountExceedsBalance')
          })

          describe('withdraw', function () {
            // eslint-disable-next-line quotes
            beforeEach("should repay ~all bob's debt", async function () {
              // given
              expect(await msUSD_Debt_B.balanceOf(bob.address)).eq(parseEther('1,500'))
              await msUSD_Debt_B.connect(alice).repay(bob.address, await msUSD.balanceOf(alice.address))
              const debtInUsd = await poolB.debtOf(bob.address)
              expect(debtInUsd).closeTo(0, toUSD('15')) // accumulated fees dust
            })

            it('should withdraw', async function () {
              // when
              const amount = await msdDAI_B.unlockedBalanceOf(bob.address)
              await msdDAI_B.connect(bob).withdraw(amount, bob.address)

              // then
              const {_depositInUsd: depositAfter} = await poolB.depositOf(bob.address)
              expect(depositAfter).closeTo(0, toUSD('20')) // remaining due to debt dust
            })
          })
        })

        describe('liquidate', function () {
          it('should liquidate unhealthy position', async function () {
            // given
            expect((await poolA.debtPositionOf(alice.address))._isHealthy).true
            await masterOracle.updatePrice(met.address, toUSD('2')) // -50%
            await masterOracle.updatePrice(msETH.address, toUSD('800')) // -10%
            expect((await poolA.debtPositionOf(alice.address))._isHealthy).false

            expect(await msdDAI_A.balanceOf(alice.address)).eq(parseEther('1,000'))
            expect(await msdMET_A.balanceOf(alice.address)).eq(parseEther('1,000'))
            expect(await msETH_Debt_A.balanceOf(alice.address)).eq(parseEther('1'))
            expect(await msETH.balanceOf(bob.address)).closeTo(parseEther('2'), parseEther('0.2'))

            // when
            const tx = poolA.connect(bob).liquidate(msETH.address, alice.address, parseEther('1'), msdDAI_A.address)

            // then
            await expect(tx)
              .changeTokenBalance(msETH, bob, parseEther('-1'))
              .changeTokenBalance(msETH_Debt_A, alice, parseEther('-1'))
              .changeTokenBalances(
                msdDAI_A,
                [alice, bob, feeCollector],
                [parseEther('-944'), parseEther('880'), parseEther('64')]
              )
            expect((await poolA.debtPositionOf(alice.address))._isHealthy).true
          })
        })
      })
    })
  })
})
