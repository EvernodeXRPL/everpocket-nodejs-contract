import { AcquireOptions, ClusterNode, ClusterContextOptions } from "../models/evernode";
import * as fs from 'fs';
import { Contract } from "../models";
import { EvernodeContext, UtilityContext, VoteContext } from "../context";
import { ClusterManager } from "../cluster";

const EXTENDED_ROUNDTIME = 10000;

class ClusterContext {
    public hpContext: any;
    public voteContex: VoteContext;
    public evernodeContext: EvernodeContext;
    public utilityContext: UtilityContext;
    public publicKey: string;
    public contract: Contract;
    public clusterManager: ClusterManager;

    public constructor(hpContext: any, publicKey: string, contract: Contract, options: ClusterContextOptions) {
        this.hpContext = hpContext;
        this.publicKey = publicKey;
        this.evernodeContext = options?.evernodeContext;
        this.utilityContext = options?.utilityContext
        this.voteContex = this.evernodeContext?.voteContext;
        this.contract = contract;
        this.clusterManager = new ClusterManager(publicKey);
    }

    public async init(): Promise<void> {
        // If this is a new Node (non-UNL), then acknowledge the maturity to be a UNL node in the cluster.
        const myNode = this.clusterManager.nodes.find(n => n.publicKey === this.hpContext.publicKey);
        if (myNode?.isUnl)
            // Enable user input channel.
            await this.#traceInputs();
        else
            await this.acknowledgeMaturity();

        await this.evernodeContext.init();

        console.log("NODES >> \n", this.clusterManager.nodes);

        // Grow the cluster if it does not meet the node target.
        if (this.clusterManager.nodes.length < this.contract.targetNodeCount) {
            await this.grow();
        }

        this.clusterManager.persistNodes();
    }

    public async grow(): Promise<void> {
        const rawData = fs.readFileSync(this.evernodeContext.acquireDataFile, 'utf8');
        const data = JSON.parse(rawData);
        const nodePubkeys = this.clusterManager.nodes.map(x => x.publicKey);

        if (data.pendingAcquires.length < 1 && data.acquiredNodes.length < this.contract.targetNodeCount) {
            await this.purchaseNode({
                instanceCfg: {
                    owner_pubkey: this.publicKey,
                    contract_id: this.contract.contractId,
                    image: this.contract.image,
                    config: this.contract.config
                }
            });
        }

        const acquiredNode = data.acquiredNodes.find((n: { pubkey: string; }) => !nodePubkeys.includes(n.pubkey));
        const isAlive = acquiredNode ? await this.utilityContext.checkLiveness(acquiredNode.ip, acquiredNode.user_port) : false;
        if (acquiredNode && isAlive) {
            // TODO Perform a lease extension as per the requirement.
            await this.hpContext.updatePeers([`${acquiredNode.ip}:${acquiredNode.peer_port}`], []);

            this.clusterManager.addNode(<ClusterNode>{
                publicKey: acquiredNode.pubkey,
                ip: acquiredNode.ip,
                userPort: acquiredNode.user_port,
                peer: { ip: acquiredNode.ip, port: acquiredNode.peer_port },
                account: acquiredNode.host,
                createdOn: this.hpContext.lclSeqNo,
                isUnl: false,
                isQuorum: false
            });
        }
    }

    public async purchaseNode(options: AcquireOptions): Promise<any> {
        const hpconfig = await this.hpContext.getConfig();
        const unl = hpconfig.unl;

        options.instanceCfg.config.contract = {
            // Take only first unl pubkey to keep xrpl memo size within 1KB.
            // Ths instance will automatically fetch full UNL when syncing.
            unl: unl.sort().slice(0, 1),
            consensus: {
                mode: "public",
                roundtime: hpconfig.consensus.roundtime,
                stage_slice: 25,
                threshold: 80
            }
        }
        await this.evernodeContext.acquireNode(options);
    }

    async #traceInputs() {
        // Collection of per-user promises to wait for. Each promise completes when inputs for that user is processed.
        const userHandlers = [];

        for (const user of this.hpContext.users.list()) {

            // This user's hex pubkey can be accessed from 'user.pubKey'

            // For each user we add a promise to list of promises.
            userHandlers.push(new Promise<void>(async (resolve) => {

                // The contract need to ensure that all outputs for a particular user is emitted
                // in deterministic order. Hence, we are processing all inputs for each user sequentially.
                for (const input of user.inputs) {

                    const buf = await this.hpContext.users.read(input);
                    const output = await this.#handleInput(user, buf);
                    output && await user.send(output);
                }

                // The promise gets completed when all inputs for this user are processed.
                resolve();
            }));
        }

        // Wait until all user promises are complete.
        await Promise.all(userHandlers);
    }

    async #handleInput(user: any, inputBuf: any) {

        const message = JSON.parse(inputBuf);

        switch (message.type) {

            case "status": {
                return JSON.stringify({ type: "status", status: "Cluster is online!" });
            }
            case "addMe": {
                if (!this.hpContext.readonly && await this.addNode(user.publicKey)) {
                    return JSON.stringify({ type: "addMe", status: "ok" });
                }
                return JSON.stringify({ type: "addMe", status: "not_ok" });
            }
            case "addNode": {
                if (!this.hpContext.readonly && await this.addNode(message.node)) {
                    return JSON.stringify({ type: "addNode", status: "ok" });
                }
                return JSON.stringify({ type: "addNode", status: "not_ok" });
            }
            default:
                return null;
        }
    }

    public async addNode(publicKey: string): Promise<boolean> {

        const addingNode = this.clusterManager.nodes.find(n => !n.isUnl && n.publicKey === publicKey);

        if (addingNode) {
            const hpconfig = await this.hpContext.getConfig();
            hpconfig.unl.push(addingNode.publicKey);
            await this.hpContext.updateConfig(hpconfig);
            this.clusterManager.markAsUnl(addingNode.publicKey, this.hpContext.lclSeqNo);
            return true;
        }
        return false;
    }

    public async acknowledgeMaturity(): Promise<boolean> {
        const unlNode = this.clusterManager.nodes.find(n => n.isUnl);
        if (unlNode)
            return await this.utilityContext.sendMessage(JSON.stringify({ type: "addMe" }), unlNode);
        return false;
    }

    async removeNode(pubkey: string): Promise<void> {
        // Update patch config.
        let config = await this.hpContext.getConfig();
        config.unl = config.unl.filter((p: string) => p != pubkey);
        await this.hpContext.updateConfig(config);

        // Update peer list.
        let node = this.clusterManager.nodes.find( n => n.publicKey ===  pubkey)
        let peer = `${node?.peer.ip}:${node?.peer.port}`
        await this.hpContext.updatePeers(null, [peer]);

        this.clusterManager.removeNode(pubkey);

        this.clusterManager.persistNodes();
    }
}

export default ClusterContext;