import { AcquireOptions } from "../models/evernode";
import { Contract, User } from "../models";
import { Buffer } from 'buffer';
import { EvernodeContext, UtilityContext, VoteContext } from "../context";
import { ClusterContextOptions, ClusterMessage, ClusterMessageResponse, ClusterMessageResponseStatus, ClusterMessageType, ClusterNode, PendingNode } from "../models/cluster";
import { ClusterManager } from "../cluster";

class ClusterContext {
    private clusterManager: ClusterManager;
    public hpContext: any;
    public voteContex: VoteContext;
    public evernodeContext: EvernodeContext;
    public utilityContext: UtilityContext;
    public contract: Contract;

    public constructor(evernodeContext: EvernodeContext, contract: Contract, options: ClusterContextOptions) {
        this.evernodeContext = evernodeContext;
        this.hpContext = this.evernodeContext.hpContext;
        this.contract = contract;
        this.utilityContext = options?.utilityContext || new UtilityContext(this.hpContext);
        this.voteContex = this.evernodeContext.voteContext;
        this.clusterManager = new ClusterManager();
    }

    /**
     * Initiates the operations regarding the cluster.
     */
    public async init(): Promise<void> {
        await this.evernodeContext.init();

        try {
            await this.#checkForPendingNodes();
            await this.#checkForNewNodes();
            await this.#checkForExtends();
        } catch (e) {
            await this.evernodeContext.deinit();
            throw e;
        }
    }

    /**
     * Deinitiates the operations regarding the cluster.
     */
    public async deinit(): Promise<void> {
        await this.evernodeContext.deinit();
    }

    /**
     * Check and update node list if there are pending acquired which are completed now.
     */
    async #checkForPendingNodes(): Promise<void> {
        const pendingNodes = this.clusterManager.getPendingNodes();

