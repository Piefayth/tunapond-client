import {
    Constr,
    Lucid, 
    fromText, 
    toHex,
} from "https://deno.land/x/lucid@0.10.1/mod.ts"
import { PieCUDAMiner } from "./miners/piecuda.ts"
import { Miner } from "./miner.ts";
import { delay } from "./util.ts";

export type MiningSubmissionEntry = {
    sha: string,
    nonce: string
}

type MiningSubmission = {
    address: string,
    entries: MiningSubmissionEntry[]
}

type SubmissionResponse = {
    num_accepted: number,
    session_id: number,
    working_block: Block,
}

type Registration = {
    address: string,
    payload: string,
    key: string,
    signature: string
}

type Block = {
    block_number: number
    current_hash: string
    leading_zeroes: number
    difficulty_number: number
    epoch_time: number
    current_time: number
    extra: string
    interlink: string[]
}

type MiningSession = {
    address: string
    message: string
    session_id: number
    start_time: string
    current_block: Block
}

export type TargetState = Constr<string | bigint | string[]>

function blockToTargetState(block: Block): TargetState {
    const nonce = new Uint8Array(16);
    crypto.getRandomValues(nonce);

    return new Constr(0, [
        toHex(nonce),
        BigInt(block.block_number),
        block.current_hash,
        BigInt(block.leading_zeroes),
        BigInt(block.difficulty_number),
        BigInt(block.epoch_time)
    ])
}

type GenericServerMessage = {
    message: string
}

const lucid = await Lucid.new(undefined, "Mainnet")
lucid.selectWalletFromSeed(Deno.readTextFileSync("seed.txt"))

const miners = [
    "PIECUDA"
]

function selectMinerFromEnvironment(): Miner {
    const miner = Deno.env.get("MINER")
    if (!miner) {
        throw Error(`The environment variable MINER must be set. Options are ${miners.join(",")}`)
    }

    if (miner === "PIECUDA") {
        const exePath = Deno.env.get("PIECUDA_EXEPATH")
        if (!exePath) {
            throw Error(`To use the PIECUDA miner, the environment variable PIECUDA_EXEPATH must be set.`)
        }

        return new PieCUDAMiner(exePath)
    } else {
        throw Error(`Unsupported miner ${miner} selected.`)
    }
}

export async function mine(poolUrl: string) {
    Deno.addSignalListener("SIGINT", async () => {
        await leavePool(poolUrl);
        console.log("Successfully ended session with pool. Goodbye!");
        Deno.exit();
    });

    const session = await joinPool(poolUrl)
    let targetState = blockToTargetState(session.current_block)
    const miner = selectMinerFromEnvironment()
    
    while (true) {
        const results = await miner.pollResults(targetState)
        if (results.length > 0) {
            const submission: MiningSubmission = {
                address: session.address,
                entries: results,
            }
            const submitResult = await fetch(`${poolUrl}/submit`, {
                method: 'POST',
                body: JSON.stringify(submission),
                headers: {
                    ['Content-Type']: 'application/json'
                }
            })
            const submissionResponse: SubmissionResponse = await submitResult.json()
            
            console.log(`Submitted ${results.length} hashes!`)

            const rejectedResultCount = results.length - submissionResponse.num_accepted
            if (rejectedResultCount > 0) {
                console.warn(`Pool rejected ${rejectedResultCount} results. Check your miner output.`)
            }

            if (submissionResponse.working_block.block_number != targetState.fields[1] as unknown as number) {
                console.log(`Pool provided new block ${submissionResponse.working_block.block_number}.`)
                targetState = blockToTargetState(submissionResponse.working_block)
            }
        } else {
            // users might want to request an updated datum anyway?
        }

        await delay(1000)
    }
    
}

async function joinPool(poolUrl: string): Promise<MiningSession> {
    const address = await lucid.wallet.address()
    const payload = "eventually this message will be a date/time that gets validated"
    const payloadHex = fromText(payload)
    const signed = await lucid.wallet.signMessage(address, payloadHex)
    const registration: Registration = {
        address,
        payload,
        ...signed
    }

    const joinPoolResponse = await fetch(`${poolUrl}/register`, {
        method: 'POST',
        body: JSON.stringify(registration),
        headers: {
            ['Content-Type']: 'application/json'
        }
    })

    if (joinPoolResponse.status == 400) {
        const response = await joinPoolResponse.json() as GenericServerMessage
        if (response.message.match(/session already exists/)) {
            await leavePool(poolUrl)
            return joinPool(poolUrl)
        } else {
            throw Error(`Could not join pool. Server sent message |${response.message}|.`)
        }
    } else {
        const miningSession: MiningSession = await joinPoolResponse.json()
        console.log(`Successfully registered new mining session ${miningSession.session_id}. Mining begins at block ${miningSession.current_block.block_number}.`)
        return miningSession
    }
}

async function leavePool(poolUrl: string): Promise<void> {
    const address = await lucid.wallet.address()
    const payload = "eventually this message will be a date/time that gets validated"
    const payloadHex = fromText(payload)
    const signed = await lucid.wallet.signMessage(address, payloadHex)
    const registration: Registration = {
        address,
        payload,
        ...signed
    }

    const leavePoolResponse = await fetch(`${poolUrl}/deregister`, {
        method: 'POST',
        body: JSON.stringify(registration),
        headers: {
            ['Content-Type']: 'application/json'
        }
    })

    if (leavePoolResponse.status == 400) {
        const response = await leavePoolResponse.json() as GenericServerMessage
        throw Error(`Could not leave pool. Server sent message |${response.message}|`)
    }
}