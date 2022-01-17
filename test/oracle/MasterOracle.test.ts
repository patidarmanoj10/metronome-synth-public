/* eslint-disable camelcase */
import {parseEther} from '@ethersproject/units'
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {expect} from 'chai'
import {ethers} from 'hardhat'
import {
  ERC20Mock__factory,
  ERC20Mock,
  MasterOracle,
  MasterOracle__factory,
  OracleMock__factory,
  OracleMock,
} from '../../typechain'

const {AddressZero} = ethers.constants

const btcPrice = parseEther('40000') // 1 BTC : $40,000
const ethPrice = parseEther('4000') // 1 ETH : $4,000

describe('MasterOracle', function () {
  let deployer: SignerWithAddress
  let user: SignerWithAddress
  let masterOracle: MasterOracle
  let defaultOracle: OracleMock
  let btcOracle: OracleMock
  let vsDOGE: ERC20Mock
  let vsETH: ERC20Mock
  let vsBTC: ERC20Mock

  beforeEach(async function () {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[deployer, user] = await ethers.getSigners()

    const erc20MockFactory = new ERC20Mock__factory(deployer)
    const oracleMockFactory = new OracleMock__factory(deployer)

    vsETH = await erc20MockFactory.deploy('vsETH', 'vsETH', 18)
    await vsETH.deployed()

    vsBTC = await erc20MockFactory.deploy('vsBTC', 'vsBTC', 8)
    await vsBTC.deployed()

    vsDOGE = await erc20MockFactory.deploy('vsDOGE', 'vsDOGE', 18)
    await vsDOGE.deployed()

    defaultOracle = await oracleMockFactory.deploy()
    await defaultOracle.deployed()

    btcOracle = await oracleMockFactory.deploy()
    await btcOracle.deployed()

    const masterOracleFactory = new MasterOracle__factory(deployer)
    masterOracle = await masterOracleFactory.deploy()
    await masterOracle.deployed()
    await masterOracle.initialize([vsBTC.address], [btcOracle.address], defaultOracle.address)

    await btcOracle.updateRate(vsBTC.address, btcPrice)
    await defaultOracle.updateRate(vsETH.address, ethPrice)
  })

  describe('addOrUpdated', function () {
    it('should revert if not governor', async function () {
      const tx = masterOracle.connect(user).addOrUpdated([vsDOGE.address], [defaultOracle.address])
      await expect(tx).revertedWith('not-governor')
    })

    it('should add new oracle', async function () {
      // given
      expect(await masterOracle.oracles(vsDOGE.address)).eq(AddressZero)

      // when
      const tx = masterOracle.addOrUpdated([vsDOGE.address], [defaultOracle.address])

      // then
      await expect(tx).emit(masterOracle, 'OracleUpdated').withArgs(vsDOGE.address, AddressZero, defaultOracle.address)
      expect(await masterOracle.oracles(vsDOGE.address)).eq(defaultOracle.address)
    })

    it('should update an oracle', async function () {
      // given
      expect(await masterOracle.oracles(vsBTC.address)).eq(btcOracle.address)

      // when
      const tx = masterOracle.addOrUpdated([vsBTC.address], [defaultOracle.address])

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
      const amountIn = parseEther('1')
      const amountOut = await masterOracle.convertToUsd(vsBTC.address, amountIn)

      // then
      const expectedAmountOut = await btcOracle.convertToUsd(vsBTC.address, amountIn)
      expect(amountOut).eq(expectedAmountOut)
    })

    it('should convert using the default oracle', async function () {
      // given
      expect(await masterOracle.oracles(vsETH.address)).eq(AddressZero)

      // when
      const amountIn = parseEther('1')
      const amountOut = await masterOracle.convertToUsd(vsETH.address, amountIn)

      // then
      const expectedAmountOut = await defaultOracle.convertToUsd(vsETH.address, amountIn)
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
      const amountIn = parseEther('1')
      const amountOut = await masterOracle.convertFromUsd(vsBTC.address, amountIn)

      // then
      const expectedAmountOut = await btcOracle.convertFromUsd(vsBTC.address, amountIn)
      expect(amountOut).eq(expectedAmountOut)
    })

    it('should convert using the default oracle', async function () {
      // given
      expect(await masterOracle.oracles(vsETH.address)).eq(AddressZero)

      // when
      const amountIn = parseEther('1')
      const amountOut = await masterOracle.convertFromUsd(vsETH.address, amountIn)

      // then
      const expectedAmountOut = await defaultOracle.convertFromUsd(vsETH.address, amountIn)
      expect(amountOut).eq(expectedAmountOut)
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
      const amountIn = parseEther('1')
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
