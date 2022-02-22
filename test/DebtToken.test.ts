/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable camelcase */
import {parseEther} from '@ethersproject/units'
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import chai, {expect} from 'chai'
import {ethers} from 'hardhat'
import {DebtTokenMock, DebtTokenMock__factory, SyntheticToken, SyntheticToken__factory} from '../typechain'
import {BLOCKS_PER_YEAR, setEtherBalance} from './helpers'
import {FakeContract, smock} from '@defi-wonderland/smock'

chai.use(smock.matchers)

describe('DebtToken', function () {
  let deployer: SignerWithAddress
  let controllerMock: FakeContract
  let user1: SignerWithAddress
  let user2: SignerWithAddress
  let treasury: SignerWithAddress
  let debtToken: DebtTokenMock
  let syntheticToken: SyntheticToken

  const name = 'vsETH Debt'
  const symbol = 'vsETH-Debt'
  const interestRate = parseEther('0')

  beforeEach(async function () {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[deployer, , user1, user2, treasury] = await ethers.getSigners()

    const syntheticTokenFactory = new SyntheticToken__factory(deployer)
    syntheticToken = await syntheticTokenFactory.deploy()
    await syntheticToken.deployed()

    controllerMock = await smock.fake('Controller')
    controllerMock.treasury.returns(treasury.address)
    controllerMock.governor.returns(deployer.address)
    await setEtherBalance(controllerMock.address, parseEther('10'))

    const debtTokenMockFactory = new DebtTokenMock__factory(deployer)
    debtToken = await debtTokenMockFactory.deploy()
    await debtToken.deployed()

    await debtToken.initialize(name, symbol, 18, controllerMock.address, syntheticToken.address)

    await syntheticToken.initialize(
      'Vesper Synth ETH',
      'vsETH',
      18,
      controllerMock.address,
      debtToken.address,
      interestRate
    )
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

      await debtToken.connect(controllerMock.wallet).mint(user1.address, amount)

      expect(await debtToken.balanceOf(user1.address)).eq(amount)
    })

    it('should revert if not controller', async function () {
      const tx = debtToken.connect(user1).mint(user1.address, parseEther('10'))
      await expect(tx).revertedWith('not-controller')
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
      await debtToken.connect(controllerMock.wallet).mint(user1.address, parseEther('1'), {gasLimit})

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
      await debtToken.connect(controllerMock.wallet).mint(user1.address, parseEther('1'), {gasLimit})
      await debtToken.connect(controllerMock.wallet).mint(user1.address, parseEther('1'), {gasLimit})
      await debtToken.connect(controllerMock.wallet).mint(user1.address, parseEther('1'), {gasLimit})

      // then
      expect(controllerMock.addToDebtTokensOfAccount).callCount(1)
    })
  })

  describe('when some token was minted', function () {
    const amount = parseEther('100')

    beforeEach('should mint', async function () {
      await debtToken.connect(controllerMock.wallet).mint(user1.address, amount)
    })

    describe('burn', function () {
      it('should burn', async function () {
        expect(await debtToken.balanceOf(user1.address)).eq(amount)

        await debtToken.connect(controllerMock.wallet).burn(user1.address, amount)

        expect(await debtToken.balanceOf(user1.address)).eq(0)
      })

      it('should revert if not controller', async function () {
        const tx = debtToken.connect(user1).mint(user1.address, parseEther('10'))
        await expect(tx).revertedWith('not-controller')
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
    })

    describe('transfer', function () {
      it('should revert when transfering', async function () {
        const tx = debtToken.transfer(user2.address, parseEther('1'))
        await expect(tx).revertedWith('transfer-not-supported')
      })
    })

    describe('transferFrom', function () {
      it('should revert when transfering', async function () {
        const tx = debtToken.connect(user2).transferFrom(user1.address, user2.address, parseEther('1'))
        await expect(tx).revertedWith('transfer-not-supported')
      })
    })
  })

  describe('balanceOf & totalSupply - get updated values without calling accrueInterest()', function () {
    const principal = parseEther('100')

    it('should get updated balance', async function () {
      // given
      await debtToken.connect(controllerMock.wallet).mint(user1.address, principal)

      // when
      await syntheticToken.updateInterestRate(parseEther('0.02')) // 2%

      await debtToken.incrementBlockNumber(BLOCKS_PER_YEAR)

      // then
      const debtOfUser = await debtToken.balanceOf(user1.address)
      const totalDebt = await debtToken.totalSupply()

      // @ts-ignore
      expect(debtOfUser).closeTo(parseEther('102'), parseEther('0.0001'))
      expect(totalDebt).eq(debtOfUser)
    })

    it('should not accrue interest if rate is 0', async function () {
      // given
      await debtToken.connect(controllerMock.wallet).mint(user1.address, principal)
      expect(await syntheticToken.interestRate()).eq(0)

      // when
      await debtToken.incrementBlockNumber(BLOCKS_PER_YEAR)

      // then
      const debtOfUser = await debtToken.balanceOf(user1.address)
      const totalDebt = await debtToken.totalSupply()

      expect(debtOfUser).eq(principal)
      expect(totalDebt).eq(debtOfUser)
    })

    it('should accrue interest after changing interest rate', async function () {
      // given
      await debtToken.connect(controllerMock.wallet).mint(user1.address, principal)

      // when
      // 1st year 10% interest + 2nd year 50% interest
      await syntheticToken.updateInterestRate(parseEther('0.1')) // 10%
      await debtToken.incrementBlockNumber(BLOCKS_PER_YEAR)

      await syntheticToken.updateInterestRate(parseEther('0.5')) // 50%
      await debtToken.incrementBlockNumber(BLOCKS_PER_YEAR)

      // then
      const debtOfUser = await debtToken.balanceOf(user1.address)
      const totalDebt = await debtToken.totalSupply()

      // @ts-ignore
      expect(debtOfUser).closeTo(parseEther('165'), parseEther('0.001'))
      // @ts-ignore
      expect(totalDebt).closeTo(debtOfUser, parseEther('0.00000001'))
    })

    it('should stop accruing interest after changing interest rate to 0', async function () {
      // given
      await debtToken.connect(controllerMock.wallet).mint(user1.address, principal)

      // when
      // 1st year 10% interest + 2nd year 0% interest
      await syntheticToken.updateInterestRate(parseEther('0.1')) // 10%

      await debtToken.incrementBlockNumber(BLOCKS_PER_YEAR)

      await syntheticToken.updateInterestRate(parseEther('0'))

      await debtToken.incrementBlockNumber(BLOCKS_PER_YEAR)

      // then
      const debtOfUser = await debtToken.balanceOf(user1.address)
      const totalDebt = await debtToken.totalSupply()

      // @ts-ignore
      expect(debtOfUser).closeTo(parseEther('110'), parseEther('0.1'))
      expect(totalDebt).eq(debtOfUser)
    })
  })

  describe('accrueInterest', function () {
    const principal = parseEther('100')

    it('should accrue interest', async function () {
      // given
      await debtToken.connect(controllerMock.wallet).mint(user1.address, principal)

      // when
      await syntheticToken.updateInterestRate(parseEther('0.02')) // 2%
      await debtToken.incrementBlockNumber(BLOCKS_PER_YEAR)
      await syntheticToken.accrueInterest()

      // then
      const totalDebt = await debtToken.totalSupply()
      // @ts-ignore
      expect(totalDebt).closeTo(parseEther('102'), parseEther('0.0001'))
    })

    it('should not accrue interest if rate is 0', async function () {
      // given
      await debtToken.connect(controllerMock.wallet).mint(user1.address, principal)
      expect(await syntheticToken.interestRate()).eq(0)

      // when
      await debtToken.incrementBlockNumber(BLOCKS_PER_YEAR)
      await syntheticToken.accrueInterest()

      // then
      const totalDebt = await debtToken.totalSupply()
      expect(totalDebt).eq(principal)
    })

    it('should accrue interest after changing interest rate', async function () {
      // given
      await debtToken.connect(controllerMock.wallet).mint(user1.address, principal)

      // when
      // 1st year 10% interest + 2nd year 50% interest
      await syntheticToken.updateInterestRate(parseEther('0.1')) // 10%
      await debtToken.incrementBlockNumber(BLOCKS_PER_YEAR)
      await syntheticToken.accrueInterest()

      await syntheticToken.updateInterestRate(parseEther('0.5')) // 50%
      await debtToken.incrementBlockNumber(BLOCKS_PER_YEAR)
      await syntheticToken.accrueInterest()

      // then
      const totalDebt = await debtToken.totalSupply()
      // @ts-ignore
      expect(totalDebt).closeTo(parseEther('165'), parseEther('0.001'))
    })

    it('should stop accruing interest after changing interest rate to 0', async function () {
      // given
      await debtToken.connect(controllerMock.wallet).mint(user1.address, principal)

      // when
      // 1st year 10% interest + 2nd year 0% interest
      await syntheticToken.updateInterestRate(parseEther('0.1')) // 10%
      await debtToken.incrementBlockNumber(BLOCKS_PER_YEAR)
      await syntheticToken.accrueInterest()

      await syntheticToken.updateInterestRate(parseEther('0'))
      await debtToken.incrementBlockNumber(BLOCKS_PER_YEAR)
      await syntheticToken.accrueInterest()

      // then
      const totalDebt = await debtToken.totalSupply()
      // @ts-ignore
      expect(totalDebt).closeTo(parseEther('110'), parseEther('0.1'))
    })

    it('should not accrue interest backwards after changing interest rate from 0', async function () {
      // given
      await debtToken.connect(controllerMock.wallet).mint(user1.address, principal)
      expect(await syntheticToken.interestRate()).eq(0)

      // when
      // 1st year 0% interest + 2nd year 10% interest
      await debtToken.incrementBlockNumber(BLOCKS_PER_YEAR)
      await syntheticToken.accrueInterest()

      await syntheticToken.updateInterestRate(parseEther('0.1')) // 10%
      await debtToken.incrementBlockNumber(BLOCKS_PER_YEAR)
      await syntheticToken.accrueInterest()

      // then
      const totalDebt = await debtToken.totalSupply()
      // @ts-ignore
      expect(totalDebt).closeTo(parseEther('110'), parseEther('0.1'))
    })
  })
})
