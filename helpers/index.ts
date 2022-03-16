import {BigNumber} from '@ethersproject/bignumber'
import {parseUnits} from '@ethersproject/units'

export const toUSD = (amount: string): BigNumber => parseUnits(amount, 18)
