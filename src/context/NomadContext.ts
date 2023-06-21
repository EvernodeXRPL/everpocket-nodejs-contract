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

    public async init(): Promise<void> {
        await this.clusterContext.init();
    }

    public async deinit(): Promise<void> {
        await this.clusterContext.deinit();
    }

    public async start(): Promise<void> {
        await this.shrinkIfExpiring();
        await this.shrinkIfNotMatured();
        await this.grow();
    }

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

    public async shrinkIfExpiring(): Promise<void> {
        const curMoment = await this.clusterContext.evernodeContext.getCurMoment();
        // Find for a nodes which is going to expire soon and not yet scheduled for extends.
        // Nodes which aren't added yet to the Unl even after the threshold.
        const node = this.clusterContext.getClusterNodes().find(n =>
            n.targetLifeMoments <= n.lifeMoments && curMoment === ((n.createdMoment || 0) + n.lifeMoments));

        if (node) {
            console.log(`Shrinking the node ${node.pubkey} due to expiring.`);
            console.log(`Expiry moment: ${((node.createdMoment || 0) + node.lifeMoments)}, Current moment: ${curMoment}`);

            if (node.isQuorum) {
                // Todo: Renew the signer list if this is a signer.
            }

            await this.clusterContext.removeNode(node.pubkey).catch(console.error);
        }
    }

    public async shrinkIfNotMatured(): Promise<void> {
        const curLcl = this.hpContext.lclSeqNo;
        // Find for a nodes which is going to expire soon and not yet scheduled for extends.
        // Nodes which aren't added yet to the Unl even after the threshold.
        const node = this.clusterContext.getClusterNodes().find(n =>
            !n.isUnl && curLcl - n.createdOnLcl > IMMATURE_KICK_THRESHOLD);

        if (node) {
            console.log(`Shrinking the node ${node.pubkey} due to not getting matured.`);
            console.log(`Created on lcl: ${node.createdOnLcl}, Current moment: ${curLcl}`);

            if (node.isQuorum) {
                // Todo: Renew the signer list if this is a signer.
            }

            await this.clusterContext.removeNode(node.pubkey).catch(console.error);
        }
    }
}

export default NomadContext;