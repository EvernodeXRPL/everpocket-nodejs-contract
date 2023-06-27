import { AcquireOptions } from "../models/evernode";
import { Peer, User } from "../models";
import { Buffer } from 'buffer';
import { EvernodeContext, UtilityContext, VoteContext } from "../context";
import { ClusterOptions, ClusterMessage, ClusterMessageResponse, ClusterMessageResponseStatus, ClusterMessageType, ClusterNode, PendingNode } from "../models/cluster";
import { ClusterManager } from "../cluster";
import { AllVoteElector } from "../vote/vote-electors";
import { VoteElectorOptions } from "../models/vote";

const DUMMY_OWNER_PUBKEY = "dummy_owner_pubkey";
const SASHIMONO_NODEJS_IMAGE = "evernodedev/sashimono:hp.latest-ubt.20.04-njs.16";
const ALIVENESS_CHECK_THRESHOLD = 5;
const TIMEOUT = 4000;

class ClusterContext {
    private clusterManager: ClusterManager;
    private userMessageProcessing: boolean;
    private maturityLclThreshold: number;
    private initialized: boolean = false;
    public hpContext: any;
    public voteContext: VoteContext;
    public evernodeContext: EvernodeContext;
    public utilityContext: UtilityContext;

    public constructor(evernodeContext: EvernodeContext, options: ClusterOptions) {
        this.evernodeContext = evernodeContext;
        this.hpContext = this.evernodeContext.hpContext;
        this.utilityContext = options?.utilityContext || new UtilityContext(this.hpContext);
        this.voteContext = this.evernodeContext.voteContext;
        this.clusterManager = new ClusterManager();
        this.maturityLclThreshold = options.maturityLclThreshold || 0;
        this.userMessageProcessing = false;
    }

    /**
     * Initiates the operations regarding the cluster.
     */
    public async init(): Promise<void> {
        if (this.initialized)
            return;

        await this.evernodeContext.init();

        try {
            await this.#setupClusterInfo();
            await this.#checkForPendingNodes();
            await this.#checkForMatured();
            await this.#checkForAcknowledged();
            await this.#checkForExtends();
            this.initialized = true;
        } catch (e) {
            await this.deinit();
            throw e;
        }
    }

    /**
     * Deinitiates the operations regarding the cluster.
     */
    public async deinit(): Promise<void> {
        if (!this.initialized)
            return;

        await this.evernodeContext.deinit();
        this.initialized = false;
    }

