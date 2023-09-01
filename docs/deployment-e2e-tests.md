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

## run test for pre-release code

```sh
# If the target chain already has contracts deployed
npx hardhat test --network localhost test/E2E.<NETWORK>.test.ts
```

## run deployment

```sh
# If the target chain already has contracts deployed
cp -r deployments/<NETWORK> deployments/localhost
```

Note: If you want to check `deployments/` files changes easier, uncomment `deployments/localhost` line from `.gitignore` and stage them.
All modifications done by the scripts will appear on the git changes area.

```sh
npx hardhat deploy --network localhost > DEPLOYMENT_TEST_OUTPUT.txt
```

Note: Always run deployment scripts twice to make sure all changes are executed (for example: calling a function for the new version of the contract won't work on the first run because of outdated ABI but will on the second).

## run test for post-release code

```sh
npx hardhat test --network localhost test/E2E.<NETWORK>.next.test.ts
```
