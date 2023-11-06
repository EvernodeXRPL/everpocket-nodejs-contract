import { JSONHelpers } from "../utils";
import { ClusterData, ClusterNode, NodeStatus, NodeStatusInfo, PendingNode } from '../models/cluster';

class ClusterManager {
    private clusterDataFile: string = "cluster.json";
    private clusterData: ClusterData = { initialized: false, nodes: [], pendingNodes: [] };
    private updated: boolean = false;

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
    public persist(): void {
        if (!this.updated)
            return;

        try {
            JSONHelpers.writeToFile(this.clusterDataFile, this.clusterData);
        } catch (error) {
            throw `Error writing file ${this.clusterDataFile}: ${error}`;
        }
    }

    /**
     * Is cluster initialized on first run.
     */
    public hasClusterInitialized(): boolean {
        return this.clusterData.initialized;
    }

    /**
     * Mark cluster as initialized.
     */
    public initializeCluster(nodes: ClusterNode[]): void {
        if (!this.clusterData.initialized) {
            for (const node of nodes) {
                const index = this.clusterData.nodes.findIndex(n => n.pubkey === node.pubkey);
                // Add node if not exist, Update otherwise.
                if (index === -1) {
                    this.clusterData.nodes.push(node);
                }
                else {
                    this.clusterData.nodes[index] = {
                        ...this.clusterData.nodes[index],
                        ...node
                    }
                }
            }

            this.clusterData.initialized = true;
            this.updated = true;
        }
    }

    /**
     * Record pending node.
     * @param node Pending node to add
     * @returns 
     */
    public addPending(node: PendingNode): void {
        // Return if pending node already exist.
        if (this.clusterData.pendingNodes.findIndex(n => n.refId === node.refId) >= 0)
            return;

        this.clusterData.pendingNodes.push(node);
        this.updated = true;
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

        this.updated = true;
    }

    /**
     * Increase alive check count.
     * @param refId Node reference.
     */
    public increaseAliveCheck(refId: string): void {
        const index = this.clusterData.pendingNodes.findIndex(n => n.refId === refId);

        if (index >= 0) {
            this.clusterData.pendingNodes[index].aliveCheckCount++;
            this.updated = true;
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

        this.updated = true;
    }

    /**
     * Add new nodes to the cluster.
     * @param nodes Node list to add.
     */
    public addNodes(nodes: ClusterNode[]): void {
        // Sort the nodes to preserve the order in all the node states.
        for (const node of nodes.sort((a, b) => a.pubkey.localeCompare(b.pubkey))) {
            this.addNode(node);
        }

        this.updated = true;
    }

    /**
     * Get the cluster nodes.
     * @returns List of cluster nodes.
     */
    public getNodes(): ClusterNode[] {
        return this.clusterData.nodes;
    }

    /**
     * Get cluster nodes in Unl. This will also include the nodes which are added to Unl in this ledger.
     * @returns List of cluster nodes which are in Unl (including the nodes which are added to Unl in this ledger).
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
     * Increase life moments of the node.
     * @param pubkey Public key of the node.
     * @param increment Life moments value to incement.
     */
    public increaseLifeMoments(pubkey: string, increment: number): void {
        const index = this.clusterData.nodes.findIndex(n => n.pubkey === pubkey);

        if (index >= 0) {
            this.clusterData.nodes[index].lifeMoments += increment;
            this.updated = true;
        }
    }

    /**
     * Increase target moments of the node.
     * @param pubkey Public key of the node.
     * @param increment Life moments value to incement.
     */
    public increaseTargetLifeMoments(pubkey: string, increment: number): void {
        const index = this.clusterData.nodes.findIndex(n => n.pubkey === pubkey);

        const maxLifeMoments = this.clusterData.nodes[index].maxLifeMoments;

        if (maxLifeMoments && this.clusterData.nodes[index].targetLifeMoments + increment > maxLifeMoments)
            throw `This node's life cannot be increased more than ${maxLifeMoments}`;

        if (index >= 0) {
            this.clusterData.nodes[index].targetLifeMoments += increment;
            this.updated = true;
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
            this.clusterData.nodes[index].status = <NodeStatusInfo>{
                status: NodeStatus.ADDED_TO_UNL,
                onLcl: lclSeqNo
            }
            this.updated = true;
        }
    }

    /**
     * Mark the node as matured.
     * @param pubkey Public key of the node.
     * @param lclSeqNo Current lcl sequence number.
     */
    public markAsMatured(pubkey: string, lclSeqNo: number): void {
        const index = this.clusterData.nodes.findIndex(n => n.pubkey === pubkey);

        if (index === -1)
            throw 'Pubkey does not exist in the cluster.';

        if (this.clusterData.nodes[index].status.status !== NodeStatus.ACKNOWLEDGED) {
            this.clusterData.nodes[index].status = <NodeStatusInfo>{
                status: NodeStatus.ACKNOWLEDGED,
                onLcl: lclSeqNo
            }
            this.updated = true;
        }
    }

    /**
     * Mark the node as active.
     * @param pubkey Public key of the node.
     * @param lclSeqNo Current lcl sequence number.
     */
    public markAsActive(pubkey: string, lclSeqNo: number): void {
        const index = this.clusterData.nodes.findIndex(n => n.pubkey === pubkey);

        if (index === -1)
            throw 'Pubkey does not exist in the cluster.';

        this.clusterData.nodes[index].activeOnLcl = lclSeqNo;
        this.updated = true;
    }

    /**
     * Remove a node from the UNL.
     * @param pubkey Node pubkey to remove.
     */
    public removeNode(pubkey: string): void {
        this.clusterData.nodes = this.clusterData.nodes.filter(n => n.pubkey !== pubkey);
        this.updated = true;
    }

    /**
     * Update the node as a quorum node.
     * @param pubkey Public key of the node.
     * @param signerAddress Signer address of the node.
     */
    public markAsQuorum(pubkey: string, signerAddress: string): void {
        const index = this.clusterData.nodes.findIndex(n => n.pubkey === pubkey);

        if (index >= 0) {
            this.clusterData.nodes[index].signerAddress = signerAddress;
            this.updated = true;
        }
    }

    /**
     * Increase the attempt count for signer replacements.
     * @param pubkey Public key of the node.
     */
    public increaseSignerReplaceFailedAttempts(pubkey: string): void {
        const index = this.clusterData.nodes.findIndex(n => n.pubkey === pubkey);

        if (index >= 0) {
            if (!this.clusterData.nodes[index].signerReplaceFailedAttempts)
                this.clusterData.nodes[index].signerReplaceFailedAttempts = 1;
            else
                this.clusterData.nodes[index].signerReplaceFailedAttempts!++;
            this.updated = true;
        }
    }
}

export default ClusterManager;
