export interface UnlNode {
  publicKey: string
  activeOn: number
}

export interface SignerList {
  account : string;
  weight: number
}

export interface SignerListInfo {
  signerQuorum: number;
  signerList: SignerList[];
}