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
  MasterOracleMock,
  MasterOracleMock__factory,
  WETHGateway,
  WETHGateway__factory,
  Treasury__factory,
  Treasury,
} from '../typechain'
import {disableForking, enableForking} from './helpers'
import Address from '../helpers/address'

const {NATIVE_TOKEN_ADDRESS} = Address

describe('WETHGateway', function () {
  let deployer: SignerWithAddress
  let user: SignerWithAddress
  let weth: IWETH
  let wethDepositToken: DepositToken
  let treasury: Treasury
  let masterOracleMock: MasterOracleMock
  let controllerMock: ControllerMock
  let wethGateway: WETHGateway
  let tokenMock: ERC20Mock

  before(enableForking)

  after(disableForking)

  beforeEach(async function () {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[deployer, user] = await ethers.getSigners()

    weth = IWETH__factory.connect(NATIVE_TOKEN_ADDRESS, deployer)

    const masterOracleMockFactory = new MasterOracleMock__factory(deployer)
    masterOracleMock = await masterOracleMockFactory.deploy()
    await masterOracleMock.deployed()

    const depositTokenFactory = new DepositToken__factory(deployer)
    wethDepositToken = await depositTokenFactory.deploy()
    await wethDepositToken.deployed()

    const treasuryFactory = new Treasury__factory(deployer)
    treasury = await treasuryFactory.deploy()
    await treasury.deployed()

    const controllerMockFactory = new ControllerMock__factory(deployer)
    controllerMock = await controllerMockFactory.deploy(
      wethDepositToken.address,
      masterOracleMock.address,
      ethers.constants.AddressZero
    )
    await controllerMock.deployed()

    const wethGatewayFactory = new WETHGateway__factory(deployer)
    wethGateway = await wethGatewayFactory.deploy(NATIVE_TOKEN_ADDRESS)
    await wethGateway.deployed()

    await wethDepositToken.initialize(NATIVE_TOKEN_ADDRESS, controllerMock.address, 'vETH-Deposit', 18, parseEther('1'))

    const erc20MockFactory = new ERC20Mock__factory(deployer)
    tokenMock = await erc20MockFactory.deploy('Name', 'SYMBOL', 18)
    await tokenMock.deployed()

    await controllerMock.updateTreasury(treasury.address, true)
    await masterOracleMock.updateRate(wethDepositToken.address, parseEther('1'))
    await treasury.initialize(controllerMock.address)
  })

  it('should not receive ETH if sender is not WETH contract', async function () {
    const tx = deployer.sendTransaction({to: wethGateway.address, value: parseEther('1')})
    await expect(tx).reverted
  })

  describe('depositETH', function () {
    it('should deposit ETH to Controller', async function () {
      // when
      const value = parseEther('1')
      const tx = () => wethGateway.connect(user).depositETH(controllerMock.address, {value})

      // then
      // Note: Each expect below re-runs the transaction (Refs: https://github.com/EthWorks/Waffle/issues/569)
      await expect(tx).changeEtherBalances([user, weth], [value.mul('-1'), value])
      await expect(tx).changeTokenBalance(weth, treasury, value)
      await expect(tx).changeTokenBalance(wethDepositToken, user, value)
    })
  })

  describe('withdrawETH', function () {
    beforeEach(async function () {
      const value = parseEther('100')
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
      await expect(tx).changeTokenBalance(weth, treasury, amount.mul('-1'))
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
