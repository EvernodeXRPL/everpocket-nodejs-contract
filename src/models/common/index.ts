export interface UnlNode {
  publicKey?: string;
  activeOn?: number;
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

export interface Contract {
  name: string;
  contractId: string;
  image: string;
  targetNodeCount: number;
  targetLifeTime: number;
  config: any;
}

export interface User {
  publicKey: string;
  inputs: [number, number]
}

export interface ConnectionOptions {
  timeout?: number;
}