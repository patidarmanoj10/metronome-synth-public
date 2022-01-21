/* eslint-disable camelcase */
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers'
import {expect} from 'chai'
import {parseEther} from 'ethers/lib/utils'
import {ethers} from 'hardhat'
import {
  DepositToken,
  DepositToken__factory,
  ERC20Mock,
  ERC20Mock__factory,
  ControllerMock,
  ControllerMock__factory,
  IWETH,
  IWETH__factory,
  OracleMock,
  OracleMock__factory,
  WETHGateway,
  WETHGateway__factory,
} from '../typechain'
import {disableForking, enableForking} from './helpers'
import Address from '../helpers/address'

const {WETH_ADDRESS} = Address

describe('WETHGateway', function () {
  let deployer: SignerWithAddress
  let user: SignerWithAddress
  let weth: IWETH
  let wethDepositToken: DepositToken
  let oracleMock: OracleMock
  let controllerMock: ControllerMock
  let wethGateway: WETHGateway
  let tokenMock: ERC20Mock

  before(enableForking)

  after(disableForking)

  beforeEach(async function () {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[deployer, user] = await ethers.getSigners()

    weth = IWETH__factory.connect(WETH_ADDRESS, deployer)

    const oracleMockFactory = new OracleMock__factory(deployer)
    oracleMock = await oracleMockFactory.deploy()
    await oracleMock.deployed()

    const depositTokenFactory = new DepositToken__factory(deployer)
    wethDepositToken = await depositTokenFactory.deploy()
    await wethDepositToken.deployed()

    const controllerMockFactory = new ControllerMock__factory(deployer)
    controllerMock = await controllerMockFactory.deploy(wethDepositToken.address, oracleMock.address)
    await controllerMock.deployed()

    const wethGatewayFactory = new WETHGateway__factory(deployer)
    wethGateway = await wethGatewayFactory.deploy(WETH_ADDRESS)
    await wethGateway.deployed()

    await wethDepositToken.initialize(WETH_ADDRESS, controllerMock.address, 'vSynth-WETH', 18)

    const erc20MockFactory = new ERC20Mock__factory(deployer)
    tokenMock = await erc20MockFactory.deploy('Name', 'SYMBOL', 18)
    await tokenMock.deployed()

    await oracleMock.updateRate(wethDepositToken.address, parseEther('1'))
  })

  it('should not receive ETH if sender is not WETH contract', async function () {
    const tx = deployer.sendTransaction({to: wethGateway.address, value: parseEther('1')})
    await expect(tx).reverted
  })

  describe('authorizeController', function () {
    it('should authorize a Controller contract to transfer WETH', async function () {
      // given
      const before = await weth.allowance(wethGateway.address, controllerMock.address)
      expect(before).eq(0)

      // when
      await wethGateway.authorizeController(controllerMock.address)

      // then
      const after = await weth.allowance(wethGateway.address, controllerMock.address)
      expect(after).eq(ethers.constants.MaxUint256)
    })

    it('should revert if caller is not governor', async function () {
      const tx = wethGateway.connect(user).authorizeController(controllerMock.address)
      await expect(tx).revertedWith('not-governor')
    })
  })

  describe('depositETH', function () {
    it('should deposit ETH to Controller', async function () {
      // given
      await wethGateway.authorizeController(controllerMock.address)

      // when
      const value = parseEther('1')
      const tx = () => wethGateway.connect(user).depositETH(controllerMock.address, {value})

      // then
      // Note: Each expect below re-runs the transaction (Refs: https://github.com/EthWorks/Waffle/issues/569)
      await expect(tx).changeEtherBalances([user, weth], [value.mul('-1'), value])
      await expect(tx).changeTokenBalance(weth, controllerMock, value) // mock doesn't use treasury
      await expect(tx).changeTokenBalance(wethDepositToken, user, value)
    })
  })

  describe('withdrawETH', function () {
    beforeEach(async function () {
      const value = parseEther('100')
      await wethGateway.authorizeController(controllerMock.address)
      await wethGateway.connect(user).depositETH(controllerMock.address, {value})
      await wethDepositToken.connect(user).approve(wethGateway.address, value)
    })

    it('should withdraw ETH from Controller', async function () {
      // when
      const amount = parseEther('1')
      const tx = () => wethGateway.connect(user).withdrawETH(controllerMock.address, amount)

      // then
      // Note: Each expect below re-runs the transaction (Refs: https://github.com/EthWorks/Waffle/issues/569)
      await expect(tx).changeEtherBalances([weth, user], [amount.mul('-1'), amount])
      await expect(tx).changeTokenBalance(weth, controllerMock, amount.mul('-1')) // mock doesn't use treasury
      await expect(tx).changeTokenBalance(wethDepositToken, user, amount.mul('-1'))
    })
  })

  describe('emergencyTokenTransfer', function () {
    beforeEach(async function () {
      await tokenMock.mint(wethGateway.address, parseEther('100'))
    })

    it('should release token from contract', async function () {
      const tx = () => wethGateway.emergencyTokenTransfer(tokenMock.address, user.address, parseEther('1'))
      await expect(tx).changeTokenBalances(tokenMock, [wethGateway, user], [parseEther('-1'), parseEther('1')])
    })

    it('should revert if caller is not governor', async function () {
      const tx = wethGateway.connect(user).emergencyTokenTransfer(tokenMock.address, user.address, parseEther('1'))
      await expect(tx).revertedWith('not-governor')
    })
  })
})
