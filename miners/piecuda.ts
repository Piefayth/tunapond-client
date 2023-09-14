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
    lastNewTargetStateTime = Date.now()

    constructor(exePath: string) {
        super()

        this.exePath = exePath
    }
    
    
    async pollResults(targetState: TargetState): Promise<MiningSubmissionEntry[]> {
        const ONE_MINUTE = 1000 * 60
        const didStateChange = (this.oldTargetState?.fields[1] || 0) != targetState.fields[1]
        
        let restart = false
        if (Date.now() > this.lastNewTargetStateTime + ONE_MINUTE) {
            this.lastNewTargetStateTime = Date.now()
            restart = true
        }

        if (didStateChange || !this.p || restart) {
            this.killExistingChild()
            this.startProcess(targetState)
            this.lastNewTargetStateTime = Date.now()
            this.oldTargetState = targetState
        }

        const solutions = await Promise.race([
            this.readProcessResults(),
            delay(this.READ_TIMEOUT)
        ]) as MiningSubmissionEntry[] || []

        this.storedSolutions = [...this.storedSolutions, ...solutions]

        //const status = await this.p?.status
        
        if (this.storedSolutions.length >= SEND_BATCH_SIZE) {
            const solutions = [...this.storedSolutions]
            this.storedSolutions = []
            return solutions
        } else {
            return []
        }
    }

    startProcess(targetState: TargetState) {
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
        const { done, value } = await reader.read()

        if (done) {
            return []
        }

        const solutions: MiningSubmissionEntry[] = []

        this.stringBuffer += decoder.decode(value || new Uint8Array())
        
        const lines = this.stringBuffer.split('\n')
        for (let i = 0; i < lines.length - 1; i++) {
            const [_, nonce] = lines[i].split('|').map(s => s.trim())
            solutions.push({ nonce })
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

