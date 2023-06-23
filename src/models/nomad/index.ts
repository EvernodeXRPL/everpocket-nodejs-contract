import { InstanceConfig } from "../evernode";

export interface NomadOptions {
    targetNodeCount: number;
    targetLifeMoments: number;
    preferredHosts: string[];
    instanceCfg: InstanceConfig;
  }