import { AcquireOptions, AcquiredNode, PendingAcquire } from "../evernode";

export interface NodeStatusInfo {
  status: NodeStatus;
  onLcl: number;
}

export interface NodeInfo {
  status: NodeStatusInfo;
  acknowledgeTries: number;
}

export interface ClusterOptions {
  maturityLclThreshold?: number;
  acknowledgeLclThreshold?: number;
  acknowledgeRetryLclThreshold?: number;
}

export interface ClusterNode extends AcquiredNode {
  status: NodeStatusInfo;
  activeOnLcl?: number;
  isUnl: boolean;
  signerAddress?: string;
  createdOnTimestamp?: number;
  lifeMoments: number;
  targetLifeMoments: number;
  signerReplaceFailedAttempts?: number;
  owner: number;
}

export interface PendingNode extends PendingAcquire {
  targetLifeMoments: number;
  aliveCheckCount: number;
}

export interface ClusterData {
  initialized: boolean,
  nodes: ClusterNode[],
  pendingNodes: PendingNode[]
}

export interface ClusterMessage {
  type: ClusterMessageType;
  data?: any;
}

export interface ClusterMessageResponse {
  type: ClusterMessageType;
  status: ClusterMessageResponseStatus;
  data?: any;
}

export interface AddNodeOperation {
  acquireOptions: AcquireOptions;
  lifeMoments: number;
}

export interface ExtendNodeOperation {
  nodePubkey: string;
  moments: number;
}

export interface RemoveNodeOperation {
  nodePubkey: string;
  force: boolean;
}

export interface Operation {
  type: OperationType,
  data: AddNodeOperation | ExtendNodeOperation | RemoveNodeOperation
}

export interface OperationData {
  operations: Operation[]
}

export enum ClusterMessageType {
  MATURED = "maturity_ack",
  CLUSTER_NODES = "cluster_nodes",
  UNKNOWN = "unknown"
}

export enum ClusterMessageResponseStatus {
  OK = "ok",
  FAIL = "fail",
  UNHANDLED = "unhandled"
}

export enum OperationType {
  ADD_NODE = "add_node",
  EXTEND_NODE = "extend_node",
  REMOVE_NODE = "remove_node"
}

export enum NodeStatus {
  NONE = 0,
  CREATED,
  CONFIGURED,
  ACKNOWLEDGED,
  ADDED_TO_UNL
}

export enum ClusterOwner {
  NONE = 0,
  SELF_MANAGER
}
