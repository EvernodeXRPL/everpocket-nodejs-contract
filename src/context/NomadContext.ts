import { error, log } from "../helpers/logger";
import { NodeStatus } from "../models/cluster";
import { NomadOptions } from "../models/nomad";
import ClusterContext from "./ClusterContext";
import HotPocketContext from "./HotPocketContext";

const IMMATURE_PRUNE_LCL_THRESHOLD = 15;
const INACTIVE_PRUNE_LCL_THRESHOLD = 60;

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
        await this.extend();
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
        const queueCount = this.clusterContext.addNodeQueueCount();
        // If the pending nodes + cluster node count is less than target node count we need to add missing nodes.
        if (this.options.targetNodeCount > (totalCount + queueCount)) {
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

            // Decide a random number to increment the life.
            // Take a number between min and max increment moments.
            const lclBasedNum = parseInt(this.hpContext.lclHash.substr(0, 2), 16);
            const randomIncrement = this.options.lifeIncrMomentMinLimit +
                (lclBasedNum % (this.options.lifeIncrMomentMaxLimit - this.options.lifeIncrMomentMinLimit))

            await this.clusterContext.addNewClusterNode(randomIncrement, {
                preferredHosts: this.options.preferredHosts, instanceCfg: this.options.instanceCfg
            }).catch(error);
        }
    }

    /**
     * Check for expiring nodes and send for extend.
     */
    public async extend(): Promise<void> {
        const momentSize = this.clusterContext.evernodeContext.getEvernodeConfig().momentSize;
        const curTimestamp = this.hpContext.timestamp;

        for (const node of this.clusterContext.getClusterNodes()) {
            const nodeExpiryTs = (node.createdOnTimestamp || 0) + (node.lifeMoments * momentSize * 1000);
            // Extend if close to expire except the nodes which has pending extends or the node which are created by contract.
            // Extend decision threshold is taken as before the half of the minimum increment moments.
            if (node.targetLifeMoments <= node.lifeMoments && node.createdOnTimestamp &&
                curTimestamp > (nodeExpiryTs - (this.options.lifeIncrMomentMinLimit * momentSize * 500))) {
                log(`Extending the node ${node.pubkey} due to expiring.`);
                log(`Expiry ts: ${nodeExpiryTs}, Current ts: ${curTimestamp}`);

                // Decide a random number to increment the life.
                // Take a number between min and max increment moments.
                const lclBasedNum = parseInt(this.hpContext.lclHash.substr(0, 2), 16);
                const randomIncrement = this.options.lifeIncrMomentMinLimit +
                    (lclBasedNum % (this.options.lifeIncrMomentMaxLimit - this.options.lifeIncrMomentMinLimit))

                this.clusterContext.extendNode(node.pubkey, randomIncrement);
            }
        }
    }

    /**
     * Prune the nodes which fulfils the prune conditions.
     */
    public async prune(): Promise<void> {
        const curLcl = this.hpContext.lclSeqNo;

        for (const node of this.clusterContext.getClusterNodes()) {
            let prune = false;
            let force = true;
            // Prune unl nodes if inactive. Only consider the nodes which are added to Unl before this ledger.
            if (node.isUnl && ((node.status.onLcl || 0) < curLcl) &&
                (curLcl - (node.activeOnLcl || 0)) > INACTIVE_PRUNE_LCL_THRESHOLD) {
                log(`Pruning the node ${node.pubkey} due to inactiveness.`);
                log(`Last active lcl: ${(node.activeOnLcl || 0)}, Current lcl: ${curLcl}`);
                prune = true;
            }
            // Prune if not matured for long period.
            else if (!node.isUnl && (node.status.status === NodeStatus.CREATED) &&
                (curLcl - node.status.onLcl) > IMMATURE_PRUNE_LCL_THRESHOLD) {
                log(`Pruning the node ${node.pubkey} due to not getting matured.`);
                log(`Created on lcl: ${node.status.onLcl}, Current moment: ${curLcl}`);
                prune = true;
            }

            if (prune) {
                await this.clusterContext.removeNode(node.pubkey, force).catch(error);
            }
        }
    }
}

export default NomadContext;