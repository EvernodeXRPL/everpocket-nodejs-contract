import { InstanceConfig } from "../evernode";

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
  targetNodeCount: number;
  targetLifeMoments: number;
  preferredHosts: string[];
  instanceCfg: InstanceConfig;
}

export interface User {
  publicKey: string;
  inputs: [number, number];

  send(msg: string): Promise<void>;
}

export interface ConnectionOptions {
  timeout?: number;
}