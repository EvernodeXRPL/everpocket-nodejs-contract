import { Contract } from "../models";
import ClusterContext from "./ClusterContext";

const IMMATURE_KICK_THRESHOLD = 20;

class NomadContext {
    public clusterContext: ClusterContext;
    public contract: Contract;
    public hpContext: any;

    public constructor(clusterContext: ClusterContext, contract: Contract) {
        this.clusterContext = clusterContext;
        this.contract = contract;
        this.hpContext = clusterContext.hpContext;
    }

    /**
     * Initialize the nomad context.
     */
    public async init(): Promise<void> {
        await this.clusterContext.init();
    }

    /**
     * Deinitialize the nomad contract.
     */
    public async deinit(): Promise<void> {
        await this.clusterContext.deinit();
    }

    /**
     * Start the nomad contract process.
     */
    public async start(): Promise<void> {
        await this.shrinkIfExpiring();
        await this.shrinkIfNotMatured();
        await this.grow();
    }

    /**
     * Grow the cluster upto target one by one.
     */
    public async grow(): Promise<void> {
        const totalCount = this.clusterContext.totalCount();
        // If the pending nodes + cluster node count is less than target node count we need to add missing nodes.
        if (this.contract.targetNodeCount > totalCount) {
            console.log('Growing the cluster.');
            console.log(`Target count: ${this.contract.targetNodeCount}, Existing count: ${totalCount}`);

            await this.clusterContext.addNewClusterNode(this.contract.targetLifeMoments, {
                preferredHosts: this.contract.preferredHosts, instanceCfg: this.contract.instanceCfg
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
            !n.isUnl && curLcl - n.createdOnLcl > IMMATURE_KICK_THRESHOLD);

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