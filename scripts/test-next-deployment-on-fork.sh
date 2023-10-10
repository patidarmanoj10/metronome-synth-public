#!/bin/bash

network=$1;

if [[ "$network" == "" ]];
then
    echo "Use: $0 <network>"
    exit
fi

if [[ "$network" != "mainnet" && "$network" != "optimism" ]];
then
    echo "'$network' is invalid"
    exit
fi

echo "Make sure the test/E2E.$network.next.test.ts test suite isn't skipped."
echo -n "Press <ENTER> to continue: "
read

# Test current release
#npx hardhat test --network localhost test/E2E.$network.test.ts

# Prepare deployment data
cp -r deployments/$network deployments/localhost

# Undo `CrossChainDispatcherUpgrader` change
cp contracts/CrossChainDispatcher.sol scripts/CrossChainDispatcher.sol.new
cp scripts/CrossChainDispatcher.sol.old contracts/CrossChainDispatcher.sol

# Deployment (1/2) - upgrade `CrossChainDispatcherUpgrader`
npx hardhat deploy --network localhost > DEPLOYMENT_TEST_OUTPUT.log

# Update upgraders
patch deploy/helpers/index.ts scripts/update-upgraders.patch

# Restore `CrossChainDispatcherUpgrader`
mv scripts/CrossChainDispatcher.sol.new contracts/CrossChainDispatcher.sol

# Deployment (2/2) - upgrade `CrossChainDispatcher`
npx hardhat deploy --network localhost >> DEPLOYMENT_TEST_OUTPUT.log

# Test next release
npx hardhat test --network localhost test/E2E.$network.next.test.ts