        for (const node of pendingNodes) {
            const info = this.evernodeContext.getIfAcquired(node.refId);
            // If acquired, Check the liveliness and add that to the node list as a non-UNL node.
            if (info && await this.utilityContext.checkLiveness(info.ip, info.userPort)) {
                await this.hpContext.updatePeers([`${info.ip}:${info.peerPort}`], []);

                this.clusterManager.addNode(<ClusterNode>{
                    refId: node.refId,
                    contractId: info.contractId,
                    createdOnLcl: this.hpContext.lclSeqNo,
                    host: node.host,
                    ip: info.ip,
                    name: info.name,
                    peerPort: info.peerPort,
                    pubkey: info.pubkey,
                    userPort: info.userPort,
                    isUnl: false,
                    isQuorum: false,
                    lifeMoments: 1,
                    targetLifeMoments: node.targetLifeMoments
                });
            }
        }
    }

    /**
     * Check for node which needed to extended.
     */
    async #checkForExtends(): Promise<void> {
        const clusterNodes = this.clusterManager.getClusterNodes();

        for (const node of clusterNodes.filter(n => n.targetLifeMoments > n.lifeMoments)) {
            const extension = this.contract.targetLifeTime - 1;
            try {
                const leaseUriToken = (await this.evernodeContext.xrplContext.xrplAcc.getURITokens()).find((n: { index: any; }) => n.index === node.name)
                if (leaseUriToken) {
                    const uriInfo = this.evernodeContext.decodeLeaseTokenUri(leaseUriToken.URI);
                    const res = await this.evernodeContext.extendSubmit(node.host, (uriInfo.leaseAmount * extension), leaseUriToken.index);
                    if (res?.engine_result === "tesSUCCESS" || res?.engine_result === "tefPAST_SEQ" || res?.engine_result === "tefALREADY")
                        this.clusterManager.updateLifeMoments(node.pubkey, node.lifeMoments + extension);
                }
            } catch (e) {
                console.error(e)
            }
        }
    }

    /**
     * Check for new node which are synced and matured.
     */
    async #checkForNewNodes(): Promise<void> {
        const selfNode = this.clusterManager.getClusterNode(this.hpContext.publicKey);

        // If this node is not in UNL acknowledge others to add to UNL.
        if (selfNode?.isUnl)
            await this.#acknowledgeMaturity();
    }

    /**
     * Acknowledges the maturity of node to a UNL node of parent cluster.
     * @returns the status of the acknowledgement as a boolean figure.
     */
    async #acknowledgeMaturity(): Promise<boolean> {
        const unlNodes = this.clusterManager.getUnlNodes();
        if (unlNodes && unlNodes.length > 0) {
            const addMessage = <ClusterMessage>{ type: ClusterMessageType.MATURED, nodePubkey: this.hpContext.publicKey }
            await this.utilityContext.sendMessage(JSON.stringify(addMessage), unlNodes[0]);
        }
        return false;
    }

    /**
     * Feed user messaged to the cluster context.
     * @param user Contract client user.
     * @param msg Message sent by the user.
     * @returns Response for the cluster message with status.
     */
    public async feedUserMessage(user: User, msg: Buffer): Promise<ClusterMessageResponse> {
        const message = JSON.parse(msg.toString()) as ClusterMessage;

        let status = ClusterMessageResponseStatus.UNHANDLED;
        switch (message.type) {
            case ClusterMessageType.MATURED: {
                // Check if node exist in the cluster.
                // Add to UNL if exist.
                const node = this.clusterManager.getClusterNode(message.nodePubkey);
                status = (node && await this.addToUnl(message.nodePubkey)) ? ClusterMessageResponseStatus.OK : ClusterMessageResponseStatus.FAIL;
                break;
            }
            default: {
                break;
            }
        }

        return <ClusterMessageResponse>{ type: message.type, status: status }
    }

    /**
     * Acquire and add new node to the cluster.
     * @param options Acquire instance options.
     */
    public async addNewClusterNode(lifeMoments: number = 1, options: AcquireOptions = {}): Promise<void> {
        const hpconfig = await this.hpContext.getConfig();
        const unl = hpconfig.unl;

        options.instanceCfg.config.contract = {
            // Take only first unl pubkey to keep xrpl memo size within 1KB.
            // Ths instance will automatically fetch full UNL when syncing.
            unl: unl.sort().slice(0, 1),
            consensus: {
                roundtime: hpconfig.consensus.roundtime
            }
        }
        let acquire = await this.evernodeContext.acquireNode(options) as PendingNode;
        acquire.targetLifeMoments = lifeMoments;

        this.clusterManager.addPending(acquire);
    }

    /**
     * Add a node to cluster and mark as UNL.
     * @param node Cluster node to be added.
     * @returns The status of the addition as a boolean figure.
     */
    public async addToCluster(node: ClusterNode): Promise<boolean> {
        // Check if node exists in the cluster.
        const existing = this.clusterManager.getClusterNode(node.pubkey);
        if (!existing)
            this.clusterManager.addNode(node);

        return await this.addToUnl(node.pubkey);
    }

    /**
     * Mark existing node as a UNL node.
     * @param pubkey Public key of the node.
     * @returns The status of the addition as a boolean figure.
     */
    public async addToUnl(pubkey: string) {
        if (this.clusterManager.markAsUnl(pubkey, this.hpContext.lclSeqNo)) {
            const hpconfig = await this.hpContext.getConfig();
            hpconfig.unl.push(pubkey);
            await this.hpContext.updateConfig(hpconfig);
            return true;
        }
        return false;
    }

    /**
     * Removes a provided a node from the cluster.
     * @param publickey Public key of the node to be removed.
     */
    async removeNode(publickey: string): Promise<void> {
        // Update patch config.
        let config = await this.hpContext.getConfig();
        config.unl = config.unl.filter((p: string) => p != publickey);
        await this.hpContext.updateConfig(config);

        // Update peer list.
        const node = this.clusterManager.getClusterNode(publickey);
        if (node) {
            let peer = `${node?.ip}:${node?.peerPort}`
            await this.hpContext.updatePeers(null, [peer]);

            this.clusterManager.removeNode(publickey);
        }
    }
}

export default ClusterContext;