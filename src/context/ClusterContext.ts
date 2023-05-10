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

        if (this.clusterManager.nodes.length <= this.contract.targetNodeCount) {
            await this.grow();
        }

        await this.updateSyncedNodes();
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
        if (acquiredNode && (await this.utilityContext.checkLiveness(acquiredNode.ip, acquiredNode.user_port))) {
            // Extend if needed.
            await this.hpContext.updatePeers([`${acquiredNode.ip}:${acquiredNode.peer_port}`], []);

            this.clusterManager.addNode(<ClusterNode>{
                publicKey: acquiredNode.pubkey,
                peer: { ip: acquiredNode.ip, port: acquiredNode.peer_port },
                account: acquiredNode.host,
                createdOn: this.hpContext.lclSeqNo,
                isUNL: false,
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


    public async updateSyncedNodes(): Promise<void> {
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

        this.clusterManager.persistNodes();
    }
}

export default ClusterContext;