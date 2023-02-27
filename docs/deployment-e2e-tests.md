## Setup (.env)

- Update `BLOCK_NUMBER`
- Set `DEPLOYER` with the correct EOA deployer account (For test purposes only, use `0xd1de3f9cd4ae2f23da941a67ca4c739f8dd9af33` that's the current `ProxyAdmin` owner)

```sh
rm artifacts/ cache/ -rf
```

## fork mainnet

```sh
npx hardhat node --fork https://eth.connect.bloq.cloud/v1/witness-open-trouble --fork-block-number <BLOCK_NUMBER> --no-deploy
```

## run test before

```sh
npx hardhat test --network localhost test/E2E.test.ts
```

## run deployment scripts

```sh
cp deployments/mainnet/ deployments/localhost -r

npx hardhat deploy --network localhost
```

## run test after

```sh
npx hardhat test --network localhost test/E2E.test.ts
```
