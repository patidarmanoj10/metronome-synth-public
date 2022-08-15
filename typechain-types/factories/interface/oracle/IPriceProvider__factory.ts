/* Autogenerated file. Do not edit manually. */
/* tslint:disable */
/* eslint-disable */

import { Contract, Signer, utils } from "ethers";
import type { Provider } from "@ethersproject/providers";
import type {
  IPriceProvider,
  IPriceProviderInterface,
} from "../../../interface/oracle/IPriceProvider";

const _abi = [
  {
    inputs: [
      {
        internalType: "address",
        name: "_assetData",
        type: "address",
      },
    ],
    name: "getPriceInUsd",
    outputs: [
      {
        internalType: "uint256",
        name: "_priceInUsd",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "_lastUpdatedAt",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_assetData",
        type: "address",
      },
    ],
    name: "update",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
];

export class IPriceProvider__factory {
  static readonly abi = _abi;
  static createInterface(): IPriceProviderInterface {
    return new utils.Interface(_abi) as IPriceProviderInterface;
  }
  static connect(
    address: string,
    signerOrProvider: Signer | Provider
  ): IPriceProvider {
    return new Contract(address, _abi, signerOrProvider) as IPriceProvider;
  }
}
