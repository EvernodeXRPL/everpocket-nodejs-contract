import { XrplContext } from "../../context";
import { XrplContextOptions } from "../xrpl";

export interface EvernodeContextOptions {
  xrplContext?: XrplContext;
  xrplOptions?: XrplContextOptions;
}

export interface AcquireOptions {
  host?: string;
  txOptions?: any;
}