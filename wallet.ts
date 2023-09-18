import { loadSync } from "https://deno.land/std@0.199.0/dotenv/mod.ts";
import { C, Constr, Data, Kupmios, Lucid, MintingPolicy, Script, applyDoubleCborEncoding, applyParamsToScript, fromText, generatePrivateKey, generateSeedPhrase } from "https://deno.land/x/lucid@0.10.7/mod.ts";

loadSync({export: true})

const BankSchema = Data.Object({
    owners: Data.Map(Data.Bytes(), Data.Integer())
})
type BankData = Data.Static<typeof BankSchema>
const BankData = BankSchema as unknown as BankData

// TODO: Let users redeem without having to have ogmios and kupo
// Hosted service or something
export async function redeem(isPreview: boolean) {
    const seed = Deno.readTextFileSync("seed.txt")
    const network = isPreview ? "Preview" : "Mainnet"

    const POOL_OUTPUT_REFERENCE = Deno.env.get("POOL_OUTPUT_REFERENCE");
    if (!POOL_OUTPUT_REFERENCE) {
        throw Error("Cannot redeem from a pool without a POOL_OUTPUT_REFERENCE. Please point POOL_OUTPUT_REFERENCE to a valid UTxO.")
    }

    const POOL_SCRIPT_HASH = Deno.env.get("POOL_SCRIPT_HASH");
    if (!POOL_SCRIPT_HASH) {
        throw Error("Cannot redeem from a pool without a POOL_SCRIPT_HASH. Please point POOL_CONTRACT_ADDRESS to a valid UTxO.")
    }

    const POOL_CONTRACT_ADDRESS = Deno.env.get("POOL_CONTRACT_ADDRESS");
    if (!POOL_CONTRACT_ADDRESS) {
        throw Error("Cannot redeem from a pool without a POOL_CONTRACT_ADDRESS. Please point POOL_CONTRACT_ADDRESS to a valid address.")
    }

    const TUNA_VALIDATOR_HASH = Deno.env.get("TUNA_VALIDATOR_HASH")
    if (!TUNA_VALIDATOR_HASH) {
        throw Error("Cannot redeem from a pool without a TUNA_VALIDATOR_HASH. Please point POOL_CONTRACT_ADDRESS to a valid address.")
    }

    const OGMIOS_URL = Deno.env.get("OGMIOS_URL")
    if (!OGMIOS_URL) {
        throw Error("Cannot register a pool without a specified OGMIOS_URL.")
    }

    const KUPO_URL = Deno.env.get("KUPO_URL")
    if (!KUPO_URL) {
        throw Error("Cannot register a pool without a specified KUPO_URL.")
    }

    const lucid = await Lucid.new(new Kupmios(KUPO_URL, OGMIOS_URL), network)
    lucid.selectWalletFromSeed(seed)

    const poolBankToken = `${POOL_SCRIPT_HASH}${fromText("BANK")}`
    const utxoWithPoolToken = await lucid.utxoByUnit(POOL_SCRIPT_HASH + fromText("POOL"))
    const poolOwnerAddress = utxoWithPoolToken.address
    const tunaAssetName =  TUNA_VALIDATOR_HASH + fromText("TUNA")
    const poolContractUtxos = await lucid.utxosAt(POOL_CONTRACT_ADDRESS)

    if (lucid.utils.getAddressDetails(POOL_CONTRACT_ADDRESS).paymentCredential?.type != 'Script'){
        throw Error("POOL CONTRACT ADDRESS was not a Script address.")
    }

    const vkh = lucid.utils.getAddressDetails((await lucid.wallet.address())).paymentCredential?.hash
    if (!vkh) {
        throw Error("Wallet found in seed.txt was, against all odds, missing a payment credential.")
    }

    const bankUtxo = poolContractUtxos.find(utxo => {
        return utxo.assets[poolBankToken]
    })

    if (!bankUtxo) {
        console.log("There is no BANK token at the POOL_CONTRACT_ADDRESS")
        return new Response(JSON.stringify({
          message: "There is no BANK token at the POOL_CONTRACT_ADDRESS"
        }), { status: 500 })
      }

      
    const bankData: BankData = await lucid.datumOf<BankData>(bankUtxo, BankData)
    const originalBankedAmount = bankUtxo.assets[tunaAssetName]
    const withdrawAmount = bankData.owners.get(vkh)
    
    bankData.owners.set(vkh, 0n)
    const newBankedAmount = originalBankedAmount - withdrawAmount!

    const [scriptTxHash, scriptOutputIndex] = POOL_OUTPUT_REFERENCE.split("#")
    const scriptReference = await lucid.utxosByOutRef([{
        txHash: scriptTxHash,
        outputIndex: Number(scriptOutputIndex)
    }])

    const ownAddress = await lucid.wallet.address()

    const tx = await lucid.newTx()
        .collectFrom([bankUtxo], Data.to(new Constr(1, [new Constr(1, [])])))
        .readFrom([utxoWithPoolToken])
        .readFrom(scriptReference)
        .addSigner(ownAddress)
        .payToAddress(poolOwnerAddress, { lovelace: 2_000_000n })
        .payToAddressWithData(
            POOL_CONTRACT_ADDRESS,
            { inline: Data.to(bankData, BankData) },
            { 
              [poolBankToken]: 1n,  // pay the bank the identifying NFT and the aggregate proper total of tuna
              [tunaAssetName]: newBankedAmount
            },
          )
        .payToAddress(
            ownAddress,
            {
                [tunaAssetName]: withdrawAmount!
            }
        )
        .complete();
    
    const signed = await tx.sign().complete()
    const submit = await signed.submit()
    console.log(`Redemption for ${withdrawAmount} $TUNA submitted. Tx: ${submit}`)
}

