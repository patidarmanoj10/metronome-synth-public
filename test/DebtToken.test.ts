/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable camelcase */
import {parseEther} from '@ethersproject/units'
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import chai, {expect} from 'chai'
import {ethers} from 'hardhat'
import {
  DebtToken,
  DebtToken__factory,
  MasterOracleMock,
  MasterOracleMock__factory,
  SyntheticToken,
  SyntheticToken__factory,
} from '../typechain'
import {impersonateAccount, increaseTime, setEtherBalance} from './helpers'
import {FakeContract, MockContract, smock} from '@defi-wonderland/smock'
import {BigNumber} from 'ethers'

chai.use(smock.matchers)

const {MaxUint256, AddressZero} = ethers.constants

let SECONDS_PER_YEAR: BigNumber

describe('DebtToken', function () {
  let deployer: SignerWithAddress
  let controllerMock: FakeContract
  let user1: SignerWithAddress
  let user2: SignerWithAddress
  let treasury: SignerWithAddress
  let debtToken: DebtToken
  let syntheticToken: SyntheticToken
  let syntheticTokenWallet: SignerWithAddress
  let masterOracleMock: MasterOracleMock
  let rewardsDistributorMock: MockContract

  const name = 'vsETH Debt'
  const symbol = 'vsETH-Debt'
  const interestRate = parseEther('0')

  beforeEach(async function () {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[deployer, , user1, user2, treasury] = await ethers.getSigners()

    const syntheticTokenFactory = new SyntheticToken__factory(deployer)
    syntheticToken = await syntheticTokenFactory.deploy()
    await syntheticToken.deployed()
    syntheticTokenWallet = await impersonateAccount(syntheticToken.address)

    const masterOracleMockFactory = new MasterOracleMock__factory(deployer)
    masterOracleMock = <MasterOracleMock>await masterOracleMockFactory.deploy()
    await masterOracleMock.deployed()

    controllerMock = await smock.fake('Controller')
    controllerMock.treasury.returns(treasury.address)
    controllerMock.governor.returns(deployer.address)
    controllerMock.masterOracle.returns(masterOracleMock.address)
    await setEtherBalance(controllerMock.address, parseEther('10'))

    const rewardsDistributorMockFactory = await smock.mock('RewardsDistributor')
    rewardsDistributorMock = await rewardsDistributorMockFactory.deploy()
    controllerMock.getRewardsDistributors.returns([rewardsDistributorMock.address])
    rewardsDistributorMock.controller.returns(controllerMock.address)

    const debtTokenFactory = new DebtToken__factory(deployer)
    debtToken = await debtTokenFactory.deploy()
    await debtToken.deployed()

    await syntheticToken.initialize(
      'Vesper Synth ETH',
      'vsETH',
      18,
      controllerMock.address,
      debtToken.address,
      interestRate,
      MaxUint256
    )

    await debtToken.initialize(name, symbol, 18, controllerMock.address)
    await debtToken.setSyntheticToken(syntheticToken.address)

    // eslint-disable-next-line new-cap
    SECONDS_PER_YEAR = await syntheticToken.SECONDS_PER_YEAR()
    await masterOracleMock.updatePrice(syntheticToken.address, parseEther('4000')) // 1 vsETH = $4,000
  })

  it('default values', async function () {
    expect(await debtToken.totalSupply()).eq(0)
    expect(await debtToken.name()).eq(name)
    expect(await debtToken.symbol()).eq(symbol)
    expect(await debtToken.decimals()).eq(18)
  })

  describe('mint', function () {
    it('should mint', async function () {
      expect(await debtToken.balanceOf(user1.address)).eq(0)
      const amount = parseEther('100')

      await debtToken.connect(syntheticTokenWallet).mint(user1.address, amount)

      expect(await debtToken.balanceOf(user1.address)).eq(amount)
    })

    it('should revert if not synthetic token', async function () {
      const tx = debtToken.connect(user1).mint(user1.address, parseEther('10'))
      await expect(tx).revertedWith('not-synthetic-token')
    })

    it('should not remove address(0) from the users array', async function () {
      // given
      controllerMock.removeFromDebtTokensOfAccount.reset()
      expect(await debtToken.balanceOf(user1.address)).eq(0)
      expect(await debtToken.balanceOf(ethers.constants.AddressZero)).eq(0)

      // when
      // Note: Set `gasLimit` prevents messing up the calls counter
      // See more: https://github.com/defi-wonderland/smock/issues/99
      const gasLimit = 250000
      await debtToken.connect(syntheticTokenWallet).mint(user1.address, parseEther('1'), {gasLimit})

      // then
      expect(controllerMock.removeFromDebtTokensOfAccount).callCount(0)
    })

    it('should add debt token to user array only if balance was 0 before mint', async function () {
      // given
      controllerMock.addToDebtTokensOfAccount.reset()
      expect(await debtToken.balanceOf(user1.address)).eq(0)

      // when
      // Note: Set `gasLimit` prevents messing up the calls counter
      // See more: https://github.com/defi-wonderland/smock/issues/99
      const gasLimit = 250000
      await debtToken.connect(syntheticTokenWallet).mint(user1.address, parseEther('1'), {gasLimit})
      await debtToken.connect(syntheticTokenWallet).mint(user1.address, parseEther('1'), {gasLimit})
      await debtToken.connect(syntheticTokenWallet).mint(user1.address, parseEther('1'), {gasLimit})

      // then
      expect(controllerMock.addToDebtTokensOfAccount).callCount(1)
    })

    it('should trigger rewards update', async function () {
      // given
      rewardsDistributorMock.updateBeforeMintOrBurn.reset()

      // when
      await debtToken.connect(syntheticTokenWallet).mint(user1.address, parseEther('1'))

      // then
      // Note: Use `callCount` instead (Refs: https://github.com/defi-wonderland/smock/issues/85)
      expect(rewardsDistributorMock.updateBeforeMintOrBurn).called
      expect(rewardsDistributorMock.updateBeforeMintOrBurn.getCall(0).args[1]).eq(user1.address)
    })
  })

  describe('when some token was minted', function () {
    const amount = parseEther('100')

    beforeEach('should mint', async function () {
      await debtToken.connect(syntheticTokenWallet).mint(user1.address, amount)
    })

    describe('burn', function () {
      it('should burn', async function () {
        expect(await debtToken.balanceOf(user1.address)).eq(amount)

        await debtToken.connect(controllerMock.wallet).burn(user1.address, amount)

        expect(await debtToken.balanceOf(user1.address)).eq(0)
      })

      it('should revert if not authorized', async function () {
        const tx = debtToken.connect(user1).burn(user1.address, parseEther('10'))
        await expect(tx).revertedWith('not-authorized')
      })

      it('should not add address(0) to the users array', async function () {
        // given
        controllerMock.addToDebtTokensOfAccount.reset()
        expect(await debtToken.balanceOf(user1.address)).eq(amount)
        expect(await debtToken.balanceOf(ethers.constants.AddressZero)).eq(0)

        // when
        // Note: Set `gasLimit` prevents messing up the calls counter
        // See more: https://github.com/defi-wonderland/smock/issues/99
        const gasLimit = 250000
        await debtToken.connect(controllerMock.wallet).burn(user1.address, amount, {gasLimit})

        // then
        expect(controllerMock.addToDebtTokensOfAccount).callCount(0)
      })

      it('should remove debt token from user array only if burning all', async function () {
        // given
        controllerMock.removeFromDebtTokensOfAccount.reset()
        expect(await debtToken.balanceOf(user1.address)).eq(amount)

        // when
        // Note: Set `gasLimit` prevents messing up the calls counter
        // See more: https://github.com/defi-wonderland/smock/issues/99
        const gasLimit = 250000
        await debtToken.connect(controllerMock.wallet).burn(user1.address, amount.div('4'), {gasLimit})
        await debtToken.connect(controllerMock.wallet).burn(user1.address, amount.div('4'), {gasLimit})
        await debtToken.connect(controllerMock.wallet).burn(user1.address, amount.div('4'), {gasLimit})
        await debtToken.connect(controllerMock.wallet).burn(user1.address, amount.div('4'), {gasLimit})

        // then
        expect(await debtToken.balanceOf(user1.address)).eq(0)
        expect(controllerMock.removeFromDebtTokensOfAccount).callCount(1)
      })

      it('should trigger rewards update', async function () {
        // given
        rewardsDistributorMock.updateBeforeMintOrBurn.reset()

        // when
        await debtToken.connect(controllerMock.wallet).burn(user1.address, amount)

        // then
        // Note: Use `callCount` instead (Refs: https://github.com/defi-wonderland/smock/issues/85)
        expect(rewardsDistributorMock.updateBeforeMintOrBurn).called
        expect(rewardsDistributorMock.updateBeforeMintOrBurn.getCall(0).args[1]).eq(user1.address)
      })
    })

    describe('transfer', function () {
      it('should revert when transferring', async function () {
        const tx = debtToken.transfer(user2.address, parseEther('1'))
        await expect(tx).revertedWith('transfer-not-supported')
      })
    })

    describe('transferFrom', function () {
      it('should revert when transferring', async function () {
        const tx = debtToken.connect(user2).transferFrom(user1.address, user2.address, parseEther('1'))
        await expect(tx).revertedWith('transfer-not-supported')
      })
    })
  })

  describe('balanceOf & totalSupply - get updated values without calling accrueInterest()', function () {
    const principal = parseEther('100')

    beforeEach(async function () {
      // given
      await debtToken.connect(syntheticTokenWallet).mint(user1.address, principal)
    })

    it('should get updated balance', async function () {
      // when
      await syntheticToken.updateInterestRate(parseEther('0.02')) // 2%

      await increaseTime(SECONDS_PER_YEAR)

      // then
      const debtOfUser = await debtToken.balanceOf(user1.address)
      const totalDebt = await debtToken.totalSupply()

      expect(debtOfUser).closeTo(parseEther('102'), parseEther('0.0001'))
      expect(totalDebt).eq(debtOfUser)
    })

    it('should not accrue interest if rate is 0', async function () {
      expect(await syntheticToken.interestRate()).eq(0)

      // when
      await increaseTime(SECONDS_PER_YEAR)

      // then
      const debtOfUser = await debtToken.balanceOf(user1.address)
      const totalDebt = await debtToken.totalSupply()

      expect(debtOfUser).eq(principal)
      expect(totalDebt).eq(debtOfUser)
    })

    it('should accrue interest after changing interest rate', async function () {
      // when
      // 1st year 10% interest + 2nd year 50% interest
      await syntheticToken.updateInterestRate(parseEther('0.1')) // 10%
      await increaseTime(SECONDS_PER_YEAR)

      await syntheticToken.updateInterestRate(parseEther('0.5')) // 50%
      await increaseTime(SECONDS_PER_YEAR)

      // then
      const debtOfUser = await debtToken.balanceOf(user1.address)
      const totalDebt = await debtToken.totalSupply()

      expect(debtOfUser).closeTo(parseEther('165'), parseEther('0.001'))
      expect(totalDebt).closeTo(debtOfUser, parseEther('0.00000001'))
    })

    it('should stop accruing interest after changing interest rate to 0', async function () {
      // when
      // 1st year 10% interest + 2nd year 0% interest
      await syntheticToken.updateInterestRate(parseEther('0.1')) // 10%

      await increaseTime(SECONDS_PER_YEAR)

      await syntheticToken.updateInterestRate(parseEther('0'))

      await increaseTime(SECONDS_PER_YEAR)

      // then
      const debtOfUser = await debtToken.balanceOf(user1.address)
      const totalDebt = await debtToken.totalSupply()

      expect(debtOfUser).closeTo(parseEther('110'), parseEther('0.1'))
      expect(totalDebt).eq(debtOfUser)
    })
  })

  describe('accrueInterest', function () {
    const principal = parseEther('100')

    beforeEach(async function () {
      // given
      await debtToken.connect(syntheticTokenWallet).mint(user1.address, principal)
    })

    it('should accrue interest', async function () {
      // when
      await syntheticToken.updateInterestRate(parseEther('0.02')) // 2%
      await increaseTime(SECONDS_PER_YEAR)
      await syntheticToken.accrueInterest()

      // then
      const totalDebt = await debtToken.totalSupply()
      expect(totalDebt).closeTo(parseEther('102'), parseEther('0.0001'))
    })

    it('should not accrue interest if rate is 0', async function () {
      // given
      expect(await syntheticToken.interestRate()).eq(0)

      // when
      await increaseTime(SECONDS_PER_YEAR)
      await syntheticToken.accrueInterest()

      // then
      const totalDebt = await debtToken.totalSupply()
      expect(totalDebt).eq(principal)
    })

    it('should accrue interest after changing interest rate', async function () {
      // when
      // 1st year 10% interest + 2nd year 50% interest
      await syntheticToken.updateInterestRate(parseEther('0.1')) // 10%
      await increaseTime(SECONDS_PER_YEAR)
      await syntheticToken.accrueInterest()

      await syntheticToken.updateInterestRate(parseEther('0.5')) // 50%
      await increaseTime(SECONDS_PER_YEAR)
      await syntheticToken.accrueInterest()

      // then
      const totalDebt = await debtToken.totalSupply()
      expect(totalDebt).closeTo(parseEther('165'), parseEther('0.001'))
    })

    it('should stop accruing interest after changing interest rate to 0', async function () {
      // when
      // 1st year 10% interest + 2nd year 0% interest
      await syntheticToken.updateInterestRate(parseEther('0.1')) // 10%
      await increaseTime(SECONDS_PER_YEAR)
      await syntheticToken.accrueInterest()

      await syntheticToken.updateInterestRate(parseEther('0'))
      await increaseTime(SECONDS_PER_YEAR)
      await syntheticToken.accrueInterest()

      // then
      const totalDebt = await debtToken.totalSupply()
      expect(totalDebt).closeTo(parseEther('110'), parseEther('0.1'))
    })

    it('should not accrue interest backwards after changing interest rate from 0', async function () {
      // given
      expect(await syntheticToken.interestRate()).eq(0)

      // when
      // 1st year 0% interest + 2nd year 10% interest
      await increaseTime(SECONDS_PER_YEAR)
      await syntheticToken.accrueInterest()

      await syntheticToken.updateInterestRate(parseEther('0.1')) // 10%
      await increaseTime(SECONDS_PER_YEAR)
      await syntheticToken.accrueInterest()

      // then
      const totalDebt = await debtToken.totalSupply()
      expect(totalDebt).closeTo(parseEther('110'), parseEther('0.1'))
    })
  })

  describe('setSyntheticToken', function () {
    let syntheticTokenFake: FakeContract

    beforeEach(async function () {
      syntheticTokenFake = await smock.fake('SyntheticToken')

      const debtTokenMockFactory = new DebtTokenMock__factory(deployer)
      debtToken = await debtTokenMockFactory.deploy()
      await debtToken.deployed()
      await debtToken.initialize(name, symbol, 18, controllerMock.address)

      expect(await debtToken.syntheticToken()).eq(AddressZero)
    })

    it('should revert if not governor', async function () {
      const tx = debtToken.connect(user1).setSyntheticToken(syntheticTokenFake.address)
      await expect(tx).revertedWith('not-governor')
    })

    it('should revert if address is null', async function () {
      const tx = debtToken.setSyntheticToken(AddressZero)
      await expect(tx).revertedWith('synthetic-is-null')
    })

    it('should revert if synthetic token is not pointing to the debt token', async function () {
      // given
      syntheticTokenFake.debtToken.returns(() => user1.address)

      // when-then
      const tx = debtToken.setSyntheticToken(syntheticTokenFake.address)
      await expect(tx).revertedWith('invalid-synthetic-debt-token')
    })

    it('should revert if decimals are not the same', async function () {
      // given
      syntheticTokenFake.debtToken.returns(() => debtToken.address)
      syntheticTokenFake.decimals.returns(() => 4)

      // when-then
      const tx = debtToken.setSyntheticToken(syntheticTokenFake.address)
      await expect(tx).revertedWith('invalid-synthetic-decimals')
    })

    it('should revert if already assigned', async function () {
      // given
      syntheticTokenFake.debtToken.returns(() => debtToken.address)
      syntheticTokenFake.decimals.returns(() => 18)
      await debtToken.setSyntheticToken(syntheticTokenFake.address)

      // when-then
      const tx = debtToken.setSyntheticToken(syntheticTokenFake.address)
      await expect(tx).revertedWith('synthetic-already-assigned')
    })

    it('should  set synthetic token', async function () {
      // given
      syntheticTokenFake.debtToken.returns(() => debtToken.address)
      syntheticTokenFake.decimals.returns(() => 18)

      // when
      await debtToken.setSyntheticToken(syntheticTokenFake.address)

      // then
      expect(await debtToken.syntheticToken()).eq(syntheticTokenFake.address)
    })
  })
})
