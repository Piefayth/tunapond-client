import { loadSync } from "https://deno.land/std@0.199.0/dotenv/mod.ts";
import { Command } from "https://deno.land/x/cliffy@v1.0.0-rc.3/command/mod.ts";
import { mine } from "./mine.ts";

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


await new Command()
  .name("tunapond")
  .description("A pool-aware miner submission interface for Fortuna.")
  .version("0.0.1")
  .command("mine", mineCommand)
  .parse(Deno.args);