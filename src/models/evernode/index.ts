import { XrplContextOptions } from "../xrpl";

export interface AcquireOptions {
  host?: string;
  hostMessageKey?: string;
  instanceCfg?: any;
  preferredHosts?: string[];
  txOptions?: any;
}

export interface PendingAcquire {
  host: string;
  leaseOfferIdx: string;
  refId: string;
  messageKey: string;
}

export interface AcquiredNode extends Instance {
  host: string;
  refId: string;
}

export interface AcquireData {
  pendingAcquires: PendingAcquire[];
  acquiredNodes: AcquiredNode[];
}

export interface Instance {
  name: string;
  ip: string;
  pubkey: string;
  contractId: string;
  peerPort: number;
  userPort: number;
}

export interface LeaseURIInfo {
  leaseIndex: number;
  halfTos: any;
  leaseAmount: number;
  identifier: any;
}
