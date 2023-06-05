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
        this.evernodeContext = options.evernodeContext;
        this.utilityContext = options.utilityContext
        this.voteContex = this.evernodeContext.voteContext;
        this.contract = contract;
        this.clusterManager = new ClusterManager(publicKey);
    }

    public async init(): Promise<void> {
        await this.evernodeContext.init();
        console.log("NODES >> \n", this.clusterManager.nodes);

        // Grow the cluster if it does not meet the node target.
        if (this.clusterManager.nodes.length < this.contract.targetNodeCount) {
            await this.grow();
        }

        // If this is a new Node (non-UNL), then acknowledge the maturity to be a UNL node in the cluster.
        const amINewNode = this.clusterManager.nodes.find(n => n.publicKey === this.hpContext.publicKey && !n.isUnl);
        if (amINewNode)
            await this.acknowledgeMaturity();
        else {
            const hpconfig = await this.hpContext.getConfig();
            if (hpconfig.unl.includes(this.hpContext.publicKey))
                // Enable user input channel.
                await this.#traceInputs();
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
            console.log("YAY.. User", user);

            // This user's hex pubkey can be accessed from 'user.pubKey'

            // For each user we add a promise to list of promises.
            userHandlers.push(new Promise<void>(async (resolve) => {

                // The contract need to ensure that all outputs for a particular user is emitted
                // in deterministic order. Hence, we are processing all inputs for each user sequentially.
                for (const input of user.inputs) {

                    console.log("Found an input");
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

        if (message.type == "status") {
            return "Cluster is online!";
        }
        else if (message.type === "addMe") {
            if (!this.hpContext.readonly) {
                await this.addNode(user.publicKey);
                this.clusterManager.addNode(user.publicKey);
            }
        }
        else if (message.type === "addNode" && this.clusterManager.publicKey === user.publicKey) {
            if (!this.hpContext.readonly) {
                await this.addNode(message.node);
                this.clusterManager.addNode(message.node);
            }
        }

        return null;
    }

    public async addNode(publicKey: string) {

        const addingNode = this.clusterManager.nodes.find(n => !n.isUnl && n.publicKey === publicKey);

        if (addingNode) {
            const hpconfig = await this.hpContext.getConfig();
            hpconfig.unl.push(addingNode.publicKey);
            await this.hpContext.updateConfig(hpconfig);
            this.clusterManager.markAsUnl(addingNode.publicKey, this.hpContext.lclSeqNo);
        }
    }

    public async acknowledgeMaturity() {
        const unlNode = this.clusterManager.nodes.find(n => n.isUnl);
        if (unlNode)
            await this.utilityContext.sendMessage(JSON.stringify({ type: "addMe" }), unlNode);
    }
}

export default ClusterContext;