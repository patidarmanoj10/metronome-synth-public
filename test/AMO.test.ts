/* eslint-disable camelcase */
import {parseEther} from '@ethersproject/units'
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import chai, {expect} from 'chai'
import {ethers} from 'hardhat'
import {AMO} from '../typechain'
import {FakeContract, smock} from '@defi-wonderland/smock'
import {setStorageAt} from '@nomicfoundation/hardhat-network-helpers'

chai.use(smock.matchers)

describe('AMO', function () {
  let deployer: SignerWithAddress
  let governor: SignerWithAddress
  let keeper: SignerWithAddress
  let alice: SignerWithAddress

  let poolRegistryMock: FakeContract
  let msUSDMock: FakeContract
  let msETHMock: FakeContract
  let vamsUSDMock: FakeContract
  let vamsETHMock: FakeContract
  let amo: AMO

  beforeEach(async function () {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[deployer, governor, keeper, alice] = await ethers.getSigners()

    poolRegistryMock = await smock.fake('PoolRegistry')
    msUSDMock = await smock.fake('SyntheticToken')
    msETHMock = await smock.fake('SyntheticToken')
    vamsUSDMock = await smock.fake('VPoolMock')
    vamsETHMock = await smock.fake('VPoolMock')

    const amoFactory = await ethers.getContractFactory('AMO', deployer)
    amo = await amoFactory.deploy()
    await amo.deployed()
    await setStorageAt(amo.address, 0, 0) // Undo initialization made by constructor
    await amo.initialize(poolRegistryMock.address)

    poolRegistryMock.governor.returns(governor.address)
    msUSDMock.decimals.returns(18)
    msUSDMock.approve.returns(true)

    vamsUSDMock.token.returns(msUSDMock.address)
    vamsUSDMock.pricePerShare.returns(parseEther('1'))

    await amo.connect(governor).updateKeeper(keeper.address)
    await amo.connect(governor).updateVesperPool(msUSDMock.address, vamsUSDMock.address)
  })

  describe('mint and deposit', function () {
    it('should mintAndDeposit', async function () {
      // given
      const amount = parseEther('100')
      msUSDMock.balanceOf.returns(amount)

      // when
      const tx = amo.connect(keeper).mintAndDeposit(msUSDMock.address, vamsUSDMock.address, amount)

      // then
      await expect(tx).emit(amo, 'MintAndDeposit').withArgs(msUSDMock.address, vamsUSDMock.address, amount)
      expect(msUSDMock.mint).to.have.been.calledWith(amo.address, amount)
      expect(vamsUSDMock.deposit).to.have.been.calledWith(amount)
    })

    it('should revert if not authorized', async function () {
      const tx = amo.connect(alice).mintAndDeposit(msUSDMock.address, vamsUSDMock.address, parseEther('10'))
      await expect(tx).revertedWithCustomError(amo, 'CallerIsNotAuthorized')
    })

    it('should revert if input amount is zero', async function () {
      const tx = amo.connect(keeper).mintAndDeposit(msUSDMock.address, vamsUSDMock.address, 0)
      await expect(tx).revertedWithCustomError(amo, 'AmountIsZero')
    })

    it('should revert if vesper pool is not allowed', async function () {
      // given
      await amo.connect(governor).updateVesperPool(msUSDMock.address, ethers.constants.AddressZero)
      expect(await amo.vPools(msUSDMock.address)).eq(ethers.constants.AddressZero)

      // when
      const tx = amo.connect(keeper).mintAndDeposit(msUSDMock.address, vamsUSDMock.address, parseEther('10'))

      // then
      await expect(tx).revertedWithCustomError(amo, 'VesperPoolIsNotAllowed')
    })
  })

  describe('withdraw and burn', function () {
    const amount = parseEther('100')

    it('should withdraw and burn', async function () {
      // given
      msUSDMock.amoSupply.returns(amount)
      // we have shares equal to amount
      vamsUSDMock.balanceOf.whenCalledWith(amo.address).returns(amount)
      // 1st call, index 0, is checking synth before withdraw in solidity. Set it to 0
      // 2nd call, index 1, is checking synth after withdraw
      msUSDMock.balanceOf.returnsAtCall(0, 0)
      msUSDMock.balanceOf.returnsAtCall(1, amount)

      // when withdraw and burn is called
      const tx = amo.connect(keeper).withdrawAndBurn(msUSDMock.address, vamsUSDMock.address, amount)

      // then
      await expect(tx).emit(amo, 'WithdrawAndBurn').withArgs(msUSDMock.address, vamsUSDMock.address, amount)
      expect(vamsUSDMock.withdraw).to.have.been.calledWith(amount)
      expect(msUSDMock.burn).to.have.been.calledWith(amo.address, amount)
    })

    it('should withdraw and burn - when amount to withdraw > vesper pool deposits', async function () {
      // given
      msUSDMock.amoSupply.returns(amount)
      // we have shares equal to amount
      vamsUSDMock.balanceOf.whenCalledWith(amo.address).returns(amount)
      // 1st call, index 0, is checking synth before withdraw in solidity. Set it to 0
      // 2nd call, index 1, is checking synth after withdraw
      msUSDMock.balanceOf.returnsAtCall(0, 0)
      msUSDMock.balanceOf.returnsAtCall(1, amount)

      // when withdraw and burn is called
      const tx = amo.connect(keeper).withdrawAndBurn(msUSDMock.address, vamsUSDMock.address, amount.mul(2))

      // then
      await expect(tx).emit(amo, 'WithdrawAndBurn').withArgs(msUSDMock.address, vamsUSDMock.address, amount)
      expect(vamsUSDMock.withdraw).to.have.been.calledWith(amount)
      expect(msUSDMock.burn).to.have.been.calledWith(amo.address, amount)
    })

    it('should revert if not authorized', async function () {
      const tx = amo.connect(alice).withdrawAndBurn(msUSDMock.address, vamsUSDMock.address, amount)
      await expect(tx).revertedWithCustomError(amo, 'CallerIsNotAuthorized')
    })

    it('should revert if vesper pool is not allowed', async function () {
      // given
      await amo.connect(governor).updateVesperPool(msUSDMock.address, ethers.constants.AddressZero)
      expect(await amo.vPools(msUSDMock.address)).eq(ethers.constants.AddressZero)

      // when
      const tx = amo.connect(keeper).withdrawAndBurn(msUSDMock.address, vamsUSDMock.address, amount)

      // then
      await expect(tx).revertedWithCustomError(amo, 'VesperPoolIsNotAllowed')
    })

    it('should revert if input amount is zero', async function () {
      const tx = amo.connect(keeper).withdrawAndBurn(msUSDMock.address, vamsUSDMock.address, 0)
      await expect(tx).revertedWithCustomError(amo, 'AmountIsZero')
    })
  })

  describe('harvest', function () {
    it('should harvest profit', async function () {
      // given AMO has 150 shares
      const amount = parseEther('150')
      vamsUSDMock.balanceOf.whenCalledWith(amo.address).returns(amount)

      // given amoSupply is 100. This makes profit as 50
      const amoSupply = parseEther('100')
      msUSDMock.amoSupply.returns(amoSupply)
      const profit = amount.sub(amoSupply)

      // 2nd call, index 1, is checking synth after withdraw
      msUSDMock.balanceOf.returnsAtCall(0, 0)
      msUSDMock.balanceOf.returnsAtCall(1, profit)

      // when harvest is called
      const tx = amo.connect(keeper).harvest(msUSDMock.address, vamsUSDMock.address)

      // then
      await expect(tx).emit(amo, 'Harvest').withArgs(msUSDMock.address, vamsUSDMock.address, profit)
      expect(vamsUSDMock.withdraw).to.have.been.calledWith(profit)
      expect(msUSDMock.transfer).to.have.been.calledWith(governor.address, profit)
    })

    it('should revert if caller is not authorized', async function () {
      const tx = amo.connect(alice).harvest(msUSDMock.address, vamsUSDMock.address)
      await expect(tx).revertedWithCustomError(amo, 'CallerIsNotAuthorized')
    })
  })

  describe('sweep', function () {
    it('should revert if caller is not authorized', async function () {
      const tx = amo.connect(keeper).sweep(msUSDMock.address, 1)
      await expect(tx).revertedWithCustomError(amo, 'CallerIsNotGovernor')
    })
  })

  describe('updateKeepers', function () {
    beforeEach(async function () {
      await amo.connect(governor).updateKeeper(keeper.address)
    })

    it('should add keeper', async function () {
      // given
      expect(await amo.isKeeper(alice.address)).to.false
      expect(await amo.getKeepers()).to.deep.eq([])

      // when
      const tx = amo.connect(governor).updateKeeper(alice.address)

      // then
      await expect(tx).emit(amo, 'KeeperUpdated').withArgs(alice.address, 'add')
      expect(await amo.isKeeper(alice.address)).to.true
      expect(await amo.getKeepers()).to.deep.eq([alice.address])
    })

    it('should remove keeper', async function () {
      // given
      await amo.connect(governor).updateKeeper(alice.address)
      expect(await amo.isKeeper(alice.address)).to.true
      expect(await amo.getKeepers()).to.deep.eq([alice.address])

      // when
      const tx = amo.connect(governor).updateKeeper(alice.address)

      // then
      await expect(tx).emit(amo, 'KeeperUpdated').withArgs(alice.address, 'remove')
      expect(await amo.isKeeper(alice.address)).to.false
      expect(await amo.getKeepers()).to.deep.eq([])
    })

    it('should revert if caller is not authorized', async function () {
      const tx = amo.connect(keeper).updateKeeper(alice.address)
      await expect(tx).revertedWithCustomError(amo, 'CallerIsNotGovernor')
    })
  })

  describe('updateVesperPool', function () {
    beforeEach(async function () {
      await amo.connect(governor).updateVesperPool(msUSDMock.address, ethers.constants.AddressZero)
    })

    it('should add vesper pool', async function () {
      // given
      expect(await amo.vPools(msUSDMock.address)).eq(ethers.constants.AddressZero)

      // when
      const tx = amo.connect(governor).updateVesperPool(msUSDMock.address, vamsUSDMock.address)

      // then
      await expect(tx).emit(amo, 'VesperPoolUpdated').withArgs(msUSDMock.address, vamsUSDMock.address)
      expect(await amo.vPools(msUSDMock.address)).eq(vamsUSDMock.address)
    })

    it('should remove vesper pool', async function () {
      // given
      await amo.connect(governor).updateVesperPool(msUSDMock.address, vamsUSDMock.address)
      expect(await amo.vPools(msUSDMock.address)).eq(vamsUSDMock.address)

      // when
      const tx = amo.connect(governor).updateVesperPool(msUSDMock.address, ethers.constants.AddressZero)

      // then
      await expect(tx).emit(amo, 'VesperPoolUpdated').withArgs(msUSDMock.address, ethers.constants.AddressZero)
      expect(await amo.vPools(msUSDMock.address)).eq(ethers.constants.AddressZero)
    })

    it('should revert if caller is not authorized', async function () {
      const tx = amo.connect(keeper).updateVesperPool(msUSDMock.address, vamsUSDMock.address)
      await expect(tx).revertedWithCustomError(amo, 'CallerIsNotGovernor')
    })
  })
})
