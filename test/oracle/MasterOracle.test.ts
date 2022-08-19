/* eslint-disable camelcase */
import {parseEther, parseUnits} from '@ethersproject/units'
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {expect} from 'chai'
import {ethers} from 'hardhat'
import {
  ERC20Mock__factory,
  ERC20Mock,
  MasterOracle,
  MasterOracle__factory,
  DefaultOracleMock__factory,
  DefaultOracleMock,
} from '../../typechain'
import {toUSD} from '../../helpers'

const {AddressZero} = ethers.constants

const btcPrice = toUSD('40000') // 1 BTC : $40,000
const ethPrice = toUSD('4000') // 1 ETH : $4,000

const ONE_BTC = parseUnits('1', 8)
const ONE_ETH = parseEther('1')

describe('MasterOracle', function () {
  let deployer: SignerWithAddress
  let user: SignerWithAddress
  let masterOracle: MasterOracle
  let defaultOracle: DefaultOracleMock
  let btcOracle: DefaultOracleMock
  let msDOGE: ERC20Mock
  let msETH: ERC20Mock
  let msBTC: ERC20Mock

  beforeEach(async function () {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[deployer, user] = await ethers.getSigners()

    const erc20MockFactory = new ERC20Mock__factory(deployer)
    const defaultOracleMockFactory = new DefaultOracleMock__factory(deployer)

    msETH = await erc20MockFactory.deploy('msETH', 'msETH', 18)
    await msETH.deployed()

    msBTC = await erc20MockFactory.deploy('msBTC', 'msBTC', 8)
    await msBTC.deployed()

    msDOGE = await erc20MockFactory.deploy('msDOGE', 'msDOGE', 18)
    await msDOGE.deployed()

    defaultOracle = await defaultOracleMockFactory.deploy()
    await defaultOracle.deployed()

    btcOracle = await defaultOracleMockFactory.deploy()
    await btcOracle.deployed()

    const masterOracleFactory = new MasterOracle__factory(deployer)
    masterOracle = await masterOracleFactory.deploy()
    await masterOracle.deployed()
    await masterOracle.initialize([msBTC.address], [btcOracle.address], defaultOracle.address)

    await btcOracle.updatePrice(msBTC.address, btcPrice)
    await defaultOracle.updatePrice(msETH.address, ethPrice)
  })

  describe('addOrUpdate', function () {
    it('should revert if not governor', async function () {
      const tx = masterOracle.connect(user).addOrUpdate([msDOGE.address], [defaultOracle.address])
      await expect(tx).revertedWith('not-governor')
    })

    it('should revert if arrays have invalid length', async function () {
      const tx1 = masterOracle.addOrUpdate([msDOGE.address, msBTC.address], [defaultOracle.address])
      await expect(tx1).revertedWith('invalid-arrays-length')

      const tx2 = masterOracle.addOrUpdate([], [])
      await expect(tx2).revertedWith('invalid-arrays-length')
    })

    it('should revert an asset is null', async function () {
      const tx1 = masterOracle.addOrUpdate([AddressZero], [defaultOracle.address])
      await expect(tx1).revertedWith('an-asset-has-null-address')
    })

    it('should add new oracle', async function () {
      // given
      expect(await masterOracle.oracles(msDOGE.address)).eq(AddressZero)

      // when
      const tx = masterOracle.addOrUpdate([msDOGE.address], [defaultOracle.address])

      // then
      await expect(tx).emit(masterOracle, 'OracleUpdated').withArgs(msDOGE.address, AddressZero, defaultOracle.address)
      expect(await masterOracle.oracles(msDOGE.address)).eq(defaultOracle.address)
    })

    it('should update an oracle', async function () {
      // given
      expect(await masterOracle.oracles(msBTC.address)).eq(btcOracle.address)

      // when
      const tx = masterOracle.addOrUpdate([msBTC.address], [defaultOracle.address])

      // then
      await expect(tx)
        .emit(masterOracle, 'OracleUpdated')
        .withArgs(msBTC.address, btcOracle.address, defaultOracle.address)
      expect(await masterOracle.oracles(msBTC.address)).eq(defaultOracle.address)
    })

    it('should remove an oracle (i.e. set zero address)', async function () {
      // given
      expect(await masterOracle.oracles(msBTC.address)).eq(btcOracle.address)

      // when
      const tx = masterOracle.addOrUpdate([msBTC.address], [AddressZero])

      // then
      await expect(tx).emit(masterOracle, 'OracleUpdated').withArgs(msBTC.address, btcOracle.address, AddressZero)
      expect(await masterOracle.oracles(msBTC.address)).eq(AddressZero)
    })
  })

  describe('setDefaultOracle', function () {
    it('should revert if not governor', async function () {
      const tx = masterOracle.connect(user).setDefaultOracle(btcOracle.address)
      await expect(tx).revertedWith('not-governor')
    })

    it('should revert if setting same address as current', async function () {
      const current = await masterOracle.defaultOracle()
      const tx = masterOracle.setDefaultOracle(current)
      await expect(tx).revertedWith('new-oracle-is-same-as-current')
    })

    it('should update the default oracle', async function () {
      const tx = masterOracle.setDefaultOracle(btcOracle.address)
      await expect(tx).emit(masterOracle, 'DefaultOracleUpdated').withArgs(defaultOracle.address, btcOracle.address)
    })

    it('should remove the default oracle', async function () {
      const tx = masterOracle.setDefaultOracle(AddressZero)
      await expect(tx).emit(masterOracle, 'DefaultOracleUpdated').withArgs(defaultOracle.address, AddressZero)
    })
  })

  describe('quoteTokenToUsd', function () {
    // eslint-disable-next-line quotes
    it("should convert using assets's oracle", async function () {
      // given

      expect(await masterOracle.oracles(msBTC.address)).eq(btcOracle.address)

      // when
      const amountIn = ONE_BTC
      const amountOut = await masterOracle.quoteTokenToUsd(msBTC.address, amountIn)

      // then
      const expectedAmountOut = await btcOracle.getPriceInUsd(msBTC.address)
      expect(amountOut).eq(expectedAmountOut)
    })

    it('should convert using the default oracle', async function () {
      // given
      expect(await masterOracle.oracles(msETH.address)).eq(AddressZero)

      // when
      const amountIn = ONE_ETH
      const amountOut = await masterOracle.quoteTokenToUsd(msETH.address, amountIn)

      // then
      const expectedAmountOut = await defaultOracle.getPriceInUsd(msETH.address)
      expect(amountOut).eq(expectedAmountOut)
    })

    it('should revert if there is no default oracle and asset has no oracle', async function () {
      await masterOracle.setDefaultOracle(AddressZero)
      const tx = masterOracle.quoteTokenToUsd(msDOGE.address, parseEther('1'))
      await expect(tx).revertedWith('asset-without-oracle')
    })

    it('should convert to from minimum ETH amount (1 wei)', async function () {
      const amountIn = '1'
      const amountOut = await masterOracle.quoteTokenToUsd(msETH.address, amountIn)
      expect(amountOut).eq(ethPrice.div(toUSD('1')))
    })
  })

  describe('quoteUsdToToken', function () {
    // eslint-disable-next-line quotes
    it("should convert using assets's oracle", async function () {
      // given
      expect(await masterOracle.oracles(msBTC.address)).eq(btcOracle.address)

      // when
      const amountIn = await btcOracle.getPriceInUsd(msBTC.address)
      const amountOut = await masterOracle.quoteUsdToToken(msBTC.address, amountIn)

      // then
      expect(amountOut).eq(ONE_BTC)
    })

    it('should convert using the default oracle', async function () {
      // given
      expect(await masterOracle.oracles(msETH.address)).eq(AddressZero)

      // when
      const amountIn = await defaultOracle.getPriceInUsd(msETH.address)
      const amountOut = await masterOracle.quoteUsdToToken(msETH.address, amountIn)

      // then
      expect(amountOut).eq(ONE_ETH)
    })

    it('should revert if  there is no default oracle and asset has no oracle', async function () {
      await masterOracle.setDefaultOracle(AddressZero)
      const tx = masterOracle.quoteUsdToToken(msDOGE.address, parseEther('1'))
      await expect(tx).revertedWith('asset-without-oracle')
    })

    it('should convert from minimum USD amount ($1 wei)', async function () {
      const amountIn = '1'
      const amountOut = await masterOracle.quoteUsdToToken(msETH.address, amountIn)
      expect(amountOut).eq(parseEther('1').div(ethPrice))
    })
  })

  describe('convert', function () {
    // eslint-disable-next-line quotes
    it("should convert using assets' oracles", async function () {
      // when
      const amountIn = ONE_BTC
      const amountOut = await masterOracle.quote(msBTC.address, msETH.address, amountIn)

      // then
      const expectedAmountOut = btcPrice.mul(parseEther('1')).div(ethPrice)
      expect(amountOut).eq(expectedAmountOut)
    })

    it('should revert if  there is no default oracle and one asset has no oracle', async function () {
      await masterOracle.setDefaultOracle(AddressZero)
      const tx = masterOracle.quote(msDOGE.address, msBTC.address, parseEther('1'))
      await expect(tx).revertedWith('asset-without-oracle')
    })
  })
})
