import { C, Lucid, generatePrivateKey, generateSeedPhrase } from "https://deno.land/x/lucid@0.10.1/mod.ts";

export async function minerWallet(isPreview = false) {
    const network = isPreview ? "Preview" : "Mainnet"
    
    let seed: string | undefined = undefined
    try {
        seed = Deno.readTextFileSync("seed.txt")
        console.log("Mining key already exists, not generating new key...")
    } catch (e) {
        seed = generateSeedPhrase();
        Deno.writeTextFileSync("seed.txt", seed);
    }

    const lucid = await Lucid.new(undefined, network)
    lucid.selectWalletFromSeed(seed)
    console.log(`Miner wallet initialized and saved to seed.txt`)
    console.log(await lucid.wallet.address())
}

export function poolWallet(isPreview = false) {
    try {
        const miningKeyRaw = Deno.readTextFileSync("poolKey.sk")
        console.log("Pool key already exists, not generating new key...")

        const privateMiningKey = C.PrivateKey.from_bech32(miningKeyRaw)

        const publicMiningKey = privateMiningKey.to_public();

        console.log(
            `Pool Address: ${publicKeyToEnterpriseAddress(publicMiningKey, isPreview)}`
        )
    } catch {
        const miningKeyRaw = generatePrivateKey()
        const privateMiningKey = C.PrivateKey.from_bech32(miningKeyRaw)
        const publicMiningKey = privateMiningKey.to_public();

        console.log(
            `Pool Address: ${publicKeyToEnterpriseAddress(publicMiningKey, isPreview)}`
        )

        Deno.writeTextFileSync("poolKey.sk", miningKeyRaw);
    }
}

function publicKeyToEnterpriseAddress(publicKey: C.PublicKey, isPreview: boolean) {
    const cred = C.StakeCredential.from_keyhash(publicKey.hash());
    const enterprise = C.EnterpriseAddress.new(isPreview ? 0 : 1, cred);
    return enterprise.to_address().to_bech32(isPreview ? "addr_test" : "addr")
}

