import { AcquireOptions } from "../models/evernode";
import { Peer, User } from "../models";
import { Buffer } from 'buffer';
import { EvernodeContext, VoteContext } from "../context";
import { ClusterOptions, ClusterMessage, ClusterMessageResponse, ClusterMessageResponseStatus, ClusterMessageType, ClusterNode, PendingNode, OperationData, OperationType, AddNodeOperation, ExtendNodeOperation, RemoveNodeOperation } from "../models/cluster";
import { ClusterManager } from "../cluster";
import { AllVoteElector } from "../vote/vote-electors";
import { VoteElectorOptions } from "../models/vote";
import HotPocketContext from "./HotPocketContext";
import { error, info, log } from "../helpers/logger";
import { JSONHelpers } from "../utils";

const DUMMY_OWNER_PUBKEY = "dummy_owner_pubkey";
const SASHIMONO_NODEJS_IMAGE = "evernodedev/sashimono:hp.udpvisa-test-0.0.1-ubt.20.04-njs.20";
const ALIVENESS_CHECK_THRESHOLD = 5;
const MATURITY_LCL_THRESHOLD = 2;
const MAX_SIGNER_REPLACE_ATTEMPTS = 10;
const TIMEOUT = 10000;

class ClusterContext {
    private operationDataFile: string = "operations.json";
    private operationData: OperationData = { operations: [] };
    private updatedData: boolean = false;
    private clusterManager: ClusterManager;
    private userMessageProcessing: boolean;
    private maturityLclThreshold: number;
    private initialized: boolean = false;
    public hpContext: HotPocketContext;
    public voteContext: VoteContext;
    public evernodeContext: EvernodeContext;

    public constructor(evernodeContext: EvernodeContext, options: ClusterOptions = {}) {
        this.evernodeContext = evernodeContext;
        this.hpContext = this.evernodeContext.hpContext;
        this.voteContext = this.evernodeContext.voteContext;
        this.clusterManager = new ClusterManager();
        this.maturityLclThreshold = options.maturityLclThreshold || MATURITY_LCL_THRESHOLD;
        this.userMessageProcessing = false;

        const data = JSONHelpers.readFromFile<OperationData>(this.operationDataFile);
        if (data)
            this.operationData = data;
        else
            JSONHelpers.writeToFile(this.operationDataFile, this.operationData);
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
            await this.#updateActiveness();
            await this.#checkForPendingNodes();
            await this.#checkForMatured();
            await this.#checkForAcknowledged();
            await this.#checkForExtends();
            await this.#processOperations();
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
        this.clusterManager.persist();
        this.#persistOperationData();
        await this.evernodeContext.deinit();
        this.initialized = false;
    }

    /**
     * Persist details of operations.
     */
    #persistOperationData(): void {
        if (!this.updatedData)
            return;

