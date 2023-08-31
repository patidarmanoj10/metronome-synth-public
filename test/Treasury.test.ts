import {FakeContract, smock} from '@defi-wonderland/smock'
import {parseEther} from '@ethersproject/units'
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {expect} from 'chai'
import {ethers} from 'hardhat'
import {ERC20Mock, PoolRewardsMock, Treasury} from '../typechain'
import {setBalance} from '@nomicfoundation/hardhat-network-helpers'

describe('Treasury', function () {
  let deployer: SignerWithAddress
  let user: SignerWithAddress
  let depositTokenMock: FakeContract
  let poolMock: FakeContract
  let met: ERC20Mock
  let treasury: Treasury

  beforeEach(async function () {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[deployer, user] = await ethers.getSigners()

    const metFactory = await ethers.getContractFactory('ERC20Mock', deployer)
    met = await metFactory.deploy('Metronome', 'MET', 18)
    await met.deployed()

    poolMock = await smock.fake('Pool')
    poolMock.doesDepositTokenExist.returns(true)
    poolMock.governor.returns(deployer.address)

    depositTokenMock = await smock.fake('DepositToken')
    depositTokenMock.underlying.returns(met.address)
    await setBalance(depositTokenMock.address, parseEther('10'))

    const treasuryFactory = await ethers.getContractFactory('Treasury', deployer)
    treasury = await treasuryFactory.deploy()
    await treasury.deployed()
    await treasury.initialize(poolMock.address)

    await met.mint(deployer.address, parseEther('1000'))
  })

  describe('pull', function () {
    beforeEach(async function () {
      const amount = await met.balanceOf(deployer.address)
      await met.transfer(treasury.address, amount)
    })

    it('should revert if not deposit token', async function () {
      poolMock.doesDepositTokenExist.returns(false)
      const tx = treasury.connect(user).pull(user.address, 0)
      await expect(tx).revertedWithCustomError(treasury, 'SenderIsNotDepositToken')
    })

    it('should revert if amount == 0', async function () {
      const tx = treasury.connect(depositTokenMock.wallet).pull(user.address, 0)
      await expect(tx).revertedWithCustomError(treasury, 'AmountIsZero')
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

  describe('claimFromVesper', function () {
    let vPoolMock: FakeContract
    let rewardsMock: PoolRewardsMock
    let token: ERC20Mock

    beforeEach(async function () {
      const erc20Factory = await ethers.getContractFactory('ERC20Mock', deployer)

      token = await erc20Factory.deploy('Token', 'TKN', 18)
      await token.deployed()

      depositTokenMock.underlying.returns(token.address)

      const rewardsMockFactory = await ethers.getContractFactory('PoolRewardsMock', deployer)
      rewardsMock = await rewardsMockFactory.deploy()
      await rewardsMock.deployed()

      vPoolMock = await smock.fake('IVPool')
      vPoolMock.poolRewards.returns(rewardsMock.address)

      await rewardsMock.setRewardTokens([token.address])

      await token.mint(rewardsMock.address, parseEther('10'))
    })

    it('should revert if not governor', async function () {
      const tx = treasury.connect(user).claimFromVesper(vPoolMock.address, user.address)
      await expect(tx).revertedWithCustomError(treasury, 'SenderIsNotGovernor')
    })

    it('should claim and withdraw if non collateral token', async function () {
      // given
      expect(await poolMock.depositTokenOf(token.address)).eq(ethers.constants.AddressZero)
      expect(await token.balanceOf(deployer.address)).eq(0)
      expect(await token.balanceOf(treasury.address)).eq(0)

      // when
      await treasury.claimFromVesper(vPoolMock.address, deployer.address)

      // then
      expect(await token.balanceOf(deployer.address)).eq(parseEther('10'))
    })

    it('should claim and withdraw if collateral token', async function () {
      // given
      poolMock.depositTokenOf.returns(depositTokenMock.address)
      depositTokenMock.totalSupply.returns(parseEther('100'))
      await token.mint(treasury.address, parseEther('100'))
      expect(await token.balanceOf(deployer.address)).eq(0)

      // when
      await treasury.claimFromVesper(vPoolMock.address, deployer.address)

      // then
      expect(await token.balanceOf(deployer.address)).eq(parseEther('10'))
    })
  })
})
