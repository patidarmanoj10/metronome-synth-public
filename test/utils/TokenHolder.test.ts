/* eslint-disable camelcase */
import {parseEther} from '@ethersproject/units'
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {expect} from 'chai'
import {ethers} from 'hardhat'
import {TokenHolderMock__factory, TokenHolderMock, ERC20Mock, ERC20Mock__factory} from '../../typechain'

describe('TokenHolder', function () {
  let deployer: SignerWithAddress
  let sweeper: SignerWithAddress
  let user: SignerWithAddress
  let tokenHolder: TokenHolderMock
  let tokenMock: ERC20Mock

  beforeEach(async function () {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[deployer, sweeper, user] = await ethers.getSigners()
    const tokenHolderFactory = new TokenHolderMock__factory(deployer)
    tokenHolder = await tokenHolderFactory.deploy(sweeper.address)

    const erc20MockFactory = new ERC20Mock__factory(deployer)
    tokenMock = await erc20MockFactory.deploy('Name', 'SYMBOL', 18)
    await tokenMock.deployed()
  })

  describe('sweep', function () {
    const amount = parseEther('10')

    beforeEach(async function () {
      await tokenHolder.toggleAcceptETH()
      expect(await tokenHolder.acceptETH()).eq(true)
      await tokenMock.mint(tokenHolder.address, amount)
      await deployer.sendTransaction({to: tokenHolder.address, value: amount})
    })

    it('should revert if caller is not sweeper', async function () {
      const tx = tokenHolder.connect(user).sweep(tokenMock.address, user.address, amount)
      await expect(tx).reverted
    })

    it('should release token from contract', async function () {
      const tx = () => tokenHolder.connect(sweeper).sweep(tokenMock.address, user.address, amount)
      await expect(tx).changeTokenBalance(tokenMock, user, amount)
    })

    it('should sweep ETH', async function () {
      const tx = () => tokenHolder.connect(sweeper).sweep(ethers.constants.AddressZero, user.address, amount)
      await expect(tx).changeEtherBalance(user, amount)
    })
  })
})
