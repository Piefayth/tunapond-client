import { Data } from "https://deno.land/x/lucid@0.10.1/mod.ts";
import { MiningSubmissionEntry, TargetState } from "../mine.ts"
import { Miner } from "../miner.ts"

const SEND_BATCH_SIZE = 5

export class PieCUDAMiner extends Miner {
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
        const didStateChange = (this.oldTargetState?.fields[0] || 0) != targetState.fields[0]

        if (didStateChange) {
            if (this.p) {
                try {
                    this.p.kill()
                } catch {}
            }

            const hexTargetState = Data.to(targetState)
            const appropriatePortionOfTargetState = hexTargetState.slice(40)
            const args = [appropriatePortionOfTargetState, `${targetState.fields[0]}`, `${targetState.fields[3]}`, "8"]
            console.log(`Executing command: ${this.exePath} with arguments: ${args.join(" ")}`)

            this.cmd = new Deno.Command(this.exePath, {
                stdout: 'piped',
                args
            })

            this.p = this.cmd.spawn()

            this.oldTargetState = targetState
            return Promise.resolve([])
        } else {
            if (!this.p) {
                return Promise.resolve([])
            }

            const decoder = new TextDecoder();
            const reader = this.p.stdout.getReader()

            while (true) {
                const { done, value } = await reader.read();
        
                if (done) {
                    break;
                }
        
                this.stringBuffer += decoder.decode(value || new Uint8Array());
                
                const lines = this.stringBuffer.split('\n');
                for (let i = 0; i < lines.length - 1; i++) {
                    const [sha, nonce] = lines[i].split('|').map(s => s.trim());
                    this.storedSolutions.push({ sha, nonce });
                }
        
                this.stringBuffer = lines[lines.length - 1];
        
                if (this.storedSolutions.length >= SEND_BATCH_SIZE) {
                    break;
                }
            }

            reader.releaseLock()
            
            // TODO: check if solution is a real solve, in which case return immediately
            const solutions = [...this.storedSolutions]
            this.storedSolutions = []

            return Promise.resolve(solutions)
        }
    }
}