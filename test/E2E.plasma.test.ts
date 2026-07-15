/* eslint-disable max-len */
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {expect} from 'chai'
import hre, {ethers} from 'hardhat'
import {loadFixture} from '@nomicfoundation/hardhat-network-helpers'
import {parseEther} from '../helpers'
import {impersonateAccount, setTokenBalance, disableForking, enableForking} from './helpers'
import {SyntheticToken, PoolRegistry, ProxyOFT} from '../typechain'
import {address as POOL_REGISTRY_ADDRESS} from '../deployments/plasma/PoolRegistry.json'
import {address as MSUSD_SYNTHETIC_ADDRESS} from '../deployments/plasma/MsUSDSynthetic.json'
import {address as MSUSD_PROXYOFT_ADDRESS} from '../deployments/plasma/MsUSDProxyOFT.json'

const isNodeHardhat = hre.network.name === 'hardhat'

/**
 * The goal of this test suite is to test current state of the base's contracts
 * Note: When we have on-going changes the TypesChain types may be different than the deployed contracts
 * For these cases, use `new ethers.Contract()` instead and amend ABI manually
 */
describe.skip('E2E tests (plasma)', function () {
  let alice: SignerWithAddress
  let poolRegistry: PoolRegistry
  let msUSD: SyntheticToken
  let msUSDProxyOFT: ProxyOFT

  if (isNodeHardhat) {
    before(async function () {
      await enableForking('plasma')
    })

    after(disableForking)
  }

  async function fixture() {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[, alice] = await ethers.getSigners()

    poolRegistry = await ethers.getContractAt('PoolRegistry', POOL_REGISTRY_ADDRESS, alice)

    msUSD = await ethers.getContractAt('SyntheticToken', MSUSD_SYNTHETIC_ADDRESS, alice)

    msUSDProxyOFT = await ethers.getContractAt('ProxyOFT', MSUSD_PROXYOFT_ADDRESS, alice)
  }

  beforeEach(async function () {
    await loadFixture(fixture)

    if (process.env.DEPLOYER) {
      // See more: https://github.com/wighawag/hardhat-deploy/issues/152#issuecomment-1402298376
      await impersonateAccount(process.env.DEPLOYER)
    }
  })

  describe('initial setup', function () {
    it('should have correct addresses', async function () {
      expect(MSUSD_SYNTHETIC_ADDRESS).eq(await msUSDProxyOFT.token())
      expect(MSUSD_PROXYOFT_ADDRESS).eq(await msUSD.proxyOFT())
    })
  })

  describe('synth mainnet end to end sanity tests', function () {
    describe('cross-chain operations', function () {
      const LZ_OPTIMISM_ID = 111

      it('should transfer msUSD to another chain', async function () {
        // given
        const amount = parseEther('100')

        await setTokenBalance(msUSD.address, alice.address, amount)
        expect(await msUSD.balanceOf(alice.address)).eq(amount)

        // when
        await msUSDProxyOFT['sendFrom(address,uint16,address,uint256)'](
          alice.address,
          LZ_OPTIMISM_ID,
          alice.address,
          amount,
          {
            value: parseEther('0.5'),
          }
        )

        // then
        expect(await msUSD.balanceOf(alice.address)).eq(0)
      })
    })
  })
})
