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
  NativeTokenGateway,
  NativeTokenGateway__factory,
  Treasury__factory,
  Treasury,
} from '../typechain'
import {disableForking, enableForking} from './helpers'
import Address from '../helpers/address'
import {toUSD} from '../helpers'

const {NATIVE_TOKEN_ADDRESS} = Address

const {MaxUint256} = ethers.constants

describe('NativeTokenGateway', function () {
  let deployer: SignerWithAddress
  let user: SignerWithAddress
  let nativeToken: IWETH
  let vsdNativeToken: DepositToken
  let treasury: Treasury
  let masterOracleMock: MasterOracleMock
  let controllerMock: ControllerMock
  let nativeTokenGateway: NativeTokenGateway
  let tokenMock: ERC20Mock

  before(enableForking)

  after(disableForking)

  beforeEach(async function () {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;[deployer, user] = await ethers.getSigners()

    nativeToken = IWETH__factory.connect(NATIVE_TOKEN_ADDRESS, deployer)

    const masterOracleMockFactory = new MasterOracleMock__factory(deployer)
    masterOracleMock = await masterOracleMockFactory.deploy()
    await masterOracleMock.deployed()

    const depositTokenFactory = new DepositToken__factory(deployer)
    vsdNativeToken = await depositTokenFactory.deploy()
    await vsdNativeToken.deployed()

    const treasuryFactory = new Treasury__factory(deployer)
    treasury = await treasuryFactory.deploy()
    await treasury.deployed()

    const controllerMockFactory = new ControllerMock__factory(deployer)
    controllerMock = await controllerMockFactory.deploy(
      vsdNativeToken.address,
      masterOracleMock.address,
      ethers.constants.AddressZero
    )
    await controllerMock.deployed()

    const nativeTokenGatewayFactory = new NativeTokenGateway__factory(deployer)
    nativeTokenGateway = await nativeTokenGatewayFactory.deploy(NATIVE_TOKEN_ADDRESS)
    await nativeTokenGateway.deployed()

    await vsdNativeToken.initialize(
      NATIVE_TOKEN_ADDRESS,
      controllerMock.address,
      'vsdETH',
      18,
      parseEther('1'),
      MaxUint256
    )

    const erc20MockFactory = new ERC20Mock__factory(deployer)
    tokenMock = await erc20MockFactory.deploy('Name', 'SYMBOL', 18)
    await tokenMock.deployed()

    await controllerMock.updateTreasury(treasury.address, true)
    await masterOracleMock.updatePrice(vsdNativeToken.address, toUSD('1'))
    await treasury.initialize(controllerMock.address)
  })

  it('should not receive ETH if sender is not WETH contract', async function () {
    const tx = deployer.sendTransaction({to: nativeTokenGateway.address, value: parseEther('1')})
    await expect(tx).reverted
  })

  describe('deposit', function () {
    it('should deposit ETH to Controller', async function () {
      // when
      const value = parseEther('1')
      const tx = () => nativeTokenGateway.connect(user).deposit(controllerMock.address, {value})

      // then
      // Note: Each expect below re-runs the transaction (Refs: https://github.com/EthWorks/Waffle/issues/569)
      await expect(tx).changeEtherBalances([user, nativeToken], [value.mul('-1'), value])
      await expect(tx).changeTokenBalance(nativeToken, treasury, value)
      await expect(tx).changeTokenBalance(vsdNativeToken, user, value)
    })
  })

  describe('withdraw', function () {
    beforeEach(async function () {
      const value = parseEther('100')
      await nativeTokenGateway.connect(user).deposit(controllerMock.address, {value})
      await vsdNativeToken.connect(user).approve(nativeTokenGateway.address, value)
    })

    it('should withdraw ETH from Controller', async function () {
      // when
      const amount = parseEther('1')
      const tx = () => nativeTokenGateway.connect(user).withdraw(controllerMock.address, amount)

      // then
      // Note: Each expect below re-runs the transaction (Refs: https://github.com/EthWorks/Waffle/issues/569)
      await expect(tx).changeEtherBalances([nativeToken, user], [amount.mul('-1'), amount])
      await expect(tx).changeTokenBalance(nativeToken, treasury, amount.mul('-1'))
      await expect(tx).changeTokenBalance(vsdNativeToken, user, amount.mul('-1'))
    })
  })

  describe('emergencyTokenTransfer', function () {
    beforeEach(async function () {
      await tokenMock.mint(nativeTokenGateway.address, parseEther('100'))
    })

    it('should release token from contract', async function () {
      const tx = () => nativeTokenGateway.emergencyTokenTransfer(tokenMock.address, user.address, parseEther('1'))
      await expect(tx).changeTokenBalances(tokenMock, [nativeTokenGateway, user], [parseEther('-1'), parseEther('1')])
    })

    it('should revert if caller is not governor', async function () {
      const tx = nativeTokenGateway
        .connect(user)
        .emergencyTokenTransfer(tokenMock.address, user.address, parseEther('1'))
      await expect(tx).revertedWith('not-governor')
    })
  })
})
