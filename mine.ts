import {
    Constr,
    Lucid, 
    Network, 
} from "https://deno.land/x/lucid@0.10.1/mod.ts"
import { PieCUDAMiner } from "./miners/piecuda.ts"
import { Miner } from "./miner.ts";
import { delay } from "./util.ts";
import { loadSync } from "https://deno.land/std@0.199.0/dotenv/mod.ts";

export type MiningSubmissionEntry = {
    nonce: string
}

type MiningSubmission = {
    address: string,
    entries: MiningSubmissionEntry[]
}

type SubmissionResponse = {
    num_accepted: number,
    nonce: string,
    working_block: Block,
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

type Work = {
    nonce: string
    current_block: Block
    miner_id: number
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

loadSync({ export: true })

const cardanoNetwork = Deno.env.get("NETWORK") as Network || "Mainnet" 
const lucid = await Lucid.new(undefined, cardanoNetwork)

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

const DELAY = 2000
async function doWork(
    poolUrl: string, 
    miner: Miner, 
    address: string, 
    targetState: TargetState, 
    minerID: number,
) {
    log(`Working on block ${targetState.fields[1]}`)
    const results = await miner.pollResults(targetState)

    if (results.length === 0) {
        await delay(DELAY)
    } else {
        try {
            log(`Submitting ${results.length} results.`)
            const submissionResponse = await submitWork(poolUrl, address, results)
            if (submissionResponse.working_block) {
                const newTargetState = blockToTargetState(submissionResponse.working_block, submissionResponse.nonce)
                return doWork(poolUrl, miner, address, newTargetState, minerID)
            }
        } catch (e) {
            await delay(DELAY)
        }
    }

    try {
        const newWork = await getWork(poolUrl)
        if (!newWork) {
            throw Error("Could not get new work from submission response or work endpoint. Is the pool down? Are you connected to the internet?");
        }
        const newTargetState = blockToTargetState(newWork.current_block, newWork.nonce)
        return doWork(poolUrl, miner, address, newTargetState, minerID)
    } catch {
        console.warn("Warning: Failed to get new work. Continuing to mine previous block.")
        return doWork(poolUrl, miner, address, targetState, minerID)
    }



}

async function submitWork(poolUrl: string, address: string, work: MiningSubmissionEntry[]): Promise<SubmissionResponse> {
    const submission: MiningSubmission = {
        address: address,
        entries: work,
    }

    const submitResult = await fetch(`${poolUrl}/submit`, {
        method: 'POST',
        body: JSON.stringify(submission),
        headers: {
            ['Content-Type']: 'application/json'
        }
    })
    
    if (submitResult.status != 200) {
        const submissionResponse: SubmissionResponse = await submitResult.json()
        log("Server was unable to submit work: " + JSON.stringify(submissionResponse))
        throw Error("Server was unable to submit work.")
    } else {
        const submissionResponse: SubmissionResponse = await submitResult.json()
        const rejectedResultCount = work.length - submissionResponse.num_accepted
        if (rejectedResultCount > 0) {
            console.warn(`Pool rejected ${rejectedResultCount} results. Check your miner output.`)
        }
    
        return submissionResponse
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
        const work = await workResponse.json() as Work
        return work
    }
}

interface HashrateResponse {
    estimated_hash_rate: number
}
async function displayHashrate(poolUrl: string, minerID: number, startTime: number) {
    const hashrateResult = await fetch(`${poolUrl}/hashrate?miner_id=${minerID}&start_time=${startTime}`)
    const hashrateJson: HashrateResponse = await hashrateResult.json() 
    log(`Pool session hashrate: ${Math.trunc(hashrateJson.estimated_hash_rate)}/s.`)
}

export async function mine(poolUrl: string) {
    lucid.selectWalletFromSeed(Deno.readTextFileSync("seed.txt"))
    const address = await lucid.wallet.address()

    const maybeWork = await getWork(poolUrl)
    if (!maybeWork) {
        throw Error("Can't start main loop, no initial work!");
    }

    const startTime = Math.floor(Date.now() / 1000)
    log(`Began mining at ${startTime} for miner ID ${maybeWork.miner_id}`)
    const { nonce, current_block } = maybeWork

    const miner = selectMinerFromEnvironment()
    const targetState = blockToTargetState(current_block, nonce)


    setInterval(() => {
        displayHashrate(poolUrl, maybeWork.miner_id, startTime)
    }, 15_000)
    
    await doWork(poolUrl, miner, address, targetState, maybeWork.miner_id)
}

function log(...args: any[]): void {
    const timestamp = new Date().toLocaleString().split(", ")[1];
    console.log(`[${timestamp}]`, ...args);
}