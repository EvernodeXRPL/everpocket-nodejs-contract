import { ClusterNode } from "../models/evernode";
import * as fs from 'fs';
import { JSONHelpers } from "../utils";
import { Peer } from "../models";

class ClusterManager {
    private clusterPath: string;
    public nodes: ClusterNode[] = [];
    public publicKey: string;

    public constructor(publicKey: string) {
        this.publicKey = publicKey;
        this.clusterPath = `./nodes.json`;
        if (fs.existsSync(this.clusterPath))
            this.nodes = JSON.parse(fs.readFileSync(this.clusterPath, 'utf8')).map((o: any) => JSONHelpers.castToModel(o));

    }

    public persistNodes(): void {
        fs.writeFileSync(this.clusterPath, JSON.stringify(this.nodes.map(o => JSONHelpers.castFromModel(o))));
    }

    public addNode(node: ClusterNode): void {
        this.nodes.push(node);
    }

    public removeNode(publicKey: string): void {
        this.nodes = this.nodes.filter(n => n.publicKey !== publicKey);
    }

    public markAsUnl(pubkey: string, lclSeqNo: number) {
        const node = this.nodes.find(n => n.publicKey === pubkey);

        if (node) {
            node.isUNL = true;
            node.addedToUnl = lclSeqNo;
        }
    }

}

export default ClusterManager;