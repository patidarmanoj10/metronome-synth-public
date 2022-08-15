/* Autogenerated file. Do not edit manually. */
/* tslint:disable */
/* eslint-disable */
import type {
  BaseContract,
  BigNumber,
  BytesLike,
  CallOverrides,
  ContractTransaction,
  Overrides,
  PopulatedTransaction,
  Signer,
  utils,
} from "ethers";
import type { FunctionFragment, Result } from "@ethersproject/abi";
import type { Listener, Provider } from "@ethersproject/providers";
import type {
  TypedEventFilter,
  TypedEvent,
  TypedListener,
  OnEvent,
  PromiseOrValue,
} from "../common";

export interface IRewardsDistributorInterface extends utils.Interface {
  functions: {
    "claimRewards(address,address[])": FunctionFragment;
    "claimRewards(address[],address[])": FunctionFragment;
    "claimRewards(address)": FunctionFragment;
    "rewardToken()": FunctionFragment;
    "tokenSpeeds(address)": FunctionFragment;
    "tokensAccruedOf(address)": FunctionFragment;
    "updateBeforeMintOrBurn(address,address)": FunctionFragment;
    "updateBeforeTransfer(address,address,address)": FunctionFragment;
  };

  getFunction(
    nameOrSignatureOrTopic:
      | "claimRewards(address,address[])"
      | "claimRewards(address[],address[])"
      | "claimRewards(address)"
      | "rewardToken"
      | "tokenSpeeds"
      | "tokensAccruedOf"
      | "updateBeforeMintOrBurn"
      | "updateBeforeTransfer"
  ): FunctionFragment;

  encodeFunctionData(
    functionFragment: "claimRewards(address,address[])",
    values: [PromiseOrValue<string>, PromiseOrValue<string>[]]
  ): string;
  encodeFunctionData(
    functionFragment: "claimRewards(address[],address[])",
    values: [PromiseOrValue<string>[], PromiseOrValue<string>[]]
  ): string;
  encodeFunctionData(
    functionFragment: "claimRewards(address)",
    values: [PromiseOrValue<string>]
  ): string;
  encodeFunctionData(
    functionFragment: "rewardToken",
    values?: undefined
  ): string;
  encodeFunctionData(
    functionFragment: "tokenSpeeds",
    values: [PromiseOrValue<string>]
  ): string;
  encodeFunctionData(
    functionFragment: "tokensAccruedOf",
    values: [PromiseOrValue<string>]
  ): string;
  encodeFunctionData(
    functionFragment: "updateBeforeMintOrBurn",
    values: [PromiseOrValue<string>, PromiseOrValue<string>]
  ): string;
  encodeFunctionData(
    functionFragment: "updateBeforeTransfer",
    values: [
      PromiseOrValue<string>,
      PromiseOrValue<string>,
      PromiseOrValue<string>
    ]
  ): string;

  decodeFunctionResult(
    functionFragment: "claimRewards(address,address[])",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "claimRewards(address[],address[])",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "claimRewards(address)",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "rewardToken",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "tokenSpeeds",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "tokensAccruedOf",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "updateBeforeMintOrBurn",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "updateBeforeTransfer",
    data: BytesLike
  ): Result;

  events: {};
}

export interface IRewardsDistributor extends BaseContract {
  connect(signerOrProvider: Signer | Provider | string): this;
  attach(addressOrName: string): this;
  deployed(): Promise<this>;

  interface: IRewardsDistributorInterface;

  queryFilter<TEvent extends TypedEvent>(
    event: TypedEventFilter<TEvent>,
    fromBlockOrBlockhash?: string | number | undefined,
    toBlock?: string | number | undefined
  ): Promise<Array<TEvent>>;

  listeners<TEvent extends TypedEvent>(
    eventFilter?: TypedEventFilter<TEvent>
  ): Array<TypedListener<TEvent>>;
  listeners(eventName?: string): Array<Listener>;
  removeAllListeners<TEvent extends TypedEvent>(
    eventFilter: TypedEventFilter<TEvent>
  ): this;
  removeAllListeners(eventName?: string): this;
  off: OnEvent<this>;
  on: OnEvent<this>;
  once: OnEvent<this>;
  removeListener: OnEvent<this>;

  functions: {
    "claimRewards(address,address[])"(
      _account: PromiseOrValue<string>,
      _tokens: PromiseOrValue<string>[],
      overrides?: Overrides & { from?: PromiseOrValue<string> }
    ): Promise<ContractTransaction>;

    "claimRewards(address[],address[])"(
      _accounts: PromiseOrValue<string>[],
      _tokens: PromiseOrValue<string>[],
      overrides?: Overrides & { from?: PromiseOrValue<string> }
    ): Promise<ContractTransaction>;

    "claimRewards(address)"(
      _account: PromiseOrValue<string>,
      overrides?: Overrides & { from?: PromiseOrValue<string> }
    ): Promise<ContractTransaction>;

    rewardToken(overrides?: CallOverrides): Promise<[string]>;

    tokenSpeeds(
      _token: PromiseOrValue<string>,
      overrides?: CallOverrides
    ): Promise<[BigNumber]>;

    tokensAccruedOf(
      _account: PromiseOrValue<string>,
      overrides?: CallOverrides
    ): Promise<[BigNumber]>;

    updateBeforeMintOrBurn(
      _token: PromiseOrValue<string>,
      _account: PromiseOrValue<string>,
      overrides?: Overrides & { from?: PromiseOrValue<string> }
    ): Promise<ContractTransaction>;

    updateBeforeTransfer(
      _token: PromiseOrValue<string>,
      _from: PromiseOrValue<string>,
      _to: PromiseOrValue<string>,
      overrides?: Overrides & { from?: PromiseOrValue<string> }
    ): Promise<ContractTransaction>;
  };