export async function minerWallet(isPreview = false) {
    const network = isPreview ? "Preview" : "Mainnet"
    
    let seed: string | undefined = undefined
    try {
        seed = Deno.readTextFileSync("seed.txt")
        console.log("Mining key already exists, not generating new key...")
    } catch (e) {
        seed = generateSeedPhrase();
        Deno.writeTextFileSync("seed.txt", seed);
        console.log(`Miner wallet initialized and saved to seed.txt`)
    }

    const lucid = await Lucid.new(undefined, network)
    lucid.selectWalletFromSeed(seed)
    console.log(await lucid.wallet.address())
}

export async function poolWallet(isPreview = false) {
    try {
        const poolKeyRaw = Deno.readTextFileSync("poolKey.sk")
        console.log("Pool key already exists, not generating new key...")

        const privatePoolKey = C.PrivateKey.from_bech32(poolKeyRaw)

        const publicPoolKey = privatePoolKey.to_public();

        console.log(
            `Pool Address: ${publicKeyToEnterpriseAddress(publicPoolKey, isPreview)}`
        )
    } catch {
        const poolKeyRaw = generatePrivateKey()
        const privatePoolKey = C.PrivateKey.from_bech32(poolKeyRaw)
        const publicPoolKey = privatePoolKey.to_public();

        console.log(
            `Pool Address: ${publicKeyToEnterpriseAddress(publicPoolKey, isPreview)}`
        )

        Deno.writeTextFileSync("poolKey.sk", poolKeyRaw);
    }
}

