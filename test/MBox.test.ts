/* eslint-disable camelcase */
import {BigNumber} from '@ethersproject/bignumber'
import {parseEther} from '@ethersproject/units'
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {expect} from 'chai'
import {ethers} from 'hardhat'
import {
  DepositLedger,
  DepositLedger__factory,
  MBox,
  MBox__factory,
  METMock,
  METMock__factory,
  OracleMock,
  OracleMock__factory,
  SyntheticAsset,
  SyntheticAsset__factory,
} from '../typechain'
import {WETH} from './helpers'

describe('MBox', function () {
  let deployer: SignerWithAddress
  let user1: SignerWithAddress
  let user2: SignerWithAddress
  let met: METMock
  let depositLedger: DepositLedger
  let oracle: OracleMock
  let mEth: SyntheticAsset
  let mBOX: MBox

  beforeEach(async function () {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[deployer, user1, user2] = await ethers.getSigners()

    const metMockFactory = new METMock__factory(deployer)
    met = await metMockFactory.deploy()

    const oracleMock = new OracleMock__factory(deployer)
    oracle = <OracleMock>await oracleMock.deploy()

    const depositLedgerFactory = new DepositLedger__factory(deployer)
    depositLedger = await depositLedgerFactory.deploy()

    const mETHFactory = new SyntheticAsset__factory(deployer)
    const underlyingAsset = WETH
    const collateralizationRatio = parseEther('1.5')
    mEth = await mETHFactory.deploy('Metronome ETH', 'mEth', collateralizationRatio, underlyingAsset)

    const mBoxFactory = new MBox__factory(deployer)
    mBOX = await mBoxFactory.deploy(met.address, mEth.address, depositLedger.address, oracle.address)

    // Deployment tasks
    await mEth.transferOwnership(mBOX.address)
    await depositLedger.transferOwnership(mBOX.address)
    await mBOX.addSyntheticAsset(mEth.address)

    // mint some MET to users
    await met.mint(user1.address, parseEther(`${1e6}`))
    await met.mint(user2.address, parseEther(`${1e6}`))

    // initialize mocked oracle
    await oracle.updateRate(await mEth.underlyingAsset(), parseEther('4000')) // 1 ETH = $4000
    await oracle.updateRate(met.address, parseEther('4')) // 1 MET = $4
  })

  describe('whitelisting', function () {
    describe('addSyntheticAsset', function () {
      it('should revert if not owner', async function () {
        const tx = mBOX.connect(user1).addSyntheticAsset(mEth.address)
        await expect(tx).to.revertedWith('Ownable: caller is not the owner')
      })

      it('should add synthetic asset', async function () {
        const someTokenAddress = met.address
        expect(await mBOX.syntheticAssetsByAddress(someTokenAddress)).to.eq(ethers.constants.AddressZero)
        await mBOX.addSyntheticAsset(someTokenAddress)
        expect(await mBOX.syntheticAssetsByAddress(someTokenAddress)).to.not.eq(ethers.constants.AddressZero)
      })
    })

    describe('removeSyntheticAsset', function () {
      it('should revert if trying to remove mEth', async function () {
        const tx = mBOX.removeSyntheticAsset(mEth.address)
        await expect(tx).to.revertedWith('can-not-remove-meth')
      })

      it('should remove synthetic asset', async function () {
        // given
        const metMockFactory = new METMock__factory(deployer)
        const someToken = await metMockFactory.deploy()
        expect(await someToken.totalSupply()).to.eq(0)
        await mBOX.addSyntheticAsset(someToken.address)
        expect(await mBOX.syntheticAssetsByAddress(someToken.address)).to.not.eq(ethers.constants.AddressZero)

        // when
        await mBOX.removeSyntheticAsset(someToken.address)

        // then
        expect(await mBOX.syntheticAssetsByAddress(someToken.address)).to.eq(ethers.constants.AddressZero)
      })
    })
  })

  describe('deposit', function () {
    beforeEach(async function () {
      await met.connect(user1).approve(mBOX.address, ethers.constants.MaxUint256)
    })

    it('should reject if collateral amount is 0', async function () {
      const toDeposit = 0
      const tx = mBOX.connect(user1).deposit(toDeposit)
      await expect(tx).to.revertedWith('zero-collateral-amount')
    })

    it('should reject if MET balance is not enough', async function () {
      const balance = await met.balanceOf(user1.address)
      const tooHigh = balance.add('1')
      const tx = mBOX.connect(user1).deposit(tooHigh)
      await expect(tx).to.revertedWith('ERC20: transfer amount exceeds balance')
    })

    it('should deposit MET and mint mBOX-MET', async function () {
      // when
      const amount = parseEther('10')
      const tx = () => mBOX.connect(user1).deposit(amount)

      // then
      await expect(tx).changeTokenBalances(met, [user1, mBOX], [amount.mul('-1'), amount])
      await expect(tx).changeTokenBalances(depositLedger, [user1, mBOX], [amount, 0])
      await expect(tx()).to.emit(mBOX, 'CollateralDeposited').withArgs(user1.address, amount)
    })
  })

  describe('mint', function () {
    const collateralAmount = parseEther('6000')
    let ethRate: BigNumber
    let metRate: BigNumber
    let collateralizationRatio: BigNumber
    let collateralInUsd: BigNumber
    let maxIssuableInUsd: BigNumber
    let maxIssuableInEth: BigNumber

    beforeEach(async function () {
      await met.connect(user1).approve(mBOX.address, ethers.constants.MaxUint256)
      await mBOX.connect(user1).deposit(collateralAmount)

      ethRate = await oracle.rateOf(WETH)
      metRate = await oracle.rateOf(met.address)
      collateralizationRatio = await mEth.collateralizationRatio()
      collateralInUsd = await oracle.convertToUSD(met.address, collateralAmount)
      maxIssuableInUsd = collateralInUsd.mul(parseEther('1')).div(collateralizationRatio)
      maxIssuableInEth = maxIssuableInUsd.mul(parseEther('1')).div(ethRate)
    })

    it('should reject if synthetic is not active', async function () {
      // when
      const toIssue = maxIssuableInEth.add(parseEther('1'))
      const invalidSynthetic = met
      const tx = mBOX.mint(invalidSynthetic.address, toIssue)

      // then
      await expect(tx).to.revertedWith('synthetic-asset-does-not-exists')
    })

    it('should reject if user has not enough collateral deposited', async function () {
      // when
      const toIssue = maxIssuableInEth.add(parseEther('1'))
      const tx = mBOX.connect(user1).mint(mEth.address, toIssue)

      // then
      await expect(tx).to.revertedWith('not-enough-collateral')
    })

    it('should reject if amount to mint is 0', async function () {
      // when
      const toIssue = 0
      const tx = mBOX.connect(user1).mint(mEth.address, toIssue)

      // then
      await expect(tx).to.revertedWith('zero-synthetic-amount')
    })

    it('should lock mBOX-MET and mint mEth', async function () {
      // when
      const amountToMint = parseEther('1')
      const tx = () => mBOX.connect(user1).mint(mEth.address, amountToMint)
      const lockedBefore = await depositLedger.lockedBalanceOf(user1.address)

      // then
      await expect(tx).changeTokenBalances(mEth, [user1], [amountToMint])
      const lockedAfter = await depositLedger.lockedBalanceOf(user1.address)
      const expectedAmountToLock = amountToMint.mul(collateralizationRatio).mul(ethRate).div(metRate).div(`${1e18}`)
      expect(lockedAfter).to.eq(lockedBefore.add(expectedAmountToLock))

      // Note: the calls below will make additional transfers
      await expect(tx).changeTokenBalances(met, [mBOX], [0])
      await expect(tx()).to.emit(mBOX, 'CollateralMinted').withArgs(user1.address, amountToMint)
    })

    it('should mint max issuable amount', async function () {
      const amount = maxIssuableInEth
      const tx = mBOX.connect(user1).mint(mEth.address, amount)
      await expect(tx).to.emit(mBOX, 'CollateralMinted').withArgs(user1.address, amount)
    })
  })
})
