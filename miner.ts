import { MiningSubmissionEntry, TargetState } from "./mine.ts"

export abstract class Miner {
    abstract pollResults(targetState: TargetState): Promise<MiningSubmissionEntry[]>
}