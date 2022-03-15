/* eslint-disable camelcase */
import {FakeContract, smock} from '@defi-wonderland/smock'
import {parseEther} from '@ethersproject/units'
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {expect} from 'chai'
import {ethers} from 'hardhat'
import {ERC20Mock, ERC20Mock__factory, Treasury, Treasury__factory} from '../typechain'
import {setEtherBalance} from './helpers'

describe('Treasury', function () {
  let deployer: SignerWithAddress
  let user: SignerWithAddress
  let depositTokenMock: FakeContract
  let controllerMock: FakeContract
  let met: ERC20Mock
  let treasury: Treasury

  beforeEach(async function () {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[deployer, user] = await ethers.getSigners()

    const metFactory = new ERC20Mock__factory(deployer)
    met = await metFactory.deploy('Metronome', 'MET', 18)
    await met.deployed()

    controllerMock = await smock.fake('Controller')
    controllerMock.isDepositTokenExists.returns(true)

    depositTokenMock = await smock.fake('DepositToken')
    depositTokenMock.underlying.returns(met.address)
    await setEtherBalance(depositTokenMock.address, parseEther('10'))

    const treasuryFactory = new Treasury__factory(deployer)
    treasury = await treasuryFactory.deploy()
    await treasury.deployed()
    await treasury.initialize(controllerMock.address)

    await met.mint(deployer.address, parseEther('1000'))
  })

  describe('pull', function () {
    beforeEach(async function () {
      const amount = await met.balanceOf(deployer.address)
      await met.transfer(treasury.address, amount)
    })

    it('should revert if not deposit token', async function () {
      controllerMock.isDepositTokenExists.returns(false)
      const tx = treasury.connect(user).pull(user.address, 0)
      await expect(tx).revertedWith('not-deposit-token')
    })

    it('should revert if amount == 0', async function () {
      const tx = treasury.connect(depositTokenMock.wallet).pull(user.address, 0)
      await expect(tx).revertedWith('amount-is-zero')
    })

    it('should pull MET tokens ', async function () {
      // when
      const amount = parseEther('10')
      expect(amount).lte(await met.balanceOf(treasury.address))
      const tx = () => treasury.connect(depositTokenMock.wallet).pull(user.address, amount)

      // then
      await expect(tx).changeTokenBalances(met, [treasury, user], [amount.mul('-1'), amount])
    })
  })
})
