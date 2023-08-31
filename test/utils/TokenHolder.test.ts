import {parseEther} from '@ethersproject/units'
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {expect} from 'chai'
import {ethers} from 'hardhat'
import {TokenHolderMock, ERC20Mock} from '../../typechain'

describe('TokenHolder', function () {
  let deployer: SignerWithAddress
  let sweeper: SignerWithAddress
  let user: SignerWithAddress
  let tokenHolder: TokenHolderMock
  let tokenMock: ERC20Mock

  beforeEach(async function () {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[deployer, sweeper, user] = await ethers.getSigners()
    const tokenHolderFactory = await ethers.getContractFactory('TokenHolderMock', deployer)
    tokenHolder = await tokenHolderFactory.deploy(sweeper.address)

    const erc20MockFactory = await ethers.getContractFactory('ERC20Mock', deployer)
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
