(BigInt.prototype as any).toJSON = function () {
    return this.toString();
  };
  
  

import { Data } from "https://deno.land/x/lucid@0.10.1/mod.ts";
import { MiningSubmissionEntry, TargetState } from "../mine.ts"
import { Miner } from "../miner.ts"
import { delay } from "../util.ts";

const SEND_BATCH_SIZE = 5

export class PieCUDAMiner extends Miner {
    READ_TIMEOUT = 5000
    p: Deno.ChildProcess | undefined = undefined
    cmd: Deno.Command | undefined = undefined
    exePath: string
    oldTargetState: TargetState | undefined = undefined
    stringBuffer = ""
    storedSolutions: MiningSubmissionEntry[] = []

    constructor(exePath: string) {
        super()

        this.exePath = exePath
    }
    
    async pollResults(targetState: TargetState): Promise<MiningSubmissionEntry[]> {
        const didStateChange = (this.oldTargetState?.fields[1] || 0) != targetState.fields[1]

        if (didStateChange || !this.p) {
            this.killExistingChild()
            this.startProcess(targetState)

            this.oldTargetState = targetState
        }

        const solutions = await Promise.race([
            this.readProcessResults(),
            delay(this.READ_TIMEOUT)
        ]) as MiningSubmissionEntry[]


        this.storedSolutions = [...this.storedSolutions, ...solutions]

        const status = await this.p?.status
        
        if (this.storedSolutions.length >= SEND_BATCH_SIZE || (status?.success == true && this.storedSolutions.length > 0)) {
            console.log("SENDING SOLVES")
            const solutions = [...this.storedSolutions]
            this.storedSolutions = []
            return solutions
        } else {
            return []
        }
    }

    startProcess(targetState: TargetState) {
        console.log("Starting process")
        const hexTargetState = Data.to(targetState)
        const appropriatePortionOfTargetState = hexTargetState.slice(40)
        const args = [appropriatePortionOfTargetState, `${targetState.fields[0]}`, `${targetState.fields[3]}`, "8"]

        this.cmd = new Deno.Command(this.exePath, {
            stdout: 'piped',
            args
        })

        this.p = this.cmd.spawn()
    }

    async readProcessResults(): Promise<MiningSubmissionEntry[]> {
        if (!this.p) {
            return []
        }

        const decoder = new TextDecoder()
        const reader = this.p.stdout.getReader()
        const { value } = await reader.read()
        const solutions: MiningSubmissionEntry[] = []

        this.stringBuffer += decoder.decode(value || new Uint8Array())
        
        const lines = this.stringBuffer.split('\n')
        for (let i = 0; i < lines.length - 1; i++) {
            const [sha, nonce] = lines[i].split('|').map(s => s.trim())
            solutions.push({ sha, nonce })
        }
        
        this.stringBuffer = lines[lines.length - 1]

        reader.releaseLock()
        
        return solutions
    }

    async killExistingChild() {
        if (this.p) {
            try {
                this.p.kill()
            } catch {}
        }
    }
}

