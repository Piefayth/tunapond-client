import { C, generatePrivateKey } from "https://deno.land/x/lucid@0.10.1/mod.ts";

export function newWallet(isPreview = false) {
    try {
      const miningKeyRaw = Deno.readTextFileSync("miningKey.sk")
      const paymentKeyRaw = Deno.readTextFileSync("paymentKey.sk")
      console.log("Both keys already exist, not generating new keys...")
  
      const privateMiningKey = C.PrivateKey.from_bech32(miningKeyRaw)
      const privatePaymentKey = C.PrivateKey.from_bech32(paymentKeyRaw)
  
      const publicMiningKey = privateMiningKey.to_public();
      const publicPaymentKey = privatePaymentKey.to_public();
  
      console.log(
        `Mining Address: ${publicKeyToEnterpriseAddress(publicMiningKey, isPreview)}`
      )
      console.log(
        `Payments Address: ${publicKeyToEnterpriseAddress(publicPaymentKey, isPreview)}`
      )
    } catch {
      const miningKeyRaw = generatePrivateKey()
      const paymentKeyRaw = generatePrivateKey()
      
      const privateMiningKey = C.PrivateKey.from_bech32(miningKeyRaw)
      const privatePaymentKey = C.PrivateKey.from_bech32(paymentKeyRaw)
  
      const publicMiningKey = privateMiningKey.to_public();
      const publicPaymentKey = privatePaymentKey.to_public();
  
      console.log(
        `Mining Address: ${publicKeyToEnterpriseAddress(publicMiningKey, isPreview)}`
      )
      console.log(
        `Payments Address: ${publicKeyToEnterpriseAddress(publicPaymentKey, isPreview)}`
      )
  
      Deno.writeTextFileSync("miningKey.sk", miningKeyRaw);
      Deno.writeTextFileSync("paymentKey.sk", paymentKeyRaw);
    }
  }
  
  function publicKeyToEnterpriseAddress(publicKey: C.PublicKey, isPreview: boolean) {
    const cred = C.StakeCredential.from_keyhash(publicKey.hash());
    const enterprise = C.EnterpriseAddress.new(isPreview ? 0 : 1, cred);
    return enterprise.to_address().to_bech32(isPreview ? "addr_test" : "addr")
  }