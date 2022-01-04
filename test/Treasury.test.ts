/* eslint-disable camelcase */
import {parseEther} from '@ethersproject/units'
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {expect} from 'chai'
import {ethers} from 'hardhat'
import {ERC20Mock, ERC20Mock__factory, Treasury, Treasury__factory} from '../typechain'

describe('Treasury', function () {
  let deployer: SignerWithAddress
  let user: SignerWithAddress
  let issuerMock: SignerWithAddress
  let met: ERC20Mock
  let treasury: Treasury

  beforeEach(async function () {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[deployer, user, issuerMock] = await ethers.getSigners()

    const metFactory = new ERC20Mock__factory(deployer)
    met = await metFactory.deploy('Metronome', 'MET', 18)
    await met.deployed()

    const treasuryFactory = new Treasury__factory(deployer)
    treasury = await treasuryFactory.deploy()
    await treasury.deployed()
    await treasury.initialize(issuerMock.address)

    await met.mint(deployer.address, parseEther('1000'))
  })

  describe('pull', function () {
    beforeEach(async function () {
      const amount = await met.balanceOf(deployer.address)
      await met.transfer(treasury.address, amount)
    })

    it('should revert if not issuer', async function () {
      const tx = treasury.connect(user).pull(met.address, user.address, 0)
      await expect(tx).to.revertedWith('not-issuer')
    })

    it('should revert if amount == 0', async function () {
      const tx = treasury.connect(issuerMock).pull(met.address, user.address, 0)
      await expect(tx).to.revertedWith('amount-is-zero')
    })

    it('should pull MET tokens ', async function () {
      // when
      const amount = parseEther('10')
      expect(amount).to.lte(await met.balanceOf(treasury.address))
      const tx = () => treasury.connect(issuerMock).pull(met.address, user.address, amount)

      // then
      await expect(tx).to.changeTokenBalances(met, [treasury, user], [amount.mul('-1'), amount])
    })
  })
})