export async function poolRegister(isPreview = false) {
    const POOL_CONTRACT_PATH = Deno.env.get("POOL_CONTRACT_PATH");
    if (!POOL_CONTRACT_PATH) {
        throw Error("Cannot register a pool without a built copy of the pool contract. Please point POOL_CONTRACT_PATH to a valid plutus.json.")
    }

    const plutusJson = JSON.parse(Deno.readTextFileSync(POOL_CONTRACT_PATH))
    const poolMintingPolicyRaw = plutusJson.validators.find((v: any) => v.title == "pool.mint").compiledCode

    const TUNA_VALIDATOR_HASH = Deno.env.get("TUNA_VALIDATOR_HASH")
    if (!TUNA_VALIDATOR_HASH) {
        throw Error("Cannot register a pool without a specified TUNA_VALIDATOR_HASH.")
    }

    const OGMIOS_URL = Deno.env.get("OGMIOS_URL")
    if (!OGMIOS_URL) {
        throw Error("Cannot register a pool without a specified OGMIOS_URL.")
    }

    const KUPO_URL = Deno.env.get("KUPO_URL")
    if (!KUPO_URL) {
        throw Error("Cannot register a pool without a specified KUPO_URL.")
    }

    const network = isPreview ? "Preview" : "Mainnet"
    const poolKeyRaw = Deno.readTextFileSync("./poolKey.sk")

    const lucid = await Lucid.new(new Kupmios(KUPO_URL, OGMIOS_URL), network)
    lucid.selectWalletFromPrivateKey(poolKeyRaw)

    const registrationUtxos = (await lucid.wallet.getUtxos()).filter(utxo => 
        utxo.assets["lovelace"] > 20_000_000
    )
    
    const ADA = isPreview ? "tADA" : "ADA"
    if (registrationUtxos.length == 0) {
        throw Error(`Must have at least 20 ${ADA} in the pool wallet to register.`)
    }
    // select whatever utxo from the wallet
    const registrationUtxo = registrationUtxos[0]

    // create a validator instance based on it
    // validator(registration_utxo_ref: OutputReference, tuna_policy: ScriptHash, max_pool_fee: Int) {

    // TODO: Parameterize the validator in a type safe way...why doesn't this work?
    // const OutputReferenceSchema = Data.Object({
    //     transaction_id: Data.Bytes(),
    //     output_index: Data.Integer()
    // })
    // type OutputReferenceData = Data.Static<typeof OutputReferenceSchema>
    // const OutputReferenceData = OutputReferenceSchema as unknown as OutputReferenceData
    
    // const outputReference: OutputReferenceData = {
    //     transaction_id: [registrationUtxo.txHash],
    //     output_index: BigInt(registrationUtxo.outputIndex)
    // }



    const outputReference = new Constr(0, [
        new Constr(0, [registrationUtxo.txHash]),
        BigInt(registrationUtxo.outputIndex),
    ]);

    const parameterizedPoolMintingPolicy = {
        type: "PlutusV2",
        script: applyDoubleCborEncoding(
            applyParamsToScript(
                poolMintingPolicyRaw, [
                    outputReference, 
                    TUNA_VALIDATOR_HASH,
                ]
            )
        )
    } as Script

    const poolContractAddress = lucid.utils.validatorToAddress(parameterizedPoolMintingPolicy)
    const poolScriptHash = lucid.utils.validatorToScriptHash(parameterizedPoolMintingPolicy)
    const poolMasterTokenAssetName = `${poolScriptHash}${fromText("POOL")}`
    const poolBankTokenAssetName = `${poolScriptHash}${fromText("BANK")}`

    // mint the nft from that validator back to the pool wallet
    // mint the bank nft back to the contract wallet
    const bank: BankData = {
        owners: new Map()
    }

    bank.owners.set("ff", 0n)

    const tx = await lucid.newTx()
        .collectFrom([registrationUtxo])
        .attachMintingPolicy(parameterizedPoolMintingPolicy)
        .mintAssets({
            [poolMasterTokenAssetName]: 1n,
            [poolBankTokenAssetName]: 1n
        }, Data.void())
        .payToContract(
            poolContractAddress,
            {   inline: Data.void(),
                scriptRef: parameterizedPoolMintingPolicy
            },
            {}
        )
        .payToContract(
            poolContractAddress,
            {   inline: Data.to(bank, BankData) },
            {
                [poolBankTokenAssetName]: 1n
            }
        )
        .complete()
    const signed = await tx.sign().complete()
    console.log("Submitting registration...\n")

    const txHash = await signed.submit()
    

    console.log(`Submitted new pool registration in transaction ${txHash}`)
    console.warn(`Please allow some time for this transaction to be available on chain.`)
    console.log(`Pool contract address: ${poolContractAddress}`)
    console.log(`Pool script hash: ${poolScriptHash}`)
    console.log(`Script Output Reference: ${txHash}#0`)
}

function publicKeyToEnterpriseAddress(publicKey: C.PublicKey, isPreview: boolean) {
    const cred = C.StakeCredential.from_keyhash(publicKey.hash());
    const enterprise = C.EnterpriseAddress.new(isPreview ? 0 : 1, cred);
    return enterprise.to_address().to_bech32(isPreview ? "addr_test" : "addr")
}

