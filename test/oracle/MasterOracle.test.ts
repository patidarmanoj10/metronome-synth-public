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

const {AddressZero} = ethers.constants

const btcPrice = parseUnits('40000', 8) // 1 BTC : $40,000
const ethPrice = parseUnits('4000', 8) // 1 ETH : $4,000

const ONE_BTC = parseUnits('1', 8)
const ONE_ETH = parseEther('1')

describe('MasterOracle', function () {
  let deployer: SignerWithAddress
  let user: SignerWithAddress
  let masterOracle: MasterOracle
  let defaultOracle: DefaultOracleMock
  let btcOracle: DefaultOracleMock
  let vsDOGE: ERC20Mock
  let vsETH: ERC20Mock
  let vsBTC: ERC20Mock

  beforeEach(async function () {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[deployer, user] = await ethers.getSigners()

    const erc20MockFactory = new ERC20Mock__factory(deployer)
    const defaultOracleMockFactory = new DefaultOracleMock__factory(deployer)

    vsETH = await erc20MockFactory.deploy('vsETH', 'vsETH', 18)
    await vsETH.deployed()

    vsBTC = await erc20MockFactory.deploy('vsBTC', 'vsBTC', 8)
    await vsBTC.deployed()

    vsDOGE = await erc20MockFactory.deploy('vsDOGE', 'vsDOGE', 18)
    await vsDOGE.deployed()

    defaultOracle = await defaultOracleMockFactory.deploy()
    await defaultOracle.deployed()

    btcOracle = await defaultOracleMockFactory.deploy()
    await btcOracle.deployed()

    const masterOracleFactory = new MasterOracle__factory(deployer)
    masterOracle = await masterOracleFactory.deploy()
    await masterOracle.deployed()
    await masterOracle.initialize([vsBTC.address], [btcOracle.address], defaultOracle.address)

    await btcOracle.updateRate(vsBTC.address, btcPrice)
    await defaultOracle.updateRate(vsETH.address, ethPrice)
  })

  describe('addOrUpdate', function () {
    it('should revert if not governor', async function () {
      const tx = masterOracle.connect(user).addOrUpdate([vsDOGE.address], [defaultOracle.address])
      await expect(tx).revertedWith('not-governor')
    })

    it('should revert if arrays have invalid length', async function () {
      const tx1 = masterOracle.addOrUpdate([vsDOGE.address, vsBTC.address], [defaultOracle.address])
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
      expect(await masterOracle.oracles(vsDOGE.address)).eq(AddressZero)

      // when
      const tx = masterOracle.addOrUpdate([vsDOGE.address], [defaultOracle.address])

      // then
      await expect(tx).emit(masterOracle, 'OracleUpdated').withArgs(vsDOGE.address, AddressZero, defaultOracle.address)
      expect(await masterOracle.oracles(vsDOGE.address)).eq(defaultOracle.address)
    })

    it('should update an oracle', async function () {
      // given
      expect(await masterOracle.oracles(vsBTC.address)).eq(btcOracle.address)

      // when
      const tx = masterOracle.addOrUpdate([vsBTC.address], [defaultOracle.address])

      // then
      await expect(tx)
        .emit(masterOracle, 'OracleUpdated')
        .withArgs(vsBTC.address, btcOracle.address, defaultOracle.address)
      expect(await masterOracle.oracles(vsBTC.address)).eq(defaultOracle.address)
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

  describe('convertToUsd', function () {
    // eslint-disable-next-line quotes
    it("should convert using assets's oracle", async function () {
      // given

      expect(await masterOracle.oracles(vsBTC.address)).eq(btcOracle.address)

      // when
      const amountIn = ONE_BTC
      const amountOut = await masterOracle.convertToUsd(vsBTC.address, amountIn)

      // then
      const expectedAmountOut = await btcOracle.getPriceInUsd(vsBTC.address)
      expect(amountOut).eq(expectedAmountOut)
    })

    it('should convert using the default oracle', async function () {
      // given
      expect(await masterOracle.oracles(vsETH.address)).eq(AddressZero)

      // when
      const amountIn = ONE_ETH
      const amountOut = await masterOracle.convertToUsd(vsETH.address, amountIn)

      // then
      const expectedAmountOut = await defaultOracle.getPriceInUsd(vsETH.address)
      expect(amountOut).eq(expectedAmountOut)
    })

    it('should revert if there is no default oracle and asset has no oracle', async function () {
      await masterOracle.setDefaultOracle(AddressZero)
      const tx = masterOracle.convertToUsd(vsDOGE.address, parseEther('1'))
      await expect(tx).revertedWith('asset-without-oracle')
    })
  })

  describe('convertFromUsd', function () {
    // eslint-disable-next-line quotes
    it("should convert using assets's oracle", async function () {
      // given
      expect(await masterOracle.oracles(vsBTC.address)).eq(btcOracle.address)

      // when
      const amountIn = await btcOracle.getPriceInUsd(vsBTC.address)
      const amountOut = await masterOracle.convertFromUsd(vsBTC.address, amountIn)

      // then
      expect(amountOut).eq(ONE_BTC)
    })

    it('should convert using the default oracle', async function () {
      // given
      expect(await masterOracle.oracles(vsETH.address)).eq(AddressZero)

      // when
      const amountIn = await defaultOracle.getPriceInUsd(vsETH.address)
      const amountOut = await masterOracle.convertFromUsd(vsETH.address, amountIn)

      // then
      expect(amountOut).eq(ONE_ETH)
    })

    it('should revert if  there is no default oracle and asset has no oracle', async function () {
      await masterOracle.setDefaultOracle(AddressZero)
      const tx = masterOracle.convertFromUsd(vsDOGE.address, parseEther('1'))
      await expect(tx).revertedWith('asset-without-oracle')
    })
  })

  describe('convert', function () {
    // eslint-disable-next-line quotes
    it("should convert using assets' oracles", async function () {
      // when
      const amountIn = ONE_BTC
      const amountOut = await masterOracle.convert(vsBTC.address, vsETH.address, amountIn)

      // then
      const expectedAmountOut = btcPrice.mul(parseEther('1')).div(ethPrice)
      expect(amountOut).eq(expectedAmountOut)
    })

    it('should revert if  there is no default oracle and one asset has no oracle', async function () {
      await masterOracle.setDefaultOracle(AddressZero)
      const tx = masterOracle.convert(vsDOGE.address, vsBTC.address, parseEther('1'))
      await expect(tx).revertedWith('asset-without-oracle')
    })
  })
})
