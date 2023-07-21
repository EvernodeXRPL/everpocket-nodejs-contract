import { error, log } from "../helpers/logger";
import { NomadOptions } from "../models/nomad";
import ClusterContext from "./ClusterContext";
import HotPocketContext from "./HotPocketContext";

const IMMATURE_PRUNE_LCL_THRESHOLD = 10;
const INACTIVE_PRUNE_LCL_THRESHOLD = 60;
const EXPIRE_PRUNE_TS_THRESHOLD = 900000; // 15 mins in ms.

class NomadContext {
    private initialized: boolean = false;
    public clusterContext: ClusterContext;
    public options: NomadOptions;
    public hpContext: HotPocketContext;

    public constructor(clusterContext: ClusterContext, contract: NomadOptions) {
        this.clusterContext = clusterContext;
        this.options = contract;
        this.hpContext = clusterContext.hpContext;
    }

    /**
     * Initialize the nomad context.
     */
    public async init(): Promise<void> {
        if (this.initialized)
            return;

        await this.clusterContext.init();
        await this.prune();
        await this.grow();
        this.initialized = true;
    }

    /**
     * Deinitialize the nomad contract.
     */
    public async deinit(): Promise<void> {
        await this.clusterContext.deinit();
        this.initialized = false;
    }

    /**
     * Grow the cluster upto target one by one.
     */
    public async grow(): Promise<void> {
        // Acquire one by one to avoid contract hanging.
        const totalCount = this.clusterContext.totalCount();
        // If the pending nodes + cluster node count is less than target node count we need to add missing nodes.
        if (this.options.targetNodeCount > totalCount) {
            if (!this.options.parallelGrow) {
                // Skip growing if there are node which are not yet added to Unl (Still syncing) or pending.
                // This will grow the cluster one by one.
                const nonUnlNodeCount = this.clusterContext.getClusterNodes().length - this.clusterContext.getClusterUnlNodes().length;
                const pendingNodeCount = this.clusterContext.getPendingNodes().length;
                if (pendingNodeCount > 0 || nonUnlNodeCount > 0)
                    return;
            }

            log('Growing the cluster.');
            log(`Target count: ${this.options.targetNodeCount}, Existing count: ${totalCount}`);

            await this.clusterContext.addNewClusterNode(this.options.targetLifeMoments, {
                preferredHosts: this.options.preferredHosts, instanceCfg: this.options.instanceCfg
            }).catch(error);
        }
    }

    /**
     * Prune the nodes which fulfils the prune conditions.
     */
    public async prune(): Promise<void> {
        const momentSize = this.clusterContext.evernodeContext.getEvernodeConfig().momentSize;
        const curTimestamp = this.hpContext.timestamp;
        const curLcl = this.hpContext.lclSeqNo;

        for (const node of this.clusterContext.getClusterNodes()) {
            const nodeExpiryTs = (node.createdOnTimestamp || 0) + (node.lifeMoments * momentSize * 1000);

            let prune = false;
            let force = true;
            // Prune unl nodes if inactive. Only consider the nodes which are added to Unl before this ledger.
            if (node.isUnl && ((node.addedToUnlOnLcl || 0) < curLcl) &&
                (curLcl - (node.activeOnLcl || 0)) > INACTIVE_PRUNE_LCL_THRESHOLD) {
                log(`Pruning the node ${node.pubkey} due to inactiveness.`);
                log(`Last active lcl: ${(node.activeOnLcl || 0)}, Current lcl: ${curLcl}`);
                prune = true;
            }
            // Prune if not matured for long period.
            else if (!node.isUnl && !node.ackReceivedOnLcl &&
                (curLcl - node.createdOnLcl) > IMMATURE_PRUNE_LCL_THRESHOLD) {
                log(`Pruning the node ${node.pubkey} due to not getting matured.`);
                log(`Created on lcl: ${node.createdOnLcl}, Current moment: ${curLcl}`);
                prune = true;
            }
            // Prune if close to expire except the nodes which has pending extends or the node which are created by contract.
            else if (node.targetLifeMoments <= node.lifeMoments && node.createdOnTimestamp &&
                curTimestamp > (nodeExpiryTs - EXPIRE_PRUNE_TS_THRESHOLD)) {
                log(`Pruning the node ${node.pubkey} due to expiring.`);
                log(`Expiry ts: ${nodeExpiryTs}, Current ts: ${curTimestamp}`);
                prune = true;
                // When removing nodes close to expire, Do not force remove them which might cause to fail pending acquires.
                force = false;
            }

            if (prune) {
                await this.clusterContext.removeNode(node.pubkey, force).catch(error);
            }
        }
    }
}

export default NomadContext;