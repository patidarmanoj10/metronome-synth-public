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

# Deployment (1/3) - Upgrade `ProxyOFTUpgrader`
npx hardhat deploy --network localhost --tags Upgraders,MultisigTxs #> DEPLOYMENT_TEST_OUTPUT.log
patch deploy/helpers/index.ts < scripts/proxy_oft_to_v2.patch

# Deployment (2/3) - Upgrade contracts and registers Pool2
npx hardhat deploy --network localhost #>> DEPLOYMENT_TEST_OUTPUT.log

# Deployment (3/3) - Call `Pool.toggleBridgingIsActive()` and finish Pool2 setup
npx hardhat deploy --network localhost #>> DEPLOYMENT_TEST_OUTPUT.log

# Test next release
npx hardhat test --network localhost test/E2E.$network.next.test.ts


