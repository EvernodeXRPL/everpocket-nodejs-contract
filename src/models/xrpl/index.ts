import { VoteElectorOptions } from "../vote";

export interface Signer {
  account: string;
  weight: number;
}

export interface SignerKey {
  account: string;
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

export interface TransactionInfo {
  hash: string;
  resultCode: string;
  lastLedgerSequence: number;
  ledgerIndex?: number;
}

export interface TransactionData {
  pending: TransactionInfo[];
  validated: TransactionInfo[];
}

export interface DecisionOptions {
  key: string;
  options?: any;
}

export interface TransactionSubmissionInfo {
  sequence: number;
  maxLedgerSequence: number;
  options?: DecisionOptions;
}

export interface XrplOptions {
  xrplApi?: any;
  rippleServer?: any;
  fallbackRippledServers?: any;
  network?: any;
}

export interface MultiSignOptions {
  quorum?: number;
  weight?: number;
  signerCount?: number;
  voteElectorOptions?: VoteElectorOptions;
  txSubmitInfo?: TransactionSubmissionInfo;
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