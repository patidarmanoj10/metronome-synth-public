## Setup (.env)

- Set `NODE_URL`, `BLOCK_NUMBER` and `DEPLOYER` (Use `Address.GNOSIS_SAFE_ADDRESS`)

```sh
source .env
```

## fork mainnet

```sh
rm artifacts/ cache/ -rf

npx hardhat node --fork $NODE_URL --fork-block-number $BLOCK_NUMBER --no-deploy
```

## run test before

```sh
npx hardhat test --network localhost test/E2E.test.ts
```

## run deployment (save and share scripts output)

```sh
cp deployments/mainnet/ deployments/localhost -r

npx hardhat deploy --network localhost > DEPLOYMENT_OUTPUT.txt
```

## run test after

```sh
npx hardhat test --network localhost test/E2E.test.ts
```
