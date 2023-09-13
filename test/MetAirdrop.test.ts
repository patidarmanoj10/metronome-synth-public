import {Contract} from 'ethers'
import {ethers} from 'hardhat'
import {expect} from 'chai'
import MerkleTree from 'merkletreejs'
import {randomBytes} from 'crypto'
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {loadFixture, time} from '@nomicfoundation/hardhat-network-helpers'
import {parseEther} from 'ethers/lib/utils'
import {IERC20, IESMET, MetAirdrop} from '../typechain'
import {disableForking, enableForking, setTokenBalance} from './helpers'
import Address from '../helpers/address'

type RewardsJson = {
  [key: string]: string
}

const generateLeaf = (account: string, amount: string): Buffer => {
  return Buffer.from(
    // Hash in appropriate Merkle format
    ethers.utils.solidityKeccak256(['address', 'uint256'], [account, amount]).slice(2),
    'hex'
  )
}

const generateTree = (rewards: RewardsJson): MerkleTree => {
  return new MerkleTree(
    // Generate leafs
    Object.entries(rewards).map(([address, amount]) => generateLeaf(ethers.utils.getAddress(address), amount)),
    // Hashing function
    ethers.utils.keccak256,
    {sortPairs: true}
  )
}

describe('MetAirdrop', function () {
  let governor: SignerWithAddress
  let alice: SignerWithAddress
  let bob: SignerWithAddress
  let met: IERC20
  let esMET: IESMET
  let esMET721: Contract
  let airdrop: MetAirdrop
  let rewards0: RewardsJson
  let rewards1: RewardsJson
  let merkleTree0: MerkleTree
  let merkleTree1: MerkleTree
  let merkleRoot0: string
  let merkleRoot1: string

  before(enableForking)

  after(disableForking)

  async function fixture() {
    const airdropFactory = await ethers.getContractFactory('MetAirdrop', governor)
    airdrop = await airdropFactory.deploy()
    await airdrop.deployed()

    met = await ethers.getContractAt('IERC20', await airdrop.MET(), governor)
    esMET = await ethers.getContractAt('IESMET', await airdrop.ESMET(), governor)
    esMET721 = new ethers.Contract(
      Address.ESMET721,
      ['function nextTokenId() external view returns(uint256)'],
      governor
    )

    rewards0 = {
      [alice.address]: parseEther('1').toString(),
      [bob.address]: parseEther('2').toString(),
    }

    rewards1 = {
      [alice.address]: parseEther('3').toString(),
      [bob.address]: parseEther('4').toString(),
    }

    merkleTree0 = generateTree(rewards0)

    merkleTree1 = generateTree(rewards1)

    merkleRoot0 = merkleTree0.getHexRoot()

    merkleRoot1 = merkleTree1.getHexRoot()

    await airdrop.updateMerkleRoot(merkleRoot0, `0x${randomBytes(32).toString('hex')}`)

    await setTokenBalance(met.address, airdrop.address, parseEther('1000'))
  }

  beforeEach(async function () {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[governor, alice, bob] = await ethers.getSigners()

    await loadFixture(fixture)
  })

  describe('claim', function () {
    beforeEach(async function () {
      expect(await met.balanceOf(esMET.address)).eq(0)
    })

    it('should receive MET when claiming after lockPeriod', async function () {
      // given
      const unlockTime = (await airdrop.updatedAt()).add(await airdrop.lockPeriod())
      await time.increaseTo(unlockTime.add(time.duration.days(1)))
      expect(await met.balanceOf(alice.address)).eq(0)

      // when
      const amount = rewards0[alice.address]
      const leaf = generateLeaf(alice.address, amount)
      const proof = merkleTree0.getHexProof(leaf)
      await airdrop.connect(alice).claim(amount, proof)

      // then
      expect(await met.balanceOf(alice.address)).eq(amount)
    })

    it('should claim and lock MET for correct period of time', async function () {
      const id = await esMET721.nextTokenId()
      const expectedUnlockTime = (await airdrop.updatedAt()).add(await airdrop.lockPeriod())

      // when
      const amount = rewards0[alice.address]
      const leaf = generateLeaf(alice.address, amount)
      const proof = merkleTree0.getHexProof(leaf)
      await airdrop.connect(alice).claim(amount, proof)

      // then
      const {unlockTime} = await esMET.positions(id)
      expect(unlockTime).closeTo(expectedUnlockTime, 5)
      expect(await met.balanceOf(esMET.address)).eq(amount)
      expect(await airdrop.claimed(alice.address)).eq(amount)
    })

    it('should receive 1st round amount when claiming on 1st round', async function () {
      // when
      const amount = rewards0[alice.address]
      const leaf = generateLeaf(alice.address, amount)
      const proof = merkleTree0.getHexProof(leaf)
      await airdrop.connect(alice).claim(amount, proof)

      // then
      expect(await met.balanceOf(esMET.address)).eq(amount)
      expect(await airdrop.claimed(alice.address)).eq(amount)
    })

    it('should receive accumulated amount when only claiming on 2st round', async function () {
      // given
      await airdrop.updateMerkleRoot(merkleRoot1, `0x${randomBytes(32).toString('hex')}`)

      // when
      const amount = rewards1[alice.address]
      const leaf = generateLeaf(alice.address, amount)
      const proof = merkleTree1.getHexProof(leaf)
      await airdrop.connect(alice).claim(amount, proof)

      // then
      expect(await met.balanceOf(esMET.address)).eq(amount)
      expect(await airdrop.claimed(alice.address)).eq(amount)
    })

    it('should receive correct rewards when claiming both rounds', async function () {
      // given
      const amount0 = rewards0[alice.address]
      const leaf0 = generateLeaf(alice.address, amount0)
      const proof0 = merkleTree0.getHexProof(leaf0)
      await airdrop.connect(alice).claim(amount0, proof0)
      expect(await airdrop.claimed(alice.address)).eq(amount0)

      // when
      await airdrop.updateMerkleRoot(merkleRoot1, `0x${randomBytes(32).toString('hex')}`)
      const amount1 = rewards1[alice.address]
      const leaf1 = generateLeaf(alice.address, amount1)
      const proof1 = merkleTree1.getHexProof(leaf1)
      await airdrop.connect(alice).claim(amount1, proof1)

      // then
      expect(await airdrop.claimed(alice.address)).eq(amount1)
      expect(await met.balanceOf(esMET.address)).eq(amount1)
    })
  })

  describe('updateMerkleRoot', function () {
    it('should revert if not governor', async function () {
      const tx = airdrop
        .connect(alice)
        .updateMerkleRoot(`0x${randomBytes(32).toString('hex')}`, `0x${randomBytes(32).toString('hex')}`)

      await expect(tx).revertedWithCustomError(airdrop, 'SenderIsNotGovernor')
    })

    it('should revert if new is same as current', async function () {
      // given
      const current = await airdrop.merkleRoot()

      // when
      const tx = airdrop.updateMerkleRoot(current, `0x${randomBytes(32).toString('hex')}`)

      // then
      await expect(tx).revertedWithCustomError(airdrop, 'NewMerkleRootSameAsCurrent')
    })

    it('should revert if proofs file is empty', async function () {
      // given
      const newRoot = `0x${randomBytes(32).toString('hex')}`

      // when
      const tx = airdrop.updateMerkleRoot(newRoot, '0x0000000000000000000000000000000000000000000000000000000000000000')

      // then
      await expect(tx).revertedWithCustomError(airdrop, 'ProofsFileIsNull')
    })

    it('should update merkleRoot', async function () {
      // given
      const newRoot = `0x${randomBytes(32).toString('hex')}`
      expect(await airdrop.merkleRoot()).not.eq(newRoot)

      // when
      await airdrop.updateMerkleRoot(newRoot, `0x${randomBytes(32).toString('hex')}`)

      // given
      expect(await airdrop.merkleRoot()).eq(newRoot)
    })
  })

  describe('updateLockPeriod', function () {
    it('should revert if not governor', async function () {
      const tx = airdrop.connect(alice).updateLockPeriod(0)

      await expect(tx).revertedWithCustomError(airdrop, 'SenderIsNotGovernor')
    })

    it('should update lockPeriod', async function () {
      // given
      const newLockPeriod = ethers.BigNumber.from(`0x${randomBytes(32).toString('hex')}`)
      expect(await airdrop.lockPeriod()).not.eq(newLockPeriod)

      // when
      await airdrop.updateLockPeriod(newLockPeriod)

      // given
      expect(await airdrop.lockPeriod()).eq(newLockPeriod)
    })
  })
})
