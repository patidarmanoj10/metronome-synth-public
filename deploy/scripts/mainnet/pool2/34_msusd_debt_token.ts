import {parseEther} from 'ethers/lib/utils'
import {buildDebtTokenDeployFunction, UpgradableContracts} from '../../../helpers'

const {
  Pool2: {alias: Pool2},
} = UpgradableContracts

const func = buildDebtTokenDeployFunction({
  poolAlias: Pool2,
  name: 'Metronome Synth USD',
  symbol: 'msUSD',
  interestRate: parseEther('0.01'), // 1%
  maxTotalSupply: parseEther('10000'),
})

export default func
