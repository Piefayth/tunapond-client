# tunapond-client

A pool-aware mining client for Fortuna.

## Usage

- Copy `.env.example` to `.env`
- Set the `POOL_URL` and appropriate `MINER` variables.
    - Note: Only the `PIECUDA` miner is currently supported.
- Place your `seed.txt` at the root of this repo. (or generate one with the instructions in the next section)
    - TODO: This repo doesn't actually need your seed; it could just take an address.
- `deno run --allow-all main.ts mine`

Miners can use this repository to create a new mining wallet. For preview:
    - `deno run --allow-all main.ts mining_wallet -p` 
Pool operators can also use this repository to create pool wallets. For preview:
    - `deno run --allow-all main.ts pool_wallet -p` 

Currently only one miner is supported! If you want to use the `PIECUDA` miner, you must compile the exe from [this repo](https://github.com/Piefayth/SHA256CUDA) and point to it with the env var `PIECUDA_EXEPATH`.

## Adding a Miner

Use `piecuda.ts` as an example. Miners must fulfill the interface with:

```ts
abstract pollResults(targetState: TargetState): Promise<MiningSubmissionEntry[]>
```

The Deno program infinitely loops and consumes results from `pollResults`. Miner internals should batch non-critical results! Sending every single low-difficulty hash that is found individually will overwhelm the pool. Only yield to the outer sending loop with a single result if that result is a full-difficulty datum solve!