  "claimRewards(address,address[])"(
    _account: PromiseOrValue<string>,
    _tokens: PromiseOrValue<string>[],
    overrides?: Overrides & { from?: PromiseOrValue<string> }
  ): Promise<ContractTransaction>;

  "claimRewards(address[],address[])"(
    _accounts: PromiseOrValue<string>[],
    _tokens: PromiseOrValue<string>[],
    overrides?: Overrides & { from?: PromiseOrValue<string> }
  ): Promise<ContractTransaction>;

  "claimRewards(address)"(
    _account: PromiseOrValue<string>,
    overrides?: Overrides & { from?: PromiseOrValue<string> }
  ): Promise<ContractTransaction>;

  rewardToken(overrides?: CallOverrides): Promise<string>;

  tokenSpeeds(
    _token: PromiseOrValue<string>,
    overrides?: CallOverrides
  ): Promise<BigNumber>;

  tokensAccruedOf(
    _account: PromiseOrValue<string>,
    overrides?: CallOverrides
  ): Promise<BigNumber>;

  updateBeforeMintOrBurn(
    _token: PromiseOrValue<string>,
    _account: PromiseOrValue<string>,
    overrides?: Overrides & { from?: PromiseOrValue<string> }
  ): Promise<ContractTransaction>;

  updateBeforeTransfer(
    _token: PromiseOrValue<string>,
    _from: PromiseOrValue<string>,
    _to: PromiseOrValue<string>,
    overrides?: Overrides & { from?: PromiseOrValue<string> }
  ): Promise<ContractTransaction>;

  callStatic: {
    "claimRewards(address,address[])"(
      _account: PromiseOrValue<string>,
      _tokens: PromiseOrValue<string>[],
      overrides?: CallOverrides
    ): Promise<void>;

    "claimRewards(address[],address[])"(
      _accounts: PromiseOrValue<string>[],
      _tokens: PromiseOrValue<string>[],
      overrides?: CallOverrides
    ): Promise<void>;

    "claimRewards(address)"(
      _account: PromiseOrValue<string>,
      overrides?: CallOverrides
    ): Promise<void>;

    rewardToken(overrides?: CallOverrides): Promise<string>;

    tokenSpeeds(
      _token: PromiseOrValue<string>,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    tokensAccruedOf(
      _account: PromiseOrValue<string>,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    updateBeforeMintOrBurn(
      _token: PromiseOrValue<string>,
      _account: PromiseOrValue<string>,
      overrides?: CallOverrides
    ): Promise<void>;

    updateBeforeTransfer(
      _token: PromiseOrValue<string>,
      _from: PromiseOrValue<string>,
      _to: PromiseOrValue<string>,
      overrides?: CallOverrides
    ): Promise<void>;
  };

  filters: {};

  estimateGas: {
    "claimRewards(address,address[])"(
      _account: PromiseOrValue<string>,
      _tokens: PromiseOrValue<string>[],
      overrides?: Overrides & { from?: PromiseOrValue<string> }
    ): Promise<BigNumber>;

    "claimRewards(address[],address[])"(
      _accounts: PromiseOrValue<string>[],
      _tokens: PromiseOrValue<string>[],
      overrides?: Overrides & { from?: PromiseOrValue<string> }
    ): Promise<BigNumber>;

    "claimRewards(address)"(
      _account: PromiseOrValue<string>,
      overrides?: Overrides & { from?: PromiseOrValue<string> }
    ): Promise<BigNumber>;

    rewardToken(overrides?: CallOverrides): Promise<BigNumber>;

    tokenSpeeds(
      _token: PromiseOrValue<string>,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    tokensAccruedOf(
      _account: PromiseOrValue<string>,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    updateBeforeMintOrBurn(
      _token: PromiseOrValue<string>,
      _account: PromiseOrValue<string>,
      overrides?: Overrides & { from?: PromiseOrValue<string> }
    ): Promise<BigNumber>;

    updateBeforeTransfer(
      _token: PromiseOrValue<string>,
      _from: PromiseOrValue<string>,
      _to: PromiseOrValue<string>,
      overrides?: Overrides & { from?: PromiseOrValue<string> }
    ): Promise<BigNumber>;
  };

  populateTransaction: {
    "claimRewards(address,address[])"(
      _account: PromiseOrValue<string>,
      _tokens: PromiseOrValue<string>[],
      overrides?: Overrides & { from?: PromiseOrValue<string> }
    ): Promise<PopulatedTransaction>;

    "claimRewards(address[],address[])"(
      _accounts: PromiseOrValue<string>[],
      _tokens: PromiseOrValue<string>[],
      overrides?: Overrides & { from?: PromiseOrValue<string> }
    ): Promise<PopulatedTransaction>;

    "claimRewards(address)"(
      _account: PromiseOrValue<string>,
      overrides?: Overrides & { from?: PromiseOrValue<string> }
    ): Promise<PopulatedTransaction>;

    rewardToken(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    tokenSpeeds(
      _token: PromiseOrValue<string>,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    tokensAccruedOf(
      _account: PromiseOrValue<string>,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    updateBeforeMintOrBurn(
      _token: PromiseOrValue<string>,
      _account: PromiseOrValue<string>,
      overrides?: Overrides & { from?: PromiseOrValue<string> }
    ): Promise<PopulatedTransaction>;

    updateBeforeTransfer(
      _token: PromiseOrValue<string>,
      _from: PromiseOrValue<string>,
      _to: PromiseOrValue<string>,
      overrides?: Overrides & { from?: PromiseOrValue<string> }
    ): Promise<PopulatedTransaction>;
  };
}
