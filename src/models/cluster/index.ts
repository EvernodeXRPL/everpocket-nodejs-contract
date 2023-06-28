import { UtilityContext } from "../../context";
import { AcquiredNode, PendingAcquire } from "../evernode";

export interface ClusterOptions {
  utilityContext: UtilityContext;
  maturityLclThreshold?: number;
}

export interface ClusterNode extends AcquiredNode {
  createdOnLcl: number;
  addedToUnlOnLcl?: number;
  ackReceivedOnLcl?: number;
  activeOnLcl?: number;
  isUnl: boolean;
  isQuorum: boolean;
  createdOnTimestamp?: number;
  lifeMoments: number;
  targetLifeMoments: number;
}

export interface PendingNode extends PendingAcquire {
  targetLifeMoments: number;
  aliveCheckCount: number;
}

export interface ClusterData {
  nodes: ClusterNode[],
  pendingNodes: PendingNode[]
}

export interface ClusterMessage {
  type: ClusterMessageType;
  nodePubkey: string;
}

export interface ClusterMessageResponse {
  type: ClusterMessageType;
  status: ClusterMessageResponseStatus;
}

export enum ClusterMessageType {
  MATURED = "maturity_ack",
  UNKNOWN = "unknown"
}

export enum ClusterMessageResponseStatus {
  OK = "ok",
  FAIL = "fail",
  UNHANDLED = "unhandled"
}
