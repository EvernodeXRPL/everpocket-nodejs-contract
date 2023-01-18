export interface Signer {
  account : string;
  weight: number
}

export interface SignerListInfo {
  signerQuorum: number;
  signerList: Signer[];
}