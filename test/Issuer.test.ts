/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable camelcase */
import {parseEther} from '@ethersproject/units'
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {expect} from 'chai'
import {ethers} from 'hardhat'
import {
  DepositToken,
  DepositToken__factory,
  ERC20Mock,
  ERC20Mock__factory,
  OracleMock,
  OracleMock__factory,
  SyntheticAsset,
  SyntheticAsset__factory,
  DebtToken,
  DebtToken__factory,
  Treasury,
  Treasury__factory,
  Issuer__factory,
  Issuer,
} from '../typechain'

describe('Issuer', function () {
  let deployer: SignerWithAddress
  let governor: SignerWithAddress
  let user: SignerWithAddress
  let user2: SignerWithAddress
  let liquidator: SignerWithAddress
  let mBoxMock: SignerWithAddress
  let met: ERC20Mock
  let mEthDebtToken: DebtToken
  let mEth: SyntheticAsset
  let treasury: Treasury
  let depositToken: DepositToken
  let oracle: OracleMock
  let issuer: Issuer

  const mEthCR = parseEther('1.5') // 150%
  const ethRate = parseEther('4000') // 1 ETH = $4000
  const metRate = parseEther('4') // 1 MET = $4

  beforeEach(async function () {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[deployer, governor, user, user2, liquidator, mBoxMock] = await ethers.getSigners()

    const oracleMock = new OracleMock__factory(deployer)
    oracle = <OracleMock>await oracleMock.deploy()
    await oracle.deployed()

    const metMockFactory = new ERC20Mock__factory(deployer)
    met = await metMockFactory.deploy('Metronome', 'MET', 18)
    await met.deployed()

    const treasuryFactory = new Treasury__factory(deployer)
    treasury = await treasuryFactory.deploy()
    await treasury.deployed()

    const depositTokenFactory = new DepositToken__factory(deployer)
    depositToken = await depositTokenFactory.deploy()
    await depositToken.deployed()

    const mEthDebtTokenFactory = new DebtToken__factory(deployer)
    mEthDebtToken = await mEthDebtTokenFactory.deploy()
    await mEthDebtToken.deployed()

    const mEthFactory = new SyntheticAsset__factory(deployer)
    mEth = await mEthFactory.deploy()
    await mEth.deployed()

    const issuerFactory = new Issuer__factory(deployer)
    issuer = await issuerFactory.deploy()
    await issuer.deployed()

    await depositToken.initialize(met.address, issuer.address)
    await depositToken.transferGovernorship(governor.address)
    await depositToken.connect(governor).acceptGovernorship()

    await mEthDebtToken.initialize('mETH Debt', 'mETH-Debt', 18, issuer.address)
    await mEthDebtToken.transferGovernorship(governor.address)
    await mEthDebtToken.connect(governor).acceptGovernorship()

    await mEth.initialize('Metronome ETH', 'mETH', 18, issuer.address, mEthDebtToken.address, mEthCR)
    await mEth.transferGovernorship(governor.address)
    await mEth.connect(governor).acceptGovernorship()

    await issuer.initialize(depositToken.address, mEth.address, oracle.address, mBoxMock.address)

    // mint some MET to users
    await met.mint(user.address, parseEther(`${1e6}`))
    await met.mint(liquidator.address, parseEther(`${1e6}`))

    // initialize mocked oracle
    await oracle.updateRate(met.address, metRate)
    await oracle.updateRate(mEth.address, ethRate)
  })

  describe('whitelisting', function () {
    describe('addSyntheticAsset', function () {
      it('should revert if not governor', async function () {
        const tx = issuer.connect(user).addSyntheticAsset(mEth.address)
        await expect(tx).to.revertedWith('not-the-governor')
      })

      it('should add synthetic asset', async function () {
        const someTokenAddress = met.address
        expect(await issuer.syntheticAssetByAddress(someTokenAddress)).to.eq(ethers.constants.AddressZero)
        await issuer.addSyntheticAsset(someTokenAddress)
        expect(await issuer.syntheticAssetByAddress(someTokenAddress)).to.not.eq(ethers.constants.AddressZero)
      })
    })

    describe('removeSyntheticAsset', function () {
      it('should remove synthetic asset', async function () {
        // given
        const DebtTokenFactory = new DebtToken__factory(deployer)
        const debtToken = await DebtTokenFactory.deploy()
        await debtToken.initialize('Metronome BTC debt', 'mBTC-debt', 8, issuer.address)

        const SyntheticAssetFactory = new SyntheticAsset__factory(deployer)
        const mAsset = await SyntheticAssetFactory.deploy()
        await mAsset.initialize('Metronome BTC', 'mBTC', 8, issuer.address, debtToken.address, parseEther('1.5'))

        expect(await mAsset.totalSupply()).to.eq(0)
        await issuer.addSyntheticAsset(mAsset.address)
        expect(await issuer.syntheticAssetByAddress(mAsset.address)).to.not.eq(ethers.constants.AddressZero)

        // when
        await issuer.removeSyntheticAsset(mAsset.address)

        // then
        expect(await issuer.syntheticAssetByAddress(mAsset.address)).to.eq(ethers.constants.AddressZero)
      })

      it('should revert if not governor', async function () {
        // when
        const tx = issuer.connect(user).removeSyntheticAsset(mEth.address)

        // then
        await expect(tx).to.revertedWith('not-the-governor')
      })

      it('should revert if removing mETH (i.e. syntheticAssets[0])', async function () {
        // given
        expect(await issuer.syntheticAssets(0)).to.eq(mEth.address)

        // when
        const tx = issuer.removeSyntheticAsset(mEth.address)

        // then
        await expect(tx).to.revertedWith('can-not-delete-meth')
      })

      it('should revert if mAsset has any supply', async function () {
        // given
        const ERC20MockFactory = new ERC20Mock__factory(deployer)
        const mAsset = await ERC20MockFactory.deploy('Metronome BTC', 'mBTC', 8)
        await mAsset.deployed()
        await issuer.addSyntheticAsset(mAsset.address)
        await mAsset.mint(deployer.address, parseEther('100'))
        expect(await mAsset.totalSupply()).to.gt(0)

        // when
        const tx = issuer.removeSyntheticAsset(mAsset.address)

        // then
        await expect(tx).to.revertedWith('synthetic-asset-with-supply')
      })
    })
  })

  describe('mintSyntheticAssetAndDebtToken', function () {
    it('should revert if not mbox', async function () {
      // when
      const tx = issuer
        .connect(user.address)
        .mintSyntheticAssetAndDebtToken(mEth.address, ethers.constants.AddressZero, 0)

      // then
      await expect(tx).to.revertedWith('not-mbox')
    })

    it('should mint mAsset and its debt representation', async function () {
      // when
      const amount = parseEther('1')
      const tx = () => issuer.connect(mBoxMock).mintSyntheticAssetAndDebtToken(mEth.address, user.address, amount)

      // then
      await expect(tx).to.changeTokenBalance(mEth, user, amount)
      await expect(tx).to.changeTokenBalance(mEthDebtToken, user, amount)
    })
  })

  describe('burnSyntheticAssetAndDebtToken', function () {
    it('should revert if not mbox', async function () {
      // when
      const tx = issuer
        .connect(user.address)
        .burnSyntheticAssetAndDebtToken(mEth.address, ethers.constants.AddressZero, ethers.constants.AddressZero, 0)

      // then
      await expect(tx).to.revertedWith('not-mbox')
    })

    it('should burn mAsset and its debt representation', async function () {
      // given
      const amount = parseEther('1')
      await issuer.connect(mBoxMock).mintSyntheticAssetAndDebtToken(mEth.address, user.address, amount.mul('10'))
      await issuer.connect(mBoxMock).mintSyntheticAssetAndDebtToken(mEth.address, user2.address, amount.mul('10'))

      // when
      const tx = () =>
        issuer.connect(mBoxMock).burnSyntheticAssetAndDebtToken(mEth.address, user.address, user2.address, amount)

      // then
      await expect(tx).to.changeTokenBalance(mEth, user, amount.mul('-1'))
      await expect(tx).to.changeTokenBalance(mEthDebtToken, user2, amount.mul('-1'))
    })
  })

  describe('mintDepositToken', function () {
    it('should revert if not mbox', async function () {
      // when
      const tx = issuer.connect(user.address).mintDepositToken(ethers.constants.AddressZero, 0)

      // then
      await expect(tx).to.revertedWith('not-mbox')
    })

    it('should mint deposit token', async function () {
      // when
      const amount = parseEther('1')
      const tx = () => issuer.connect(mBoxMock).mintDepositToken(user.address, amount)

      // then
      await expect(tx).to.changeTokenBalance(depositToken, user, amount)
    })
  })

  describe('when have some deposit token', function () {
    beforeEach(async function () {
      await issuer.connect(mBoxMock).mintDepositToken(user.address, parseEther('1'))
    })

    describe('collectFee', function () {
      it('should revert if not mbox', async function () {
        // when
        const tx = issuer.connect(user.address).collectFee(ethers.constants.AddressZero, 0, true)

        // then
        await expect(tx).to.revertedWith('not-mbox')
      })

      it('should collect fee', async function () {
        // when
        const amount = await depositToken.balanceOf(user.address)
        const tx = () => issuer.connect(mBoxMock).collectFee(user.address, amount, true)

        // then
        await expect(tx).to.changeTokenBalance(depositToken, user, amount.mul('-1'))
      })
    })

    describe('burnWithdrawnDeposit', function () {
      it('should revert if not mbox', async function () {
        // when
        const tx = issuer.connect(user.address).burnWithdrawnDeposit(ethers.constants.AddressZero, 0)

        // then
        await expect(tx).to.revertedWith('not-mbox')
      })

      it('should burn deposit tokens', async function () {
        // when
        const amount = await depositToken.balanceOf(user.address)
        const tx = () => issuer.connect(mBoxMock).burnWithdrawnDeposit(user.address, amount)

        // then
        await expect(tx).to.changeTokenBalance(depositToken, user, amount.mul('-1'))
      })
    })

    describe('seizeDepositToken', function () {
      it('should revert if not mbox', async function () {
        // when
        const tx = issuer
          .connect(user.address)
          .seizeDepositToken(ethers.constants.AddressZero, ethers.constants.AddressZero, 0)

        // then
        await expect(tx).to.revertedWith('not-mbox')
      })

      it('should seize deposit tokens', async function () {
        // when
        const amount = await depositToken.balanceOf(user.address)
        const tx = () => issuer.connect(mBoxMock).seizeDepositToken(user.address, user2.address, amount)

        // then
        await expect(tx).to.changeTokenBalances(depositToken, [user, user2], [amount.mul('-1'), amount])
      })
    })

    describe('updateDepositToken', function () {
      it('should revert if not gorvernor', async function () {
        // when
        const tx = issuer.connect(user.address).updateDepositToken(ethers.constants.AddressZero)

        // then
        await expect(tx).to.revertedWith('not-the-governor')
      })
    })
  })

  describe('updateOracle', function () {
    it('should revert if not gorvernor', async function () {
      // when
      const tx = issuer.connect(user.address).updateOracle(ethers.constants.AddressZero)

      // then
      await expect(tx).to.revertedWith('not-the-governor')
    })

    it('should revert if using the same address', async function () {
      // given
      expect(await issuer.oracle()).to.eq(oracle.address)

      // when
      const tx = issuer.updateOracle(oracle.address)

      // then
      await expect(tx).to.revertedWith('new-oracle-is-same-as-current')
    })

    it('should revert if address is zero', async function () {
      // when
      const tx = issuer.updateOracle(ethers.constants.AddressZero)

      // then
      await expect(tx).to.revertedWith('oracle-address-is-null')
    })

    it('should update oracle contract', async function () {
      // given
      const oldOracle = await issuer.oracle()
      const newOracle = user2.address
      expect(oldOracle).not.eq(newOracle)

      // when
      const tx = issuer.updateOracle(newOracle)

      // then
      await expect(tx).to.emit(issuer, 'OracleUpdated').withArgs(oldOracle, newOracle)
      expect(await issuer.oracle()).to.eq(newOracle)
    })
  })
})
