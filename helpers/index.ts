/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
import {ethers} from 'hardhat'

export const parseUnits = (n: string, d: number) => ethers.utils.parseUnits(n.replace(new RegExp(/,/g), ''), d)

export const parseEther = (n: string) => parseUnits(n, 18)

export const toUSD = (n: string) => parseUnits(n, 18)
