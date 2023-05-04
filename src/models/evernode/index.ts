import { VoteContext, XrplContext } from "../../context";
import { Peer } from "../common";
import { XrplContextOptions } from "../xrpl";

export interface EvernodeContextOptions {
  xrplContext?: XrplContext;
  xrplOptions?: XrplContextOptions;
}

export interface AcquireOptions {
  host?: string;
  hostMessageKey?: string;
  instanceCfg?: any;
  txOptions?: any;
}

export interface ClusterNode {
  publicKey: string;
  peer: Peer;
  account: string;
  isUNL: boolean;
  isQuorum: boolean;
}

export interface Instance {
  name: string;
  ip: string;
  pubKey: string;
  contractId: string;
  peerPort: string;
  userPort: string;
  extended?: boolean;
}