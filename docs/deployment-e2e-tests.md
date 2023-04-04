## Setup (.env)

- Set `NODE_URL`, `BLOCK_NUMBER`
- If you only want to test changes bypassing multi-sig logic, leave `DEPLOYER` empty otherwise use real address (i.e. deployer/delegate)

```sh
source .env
```

## fork mainnet

```sh
rm  -rf artifacts/ cache/

npx hardhat node --fork $NODE_URL --fork-block-number $BLOCK_NUMBER --no-deploy
```

If you set `process.env.DEPLOYER` account, run:

```sh
npx hardhat impersonate-deployer --network localhost
```

## run test before (optional)

```sh
npx hardhat test --network localhost test/E2E.test.ts
```

## run deployment

```sh
cp -r deployments/mainnet/ deployments/localhost
```

Note: If you want to check `deployments/` files changes easier, uncomment `deployments/localhost` line from `.gitignore` and stage them.
All modifications done by the scripts will appear on the git changes area.

```sh
npx hardhat deploy --network localhost > DEPLOYMENT_TEST_OUTPUT.txt
```

## run test after

```sh
npx hardhat test --network localhost test/E2E.test.ts
```
