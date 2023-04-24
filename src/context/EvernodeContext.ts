import { XrplContext } from ".";
import { ClusterManager } from "../cluster";
import { AcquireOptions, EvernodeContextOptions } from "../models/evernode";

class EvernodeContext {
    public hpContext: any;
    public xrplContext: XrplContext;
    public clusterManager: ClusterManager;

    constructor(hpContext: any, address: string, options: EvernodeContextOptions = {}) {
        this.hpContext = hpContext;
        this.xrplContext = options.xrplContext || new XrplContext(this.hpContext, address, null, options.xrplOptions);
        this.clusterManager = new ClusterManager(hpContext.publicKey);
    }

    async init(): Promise<void> {
        // Check for pending transactions and their completion.
    }

    async addNode(options: AcquireOptions = {}): Promise<void> {
        // const host = options.host || pick a random host.

        const tx = {
            // Acquire tx,
            ...options.txOptions
        };

        await this.xrplContext.init();

        try {
            await this.xrplContext.multiSignAndSubmitTransaction(tx);

            // Record as a pending transaction.
        } catch (e) {
            console.error(e);
        } finally {
            await this.xrplContext.deinit();
        }
    }

    async removeNode(pubkey: string): Promise<void> {
        // // Update patch config.
        // let config = await this.hpContext.getConfig();
        // config.unl = config.unl.filter((p: string) => p != pubkey);
        // await this.hpContext.updateConfig(config);
        
        // // Update peer list.
        // let peer = '';// find peer from local state file.
        // await this.hpContext.updatePeers(null, [peer]);
    }
}

export default EvernodeContext;