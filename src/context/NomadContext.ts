import { Contract } from "../models";
import ClusterContext from "./ClusterContext";

class NomadContext {
    public clusterContext: ClusterContext;
    public contract: Contract;

    public constructor(clusterContext: ClusterContext, contract: Contract) {
        this.clusterContext = clusterContext;
        this.contract = contract;
    }

    public async init(): Promise<void> {
        await this.clusterContext.init();
    }

    public async deinit(): Promise<void> {
        await this.clusterContext.deinit();
    }

    public async start(): Promise<void> {
        await this.shrink();
        await this.grow();
    }

    public async grow(): Promise<void> {
        const totalCount = this.clusterContext.totalCount();
        // If the pending nodes + cluster node count is less than target node count we need to add missing nodes.
        if (this.contract.targetNodeCount > totalCount) {
            console.log('Growing the cluster.');
            console.log(`Target count: ${this.contract.targetNodeCount}, Existing count: ${totalCount}`);

            await this.clusterContext.addNewClusterNode(this.contract.targetLifeMoments, {
                preferredHosts: this.contract.preferredHosts
            }).catch(console.error);
        }
    }

    public async shrink(): Promise<void> {
        const curMoment = await this.clusterContext.evernodeContext.getCurMoment();
        // Find for a nodes which is going to expire soon and not yet scheduled for extends.
        const node = this.clusterContext.getClusterNodes().find(n => n.targetLifeMoments <= n.lifeMoments &&
            curMoment == ((n.createdMoment || 0) + n.lifeMoments));

        if (node) {
            console.log(`Shrinking the node ${node.pubkey}.`);
            console.log(`Expiry moment: ${((node.createdMoment || 0) + node.lifeMoments)}, Current moment: ${curMoment}`);

            if (node.isQuorum) {
                // Todo: Renew the signer list if this is a signer.
            }

            await this.clusterContext.removeNode(node.pubkey).catch(console.error);
        }
    }
}

export default NomadContext;