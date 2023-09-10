import { loadSync } from "https://deno.land/std@0.199.0/dotenv/mod.ts";
import { Command } from "https://deno.land/x/cliffy@v1.0.0-rc.3/command/mod.ts";
import { mine } from "./mine.ts";
import { C, generatePrivateKey } from "https://deno.land/x/lucid@0.10.1/mod.ts";

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

const newWalletCommand = new Command()
  .description("Create a new pool operator wallet.")
  .option("-p, --preview", "Use testnet")
  .action(({ preview }) => {
    try {
      const privateKeyRaw = Deno.readTextFileSync("key.sk")
      console.log("key.sk already exists, skippping generation.");
      const privateKey = C.PrivateKey.from_bech32(privateKeyRaw)
      const publicKey = privateKey.to_public();
      const cred = C.StakeCredential.from_keyhash(publicKey.hash());
      const enterprise = C.EnterpriseAddress.new(preview ? 0 : 1, cred);
      console.log(enterprise.to_address().to_bech32(preview ? "addr_test" : "addr"));
    } catch {
      const key = generatePrivateKey()
      const privateKey = C.PrivateKey.from_bech32(key)
      const publicKey = privateKey.to_public();
      const cred = C.StakeCredential.from_keyhash(publicKey.hash());
      const enterprise = C.EnterpriseAddress.new(preview ? 0 : 1, cred);
      console.log(enterprise.to_address().to_bech32(preview ? "addr_test" : "addr"));
      Deno.writeTextFileSync("key.sk", key);
    }
  })

await new Command()
  .name("tunapond")
  .description("A pool-aware miner submission interface for Fortuna.")
  .version("0.0.1")
  .command("mine", mineCommand)
  .command("new_wallet", newWalletCommand)
  .parse(Deno.args);