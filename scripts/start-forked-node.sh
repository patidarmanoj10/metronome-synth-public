#!/bin/bash
#
# Notes:
# - If you want to impersonate deployer, set it to the `DEPLOYER` env var
# - If you want to check `deployments/` files changes easier, uncomment `deployments/localhost` line from `.gitignore` and stage them.
#   All modifications done by the scripts will appear on the git changes area.
#

echo "Make sure .env has the correct values."
echo -n "Press <ENTER> to continue: "
read -r ans

# Clean old files
rm  -rf artifacts/ cache/

# Update ENV VARS
source .env

# Run node
npx hardhat node --fork $NODE_URL --fork-block-number $BLOCK_NUMBER --no-deploy

# Impersonate deployer
# npx hardhat impersonate-deployer --network localhost

