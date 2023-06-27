import { NomadOptions } from "../models/nomad";
import ClusterContext from "./ClusterContext";

const IMMATURE_KICK_THRESHOLD = 10;

class NomadContext {
    private initialized: boolean = false;
    public clusterContext: ClusterContext;
    public options: NomadOptions;
    public hpContext: any;

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
        await this.shrinkIfExpiring();
        await this.shrinkIfNotMatured();
        await this.grow();
        this.initialized = true;
    }

    /**
     * Deinitialize the nomad contract.
     */
    public async deinit(): Promise<void> {
        if (!this.initialized)
            return;

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
                const nonUnlNodes = this.clusterContext.getClusterNonUnlNodes();
                const pendingNodes = this.clusterContext.getPendingNodes();
                if ((nonUnlNodes && nonUnlNodes.length > 0) || (pendingNodes && pendingNodes.length))
                    return;
            }

            console.log('Growing the cluster.');
            console.log(`Target count: ${this.options.targetNodeCount}, Existing count: ${totalCount}`);

            await this.clusterContext.addNewClusterNode(this.options.targetLifeMoments, {
                preferredHosts: this.options.preferredHosts, instanceCfg: this.options.instanceCfg
            }).catch(console.error);
        }
    }

    /**
     * Shrink the recently expiring nodes one by one.
     */
    public async shrinkIfExpiring(): Promise<void> {
        const curMoment = await this.clusterContext.evernodeContext.getCurMoment();
        // Find for a nodes which is going to expire soon and not yet scheduled for extends.
        // Nodes which aren't added yet to the Unl even after the threshold.
        const nodes = this.clusterContext.getClusterNodes().filter(n =>
            n.targetLifeMoments <= n.lifeMoments && curMoment === ((n.createdMoment || 0) + n.lifeMoments));

        for (const node of nodes) {
            try {
                console.log(`Shrinking the node ${node.pubkey} due to expiring.`);
                console.log(`Expiry moment: ${((node.createdMoment || 0) + node.lifeMoments)}, Current moment: ${curMoment}`);
                await this.clusterContext.removeNode(node.pubkey);
                // Return if at least one node is removed, So others will be removed next round.
                return;
            }
            catch (e) {
                console.error(e);
            }
        }

    }

    /**
     * Shrink the recently immatures nodes one by one.
     */
    public async shrinkIfNotMatured(): Promise<void> {
        const curLcl = this.hpContext.lclSeqNo;
        // Find for a nodes which is going to expire soon and not yet scheduled for extends.
        // Nodes which aren't added yet to the Unl even after the threshold.
        const nodes = this.clusterContext.getClusterNodes().filter(n =>
            !n.isUnl && !n.ackReceivedOnLcl && (curLcl - n.createdOnLcl) > IMMATURE_KICK_THRESHOLD);

        for (const node of nodes) {
            try {
                console.log(`Shrinking the node ${node.pubkey} due to not getting matured.`);
                console.log(`Created on lcl: ${node.createdOnLcl}, Current moment: ${curLcl}`);
                await this.clusterContext.removeNode(node.pubkey);
                // Return if at least one node is removed, So others will be removed next round.
                return;
            }
            catch (e) {
                console.error(e);
            }
        }
    }
}

export default NomadContext;