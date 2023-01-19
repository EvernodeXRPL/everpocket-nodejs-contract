export interface Signer {
  account: string;
  secret: string;
  weight: number;
}

export interface SignerListInfo {
  signerQuorum: number;
  signerList: Signer[];
}

export interface SignedBlob {
  blob: string;
  account: string;
}

export interface TransactionSubmissionInfo {
  sequence: number;
  maxLedgerSequence: number;
}