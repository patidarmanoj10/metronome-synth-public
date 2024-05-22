import {parseEther} from 'ethers/lib/utils'
import {buildDebtTokenDeployFunction, UpgradableContracts} from '../../../helpers'

const {
  Pool1: {alias: Pool1},
} = UpgradableContracts

const func = buildDebtTokenDeployFunction({
  name: 'Metronome Synth OP',
  poolAlias: Pool1,
  symbol: 'msOP',
  interestRate: parseEther('0.01'), // 1%
  maxTotalSupply: parseEther('1250'),
})

export default func
