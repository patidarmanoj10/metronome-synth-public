/* eslint-disable camelcase */
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {expect} from 'chai'
import {ethers} from 'hardhat'
import {loadFixture} from '@nomicfoundation/hardhat-network-helpers'
import {toUSD, parseEther} from '../helpers'
import {
  DepositToken,
  DepositToken__factory,
  SyntheticToken,
  SyntheticToken__factory,
  Pool,
  Pool__factory,
  IERC20,
  DebtToken__factory,
  DebtToken,
  ERC20Mock__factory,
  MasterOracleMock__factory,
  Treasury__factory,
  PoolRegistry__factory,
  MasterOracleMock,
  Treasury,
  PoolRegistry,
} from '../typechain'

const {MaxUint256} = ethers.constants

const INTEREST_RATE = parseEther('0')

async function fixture() {
  const [deployer, feeCollector, alice, bob] = await ethers.getSigners()

  const poolRegistryFactory = new PoolRegistry__factory(deployer)
  const poolFactory = new Pool__factory(deployer)
  const masterOracleFactory = new MasterOracleMock__factory(deployer)
  const erc20MockFactory = new ERC20Mock__factory(deployer)
  const treasuryFactory = new Treasury__factory(deployer)
  const depositTokenFactory = new DepositToken__factory(deployer)
  const debtTokenFactory = new DebtToken__factory(deployer)
  const syntheticTokenFactory = new SyntheticToken__factory(deployer)

  const dai = await erc20MockFactory.deploy('Dai Stablecoin', 'DAI', 18)
  await dai.deployed()

  const met = await erc20MockFactory.deploy('Metronome', 'MET', 18)
  await met.deployed()

  const masterOracle = await masterOracleFactory.deploy()
  await masterOracle.deployed()

  const poolRegistry = await poolRegistryFactory.deploy()
  await poolRegistry.deployed()

  const msETH = await syntheticTokenFactory.deploy()
  await msETH.deployed()

  const msDOGE = await syntheticTokenFactory.deploy()
  await msDOGE.deployed()

  const msUSD = await syntheticTokenFactory.deploy()
  await msUSD.deployed()

  // Pool A: Deposit [MET,DAI], Mint [msETH,msDOGE,msUSD]
  const poolA = await poolFactory.deploy()
  await poolA.deployed()

  const treasuryA = await treasuryFactory.deploy()
  await treasuryA.deployed()

  const msdMET_A = await depositTokenFactory.deploy()
  await msdMET_A.deployed()

  const msdDAI_A = await depositTokenFactory.deploy()
  await msdDAI_A.deployed()

  const msETH_Debt_A = await debtTokenFactory.deploy()
  await msETH_Debt_A.deployed()

  const msDOGE_Debt_A = await debtTokenFactory.deploy()
  await msDOGE_Debt_A.deployed()

  const msUSD_Debt_A = await debtTokenFactory.deploy()
  await msUSD_Debt_A.deployed()

  // Pool B: Deposit [DAI], Mint [msUSD]
  const poolB = await poolFactory.deploy()
  await poolB.deployed()

  const treasuryB = await treasuryFactory.deploy()
  await treasuryB.deployed()

  const msdDAI_B = await depositTokenFactory.deploy()
  await msdDAI_B.deployed()

  const msUSD_Debt_B = await debtTokenFactory.deploy()
  await msUSD_Debt_B.deployed()

  await poolRegistry.initialize(masterOracle.address, feeCollector.address)
  await msUSD.initialize('Metronome Synth USD', 'msUSD', 18, poolRegistry.address)
  await msETH.initialize('Metronome Synth ETH', 'msETH', 18, poolRegistry.address)
  await msDOGE.initialize('Metronome Synth DOGE', 'msDOGE', 18, poolRegistry.address)

  await poolA.initialize(poolRegistry.address)
  await treasuryA.initialize(poolA.address)
  await msdMET_A.initialize(met.address, poolA.address, 'msdMET-A', 18, parseEther('0.5'), MaxUint256)
  await msdDAI_A.initialize(dai.address, poolA.address, 'msdDAI-A', 18, parseEther('0.5'), MaxUint256)
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
  await treasuryB.initialize(poolB.address)
  await msdDAI_B.initialize(dai.address, poolB.address, 'msdDAI B', 18, parseEther('0.8'), MaxUint256)
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
  await dai.mint(alice.address, parseEther('1,000,000'))
  await met.mint(alice.address, parseEther('1,000,000'))
  await dai.mint(bob.address, parseEther('1,000,000'))
  await met.mint(bob.address, parseEther('1,000,000'))

  return {
    dai,
    met,
    masterOracle,
    poolRegistry,
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

  beforeEach(async function () {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[, feeCollector, alice, bob] = await ethers.getSigners()
    ;({
      dai,
      met,
      masterOracle,
      poolRegistry,
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

        describe('repay', function () {
          beforeEach('should repay', async function () {
            // given
            expect(await poolA.debtOf(alice.address)).eq(toUSD('2,000'))
            expect(await poolB.debtOf(alice.address)).eq(0)
            expect(await poolA.debtOf(bob.address)).eq(0)
            expect(await poolB.debtOf(bob.address)).eq(toUSD('2,000'))
            expect(await msUSD_Debt_A.balanceOf(alice.address)).eq(toUSD('500'))
            expect(await msUSD_Debt_B.balanceOf(bob.address)).eq(toUSD('2,000'))
            const repayFeeA = await poolA.repayFee()
            const repayFeeB = await poolB.repayFee()

            // when
            // alice pays part of bob's msUSD debt
            const bobDebtToRepay = parseEther('500')
            const bobDebtPlusRepayFee = bobDebtToRepay.mul(parseEther('1').add(repayFeeB)).div(parseEther('1'))
            await msUSD_Debt_B.connect(alice).repay(bob.address, bobDebtPlusRepayFee)
            // bob pays all alice's msETH debt
            const aliceDebtToRepay = parseEther('1')
            const aliceDebtPlusRepayFee = aliceDebtToRepay.mul(parseEther('1').add(repayFeeA)).div(parseEther('1'))
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
            await expect(tx).rejectedWith('burn-amount-exceeds-balance')
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
