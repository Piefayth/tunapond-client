# tunapond-client

A pool-aware mining client for Fortuna.

## Usage

- Copy `.env.example` to `.env`
- Set the `POOL_URL` and appropriate `MINER` variables.
    - Note: Only the `PIECUDA` miner is currently supported.
- Place your `seed.txt` at the root of this repo.
- `deno run --allow-all main.ts mine`

## Adding a Miner

Use `piecuda.ts` as an example. Miners must fulfill the interface with:

```ts
abstract pollResults(targetState: TargetState): Promise<MiningSubmissionEntry[]>
```

The Deno program infinitely loops and consumes results from `pollResults`. Miner internals should batch non-critical results! Sending every single low-difficulty hash that is found individually will overwhelm the pool. Only yield to the outer sending loop with a single result if that result is a full-difficulty datum solve!