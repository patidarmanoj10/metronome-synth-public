/* eslint-disable camelcase */
import {parseEther} from '@ethersproject/units'
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import chai, {expect} from 'chai'
import {ethers} from 'hardhat'
import {RewardsDistributor__factory, RewardsDistributor, ERC20Mock__factory, ERC20Mock} from '../typechain'
import {FakeContract, smock} from '@defi-wonderland/smock'
import {increaseTimeOfNextBlock, mineBlock} from './helpers'
import {BigNumber} from 'ethers'

chai.use(smock.matchers)

const DEFAULT_INDEX = parseEther('1')

describe('RewardDistributor', function () {
  let deployer: SignerWithAddress
  let alice: SignerWithAddress
  let bob: SignerWithAddress
  let vsp: ERC20Mock
  let controller: FakeContract
  let debtToken1: FakeContract
  let vsdTOKEN1: FakeContract
  let debtToken2: FakeContract
  let vsdTOKEN2: FakeContract
  let rewardDistributor: RewardsDistributor

  beforeEach(async function () {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[deployer, alice, bob] = await ethers.getSigners()

    const erc20MockFactory = new ERC20Mock__factory(deployer)
    vsp = await erc20MockFactory.deploy('VesperToken', 'VSP', 18)
    await vsp.deployed()

    controller = await smock.fake('Controller')
    debtToken1 = await smock.fake('DebtToken')
    vsdTOKEN1 = await smock.fake('DepositToken')
    debtToken2 = await smock.fake('DebtToken')
    vsdTOKEN2 = await smock.fake('DepositToken')

    const rewardDistributorFactory = new RewardsDistributor__factory(deployer)
    rewardDistributor = await rewardDistributorFactory.deploy()
    rewardDistributor.deployed()

    // Setup
    await rewardDistributor.initialize(controller.address, vsp.address)

    vsdTOKEN1.controller.returns(controller.address)
    vsdTOKEN2.controller.returns(controller.address)

    debtToken1.debtIndex.returns(parseEther('1'))
    debtToken2.debtIndex.returns(parseEther('1'))

    controller.isDepositTokenExists.returns(true)
    controller.isSyntheticTokenExists.returns(true)
    controller.governor.returns(deployer.address)
    controller.getRewardsDistributors.returns([rewardDistributor.address])
  })

  describe('updateTokenSpeed', function () {
    it('should revert if not governor', async function () {
      // given
      const speed = parseEther('1')

      // when
      const tx = rewardDistributor.connect(alice.address).updateTokenSpeed(vsdTOKEN1.address, speed)

      // then
      await expect(tx).revertedWith('not-governor')
    })

    it('should turn on', async function () {
      // given
      const before = await rewardDistributor.tokenSpeeds(vsdTOKEN1.address)
      expect(before).eq(0)

      // when
      const speed = parseEther('1')
      await rewardDistributor.updateTokenSpeed(vsdTOKEN1.address, speed)

      // then
      const after = await rewardDistributor.tokenSpeeds(vsdTOKEN1.address)
      expect(after).eq(speed)
    })

    it('should update speed', async function () {
      // given
      const before = parseEther('1')
      await rewardDistributor.updateTokenSpeed(vsdTOKEN1.address, before)

      // when
      const newSpeed = parseEther('2')
      await rewardDistributor.updateTokenSpeed(vsdTOKEN1.address, newSpeed)

      // then
      const after = await rewardDistributor.tokenSpeeds(vsdTOKEN1.address)
      expect(after).eq(newSpeed)
    })

    it('should turn off', async function () {
      // given
      const before = parseEther('1')
      await rewardDistributor.updateTokenSpeed(vsdTOKEN1.address, before)

      // when
      const newSpeed = 0
      await rewardDistributor.updateTokenSpeed(vsdTOKEN1.address, newSpeed)

      // then
      const after = await rewardDistributor.tokenSpeeds(vsdTOKEN1.address)
      expect(after).eq(newSpeed)
    })
  })

  describe('updateTokenSpeeds', function () {
    it('should revert if not governor', async function () {
      // given
      const speed = parseEther('1')

      // when
      const tx = rewardDistributor
        .connect(alice.address)
        .updateTokenSpeeds(
          [vsdTOKEN1.address, vsdTOKEN2.address, debtToken1.address, debtToken2.address],
          [speed, speed, speed, speed]
        )

      // then
      await expect(tx).revertedWith('not-governor')
    })

    it('should update speeds', async function () {
      // given
      expect(await rewardDistributor.tokenSpeeds(vsdTOKEN1.address)).eq(0)
      expect(await rewardDistributor.tokenSpeeds(vsdTOKEN2.address)).eq(0)
      expect(await rewardDistributor.tokenSpeeds(debtToken1.address)).eq(0)
      expect(await rewardDistributor.tokenSpeeds(debtToken2.address)).eq(0)

      // when
      await rewardDistributor.updateTokenSpeeds(
        [vsdTOKEN1.address, vsdTOKEN2.address, debtToken1.address, debtToken2.address],
        [parseEther('1'), parseEther('2'), parseEther('3'), parseEther('4')]
      )

      // then
      expect(await rewardDistributor.tokenSpeeds(vsdTOKEN1.address)).eq(parseEther('1'))
      expect(await rewardDistributor.tokenSpeeds(vsdTOKEN2.address)).eq(parseEther('2'))
      expect(await rewardDistributor.tokenSpeeds(debtToken1.address)).eq(parseEther('3'))
      expect(await rewardDistributor.tokenSpeeds(debtToken2.address)).eq(parseEther('4'))
    })
  })

  describe('supply actions', function () {
    const speed = parseEther('1')

    beforeEach(async function () {
      await rewardDistributor.updateTokenSpeed(vsdTOKEN1.address, speed)

      vsdTOKEN1.totalSupply.returns(0)
      vsdTOKEN1.balanceOf.returns(0)

      const {index: indexBefore} = await rewardDistributor.tokenStates(vsdTOKEN1.address)
      const aliceIndexBefore = await rewardDistributor.accountIndexOf(vsdTOKEN1.address, alice.address)
      const bobIndexBefore = await rewardDistributor.accountIndexOf(vsdTOKEN1.address, bob.address)
      expect(indexBefore).eq(parseEther('1'))
      expect(aliceIndexBefore).eq(0)
      expect(bobIndexBefore).eq(0)

      await rewardDistributor.updateBeforeMintOrBurn(vsdTOKEN1.address, alice.address)
      await rewardDistributor.updateBeforeMintOrBurn(vsdTOKEN1.address, bob.address)

      const {index: indexAfter} = await rewardDistributor.tokenStates(vsdTOKEN1.address)
      const aliceIndexAfter = await rewardDistributor.accountIndexOf(vsdTOKEN1.address, alice.address)
      const bobIndexAfter = await rewardDistributor.accountIndexOf(vsdTOKEN1.address, bob.address)
      expect(indexAfter).eq(DEFAULT_INDEX)
      expect(aliceIndexAfter).eq(DEFAULT_INDEX)
      expect(bobIndexAfter).eq(DEFAULT_INDEX)

      const aliceTokensAccrued = await rewardDistributor.tokensAccruedOf(alice.address)
      const bobTokensAccrued = await rewardDistributor.tokensAccruedOf(bob.address)
      expect(aliceTokensAccrued).eq(0)
      expect(bobTokensAccrued).eq(0)
    })

    describe('updateBeforeMintOrBurn', function () {
      it('should update rewards (from 0 to all supply)', async function () {
        // when
        const totalSupply = parseEther('100')
        const balanceOf = parseEther('100')
        vsdTOKEN1.totalSupply.returns(totalSupply)
        vsdTOKEN1.balanceOf.returns(balanceOf)

        await increaseTimeOfNextBlock(10)
        await rewardDistributor.updateBeforeMintOrBurn(vsdTOKEN1.address, alice.address)

        // then
        const expectedTotalAccured = parseEther('10')
        const expectedUserAccured = parseEther('10')
        const accrualRatio = expectedTotalAccured.mul(parseEther('1')).div(totalSupply)

        const {index: indexAfter} = await rewardDistributor.tokenStates(vsdTOKEN1.address)
        const aliceIndexAfter = await rewardDistributor.accountIndexOf(vsdTOKEN1.address, alice.address)
        const tokensAccruedOfUser = await rewardDistributor.tokensAccruedOf(alice.address)

        expect(tokensAccruedOfUser).eq(expectedUserAccured)
        expect(indexAfter).eq(DEFAULT_INDEX.add(accrualRatio))
        expect(aliceIndexAfter).eq(indexAfter)
      })

      it('should update rewards (from 0 to half supply)', async function () {
        // when
        const totalSupply = parseEther('100')
        const balanceOf = parseEther('50')
        vsdTOKEN1.totalSupply.returns(totalSupply)
        vsdTOKEN1.balanceOf.returns(balanceOf)

        await increaseTimeOfNextBlock(10)
        await rewardDistributor.updateBeforeMintOrBurn(vsdTOKEN1.address, alice.address)

        // then
        const expectedTotalAccured = parseEther('10')
        const expectedUserAccured = parseEther('5')
        const accrualRatio = expectedTotalAccured.mul(parseEther('1')).div(totalSupply)

        const {index: indexAfter} = await rewardDistributor.tokenStates(vsdTOKEN1.address)
        const aliceIndexAfter = await rewardDistributor.accountIndexOf(vsdTOKEN1.address, alice.address)
        const tokensAccruedOfUser = await rewardDistributor.tokensAccruedOf(alice.address)

        expect(tokensAccruedOfUser).eq(expectedUserAccured)
        expect(indexAfter).eq(DEFAULT_INDEX.add(accrualRatio))
        expect(aliceIndexAfter).eq(indexAfter)
      })

      it('should update rewards (from total to half supply)', async function () {
        // given
        const totalSupply1 = parseEther('100')
        const balance1 = parseEther('100')
        vsdTOKEN1.totalSupply.returns(totalSupply1)
        vsdTOKEN1.balanceOf.returns(balance1)

        await increaseTimeOfNextBlock(10)
        await rewardDistributor.updateBeforeMintOrBurn(vsdTOKEN1.address, alice.address)
        const tokensAccruedOfUser1 = await rewardDistributor.tokensAccruedOf(alice.address)
        expect(tokensAccruedOfUser1).eq(parseEther('10'))

        // when
        const totalSupply2 = parseEther('100')
        const balance2 = parseEther('50')
        vsdTOKEN1.totalSupply.returns(totalSupply2)
        vsdTOKEN1.balanceOf.returns(balance2)

        await increaseTimeOfNextBlock(10)
        await rewardDistributor.updateBeforeMintOrBurn(vsdTOKEN1.address, alice.address)

        // then
        const tokensAccruedOfUser2 = await rewardDistributor.tokensAccruedOf(alice.address)
        expect(tokensAccruedOfUser2).eq(parseEther('15'))
      })

      it('should update rewards (from half to total supply)', async function () {
        // given
        const totalSupply1 = parseEther('100')
        const balance1 = parseEther('50')
        vsdTOKEN1.totalSupply.returns(totalSupply1)
        vsdTOKEN1.balanceOf.returns(balance1)

        await increaseTimeOfNextBlock(10)
        await rewardDistributor.updateBeforeMintOrBurn(vsdTOKEN1.address, alice.address)
        const tokensAccruedBefore = await rewardDistributor.tokensAccruedOf(alice.address)
        expect(tokensAccruedBefore).eq(parseEther('5'))

        // when
        const totalSupply2 = parseEther('100')
        const balance2 = parseEther('100')
        vsdTOKEN1.totalSupply.returns(totalSupply2)
        vsdTOKEN1.balanceOf.returns(balance2)

        await increaseTimeOfNextBlock(10)
        await rewardDistributor.updateBeforeMintOrBurn(vsdTOKEN1.address, alice.address)

        // then
        const tokensAccruedAfter = await rewardDistributor.tokensAccruedOf(alice.address)
        expect(tokensAccruedAfter).eq(parseEther('15'))
      })
    })

    describe('updateBeforeTransfer', function () {
      it('should update rewards on transfer', async function () {
        // given
        vsdTOKEN1.totalSupply.returns(parseEther('100'))
        const balanceOfAlice1 = parseEther('50')
        const balanceOfBob1 = parseEther('50')
        vsdTOKEN1.balanceOf.whenCalledWith(alice.address).returns(balanceOfAlice1)
        vsdTOKEN1.balanceOf.whenCalledWith(bob.address).returns(balanceOfBob1)

        await increaseTimeOfNextBlock(10)
        await rewardDistributor.updateBeforeTransfer(vsdTOKEN1.address, alice.address, bob.address)

        const aliceTokensAccrued1 = await rewardDistributor.tokensAccruedOf(alice.address)
        const bobTokensAccrued1 = await rewardDistributor.tokensAccruedOf(bob.address)
        expect(aliceTokensAccrued1).eq(parseEther('5'))
        expect(bobTokensAccrued1).eq(parseEther('5'))

        // when
        const balanceOfAlice2 = parseEther('25')
        const balanceOfBob2 = parseEther('75')
        vsdTOKEN1.balanceOf.whenCalledWith(alice.address).returns(balanceOfAlice2)
        vsdTOKEN1.balanceOf.whenCalledWith(bob.address).returns(balanceOfBob2)

        await increaseTimeOfNextBlock(10)
        await rewardDistributor.updateBeforeTransfer(vsdTOKEN1.address, alice.address, bob.address)

        // then
        const aliceTokensAccrued2 = await rewardDistributor.tokensAccruedOf(alice.address)
        const bobTokensAccrued2 = await rewardDistributor.tokensAccruedOf(bob.address)
        expect(aliceTokensAccrued2).eq(parseEther('7.5'))
        expect(bobTokensAccrued2).eq(parseEther('12.5'))
      })
    })
  })

  describe('claiming', function () {
    const speedPerToken = parseEther('1')

    beforeEach(async function () {
      await vsp.mint(rewardDistributor.address, parseEther('1000'))

      await rewardDistributor.updateTokenSpeed(vsdTOKEN1.address, speedPerToken)
      await rewardDistributor.updateTokenSpeed(vsdTOKEN2.address, speedPerToken)
      await rewardDistributor.updateTokenSpeed(debtToken1.address, speedPerToken)
      await rewardDistributor.updateTokenSpeed(debtToken2.address, speedPerToken)

      vsdTOKEN1.totalSupply.returns(0)
      vsdTOKEN1.balanceOf.returns(0)

      vsdTOKEN2.totalSupply.returns(0)
      vsdTOKEN2.balanceOf.returns(0)

      debtToken1.totalSupply.returns(0)
      debtToken1.balanceOf.returns(0)

      debtToken2.totalSupply.returns(0)
      debtToken2.balanceOf.returns(0)

      await ethers.provider.send('evm_setAutomine', [false])

      await rewardDistributor.updateBeforeMintOrBurn(vsdTOKEN1.address, alice.address)
      await rewardDistributor.updateBeforeMintOrBurn(vsdTOKEN1.address, bob.address)

      await rewardDistributor.updateBeforeMintOrBurn(vsdTOKEN2.address, alice.address)
      await rewardDistributor.updateBeforeMintOrBurn(vsdTOKEN2.address, bob.address)

      await rewardDistributor.updateBeforeMintOrBurn(debtToken1.address, alice.address)
      await rewardDistributor.updateBeforeMintOrBurn(debtToken1.address, bob.address)

      await rewardDistributor.updateBeforeMintOrBurn(debtToken2.address, alice.address)
      await rewardDistributor.updateBeforeMintOrBurn(debtToken2.address, bob.address)

      await ethers.provider.send('evm_mine', [])

      vsdTOKEN1.totalSupply.returns(parseEther('100'))
      vsdTOKEN1.balanceOf.whenCalledWith(alice.address).returns(parseEther('50'))
      vsdTOKEN1.balanceOf.whenCalledWith(bob.address).returns(parseEther('50'))

      vsdTOKEN2.totalSupply.returns(parseEther('100'))
      vsdTOKEN2.balanceOf.whenCalledWith(alice.address).returns(parseEther('50'))
      vsdTOKEN2.balanceOf.whenCalledWith(bob.address).returns(parseEther('50'))

      debtToken1.totalSupply.returns(parseEther('100'))
      debtToken1.balanceOf.whenCalledWith(alice.address).returns(parseEther('50'))
      debtToken1.balanceOf.whenCalledWith(bob.address).returns(parseEther('50'))

      debtToken2.totalSupply.returns(parseEther('100'))
      debtToken2.balanceOf.whenCalledWith(alice.address).returns(parseEther('50'))
      debtToken2.balanceOf.whenCalledWith(bob.address).returns(parseEther('50'))

      // Will accrue 1 VSP per token per second (40 VSP in total)
      // Each user (i.e. alice and bob) will accrue 5 VSP per token
      await increaseTimeOfNextBlock(10)
    })

    afterEach(async function () {
      await ethers.provider.send('evm_setAutomine', [true])
    })

    it('claimRewards', async function () {
      // when
      const before = await Promise.all([vsp.balanceOf(alice.address), vsp.balanceOf(bob.address)])
      expect(before).deep.eq([BigNumber.from(0), BigNumber.from(0)])

      await rewardDistributor['claimRewards(address)'](alice.address)
      await rewardDistributor['claimRewards(address)'](bob.address)
      await mineBlock()

      // then
      const after = await Promise.all([vsp.balanceOf(alice.address), vsp.balanceOf(bob.address)])
      expect(after).deep.eq([parseEther('20'), parseEther('20')])
    })

    it('claimRewards(address,address[])', async function () {
      // given
      const before = await vsp.balanceOf(alice.address)
      expect(before).eq(0)

      // when
      await rewardDistributor['claimRewards(address,address[])'](alice.address, [vsdTOKEN1.address, vsdTOKEN2.address])
      await mineBlock()

      // then
      const after = await vsp.balanceOf(alice.address)
      expect(after).eq(parseEther('10'))
    })

    it('claimRewards(address[],address[])', async function () {
      // given
      const before = await Promise.all([vsp.balanceOf(alice.address), vsp.balanceOf(bob.address)])
      expect(before).deep.eq([BigNumber.from(0), BigNumber.from(0)])

      // when
      await rewardDistributor['claimRewards(address[],address[])'](
        [alice.address, bob.address],
        [debtToken1.address, debtToken2.address]
      )
      await mineBlock()

      // then
      const after = await Promise.all([vsp.balanceOf(alice.address), vsp.balanceOf(bob.address)])
      expect(after).deep.eq([parseEther('10'), parseEther('10')])
    })
  })
})
