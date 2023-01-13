export interface UnlNode {
  publicKey: string
  activeOn: number
}

export interface ContractConfig {
  binPath: string,
  binArgs: string,
  environment: Map<string, string>,
  version: string,
  maxInputLedgerOffset: number,
  unl: string[],
  consensus: {
    mode: string,
    roundtime: number,
    stageSlice: number,
    threshold: number
  },
  npl: {
    mode: string
  },
  roundLimits: {
    userInputBytes: number,
    userOutputBytes: number,
    nplOutputBytes: number,
    procCpuSeconds: number,
    procMemBytes: number,
    procOfdCount: number
  }
}
