export interface AcquireOptions {
  host?: string;
  hostMessageKey?: string;
  instanceCfg?: InstanceConfig;
  preferredHosts?: string[];
  txOptions?: any;
}

export interface InstanceConfig {
  ownerPubkey: string,
  contractId: string,
  image: string,
  config: any
}

export interface PendingAcquire {
  host: string;
  leaseOfferIdx: string;
  refId: string;
  messageKey: string;
  acquireLedgerIdx: number;
  acquireSentOnLcl: number;
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
