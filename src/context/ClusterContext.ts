import { AcquireOptions, ClusterNode, ClusterContextOptions } from "../models/evernode";
import * as fs from 'fs';
import { Contract } from "../models";
import { EvernodeContext, UtilityContext, VoteContext } from "../context";
import { ClusterManager } from "../cluster";

const MAX_SUPPORTED_NODE_LIMIT = 10;
const MIN_NODE_REQUIREMENT = 2;

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

        console.log("NODES >> \n", this.clusterManager.nodes)

        if (this.clusterManager.nodes.length <= this.contract.targetNodeCount) {
            const rawData = fs.readFileSync(this.evernodeContext.acquireDataFile, 'utf8');
            const data = JSON.parse(rawData);
            const nodePubkeys = this.clusterManager.nodes.map(x => x.publicKey);

            if (data.pendingAcquires.length < 1 && data.acquiredNodes.length < this.contract.targetNodeCount) {
                const options: AcquireOptions = {
                    instanceCfg: {
                        owner_pubkey: this.publicKey,
                        contract_id: this.contract.contractId,
                        image: this.contract.image,
                        config: this.contract.config
                    }
                }
                const hpconfig = await this.hpContext.getConfig();
                const unl = hpconfig.unl;

                options.instanceCfg.config.contract = {
                    // Take only first unl pubkey to keep xrpl memo size within 1KB.
                    // Ths instance will automatically fetch full UNL when syncing.
                    unl: unl.sort().slice(0, 1),
                    roundtime: hpconfig.roundtime
                }
                await this.evernodeContext.acquireNode(options);
            }

            const acquiredNode = data.acquiredNodes.find((n: { pubkey: string; }) => !nodePubkeys.includes(n.pubkey));
            if (acquiredNode && (await this.utilityContext.checkLiveness(acquiredNode.ip, acquiredNode.user_port))) {
                await this.hpContext.updatePeers([`${acquiredNode.ip}:${acquiredNode.peer_port}`], []);
                this.clusterManager.addNode(acquiredNode.pubkey, { ip: acquiredNode.ip, port: acquiredNode.peer_port }, acquiredNode.host, this.hpContext.lclSeqNo);
            }
        }

        await this.syncNodes();
        this.clusterManager.persistNodes();
    }

    public async syncNodes() {
        const nonUnl = this.clusterManager.nodes.filter(n => !n.isUNL);

        const waitFulfilled = nonUnl.filter(n => n.createdOn <= (this.hpContext.lclSeqNo - 5));

        if (waitFulfilled.length > 0) {
            const hpconfig = await this.hpContext.getConfig();
            for (const n of waitFulfilled) {
                hpconfig.unl.push(n.publicKey);
                await this.hpContext.updateConfig(hpconfig);
                this.clusterManager.markAsUnl(n.publicKey, this.hpContext.lclSeqNo);
            }
        }
    }
}

export default ClusterContext;