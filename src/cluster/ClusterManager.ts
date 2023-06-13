import * as fs from 'fs';
import { JSONHelpers } from "../utils";
import { ClusterData, ClusterNode, PendingNode } from '../models/cluster';

class ClusterManager {
    private clusterDataFile: string = "cluster.json";
    private clusterData: ClusterData;

    public constructor() {
        if (!fs.existsSync(this.clusterDataFile))
            JSONHelpers.writeToFile(this.clusterDataFile, <ClusterData>{ nodes: [], pendingNodes: [] });
        this.clusterData = JSONHelpers.readFromFile<ClusterData>(this.clusterDataFile);
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
     * Add new node to the cluster.
     * @param node Node to add
     */
    public addNode(node: ClusterNode): void {
        this.clusterData.pendingNodes = this.clusterData.pendingNodes.filter(n => n.refId !== node.refId);

        // Return if node already exist.
        if (this.clusterData.nodes.findIndex(n => n.refId === node.refId && n.name === node.name) > 0)
            return;

        this.clusterData.nodes.push(node);

        this.#persist();
    }

    /**
     * Get the pending nodes.
     * @returns List of pending nodes.
     */
    public getPendingNodes(): PendingNode[] {
        return this.clusterData.pendingNodes;
    }

    /**
     * Get the cluster nodes.
     * @returns List of cluster nodes.
     */
    public getClusterNodes(): ClusterNode[] {
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
    public getClusterNode(pubkey: string): ClusterNode | null {
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
     * @returns True if marked as UNL. False if node does not exist or already a UNL node.
     */
    public markAsUnl(pubkey: string, lclSeqNo: number): boolean {
        const index = this.clusterData.nodes.findIndex(n => n.pubkey === pubkey);

        if (index == -1)
            return false;

        if (!this.clusterData.nodes[index].isUnl) {
            this.clusterData.nodes[index].isUnl = true;
            this.clusterData.nodes[index].addedToUnlOnLcl = lclSeqNo;
            this.#persist();
            return true;
        }

        return false;
    }

    public removeNode(publicKey: string): void {
        this.clusterData.nodes = this.clusterData.nodes.filter(n => n.pubkey !== publicKey);
        this.#persist();
    }

}

export default ClusterManager;