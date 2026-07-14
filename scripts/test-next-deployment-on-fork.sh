#!/bin/bash

network=$1;

if [[ "$network" == "" ]];
then
    echo "Use: $0 <network>"
    exit
fi

if [ ! -d "deploy/scripts/$network" ];
then
    echo "'$network' is invalid"
    exit
fi

echo "Make sure the test/E2E.$network.next.test.ts test suite isn't skipped."
echo -n "Press <ENTER> to continue: "
read

# Test current release
#npx hardhat test --network localhost test/E2E.$network.test.ts

# Impersonate deployer
npx hardhat impersonate-deployer --network localhost

# Prepare deployment data
cp -r deployments/$network deployments/localhost

# Deployment
npx hardhat deploy --network localhost
npx hardhat deploy --network localhost
npx hardhat deploy --network localhost

# Test next release
npx hardhat test --network localhost test/E2E.$network.next.test.ts


