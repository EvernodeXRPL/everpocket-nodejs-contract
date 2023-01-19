export class UnlNode {
  publicKey?: string;
  activeOn?: number;
}

export class ContractConfig {
  binPath?: string;
  binArgs?: string;
  environment?: Map<string, string>;
  version?: string;
  maxInputLedgerOffset?: number;
  unl?: string[];
  consensus?: {
    mode?: string;
    roundtime?: number;
    stageSlice?: number;
    threshold?: number
  };
  npl?: {
    mode?: string
  };
  roundLimits?: {
    userInputBytes?: number;
    userOutputBytes?: number;
    nplOutputBytes?: number;
    procCpuSeconds?: number;
    procMemBytes?: number;
    procOfdCount?: number;
  }
}

export class Peer {
  ip?: string;
  port?: number;

  constructor(ip: string, port: number) {
    this.ip = ip;
    this.port = port;
  }

  toString(): string {
    if (!this.ip || !this.port)
      throw 'IP and Port cannot be empty.'
    return `${this.ip}:${this.port}`
  }
}