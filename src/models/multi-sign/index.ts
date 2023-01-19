export interface Signer {
  address: string;
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