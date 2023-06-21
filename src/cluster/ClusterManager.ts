import { JSONHelpers } from "../utils";
import { ClusterData, ClusterNode, PendingNode } from '../models/cluster';

class ClusterManager {
    private clusterDataFile: string = "cluster.json";
    private clusterData: ClusterData = { nodes: [], pendingNodes: [] };

    public constructor() {
        const data = JSONHelpers.readFromFile<ClusterData>(this.clusterDataFile);
        if (data)
            this.clusterData = data;
        else
            JSONHelpers.writeToFile(this.clusterDataFile, this.clusterData);
    }

    /**
     * Persist details of cluster.
     */
    #persist(): void {
        try {
            JSONHelpers.writeToFile(this.clusterDataFile, this.clusterData);
        } catch (error) {
            throw `Error writing file ${this.clusterDataFile}: ${error}`;
        }
    }

    /**
     * Record pending node.
     * @param node Pending node to add
     * @returns 
     */
    public addPending(node: PendingNode): void {
        // Return if pending node already exist.
        if (this.clusterData.pendingNodes.findIndex(n => n.refId === node.refId) > 0)
            return;

        this.clusterData.pendingNodes.push(node);
        this.#persist();
    }

    /**
     * Get the pending nodes.
     * @returns List of pending nodes.
     */
    public getPending(): PendingNode[] {
        return this.clusterData.pendingNodes;
    }

    /**
     * Remove node from pending node list.
     * @param refId Node reference.
     */
    public removePending(refId: string): void {
        this.clusterData.pendingNodes = this.clusterData.pendingNodes.filter(n => n.refId !== refId);

        this.#persist();
    }

    /**
     * Increase alive check count.
     * @param refId Node reference.
     */
    public increaseAliveCheck(refId: string): void {
        const index = this.clusterData.pendingNodes.findIndex(n => n.refId === refId);

        if (index > 0) {
            this.clusterData.pendingNodes[index].aliveCheckCount++;
            this.#persist();
        }
    }

    /**
     * Add new node to the cluster.
     * @param node Node to add.
     */
    public addNode(node: ClusterNode): void {
        this.clusterData.pendingNodes = this.clusterData.pendingNodes.filter(n => n.refId !== node.refId);

        // Return if node already exist.
        if (!this.getNode(node.pubkey)) {
            this.clusterData.nodes.push(node);
        }

        this.#persist();
    }

    /**
     * Add new nodes to the cluster.
     * @param nodes Node list to add.
     */
    public addNodes(nodes: ClusterNode[]): void {
        // Sort the nodes to preserve the order in all the node states.
        for (const node of nodes.sort((a, b) => a.pubkey.localeCompare(b.pubkey))) {
            this.clusterData.pendingNodes = this.clusterData.pendingNodes.filter(n => n.refId !== node.refId);

            // Return if node already exist.
            if (!this.getNode(node.pubkey))
                this.clusterData.nodes.push(node);
        }

        this.#persist();
    }

    /**
     * Get the cluster nodes.
     * @returns List of cluster nodes.
     */
    public getNodes(): ClusterNode[] {
        return this.clusterData.nodes;
    }

    /**
     * Get cluster nodes in Unl.
     * @returns List of cluster nodes which are in Unl.
     */
    public getUnlNodes(): ClusterNode[] {
        return this.clusterData.nodes.filter(n => n.isUnl);
    }

    /**
     * Get cluster node by pubkey if exist.
     * @param pubkey Public key of the node to find.
     * @returns Cluster node if exists, otherwise null.
     */
    public getNode(pubkey: string): ClusterNode | null {
        const node = this.clusterData.nodes.find(n => n.pubkey === pubkey);
        return node ? node : null;
    }

    /**
     * Update the life moments of the node.
     * @param pubkey Public key of the node.
     * @param lifeMoments Life moments value.
     */
    public updateLifeMoments(pubkey: string, lifeMoments: number): void {
        const index = this.clusterData.nodes.findIndex(n => n.pubkey === pubkey);

        if (index > 0) {
            this.clusterData.nodes[index].lifeMoments = lifeMoments;
            this.#persist();
        }
    }

    /**
     * Mark the node as a UNL node.
     * @param pubkey Public key of the node.
     * @param lclSeqNo Current lcl sequence number.
     */
    public markAsUnl(pubkey: string, lclSeqNo: number): void {
        const index = this.clusterData.nodes.findIndex(n => n.pubkey === pubkey);

        if (index === -1)
            throw 'Pubkey does not exist in the cluster.';

        if (!this.clusterData.nodes[index].isUnl) {
            this.clusterData.nodes[index].isUnl = true;
            this.clusterData.nodes[index].addedToUnlOnLcl = lclSeqNo;
            this.#persist();
        }
    }

    public removeNode(publicKey: string): void {
        this.clusterData.nodes = this.clusterData.nodes.filter(n => n.pubkey !== publicKey);
        this.#persist();
    }

}

export default ClusterManager;