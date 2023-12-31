import { loadSync } from "https://deno.land/std@0.199.0/dotenv/mod.ts";
import { Command } from "https://deno.land/x/cliffy@v1.0.0-rc.3/command/mod.ts";
import { mine } from "./mine.ts";
import { minerWallet, poolRegister, poolWallet, redeem } from "./wallet.ts";
import { number } from "https://deno.land/x/cliffy@v1.0.0-rc.3/flags/types/number.ts";
import { Lucid } from "https://deno.land/x/lucid@0.10.1/mod.ts";

if (!import.meta.main) {
  console.error("main.ts is not a module")
}

loadSync({ export: true, allowEmptyValues: true });


const mineCommand = new Command()
  .description("Start the miner")
  .env("POOL_URL=<value:string>", "Mining Pool URL", { required: true })
  .action(async ({ poolUrl }) => {
      await mine(poolUrl)
  })

const poolWalletCommand = new Command()
  .description("Create a new pool operator wallet.")
  .option("-p, --preview", "Use testnet")
  .action(({ preview }) => {
    poolWallet(preview)
  })

const registerPoolCommand = new Command()
  .description("Register a new pool.")
  .option("-p, --preview", "Use testnet")
  .action(({ preview }) => {
    poolRegister(preview)
  })

const minerWalletCommand = new Command()
  .description("Create a new miner wallet.")
  .option("-p, --preview", "Use testnet")
  .action(({ preview }) => {
    minerWallet(preview)
  })

const redeemCommand = new Command()
  .description("Redeem tuna from a mining pool.")
  .option("-p, --preview", "Use testnet")
  .action(({ preview }) => {
    redeem(preview || false )
  })

const whoamiCommand = new Command()
  .description("Returns a public key hash for a mining wallet.")
  .option("-p, --preview", "Use testnet")
  .action(async ({ preview }) => {
    const seed = Deno.readTextFileSync('./seed.txt')
    const lucid = await Lucid.new(undefined, preview ? "Preview" : "Mainnet")
    lucid.selectWalletFromSeed(seed)
    const vkh = lucid.utils.getAddressDetails((await lucid.wallet.address())).paymentCredential?.hash
    console.log(`You are ${vkh}`)
  })

const whoisthisCommand = new Command()
  .description("Returns a public key hash for a mining wallet.")
  .arguments('<address>')
  .option("-p, --preview", "Use testnet")
  .action(async ({ preview }, address) => {
    const lucid = await Lucid.new(undefined, preview ? "Preview" : "Mainnet")
    const vkh = lucid.utils.getAddressDetails(address).paymentCredential?.hash
    console.log(`They are ${vkh}`)
  })

await new Command()
  .name("tunapond")
  .description("A pool-aware miner submission interface for Fortuna.")
  .version("0.0.1")
  .command("mine", mineCommand)
  .command("pool_wallet", poolWalletCommand)
  .command("register_pool_this_costs_20_ADA", registerPoolCommand)
  .command("mining_wallet", minerWalletCommand)
  .command("redeem", redeemCommand)
  .command("whoami", whoamiCommand)
  .command("whoisthis", whoisthisCommand)
  .parse(Deno.args);