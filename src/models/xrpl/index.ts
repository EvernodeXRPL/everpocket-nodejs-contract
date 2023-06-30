import { VoteOptions, VoteElectorOptions } from "../vote";

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

export interface SignatureInfo extends Signature {
  weight: number;
} 

export interface TransactionSubmissionInfo {
  sequence: number;
  maxLedgerSequence: number;
}

export interface XrplOptions {
  xrplApi?: any;
}

export interface MultiSignOptions {
  quorum?: number;
  weight?: number;
  signerCount?: number;
  voteElectorOptions?: VoteElectorOptions;
  txOptions?: any;
}

export interface URIToken {
  Flags: number;
  Issuer: string;
  Owner?: string;
  Amount?: any;
  index: string;
  URI: string;
}

export interface Memo {
  type: string;
  format: string;
  data: string;
}

export interface HookParameter {
  name: string;
  value: string;
}

export interface Transaction {
  TransactionType: string;
  Account: string;
  Amount: any;
  Destination: string;
  Memos?: Memo[];
  HookParameters?: HookParameter[];
}