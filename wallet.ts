import { C, generatePrivateKey } from "https://deno.land/x/lucid@0.10.1/mod.ts";

export function newWallet(isPreview = false) {
    try {
      const miningKeyRaw = Deno.readTextFileSync("miningKey.sk")
      console.log("Keys already exists, not generating new key...")
  
      const privateMiningKey = C.PrivateKey.from_bech32(miningKeyRaw)
  
      const publicMiningKey = privateMiningKey.to_public();
  
      console.log(
        `Mining Address: ${publicKeyToEnterpriseAddress(publicMiningKey, isPreview)}`
      )
    } catch {
      const miningKeyRaw = generatePrivateKey()
      const privateMiningKey = C.PrivateKey.from_bech32(miningKeyRaw)
      const publicMiningKey = privateMiningKey.to_public();
  
      console.log(
        `Mining Address: ${publicKeyToEnterpriseAddress(publicMiningKey, isPreview)}`
      )
  
      Deno.writeTextFileSync("miningKey.sk", miningKeyRaw);
    }
  }
  
  function publicKeyToEnterpriseAddress(publicKey: C.PublicKey, isPreview: boolean) {
    const cred = C.StakeCredential.from_keyhash(publicKey.hash());
    const enterprise = C.EnterpriseAddress.new(isPreview ? 0 : 1, cred);
    return enterprise.to_address().to_bech32(isPreview ? "addr_test" : "addr")
  }