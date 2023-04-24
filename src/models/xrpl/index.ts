import { VoteContext } from "../../context";
import { VoteContextOptions } from "../vote";

export interface Signer {
  account: string;
  weight: number;
}

export interface SignerPrivate extends Signer {
  secret: string;
}

export interface SignerListInfo {
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
  signerCount?: number;
  voteTimeout?: number;
  txOptions?: any;
}