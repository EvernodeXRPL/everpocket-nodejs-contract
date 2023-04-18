import { XrplContext } from "../../context";
import { Peer } from "../common";
import { XrplContextOptions } from "../xrpl";

export interface EvernodeContextOptions {
  xrplContext?: XrplContext;
  xrplOptions?: XrplContextOptions;
}

export interface AcquireOptions {
  host?: string;
  txOptions?: any;
}

export interface ClusterNode {
  publicKey: string;
  peer: Peer;
  account: string;
  isUNL: boolean;
  isQuorum: boolean;
}