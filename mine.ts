import {
    Constr,
    Lucid, 
    Network, 
    fromHex, 
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

type Work = {
    nonce: string
    current_block: Block
}

export type TargetState = Constr<string | bigint | string[]>

function blockToTargetState(block: Block, poolNonce: string): TargetState {
    return new Constr(0, [
        poolNonce,
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

const cardanoNetwork = Deno.env.get("NETWORK") as Network || "Mainnet" 
const lucid = await Lucid.new(undefined, cardanoNetwork)
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
    const address = await lucid.wallet.address()

    const maybeWork = await getWork(poolUrl)
    if (!maybeWork) {
        throw Error("Can't start main loop, no initial work!");
    }
    const { nonce, current_block } = maybeWork

    const miner = selectMinerFromEnvironment()
    let targetState = blockToTargetState(current_block, nonce)
    let wasSubmissionRejected = false
    
    while (true) {
        const results = await miner.pollResults(targetState, wasSubmissionRejected)
        wasSubmissionRejected = false

        const submission: MiningSubmission = {
            address: address,
            entries: results,
        }

        const submitResult = await fetch(`${poolUrl}/submit`, {
            method: 'POST',
            body: JSON.stringify(submission),
            headers: {
                ['Content-Type']: 'application/json'
            }
        })

        if (submitResult.status != 200) {
            wasSubmissionRejected = true
            continue;
        }

        const submissionResponse: SubmissionResponse = await submitResult.json()
        
        const rejectedResultCount = results.length - submissionResponse.num_accepted
        if (rejectedResultCount > 0) {
            console.warn(`Pool rejected ${rejectedResultCount} results. Check your miner output.`)
        }

        if (submissionResponse.working_block) {
            if (submissionResponse.working_block.block_number != targetState.fields[1] as unknown as number) {
                console.log(`Pool provided new block ${submissionResponse.working_block.block_number}.`)
                targetState = blockToTargetState(submissionResponse.working_block, nonce)
                // no point waiting, we got a new block!
            } else {
                await delay(5000)
            }
        } else {
            await delay(5000)
        }
    }
    
}

async function getWork(poolUrl: string): Promise<Work | undefined> {
    const address = await lucid.wallet.address()
    const workResponse = await fetch(`${poolUrl}/work?address=${address}`, {
        method: 'GET',
        headers: {
            ['Content-Type']: 'application/json'
        }
    })

    if (workResponse.status != 200) {
        console.debug(workResponse)
        console.log("Couldn't get any work!")
    } else {
        return await workResponse.json() as Work
    }
}
