export interface Signer {
  account : string;
  weight: number
}

export interface SignerListInfo {
  signerQuorum: number;
  signerList: Signer[];
}

export interface SignedBlob {
  blob : string;
  account: string;
}