import { MiningSubmissionEntry, TargetState } from "./mine.ts"

export abstract class Miner {
    abstract pollResults(targetState: TargetState, samplingZeroes: number): Promise<MiningSubmissionEntry[]>
}