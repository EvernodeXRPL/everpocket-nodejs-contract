import { InstanceConfig } from "../evernode";

export interface NomadOptions {
  targetNodeCount: number;
  lifeIncrMomentMinLimit: number;
  lifeIncrMomentMaxLimit: number;
  preferredHosts?: string[];
  instanceCfg?: InstanceConfig;
  parallelGrow?: boolean;
}