        try {
            JSONHelpers.writeToFile(this.operationDataFile, this.operationData);
        } catch (error) {
            throw `Error writing file ${this.operationDataFile}: ${error}`;
        }
    }

    /**
     * Get the queued add node operations.
     * @returns Total number of cluster nodes.
     */
    public addNodeQueueCount(): number {
        return this.operationData.operations.filter(o => o.type === OperationType.ADD_NODE).length;
    }

    /**
     * Queue an operation in the queue.
     */
    #queueOperation(type: OperationType, data: AddNodeOperation | ExtendNodeOperation | RemoveNodeOperation) {
        this.operationData.operations.push({
            type: type,
            data: data
        });
        this.updatedData = true;
    }

    /**
     * Process operations one by one at each execution.
     */
    async #processOperations() {
        if (this.operationData.operations.length === 0)
            return;

        info(`Operations processor started.`);

        const operation = this.operationData.operations.splice(0, 1)[0];
        this.updatedData = true;

        try {
            if (operation.type === OperationType.ADD_NODE) {
                const data = operation.data as AddNodeOperation;

                log(`Acquiring a new node...`);
                let acquire = (await this.evernodeContext.acquireNode(data.acquireOptions)) as PendingNode;
                acquire.targetLifeMoments = data.lifeMoments;
                acquire.aliveCheckCount = 0;

                this.clusterManager.addPending(acquire);
            }
            else if (operation.type === OperationType.EXTEND_NODE) {
                const data = operation.data as ExtendNodeOperation;
                const clusterNodes = this.getClusterNodes();
                const pendingExtend = clusterNodes.find(n => n.pubkey === data.nodePubkey);

                if (pendingExtend) {
                    log(`Extending node ${pendingExtend?.pubkey} by ${data.moments}...`);
                    const res = await this.evernodeContext.extendSubmit(pendingExtend.host, data.moments, pendingExtend.name);
                    if (res)
                        this.clusterManager.increaseLifeMoments(pendingExtend.pubkey, data.moments);
                }
            }
            else if (operation.type === OperationType.REMOVE_NODE) {
                const data = operation.data as RemoveNodeOperation;

                // If there ares pending acquires, There could be issues while removing the node.
                if (!data.force && this.getPendingNodes().length > 0)
                    throw 'Nodes cannot be removed, There are pending acquires.'

                const pubkey = data.nodePubkey;
                const node = this.clusterManager.getNode(pubkey);

                log(`Removing the node ${pubkey}...`);

                if (node?.signerAddress) {
                    if ((node?.signerReplaceFailedAttempts || 0) < MAX_SIGNER_REPLACE_ATTEMPTS) {
                        // Generate new multi signer if this node is not already a signer.
                        let newSignerKey, newSignerAddress;
                        if (!this.evernodeContext.xrplContext.multiSigner.isSignerNode()) {
                            // Generate new multi signer;
                            newSignerKey = this.evernodeContext.xrplContext.multiSigner.generateSigner();
                            newSignerAddress = newSignerKey.account;
                        }

                        const elector = new AllVoteElector(1, TIMEOUT);
                        const electionName = `newSigner${this.voteContext.getUniqueNumber()}`;

                        const createdSigners = (await this.voteContext.vote(electionName, [newSignerAddress], elector)).map(o => { return { pubkey: o.sender.publicKey, data: o.data } });

                        // Filter only the signers generated by the node which are not already signers.
                        const signerObj = createdSigners.filter(ob => ob.data).sort((a, b) => a.data.localeCompare(b.data))[0];
                        const newSignerPubkey = signerObj?.pubkey;
                        newSignerAddress = signerObj?.data;

                        if (newSignerPubkey && newSignerAddress) {
                            log(`Replacing the signer ${pubkey} with ${newSignerPubkey}...`);
                            try {
                                await this.evernodeContext.xrplContext.replaceSignerList(node.signerAddress, newSignerAddress);
                                this.clusterManager.markAsQuorum(newSignerPubkey, newSignerAddress);

                                // Set new signer if new signer is self.
                                if (newSignerPubkey === this.hpContext.publicKey && newSignerKey)
                                    this.evernodeContext.xrplContext.multiSigner.setSigner(newSignerKey);

                                // Remove old signer if old signer is self.
                                if (pubkey === this.hpContext.publicKey)
                                    this.evernodeContext.xrplContext.multiSigner.removeSigner();
                            }
                            catch (e) {
                                this.clusterManager.increaseSignerReplaceFailedAttempts(pubkey);
                                throw e;
                            }
                        } else {
                            this.clusterManager.increaseSignerReplaceFailedAttempts(pubkey);
                            throw `No NON-Quorum node was found to replace ${pubkey} signer node.`;
                        }
                    }
                    else {
                        error(`${MAX_SIGNER_REPLACE_ATTEMPTS} attempts on signer replacement failed, Skipping the signer replacement.`);
                    }
                }

                // Update patch config if node exists in UNL.
                let config = await this.hpContext.getContractConfig();
                const idx = config.unl.findIndex((p: string) => p === pubkey);
                if (idx > -1) {
                    config.unl.splice(idx, 1);
                    await this.hpContext.updateContractConfig(config);
                }

                // Update peer list.
                if (node) {
                    if (node?.domain && node?.peerPort) {
                        let peer = `${node?.domain}:${node?.peerPort}`
                        await this.hpContext.updatePeers(null, [peer]);
                    }

                    this.clusterManager.removeNode(pubkey);
                }
            }
        } catch (e) {
            error(e);
        }

        info(`Operations processor ended.`);
    }

    /**
     * Setup initial cluster info and prepare the data file.
     * @param [options={}] Vote options to collect the vote info. 
     */
    async #setupClusterInfo(options: VoteElectorOptions = {}): Promise<void> {
        if (!this.clusterManager.hasClusterInitialized()) {
            const electionName = `share_node_info${this.voteContext.getUniqueNumber()}`;
            const elector = new AllVoteElector(0, options?.timeout || TIMEOUT);
            const signer = this.evernodeContext.xrplContext.multiSigner.getSigner();
            const node = <ClusterNode>{
                pubkey: this.hpContext.publicKey,
                contractId: this.hpContext.contractId,
                isUnl: !!this.hpContext.getContractUnl().find((p: any) => p.publicKey === this.hpContext.publicKey),
                signerAddress: signer ? signer.account : null
            }
            const nodes: ClusterNode[] = (await this.voteContext.vote(electionName, [node], elector)).map(ob => ob.data);

            const unlCount = this.hpContext.getContractUnl().length;
            if (nodes.length < unlCount)
                throw `Could not collect UNL node info. Unl node count ${unlCount}, Received ${nodes.length}.`

            this.clusterManager.initializeCluster(nodes);
            log('Initialized the cluster data with node info.');
        }
    }

    /**
     * Mark the activeness of nodes.
     */
    async #updateActiveness(): Promise<void> {
        const hpconfig = await this.hpContext.getContractConfig();

        for (const u of this.hpContext.getContractUnl()) {
            const gap = Math.abs(u.activeOn - this.hpContext.timestamp);
            // If last active timestamp is before the twice of roundtime, This node must be active.
            if (!u.activeOn || gap <= (hpconfig.consensus.roundtime * 2)) {
                try {
                    this.clusterManager.markAsActive(u.publicKey, this.hpContext.lclSeqNo);
                }
                catch (e) {
                    error(e);
                }
            }
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
                try {
                    // Remove node if aliveness check threshold reached.
                    if (node.aliveCheckCount > ALIVENESS_CHECK_THRESHOLD) {
                        this.clusterManager.removePending(node.refId);

                        log(`Pending node ${node.refId} is removed since it's not alive.`);
                        continue;
                    }

                    if (!(await this.hpContext.checkLiveness(new Peer(info.domain, info.userPort)))) {
                        this.clusterManager.increaseAliveCheck(node.refId);
                    }
                    else {
                        await this.hpContext.updatePeers([`${info.domain}:${info.peerPort}`]);

                        this.clusterManager.addNode(<ClusterNode>{
                            refId: node.refId,
                            contractId: info.contractId,
                            createdOnLcl: this.hpContext.lclSeqNo,
                            createdOnTimestamp: this.hpContext.timestamp,
                            host: node.host,
                            domain: info.domain,
                            outboundIp: info.outboundIp,
                            name: info.name,
                            peerPort: info.peerPort,
                            pubkey: info.pubkey,
                            userPort: info.userPort,
                            isUnl: false,
                            lifeMoments: 1,
                            targetLifeMoments: node.targetLifeMoments
                        });

                        log(`Added node ${info.pubkey} to the cluster as nonUnl.`);
                    }
                }
                catch (e) {
                    error(e);
                }

            }
            // If the pending node is not in the pending acquire, this acquire should be failed.
            else if (!info && !this.evernodeContext.getIfPending(node.refId)) {
                this.clusterManager.removePending(node.refId);
                log(`Pending node ${node.refId} is removed due to unavailability.`);
            }
        }
    }

    /**
     * Check for node which needed to extended.
     */
    async #checkForExtends(): Promise<void> {
        const clusterNodes = this.getClusterNodes();
        const pendingExtend = clusterNodes.find(n => n.targetLifeMoments > n.lifeMoments);

        if (pendingExtend) {
            this.#queueOperation(OperationType.EXTEND_NODE, <ExtendNodeOperation>{
                nodePubkey: pendingExtend.pubkey,
                moments: pendingExtend.targetLifeMoments - pendingExtend.lifeMoments
            });
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
                log(`Adding node ${node.pubkey} as a Unl node.`);
                await this.addToUnl(node.pubkey);
            } catch (e) {
                error(e)
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
            await this.#acknowledgeMaturity().catch(error);
            log(`Maturity acknowledgement sent.`);
        }
    }

    /**
     * Acknowledges the maturity of node to a UNL node of parent cluster.
     * @returns the status of the acknowledgement as a boolean figure.
     */
    async #acknowledgeMaturity(): Promise<boolean> {
        const unlNodes = this.getClusterUnlNodes();
        if (unlNodes && unlNodes.length > 0) {
            const addMessage = <ClusterMessage>{ type: ClusterMessageType.MATURED, data: this.hpContext.publicKey }
            await this.hpContext.sendMessage(JSON.stringify(addMessage), unlNodes.map(n => new Peer(n.domain, n.userPort)));
        }
        return false;
    }

    /**
     * Get all Unl nodes in the cluster.
     * @returns List of nodes in the cluster which are in Unl.
     */
    public getClusterUnlNodes(): ClusterNode[] {
        // Filter out the nodes which are not persisted in the HotPocket Unl yet.
        return this.clusterManager.getUnlNodes().filter(n => this.hpContext.getContractUnl().find((p: any) => p.publicKey === n.pubkey));
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
                        if (user.publicKey === message.data) {
                            const node = this.clusterManager.getNode(message.data);
                            if (node) {
                                this.clusterManager.markAsMatured(message.data, this.hpContext.lclSeqNo)
                                response.status = ClusterMessageResponseStatus.OK;
                                log(`Maturity acknowledgement received from node ${message.data}.`);
                            }
                        }
                    }
                    catch (e) {
                        error(e);
                    }
                    finally {
                        await user.send(JSON.stringify(response));
                        // Release the user message processor.
                        this.#releaseUserMessageProc();
                    }

                    break;
                }
                case ClusterMessageType.CLUSTER_NODES: {
                    // Set status as fail for default.
                    response.status = ClusterMessageResponseStatus.FAIL;

                    try {
                        response.status = ClusterMessageResponseStatus.OK;
                        response.data = this.clusterManager.getNodes();
                    }
                    catch (e) {
                        error(e);
                    }
                    finally {
                        await user.send(JSON.stringify(response));
                    }

                    break;
                }
                default: {
                    break;
                }
            }
        }
        catch (e) {
            error(e);
        }

        return response;
    }

    /**
     * Acquire and add new node to the cluster.
     * @param [lifeMoments=1] Amount of life moments for the instance.
     * @param [options={}]  Acquire instance options.
     */
    public async addNewClusterNode(lifeMoments: number = 1, options: AcquireOptions = {}): Promise<void> {
        const hpconfig = await this.hpContext.getContractConfig();
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
                        roundtime: hpconfig.consensus.roundtime,
                        stage_slice: hpconfig.consensus.stage_slice
                    }
                },
                mesh: {
                    ...(options.instanceCfg?.config?.mesh ? options.instanceCfg.config.mesh : {}),
                    peer_discovery: {
                        // Disabling Dynamic Peer Discovery.(In order to mitigate adding previously removed peers again in to the known peer list)
                        enabled: false,
                        interval: options.instanceCfg?.config?.mesh?.peer_discovery?.interval ? options.instanceCfg.config.mesh.peer_discovery.interval : 30000
                    },
                    msg_forwarding: false
                }
            }
        }

        this.#queueOperation(OperationType.ADD_NODE, <AddNodeOperation>{
            acquireOptions: options,
            lifeMoments: lifeMoments
        });
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

        const hpconfig = await this.hpContext.getContractConfig();
        hpconfig.unl.push(pubkey);
        await this.hpContext.updateContractConfig(hpconfig);
    }

    /**
     * Removes a provided a node from the cluster.
     * @param pubkey Public key of the node to be removed.
     * @param [force=false] Force remove. (This might cause to fail some pending operations).
     */
    public async removeNode(pubkey: string, force: boolean = false): Promise<void> {
        this.#queueOperation(OperationType.REMOVE_NODE, <RemoveNodeOperation>{
            nodePubkey: pubkey,
            force: force
        })
    }
}

export default ClusterContext;