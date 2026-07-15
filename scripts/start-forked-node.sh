#!/bin/bash
#
# Notes:
# - If you want to impersonate deployer, set it to the `DEPLOYER` env var
# - If you want to check `deployments/` files changes easier, uncomment `deployments/localhost` line from `.gitignore` and stage them.
#   All modifications done by the scripts will appear on the git changes area.
#

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

# Update ENV VARS
source .env

url=$(eval echo "\$${network^^}_NODE_URL")
block=$(eval echo "\$${network^^}_BLOCK_NUMBER")

echo "Make sure .env has the correct values."
echo ""
echo NODE_URL=$url
echo BLOCK_NUMBER=$block
echo ""
echo -n "Press <ENTER> to continue: "
read

# Clean old files
rm  -rf artifacts/ cache/ multisig.batch.tmp.json

# Run node
npx hardhat node --fork $url --fork-block-number $block --no-deploy



