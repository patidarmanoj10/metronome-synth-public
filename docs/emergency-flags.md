# Emergency flags/configs

LayerZero chain IDs: [https://stargateprotocol.gitbook.io/stargate/developers/chain-ids](https://stargateprotocol.gitbook.io/stargate/developers/chain-ids)

## By contracts

### PoolRegistry (singleton)

**paused**:

**everythingStopped**: If `true` it disables: `issue`, `leverage`, `repay`, `repayAll`, `liquidate`, `swap` for all pools

**isCrossChainFlashRepayActive**: If `false` it disables all pool's cross-chain flash repay operations.

### CrossChainDispatcher (singleton)

**isBridgingActive**: If `false` it disables all bridging activities (i.e. both cc features and msAssets bridge transfers).

**isDestinationChainSupported[lzChainId]**: Maps supported cross-chain routes for both cc features and bridge transfers.

### SyntheticToken (singleton)

**maxTotalSupply**: Supply cap. This cap impacts `issue`, `leverage` and `swap` features.

**isActive**: If `false` synth mint is disabled. It will impact `issue`, `leverage`, `swap`, `crossChainLeverage` features and bridge transfers.

**maxBridgedInSupply**: Maximum allowed bridged-in supply. When reach this value, bridging in will only be possible after some bridging out.

**maxBridgedOutSupply**: Maximum allowed bridged-out supply. When reach this value, bridging out will only be possible after some bridging in.

### ProxyOFT (singleton)

**trustedRemoteLookup[lzChainId][srcAddress:dstAddress]**: Set trusted paths where can accepts cross-chain messages.

### Pool

**paused**: If `true` it disables all collateral deposits.

**everythingStopped**: If `true` it disables: `issue`, `leverage`, `repay`, `repayAll`, `liquidate`, `swap`

**isSwapActive**: If `false` it disables the pool's `swap` feature.

**isBridgingActive**: If `false` it disables pool's cross-chain features (i.e. `ccLeverage` and `ccFlashRepay`).

### DebtToken (per pool)

**maxTotalSupply**: Supply cap. This cap impacts `issue` and `leverage` features. It doesn't impact `swap`.

**isActive**: If `false` synth debt mint is disabled. It will impact `issue` and `leverage` features. The `swap` continues working.

### DepositToken (per pool)

**maxTotalSupply**: Supply cap. This cap impacts `deposit` feature.

**isActive**: If `false` deposit receipt mint is disabled. It will impact `deposit` feature. The `withdraw` continues working.

## By features

## Pool.swap()

Disabled if: `PoolRegistry.everythingStopped()` || `Pool.everythingStopped()` || `!SyntheticTokenOut.isActive()`

## Pool.liquidate()

Disabled if: `PoolRegistry.everythingStopped()` || `Pool.everythingStopped()`

## DebtToken.issue()

Disabled if: `PoolRegistry.everythingStopped()` || `!SyntheticToken.isActive()` || `Pool.everythingStopped()` || `!DebtToken.isActive()`

## DebtToken.repay()

Disabled if: `PoolRegistry.everythingStopped()` || `Pool.everythingStopped()`

## DebtToken.repayAll()

Disabled if: `PoolRegistry.everythingStopped()` || `Pool.everythingStopped()`

## DepositToken.deposit()

Disabled if: `PoolRegistry.paused()` || `Pool.paused()` || `!DepositToken.isActive()`

## DepositToken.withdraw()

Disabled if: `PoolRegistry.everythingStopped()` || `Pool.everythingStopped()`

## SmartFarmingManager.crossChainLeverage()

Disabled if: `PoolRegistry.everythingStopped()` || `Pool.everythingStopped()` || `!CrossChainDispatcher.isBridgingActive()` || `!Pool.isBridgingActive()`

## SmartFarmingManager.crossChainFlashRepay()

Disabled if: `!CrossChainDispatcher.isBridgingActive()` || `!Pool.isBridgingActive()` || `!PoolRegistry.isCrossChainFlashRepayActive()`

## ProxyOFT.debitFrom() (i.e. bridge transfers)

Disabled if: `!CrossChainDispatcher.isBridgingActive()` || `!CrossChainDispatcher.isDestinationChainSupported(dstChainId)`

Note: To pause all above, use: `PoolRegistry.shutdown()` + `CrossChainDispatcher.toggleBridgingIsActive()`
