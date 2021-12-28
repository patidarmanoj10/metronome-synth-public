/* eslint-disable @typescript-eslint/ban-ts-comment */
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
  DebtToken__factory,
  Treasury,
  Treasury__factory,
  Issuer__factory,
  Issuer,
  DebtTokenMock__factory,
  DebtTokenMock,
} from '../typechain'
import {BLOCKS_PER_YEAR} from './helpers'

describe('Issuer', function () {
  let deployer: SignerWithAddress
  let governor: SignerWithAddress
  let user: SignerWithAddress
  let user2: SignerWithAddress
  let liquidator: SignerWithAddress
  let vSynthMock: SignerWithAddress
  let met: ERC20Mock
  let vsEthDebtToken: DebtTokenMock
  let vsEth: SyntheticAsset
  let treasury: Treasury
  let metDepositToken: DepositToken
  let oracle: OracleMock
  let issuer: Issuer

  const vsEthCR = parseEther('1.5') // 150%
  const ethRate = parseEther('4000') // 1 ETH = $4000
  const metRate = parseEther('4') // 1 MET = $4

  const interestRate = parseEther('0')

  beforeEach(async function () {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[deployer, governor, user, user2, liquidator, vSynthMock] = await ethers.getSigners()

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
    metDepositToken = await depositTokenFactory.deploy()
    await metDepositToken.deployed()

    const vsEthDebtTokenFactory = new DebtTokenMock__factory(deployer)
    vsEthDebtToken = await vsEthDebtTokenFactory.deploy()
    await vsEthDebtToken.deployed()

    const vsEthFactory = new SyntheticAsset__factory(deployer)
    vsEth = await vsEthFactory.deploy()
    await vsEth.deployed()

    const issuerFactory = new Issuer__factory(deployer)
    issuer = await issuerFactory.deploy()
    await issuer.deployed()

    await metDepositToken.initialize(met.address, issuer.address, oracle.address, 'vSynths-MET', 18)
    await metDepositToken.transferGovernorship(governor.address)
    await metDepositToken.connect(governor).acceptGovernorship()

    await vsEthDebtToken.initialize('vsETH Debt', 'vsETH-Debt', 18, issuer.address, vsEth.address)
    await vsEthDebtToken.transferGovernorship(governor.address)
    await vsEthDebtToken.connect(governor).acceptGovernorship()

    await vsEth.initialize(
      'Vesper Synth ETH',
      'vsETH',
      18,
      issuer.address,
      vsEthDebtToken.address,
      vsEthCR,
      oracle.address,
      interestRate
    )
    await vsEth.transferGovernorship(governor.address)
    await vsEth.connect(governor).acceptGovernorship()

    await treasury.initialize(issuer.address)

    await issuer.initialize(
      metDepositToken.address,
      vsEth.address,
      oracle.address,
      treasury.address,
      vSynthMock.address
    )

    // mint some MET to users
    await met.mint(user.address, parseEther(`${1e6}`))
    await met.mint(liquidator.address, parseEther(`${1e6}`))

    // initialize mocked oracle
    await oracle.updateRate(met.address, metRate)
    await oracle.updateRate(vsEth.address, ethRate)
  })

  describe('whitelisting', function () {
    describe('addSyntheticAsset', function () {
      it('should revert if not governor', async function () {
        const tx = issuer.connect(user).addSyntheticAsset(vsEth.address)
        await expect(tx).to.revertedWith('not-the-governor')
      })

      it('should add synthetic asset', async function () {
        const someTokenAddress = met.address
        const syntheticAssetsBefore = await issuer.getSyntheticAssets()
        await issuer.addSyntheticAsset(someTokenAddress)
        const syntheticAssetsAfter = await issuer.getSyntheticAssets()
        expect(syntheticAssetsAfter.length).eq(syntheticAssetsBefore.length + 1)
      })
    })

    describe('removeSyntheticAsset', function () {
      it('should remove synthetic asset', async function () {
        // given
        const DebtTokenFactory = new DebtToken__factory(deployer)
        const debtToken = await DebtTokenFactory.deploy()

        const SyntheticAssetFactory = new SyntheticAsset__factory(deployer)
        const vsAsset = await SyntheticAssetFactory.deploy()

        await debtToken.initialize('Vesper Synth BTC debt', 'vsBTC-debt', 8, issuer.address, vsAsset.address)
        await vsAsset.initialize(
          'Vesper Synth BTC',
          'vsBTC',
          8,
          issuer.address,
          debtToken.address,
          parseEther('1.5'),
          oracle.address,
          interestRate
        )

        expect(await vsAsset.totalSupply()).to.eq(0)
        await issuer.addSyntheticAsset(vsAsset.address)
        const syntheticAssetsBefore = await issuer.getSyntheticAssets()

        // when
        await issuer.removeSyntheticAsset(vsAsset.address)

        // then
        const syntheticAssetsAfter = await issuer.getSyntheticAssets()
        expect(syntheticAssetsAfter.length).eq(syntheticAssetsBefore.length - 1)
      })

      it('should revert if not governor', async function () {
        // when
        const tx = issuer.connect(user).removeSyntheticAsset(vsEth.address)

        // then
        await expect(tx).to.revertedWith('not-the-governor')
      })

      it('should revert if removing vsETH (i.e. syntheticAssets[0])', async function () {
        // given
        const [firstSyntheticAsset] = await issuer.getSyntheticAssets()
        expect(firstSyntheticAsset).to.eq(vsEth.address)

        // when
        const tx = issuer.removeSyntheticAsset(vsEth.address)

        // then
        await expect(tx).to.revertedWith('can-not-delete-vseth')
      })

      it('should revert if vsAsset has any supply', async function () {
        // given
        const ERC20MockFactory = new ERC20Mock__factory(deployer)
        const vsAsset = await ERC20MockFactory.deploy('Vesper Synth BTC', 'vsBTC', 8)
        await vsAsset.deployed()
        await issuer.addSyntheticAsset(vsAsset.address)
        await vsAsset.mint(deployer.address, parseEther('100'))
        expect(await vsAsset.totalSupply()).to.gt(0)

        // when
        const tx = issuer.removeSyntheticAsset(vsAsset.address)

        // then
        await expect(tx).to.revertedWith('synthetic-asset-with-supply')
      })
    })
  })

  describe('mintSyntheticAsset', function () {
    it('should revert if not vSynth', async function () {
      // when
      const tx = issuer.connect(user.address).mintSyntheticAsset(vsEth.address, ethers.constants.AddressZero, 0)

      // then
      await expect(tx).to.revertedWith('not-vsynth')
    })

    it('should mint vsAsset', async function () {
      // when
      const amount = parseEther('1')
      const tx = () => issuer.connect(vSynthMock).mintSyntheticAsset(vsEth.address, user.address, amount)

      // then
      await expect(tx).to.changeTokenBalance(vsEth, user, amount)
    })
  })

  describe('burnSyntheticAsset', function () {
    it('should revert if not vSynth', async function () {
      // when
      const tx = issuer.connect(user.address).burnSyntheticAsset(vsEth.address, ethers.constants.AddressZero, 0)

      // then
      await expect(tx).to.revertedWith('not-vsynth')
    })

    it('should burn vsAsset', async function () {
      // given
      const amount = parseEther('1')
      await issuer.connect(vSynthMock).mintSyntheticAsset(vsEth.address, user.address, amount.mul('10'))

      // when
      const tx = () => issuer.connect(vSynthMock).burnSyntheticAsset(vsEth.address, user.address, amount)

      // then
      await expect(tx).to.changeTokenBalance(vsEth, user, amount.mul('-1'))
    })
  })

  describe('mintDebtToken', function () {
    it('should revert if not vSynth', async function () {
      // when
      const tx = issuer.connect(user.address).mintDebtToken(vsEth.address, ethers.constants.AddressZero, 0)

      // then
      await expect(tx).to.revertedWith('not-vsynth')
    })

    it('should mint vsAsset', async function () {
      // when
      const amount = parseEther('1')
      const tx = () => issuer.connect(vSynthMock).mintDebtToken(vsEth.address, user.address, amount)

      // then
      await expect(tx).to.changeTokenBalance(vsEth, user, amount)
    })
  })

  describe('burnDebtToken', function () {
    it('should revert if not vSynth', async function () {
      // when
      const tx = issuer.connect(user.address).burnDebtToken(vsEth.address, ethers.constants.AddressZero, 0)

      // then
      await expect(tx).to.revertedWith('not-vsynth')
    })

    it('should burn vsAsset and its debt representation', async function () {
      // given
      const amount = parseEther('1')
      await issuer.connect(vSynthMock).mintDebtToken(vsEth.address, user.address, amount.mul('10'))

      // when
      const tx = () => issuer.connect(vSynthMock).burnDebtToken(vsEth.address, user.address, amount)

      // then
      await expect(tx).to.changeTokenBalance(vsEth, user, amount.mul('-1'))
    })
  })

  describe('mintDepositToken', function () {
    it('should revert if not vSynth', async function () {
      // when
      const tx = issuer.connect(user.address).mintDepositToken(metDepositToken.address, ethers.constants.AddressZero, 0)

      // then
      await expect(tx).to.revertedWith('not-vsynth')
    })

    it('should mint deposit token', async function () {
      // when
      const amount = parseEther('1')
      const tx = () => issuer.connect(vSynthMock).mintDepositToken(metDepositToken.address, user.address, amount)

      // then
      await expect(tx).to.changeTokenBalance(metDepositToken, user, amount)
    })
  })

  describe('when have some deposit token', function () {
    beforeEach(async function () {
      await issuer.connect(vSynthMock).mintDepositToken(metDepositToken.address, user.address, parseEther('1'))
    })

    describe('burnDepositToken', function () {
      it('should revert if not vSynth', async function () {
        // when
        const tx = issuer
          .connect(user.address)
          .burnDepositToken(metDepositToken.address, ethers.constants.AddressZero, 0)

        // then
        await expect(tx).to.revertedWith('not-vsynth')
      })

      it('should burn deposit tokens', async function () {
        // when
        const amount = await metDepositToken.balanceOf(user.address)
        const tx = () => issuer.connect(vSynthMock).burnDepositToken(metDepositToken.address, user.address, amount)

        // then
        await expect(tx).to.changeTokenBalance(metDepositToken, user, amount.mul('-1'))
      })
    })

    describe('seizeDepositToken', function () {
      it('should revert if not vSynth', async function () {
        // when
        const tx = issuer
          .connect(user.address)
          .seizeDepositToken(metDepositToken.address, ethers.constants.AddressZero, ethers.constants.AddressZero, 0)

        // then
        await expect(tx).to.revertedWith('not-vsynth')
      })

      it('should seize deposit tokens', async function () {
        // when
        const amount = await metDepositToken.balanceOf(user.address)
        const tx = () =>
          issuer.connect(vSynthMock).seizeDepositToken(metDepositToken.address, user.address, user2.address, amount)

        // then
        await expect(tx).to.changeTokenBalances(metDepositToken, [user, user2], [amount.mul('-1'), amount])
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

  describe('updateTreasury', function () {
    it('should revert if using the same address', async function () {
      // given
      expect(await issuer.treasury()).to.eq(treasury.address)

      // when
      const tx = issuer.updateTreasury(treasury.address)

      // then
      await expect(tx).to.revertedWith('new-treasury-is-same-as-current')
    })

    it('should revert if caller is not governor', async function () {
      // when
      const tx = issuer.connect(user.address).updateTreasury(treasury.address)

      // then
      await expect(tx).to.revertedWith('not-the-governor')
    })

    it('should revert if address is zero', async function () {
      // when
      const tx = issuer.updateTreasury(ethers.constants.AddressZero)

      // then
      await expect(tx).to.revertedWith('treasury-address-is-null')
    })

    it('should migrate funds to the new treasury', async function () {
      // given
      const balance = parseEther('100')
      await met.mint(treasury.address, balance)

      const treasuryFactory = new Treasury__factory(deployer)
      const newTreasury = await treasuryFactory.deploy()
      await newTreasury.deployed()
      await newTreasury.initialize(issuer.address)

      // when
      const tx = () => issuer.updateTreasury(newTreasury.address)

      // then
      await expect(tx).changeTokenBalances(met, [treasury, newTreasury], [balance.mul('-1'), balance])
    })
  })

  describe('acrueInterest', function () {
    const newInterestRate = parseEther('0.1')

    it('should mint accrued fee to treasury', async function () {
      const pricipal = parseEther('100')

      // given
      await vsEth.connect(governor).updateInterestRate(newInterestRate)
      await issuer.connect(vSynthMock).mintSyntheticAsset(vsEth.address, user.address, pricipal)
      await issuer.connect(vSynthMock).mintDebtToken(vsEthDebtToken.address, user.address, pricipal)
      await vsEthDebtToken.setBlockNumber(BLOCKS_PER_YEAR)

      // when
      await issuer.connect(vSynthMock).accrueInterest(vsEth.address)

      // then
      const totalCredit = await vsEth.totalSupply()
      const totalDebt = await vsEthDebtToken.totalSupply()
      const debtOfUser = await vsEthDebtToken.balanceOf(user.address)
      const creditOfUser = await vsEth.balanceOf(user.address)
      const creditOfTreasury = await vsEth.balanceOf(treasury.address)
      // @ts-ignore
      expect(totalDebt).closeTo(parseEther('110'), parseEther('0.01'))
      expect(totalCredit).eq(totalDebt).eq(debtOfUser)
      expect(creditOfUser).eq(pricipal)
      expect(totalCredit).eq(creditOfUser.add(creditOfTreasury))
    })
  })
})
