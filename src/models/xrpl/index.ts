import { VoteContext } from "../../context";
import { VoteContextOptions } from "../vote";

export interface Signer {
  account: string;
  secret: string;
  weight: number;
}

export interface SignerListInfo {
  signer?: Signer;
  signerQuorum: number;
  signerList: Signer[];
}

export interface Signature {
  Signer: {
    SigningPubKey: string;
    TxnSignature: string;
    Account: string;
  }
}

export interface TransactionSubmissionInfo {
  sequence: number;
  maxLedgerSequence: number;
}

export interface XrplContextOptions {
  xrplApi?: any;
  voteContext?: VoteContext;
  voteOptions?: VoteContextOptions;
}

export interface MultiSignOptions {
  quorum?: number;
  weight?: number;
  voteTimeout?: number;
}