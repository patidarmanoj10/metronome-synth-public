/* eslint-disable camelcase */
import {parseEther} from '@ethersproject/units'
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {expect} from 'chai'
import {ethers} from 'hardhat'
import {
  DepositToken__factory,
  DepositToken,
  ERC20Mock__factory,
  ERC20Mock,
  ControllerMock,
  ControllerMock__factory,
  OracleMock__factory,
  OracleMock,
} from '../typechain'
import {HOUR} from './helpers'

describe('DepositToken', function () {
  let deployer: SignerWithAddress
  let governor: SignerWithAddress
  let user: SignerWithAddress
  let met: ERC20Mock
  let controllerMock: ControllerMock
  let metDepositToken: DepositToken
  let oracle: OracleMock

  const metRate = parseEther('4') // 1 MET = $4

  beforeEach(async function () {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[deployer, governor, user] = await ethers.getSigners()

    const oracleMock = new OracleMock__factory(deployer)
    oracle = <OracleMock>await oracleMock.deploy()
    await oracle.deployed()

    const metMockFactory = new ERC20Mock__factory(deployer)
    met = await metMockFactory.deploy('Metronome', 'MET', 18)
    await met.deployed()

    const depositTokenFactory = new DepositToken__factory(deployer)
    metDepositToken = await depositTokenFactory.deploy()
    await metDepositToken.deployed()

    const controllerMockFactory = new ControllerMock__factory(deployer)
    controllerMock = await controllerMockFactory.deploy(metDepositToken.address, oracle.address)
    await controllerMock.deployed()

    await metDepositToken.initialize(met.address, controllerMock.address, oracle.address, 'vSynth-MET', 18)
    await metDepositToken.transferGovernorship(governor.address)
    await metDepositToken.connect(governor).acceptGovernorship()
    metDepositToken = metDepositToken.connect(governor)

    await oracle.updateRate(met.address, metRate)
  })

  describe('mint', function () {
    it('should mint', async function () {
      // given
      expect(await metDepositToken.balanceOf(user.address)).eq(0)
      expect(await metDepositToken.lastDepositOf(user.address)).eq(0)

      // when
      const amount = parseEther('100')

      const call = metDepositToken.interface.encodeFunctionData('mint', [user.address, amount])

      await controllerMock.mockCall(metDepositToken.address, call)

      // then
      expect(await metDepositToken.balanceOf(user.address)).eq(amount)
      const lastBlock = await ethers.provider.getBlock('latest')
      expect(await metDepositToken.lastDepositOf(user.address)).eq(lastBlock.timestamp)
    })

    it('should revert if surpass max total supply', async function () {
      // given
      expect(await metDepositToken.totalSupply()).eq(0)
      const maxInUsd = parseEther('400') // 100 MET
      await metDepositToken.updateMaxTotalSupplyInUsd(maxInUsd)

      // when
      const amount = parseEther('101') // $404
      const call = metDepositToken.interface.encodeFunctionData('mint', [user.address, amount])
      const tx = controllerMock.mockCall(metDepositToken.address, call)

      // then
      await expect(tx).revertedWith('surpass-max-total-supply')
    })

    it('should revert if not controller', async function () {
      const tx = metDepositToken.connect(user).mint(user.address, parseEther('10'))
      await expect(tx).revertedWith('not-controller')
    })
  })

  describe('when user has some balance', function () {
    const amount = parseEther('100')

    beforeEach(async function () {
      const call = metDepositToken.interface.encodeFunctionData('mint', [user.address, amount])
      await controllerMock.mockCall(metDepositToken.address, call)
      expect(await metDepositToken.balanceOf(user.address)).eq(amount)
    })

    describe('burnFromUnlocked', function () {
      it('should revert if not controller', async function () {
        const tx = metDepositToken.connect(user).burnFromUnlocked(user.address, parseEther('10'))
        await expect(tx).revertedWith('not-controller')
      })

      it('should revert if amount > free amount', async function () {
        // given
        const {_unlockedDepositInUsd} = await controllerMock.debtPositionOf(user.address)
        const _unlockedDeposit = await oracle.convertFromUsd(met.address, _unlockedDepositInUsd)

        // when
        const call = metDepositToken.interface.encodeFunctionData('burnFromUnlocked', [
          deployer.address,
          _unlockedDeposit.add('1'),
        ])
        const tx = controllerMock.mockCall(metDepositToken.address, call)

        // then
        await expect(tx).revertedWith('not-enough-free-balance')
      })

      it('should burn if amount <= free amount', async function () {
        // given
        const {_unlockedDepositInUsd} = await controllerMock.debtPositionOf(user.address)
        const _unlockedDeposit = await oracle.convertFromUsd(met.address, _unlockedDepositInUsd)
        expect(await metDepositToken.balanceOf(user.address)).eq(amount)

        // when
        const call = metDepositToken.interface.encodeFunctionData('burnFromUnlocked', [user.address, _unlockedDeposit])
        await controllerMock.mockCall(metDepositToken.address, call)

        // then
        expect(await metDepositToken.balanceOf(user.address)).eq(amount.sub(_unlockedDeposit))
      })
    })

    describe('burnForWithdraw', function () {
      it('should revert if not controller', async function () {
        const tx = metDepositToken.connect(user).burnForWithdraw(user.address, parseEther('10'))
        await expect(tx).revertedWith('not-controller')
      })

      it('should revert if minimum deposit time have not passed', async function () {
        // given
        await metDepositToken.connect(governor).updateMinDepositTime(HOUR)

        // when
        const call = metDepositToken.interface.encodeFunctionData('burnForWithdraw', [user.address, parseEther('10')])
        const tx = controllerMock.mockCall(metDepositToken.address, call)

        // then
        await expect(tx).revertedWith('min-deposit-time-have-not-passed')
      })

      it('should revert if amount > free amount', async function () {
        // given
        const {_unlockedDepositInUsd} = await controllerMock.debtPositionOf(user.address)
        const _unlockedDeposit = await oracle.convertFromUsd(met.address, _unlockedDepositInUsd)

        // when
        const call = metDepositToken.interface.encodeFunctionData('burnForWithdraw', [
          user.address,
          _unlockedDeposit.add('1'),
        ])
        const tx = controllerMock.mockCall(metDepositToken.address, call)

        // then
        await expect(tx).revertedWith('not-enough-free-balance')
      })

      it('should burn if amount <= free amount', async function () {
        // given
        const {_unlockedDepositInUsd} = await controllerMock.debtPositionOf(user.address)
        const _unlockedDeposit = await oracle.convertFromUsd(met.address, _unlockedDepositInUsd)
        expect(await metDepositToken.balanceOf(user.address)).eq(amount)

        // when
        const call = metDepositToken.interface.encodeFunctionData('burnForWithdraw', [user.address, _unlockedDeposit])
        await controllerMock.mockCall(metDepositToken.address, call)

        // then
        expect(await metDepositToken.balanceOf(user.address)).eq(amount.sub(_unlockedDeposit))
      })
    })

    describe('burn', function () {
      it('should burn', async function () {
        const call = metDepositToken.interface.encodeFunctionData('burn', [user.address, amount])
        await controllerMock.mockCall(metDepositToken.address, call)
        expect(await metDepositToken.balanceOf(user.address)).eq(0)
      })

      it('should revert if not controller', async function () {
        const tx = metDepositToken.connect(user).burn(user.address, parseEther('10'))
        await expect(tx).revertedWith('not-controller')
      })
    })

    describe('transfer', function () {
      it('should transfer if amount <= free amount', async function () {
        const {_unlockedDepositInUsd} = await controllerMock.debtPositionOf(user.address)
        const _unlockedDeposit = await oracle.convertFromUsd(met.address, _unlockedDepositInUsd)
        expect(await metDepositToken.balanceOf(user.address)).eq(amount)
        await metDepositToken.connect(user).transfer(deployer.address, _unlockedDeposit)
        expect(await metDepositToken.balanceOf(user.address)).eq(amount.sub(_unlockedDeposit))
      })

      it('should revert if minimum deposit time have not passed', async function () {
        // given
        await metDepositToken.connect(governor).updateMinDepositTime(HOUR)

        // when
        const {_unlockedDepositInUsd} = await controllerMock.debtPositionOf(user.address)
        const _unlockedDeposit = await oracle.convertFromUsd(met.address, _unlockedDepositInUsd)
        const tx = metDepositToken.connect(user).transfer(deployer.address, _unlockedDeposit)

        // then
        await expect(tx).revertedWith('min-deposit-time-have-not-passed')
      })

      it('should revert if amount > free amount', async function () {
        const {_unlockedDepositInUsd} = await controllerMock.debtPositionOf(user.address)
        const _unlockedDeposit = await oracle.convertFromUsd(met.address, _unlockedDepositInUsd)
        const tx = metDepositToken.connect(user).transfer(deployer.address, _unlockedDeposit.add('1'))
        await expect(tx).revertedWith('not-enough-free-balance')
      })
    })

    describe('transferFrom', function () {
      beforeEach(async function () {
        await metDepositToken.connect(user).approve(deployer.address, ethers.constants.MaxUint256)
      })

      it('should transfer if amount <= free amount', async function () {
        const {_unlockedDepositInUsd} = await controllerMock.debtPositionOf(user.address)
        const _unlockedDeposit = await oracle.convertFromUsd(met.address, _unlockedDepositInUsd)
        expect(await metDepositToken.balanceOf(user.address)).eq(amount)
        await metDepositToken.connect(deployer).transferFrom(user.address, deployer.address, _unlockedDeposit)
        expect(await metDepositToken.balanceOf(user.address)).eq(amount.sub(_unlockedDeposit))
      })

      it('should revert if minimum deposit time have not passed', async function () {
        // given
        await metDepositToken.connect(governor).updateMinDepositTime(HOUR)

        // when
        const {_unlockedDepositInUsd} = await controllerMock.debtPositionOf(user.address)
        const _unlockedDeposit = await oracle.convertFromUsd(met.address, _unlockedDepositInUsd)
        const tx = metDepositToken.connect(deployer).transferFrom(user.address, deployer.address, _unlockedDeposit)

        // then
        await expect(tx).revertedWith('min-deposit-time-have-not-passed')
      })

      it('should revert if amount > free amount', async function () {
        const {_unlockedDepositInUsd} = await controllerMock.debtPositionOf(user.address)
        const _unlockedDeposit = await oracle.convertFromUsd(met.address, _unlockedDepositInUsd)
        const tx = metDepositToken
          .connect(deployer)
          .transferFrom(user.address, deployer.address, _unlockedDeposit.add('1'))
        await expect(tx).revertedWith('not-enough-free-balance')
      })
    })

    describe('seize', function () {
      it('should revert if not controller', async function () {
        const tx = metDepositToken.connect(user).seize(user.address, deployer.address, parseEther('10'))
        await expect(tx).revertedWith('not-controller')
      })

      it('should seize tokens', async function () {
        const amountToSeize = parseEther('10')

        const call = metDepositToken.interface.encodeFunctionData('seize', [
          user.address,
          deployer.address,
          amountToSeize,
        ])
        const tx = () => controllerMock.mockCall(metDepositToken.address, call)

        await expect(tx).changeTokenBalances(
          metDepositToken,
          [user, deployer],
          [amountToSeize.mul('-1'), amountToSeize]
        )
      })
    })
  })
})
