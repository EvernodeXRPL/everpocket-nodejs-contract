import { AcquireOptions } from "../models/evernode";
import { Peer, User } from "../models";
import { Buffer } from 'buffer';
import { EvernodeContext, VoteContext } from "../context";
import { ClusterOptions, ClusterMessage, ClusterMessageResponse, ClusterMessageResponseStatus, ClusterMessageType, ClusterNode, PendingNode } from "../models/cluster";
import { ClusterManager } from "../cluster";
import { AllVoteElector } from "../vote/vote-electors";
import { VoteElectorOptions } from "../models/vote";
import HotPocketContext from "./HotPocketContext";
import { error, log } from "../helpers/logger";
import * as fs from 'fs';

const DUMMY_OWNER_PUBKEY = "dummy_owner_pubkey";
const SASHIMONO_NODEJS_IMAGE = "evernodedev/sashimono:hp.latest-ubt.20.04-njs.20";
const ALIVENESS_CHECK_THRESHOLD = 5;
const MATURITY_LCL_THRESHOLD = 2;
const MAX_SIGNER_REPLACE_ATTEMPTS = 5;
const TIMEOUT = 10000;

class ClusterContext {
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
        await this.evernodeContext.deinit();
        this.initialized = false;
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

        // Helping to make connections
        // This flag file is written at the first execution of the contract.
        const isDefinedPeers = fs.existsSync('../flag_init_peers');
        if (!isDefinedPeers || this.hpContext.lclSeqNo % 4 === 1) {
            console.log("Peer list Updating..");
            const detailedClusterNodes = this.clusterManager.getNodes();
            const knownPeers = detailedClusterNodes.filter(n => n.isUnl && n.pubkey !== this.hpContext.publicKey).map(kp => { return `${kp.ip}:${kp.peerPort}` });
            if (knownPeers) {
                await this.hpContext.updatePeers(knownPeers);
                console.log(`Peer list was updated with ${knownPeers.length} peers.`);
            }

            if (!isDefinedPeers)
                fs.writeFileSync('../flag_init_peers', '');
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

                    if (!(await this.hpContext.checkLiveness(new Peer(info.ip, info.userPort)))) {
                        this.clusterManager.increaseAliveCheck(node.refId);
                    }
                    else {
                        await this.hpContext.updatePeers([`${info.ip}:${info.peerPort}`]);

                        this.clusterManager.addNode(<ClusterNode>{
                            refId: node.refId,
                            contractId: info.contractId,
                            createdOnLcl: this.hpContext.lclSeqNo,
                            createdOnTimestamp: this.hpContext.timestamp,
                            host: node.host,
                            ip: info.ip,
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
                    log(e);
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
        const pendingExtends = clusterNodes.filter(n => n.targetLifeMoments > n.lifeMoments);

        for (const pendingExtend of pendingExtends) {
            const extension = pendingExtend.targetLifeMoments - pendingExtend.lifeMoments;
            try {
                log(`Extending node ${pendingExtend.pubkey} by ${extension}.`);
                const res = await this.evernodeContext.extendSubmit(pendingExtend.host, extension, pendingExtend.name);
                if (res)
                    this.clusterManager.updateLifeMoments(pendingExtend.pubkey, pendingExtend.lifeMoments + extension);
            } catch (e) {
                error(e)
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
            await this.hpContext.sendMessage(JSON.stringify(addMessage), unlNodes.map(n => new Peer(n.ip, n.userPort)));
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
                        roundtime: hpconfig.consensus.roundtime
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
        // If there ares pending acquires, There could be issues while removing the node.
        if (!force && this.getPendingNodes().length > 0)
            throw 'Nodes cannot be removed, There are pending acquires.'

        const node = this.clusterManager.getNode(pubkey);

        if (node?.signerAddress) {
            if ((node?.signerReplaceFailedAttempts || 0) < MAX_SIGNER_REPLACE_ATTEMPTS) {
                // Sorting logic to determine new pubkey - start
                const clusterNodes = this.getClusterNodes();
                const nonQuorumNodes = clusterNodes.filter(n => !n.signerAddress).sort((a, b) => a.pubkey.localeCompare(b.pubkey));

                let newSignerPubkey = nonQuorumNodes[0]?.pubkey;

                if (newSignerPubkey) {
                    log(`Replacing the signer ${pubkey} with ${newSignerPubkey}...`);
                    try {
                        const newAddress = await this.evernodeContext.xrplContext.replaceSignerList(pubkey, node.signerAddress, newSignerPubkey);
                        this.clusterManager.markAsQuorum(newSignerPubkey, newAddress);
                    }
                    catch (e) {
                        this.clusterManager.increaseSignerReplaceFailedAttempts(pubkey);
                        throw e;
                    }
                }
            }
            else {
                error(`${MAX_SIGNER_REPLACE_ATTEMPTS} attempts on signer replacement failed, Skipping the signer replacement.`);
            }
        }

        // Update patch config if node exists in UNL.
        let config = await this.hpContext.getContractConfig();
        const index = config.unl.findIndex((p: string) => p === pubkey);
        if (index > -1) {
            config.unl.splice(index, 1);
            await this.hpContext.updateContractConfig(config);
        }

        // Update peer list.
        if (node) {
            if (node?.ip && node?.peerPort) {
                let peer = `${node?.ip}:${node?.peerPort}`
                await this.hpContext.updatePeers(null, [peer]);
            }

            this.clusterManager.removeNode(pubkey);
        }
    }
}

export default ClusterContext;