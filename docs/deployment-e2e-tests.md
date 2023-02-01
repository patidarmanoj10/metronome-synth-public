## Setup (.env)

- Update `BLOCK_NUMBER` if needed
- Set `DEPLOYER=0xd1de3f9cd4ae2f23da941a67ca4c739f8dd9af33`

rm artifacts/ cache/ -rf

## fork mainnet (use the same block as above)

npx hardhat node --fork https://eth.connect.bloq.cloud/v1/witness-open-trouble --fork-block-number 16477070 --no-deploy

## run test before

npx hardhat test --network localhost test/E2E.test.ts

## run deployment scripts

cp deployments/mainnet/ deployments/localhost -r
npx hardhat deploy --network localhost

## run test after

npx hardhat test --network localhost test/E2E.test.ts