    /**
     * Setup initial cluster info and prepare the data file.
     * @param [options={}] Vote options to collect the vote info. 
     */
    async #setupClusterInfo(options: VoteElectorOptions = {}): Promise<void> {
        const clusterNodes = this.getClusterNodes();
        if (clusterNodes.length === 0) {
            const electionName = `share_node_info${this.voteContext.getUniqueNumber()}`;
            const elector = new AllVoteElector(0, options?.timeout || TIMEOUT);
            const contractConfig = await this.hpContext.getConfig();
            const node = <ClusterNode>{
                pubkey: this.hpContext.publicKey,
                contractId: contractConfig.id,
                isUnl: !!contractConfig.unl.find((k: string) => k === this.hpContext.publicKey),
                isQuorum: this.evernodeContext.xrplContext.isSigner()
            }
            const nodes: ClusterNode[] = (await this.voteContext.vote(electionName, [node], elector)).map(ob => ob.data);
            this.clusterManager.addNodes(nodes);
        }
    }

    /**
     * Check and update node list if there are pending acquired which are completed now.
     */
    async #checkForPendingNodes(): Promise<void> {
        const pendingNodes = this.getPendingNodes();

        for (const node of pendingNodes) {
            const info = this.evernodeContext.getIfAcquired(node.refId);
            // If acquired, Check the liveliness and add that to the node list as a non-UNL node.
            if (info) {
                // Remove node if aliveness check threshold reached.
                if (node.aliveCheckCount > ALIVENESS_CHECK_THRESHOLD) {
                    this.clusterManager.removePending(node.refId);

                    console.log(`Pending node ${node.refId} is removed since it's not alive.`);
                    continue;
                }

                if (!(await this.utilityContext.checkLiveness(new Peer(info.ip, info.userPort)))) {
                    this.clusterManager.increaseAliveCheck(node.refId);
                }
                else {
                    await this.hpContext.updatePeers([`${info.ip}:${info.peerPort}`], []);

                    const curMoment = await this.evernodeContext.getCurMoment();

                    this.clusterManager.addNode(<ClusterNode>{
                        refId: node.refId,
                        contractId: info.contractId,
                        createdOnLcl: this.hpContext.lclSeqNo,
                        createdMoment: curMoment,
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

                    console.log(`Added node ${info.pubkey} to the cluster as nonUnl.`);
                }

            }
            // If the pending node is not in the pending acquire, this acquire should be failed.
            else if (!info && !this.evernodeContext.getIfPending(node.refId)) {
                this.clusterManager.removePending(node.refId);

                console.log(`Pending node ${node.refId} is removed due to unavailability.`);
            }
        }
    }

    /**
     * Check for node which needed to extended.
     */
    async #checkForExtends(): Promise<void> {
        // Extend one by one to avoid contract hanging.
        const clusterNodes = this.getClusterNodes();
        const pendingExtend = clusterNodes.find(n => n.targetLifeMoments > n.lifeMoments);

        if (pendingExtend) {
            const extension = pendingExtend.targetLifeMoments - pendingExtend.lifeMoments;
            try {
                console.log(`Extending node ${pendingExtend.pubkey} by ${extension}.`);
                const res = await this.evernodeContext.extendSubmit(pendingExtend.host, extension, pendingExtend.name);
                if (res)
                    this.clusterManager.updateLifeMoments(pendingExtend.pubkey, pendingExtend.lifeMoments + extension);
            } catch (e) {
                console.error(e)
            }
        }
    }

    /**
     * Check for maturity acknowledged nodes.
     */
    async #checkForAcknowledged(): Promise<void> {
        // Add one by one to Unl to avoid forking.
        const clusterNodes = this.getClusterNodes();
        const pendingAcknowledged = clusterNodes
            .filter(n => !n.isUnl && n.ackReceivedOnLcl && (n.ackReceivedOnLcl + this.maturityLclThreshold) < this.hpContext.lclSeqNo)
            .sort((a, b) => (a.ackReceivedOnLcl || 0) < (b.ackReceivedOnLcl || 0) ? -1 : 1);

        if (pendingAcknowledged && pendingAcknowledged.length > 0) {
            const node = pendingAcknowledged[0];
            try {
                console.log(`Adding node ${node.pubkey} as a Unl node.`);
                await this.addToUnl(node.pubkey);
            } catch (e) {
                console.error(e)
            }
        }
    }

    /**
     * Check for new node which are synced and matured.
     */
    async #checkForMatured(): Promise<void> {
        const selfNode = this.clusterManager.getNode(this.hpContext.publicKey);

        // If this node is not in UNL acknowledge others to add to UNL.
        if (selfNode && !selfNode.isUnl && !selfNode.ackReceivedOnLcl) {
            await this.#acknowledgeMaturity();
            console.log(`Maturity acknowledgement sent.`);
        }
    }

    /**
     * Acknowledges the maturity of node to a UNL node of parent cluster.
     * @returns the status of the acknowledgement as a boolean figure.
     */
    async #acknowledgeMaturity(): Promise<boolean> {
        const unlNodes = this.getClusterUnlNodes();
        if (unlNodes && unlNodes.length > 0) {
            const addMessage = <ClusterMessage>{ type: ClusterMessageType.MATURED, nodePubkey: this.hpContext.publicKey }
            await this.utilityContext.sendMessage(JSON.stringify(addMessage), unlNodes.map(n => new Peer(n.ip, n.userPort)));
        }
        return false;
    }

    /**
     * Get all Unl nodes in the cluster.
     * @returns List of nodes in the cluster which are in Unl.
     */
    public getClusterUnlNodes(): ClusterNode[] {
        // Filter out the nodes which are not persisted in the HotPocket Unl yet.
        return this.clusterManager.getUnlNodes().filter(n => this.hpContext.unl.list().find((p: any) => p.publicKey === n.pubkey));
    }

    /**
     * Get all nodes in the cluster.
     * @returns List of nodes in the cluster.
     */
    public getClusterNodes(): ClusterNode[] {
        return this.clusterManager.getNodes();
    }

    /**
     * Get all pending nodes.
     * @returns List of pending nodes.
     */
    public getPendingNodes(): PendingNode[] {
        return this.clusterManager.getPending();
    }

    /**
     * Get the pending + cluster node count in the cluster.
     * @returns Total number of cluster nodes.
     */
    public totalCount(): number {
        return (this.getClusterNodes().length + this.getPendingNodes().length)
    }

    /**
     * Try to acquire the user message lock.
     */
    async #acquireUserMessageProc(): Promise<void> {
        await new Promise<void>(async resolve => {
            while (this.userMessageProcessing) {
                await new Promise(resolveSleep => {
                    setTimeout(resolveSleep, 1000);
                })
            }
            resolve();
        });
        this.userMessageProcessing = true;
    }

    /**
     * Release the user message lock.
     */
    #releaseUserMessageProc(): void {
        this.userMessageProcessing = false;
    }

    /**
     * Feed user message to the cluster context.
     * @param user Contract client user.
     * @param msg Message sent by the user.
     * @returns Response for the cluster message with status.
     */
    public async feedUserMessage(user: User, msg: Buffer): Promise<ClusterMessageResponse> {
        let response = <ClusterMessageResponse>{
            type: ClusterMessageType.UNKNOWN,
            status: ClusterMessageResponseStatus.UNHANDLED
        }

        try {
            const message = JSON.parse(msg.toString()) as ClusterMessage;
            response.type = message.type;
            switch (response.type) {
                case ClusterMessageType.MATURED: {
                    // Set status as fail for default.
                    response.status = ClusterMessageResponseStatus.FAIL;

                    // Process user messages sequentially to avoid conflicts.
                    // Lock the user message processor.
                    await this.#acquireUserMessageProc();

                    try {
                        // Check if node exist in the cluster.
                        // Add to UNL if exist. Note: The node's user connection will be made from node's public key.
                        if (user.publicKey === message.nodePubkey) {
                            const node = this.clusterManager.getNode(message.nodePubkey);
                            if (node) {
                                this.clusterManager.markAsMatured(message.nodePubkey, this.hpContext.lclSeqNo)
                                response.status = ClusterMessageResponseStatus.OK;
                                console.log(`Maturity acknowledgement received from node ${message.nodePubkey}.`);
                            }
                        }
                    }
                    catch (e) {
                        console.error(e);
                    }
                    finally {
                        await user.send(JSON.stringify(response));
                        // Release the user message processor.
                        this.#releaseUserMessageProc();
                    }

                    break;
                }
                default: {
                    break;
                }
            }
        }
        catch (e) {
            console.error(e);
        }

        return response;
    }

    /**
     * Acquire and add new node to the cluster.
     * @param [lifeMoments=1] Amount of life moments for the instance.
     * @param [options={}]  Acquire instance options.
     */
    public async addNewClusterNode(lifeMoments: number = 1, options: AcquireOptions = {}): Promise<void> {
        const hpconfig = await this.hpContext.getConfig();
        const unl = hpconfig.unl;

        // Override the instance specs.
        options.instanceCfg = {
            ...(options.instanceCfg ? options.instanceCfg : {}),
            // If owner pubkey is not set, Set a dummy pub key.
            ownerPubkey: options.instanceCfg?.ownerPubkey ? options.instanceCfg.ownerPubkey : DUMMY_OWNER_PUBKEY,
            // If instance image is not set, Set the sashimono node js image.
            image: options.instanceCfg?.image ? options.instanceCfg.image : SASHIMONO_NODEJS_IMAGE,
            contractId: this.hpContext.contractId,
            config: {
                ...(options.instanceCfg?.config ? options.instanceCfg.config : {}),
                contract: {
                    ...(options.instanceCfg?.config?.contract ? options.instanceCfg.config.contract : {}),
                    // Take only first unl pubkey to keep xrpl memo size within 1KB.
                    // Ths instance will automatically fetch full UNL when syncing.
                    unl: unl.sort().slice(0, 1),
                    consensus: {
                        ...(options.instanceCfg?.config?.contract?.consensus ? options.instanceCfg.config.contract.consensus : {}),
                        roundtime: hpconfig.consensus.roundtime
                    }
                }
            }
        }

        let acquire = (await this.evernodeContext.acquireNode(options)) as PendingNode;
        acquire.targetLifeMoments = lifeMoments;
        acquire.aliveCheckCount = 0;

        this.clusterManager.addPending(acquire);
    }

    /**
     * Add a node to cluster and mark as UNL.
     * @param node Cluster node to be added.
     */
    public async addToCluster(node: ClusterNode): Promise<void> {
        // Check if node exists in the cluster.
        const existing = this.clusterManager.getNode(node.pubkey);
        if (!existing)
            this.clusterManager.addNode(node);

        await this.addToUnl(node.pubkey);
    }

    /**
     * Mark existing node as a UNL node.
     * @param pubkey Public key of the node.
     */
    public async addToUnl(pubkey: string): Promise<void> {
        this.clusterManager.markAsUnl(pubkey, this.hpContext.lclSeqNo);

        const hpconfig = await this.hpContext.getConfig();
        hpconfig.unl.push(pubkey);
        await this.hpContext.updateConfig(hpconfig);
    }

    /**
     * Removes a provided a node from the cluster.
     * @param pubkey Public key of the node to be removed.
     */
    public async removeNode(pubkey: string): Promise<void> {
        // If this node contains pending operations, This node cannot be removed until they are completed.
        if (await this.hasPendingOperations(pubkey))
            throw 'This node cannot be removed yet. It has pending operations.'

        // Update patch config if node exists in UNL.
        let config = await this.hpContext.getConfig();
        const index = config.unl.findIndex((p: string) => p === pubkey);
        if (index > -1) {
            config.unl.splice(index, 1);
            await this.hpContext.updateConfig(config);
        }

        // Update peer list.
        const node = this.clusterManager.getNode(pubkey);
        if (node) {
            let peer = `${node?.ip}:${node?.peerPort}`
            await this.hpContext.updatePeers(null, [peer]);

            this.clusterManager.removeNode(pubkey);
        }
    }

    /**
     * Check wether there're pending operations for a node.
     * @param pubkey Public key of the node to check.
     * @param [options={}] Vote options to collect the check.
     * @returns true if there're pending operations otherwise false.
     */
    public async hasPendingOperations(pubkey: string, options: VoteElectorOptions = {}): Promise<boolean> {
        const elector = new AllVoteElector(1, options?.timeout || TIMEOUT);
        const electionName = `removeSigner${this.voteContext.getUniqueNumber()}`;

        if (pubkey === this.hpContext.publicKey) {
            const hasPending = this.evernodeContext.hasPendingOperations();
            return (await this.voteContext.vote(electionName, [hasPending], elector)).map(ob => ob.data)[0];
        }
        else {
            return (await this.voteContext.subscribe(electionName, elector)).map(ob => ob.data)[0];
        }
    }
}

export default ClusterContext;