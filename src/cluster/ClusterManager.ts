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
        this.clusterPath = `../nodes.json`;
        if (fs.existsSync(this.clusterPath))
            this.nodes = JSONHelpers.castToModel<ClusterNode[]>(JSON.parse(fs.readFileSync(this.clusterPath).toString()));
    }

    public persistNodes(): void {
        fs.writeFileSync(this.clusterPath, JSON.stringify(JSONHelpers.castFromModel(this.nodes)));
    }

    public addNode(publicKey: string, peer: Peer): void {
        this.nodes.push(<ClusterNode>{ publicKey: publicKey, peer: peer });
    }

    public removeNode(publicKey: string): void {
        this.nodes = this.nodes.filter(n => n.publicKey !== publicKey);
    }
}

export default ClusterManager;