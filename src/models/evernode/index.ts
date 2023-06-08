import { EvernodeContext, UtilityContext, VoteContext, XrplContext } from "../../context";
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

export interface ClusterContextOptions {
  evernodeContext: EvernodeContext
  utilityContext: UtilityContext;
}

export interface ClusterNode {
  publicKey: string;
  ip: string;
  peer: Peer;
  userPort: number;
  account: string;
  createdOn: number;
  addedToUnl?: number;
  isUnl: boolean;
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

export interface LeaseURIInfo {
  leaseIndex: number;
  halfTos: any;
  leaseAmount: number;
  identifier: any;
}
