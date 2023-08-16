import { Buffer } from 'buffer';
import { ConnectionOptions, HotPocketOptions, Peer, UnlNode } from '../models';
import { ClusterMessageResponse, ClusterMessageResponseStatus, ClusterMessageType } from '../models/cluster';
import VoteContext from './VoteContext';
import { log, error } from '../helpers/logger';
const HotPocket = require('hotpocket-js-client');

const TIMEOUT = 60000;

class HotPocketContext {
    private hpClient: any;
    private contractContext: any;
    public voteContext: any;
    public publicKey: string;
    public contractId: string;
    public lclSeqNo: number;
    public lclHash: string;
    public timestamp: number;

    constructor(contractContext: any, options: HotPocketOptions = {}) {
        this.contractContext = contractContext;
        this.publicKey = this.contractContext.publicKey;
        this.contractId = this.contractContext.contractId;
        this.lclSeqNo = this.contractContext.lclSeqNo;
        this.lclHash = this.contractContext.lclHash;
        this.timestamp = this.contractContext.timestamp;
        this.voteContext = options.voteContext || new VoteContext(this.contractContext, options.voteOptions)
    }

    /**
     * Initiates a client connection for a given ip and a port.
     * @param nodes List of cluster nodes to connect.
     * @param useNewKeyPair If new key pair needs to be utilized.
     */
    async #initClient(nodes: Peer[], useNewKeyPair: boolean = false): Promise<void> {
        if (this.hpClient)
            await this.hpClient.close();

        const keys = (useNewKeyPair) ? await HotPocket.generateKeys() : {
            privateKey: new Uint8Array(Buffer.from(this.contractContext.privateKey, 'hex')),
            publicKey: new Uint8Array(Buffer.from(this.contractContext.publicKey, 'hex'))
        }

        const nodesToTry = nodes.filter(n => n.ip && n.port).map(n => `wss://${n.toString()}`);
        if (!nodesToTry || !nodesToTry.length)
            throw `There are no nodes ip port info to connect.`;

        this.hpClient = await HotPocket.createClient(nodesToTry, keys);
    }

    /**
     * Connect to given node and handle an user action.
     * @param nodes Nodes to connect to.
     * @param [action=null] User action to be handled
     * @param [callback=null] Callback on completion or error.
     * @param [options={}] Connection options.
     */
    async #connectAndHandle(nodes: Peer[], action: Function | null = null, callback: Function | null = null, options: ConnectionOptions = {}): Promise<void> {
        await this.#initClient(nodes);

        const timer = setTimeout(async () => {
            await handleFailure(`Timeout waiting for HotPocket connection`);
        }, options.timeout || TIMEOUT);

        const handleFailure = async (error: any) => {
            clearTimeout(timer);
            this.hpClient.clear(HotPocket.events.contractOutput);
            await this.hpClient.close();
            if (callback)
                await callback(null, error);
        }
        const handleSuccess = async (data: any) => {
            clearTimeout(timer);
            await this.hpClient.close();
            if (callback)
                await callback(data, null);
        }

        try {
            if (await this.hpClient.connect()) {
                try {
                    let data = null;
                    if (action)
                        data = await action();
                    await handleSuccess(data);
                }
                catch (e) {
                    error("Handle Failure in performing action", e)
                    await handleFailure(e);
                }
            }
            else {
                await handleFailure(`HotPocket connection failed for requested nodes`);
            }
        }
        catch (e) {
            error("Handle Failure in Connecting", e)
            await handleFailure(e);
        }
        return;
    }

    /**
     * Checks the liveliness of a node.
     * @param node Node to check the connection.
     * @returns the liveliness as a boolean figure.
     */
    public async checkLiveness(node: Peer): Promise<boolean> {
        const address = node.toString();
        return new Promise<boolean>(async (resolve, reject) => {
            await this.#connectAndHandle([node], () => {
                log(`Hot Pocket live at wss://${address}`);
            }, (data: any, err: any) => {
                if (err) {
                    error(err);
                    resolve(false);
                }
                else
                    resolve(true);
                return;
            }, { timeout: 6000 }).catch(e => {
                reject(e);
                return;
            });
        });
    }

    /**
     * Sends a message to a cluster node.
     * @param message Message to be sent.
     * @param nodes Nodes to send the message.
     * @returns the state of the message sending as a boolean figure.
     */
    public async sendMessage(message: any, nodes: Peer[]): Promise<void> {
        return new Promise<void>(async (resolve, reject) => {
            await this.#connectAndHandle(nodes, async () => {
                return await new Promise<void>(async (resolve2, reject2) => {
                    this.hpClient.on(HotPocket.events.contractOutput, (res: any) => {
                        try {
                            for (const output of res.outputs) {
                                let obj = JSON.parse(output.toString()) as ClusterMessageResponse;
                                if (obj.type === ClusterMessageType.MATURED && obj.status === ClusterMessageResponseStatus.OK) {
                                    resolve2();
                                    return;
                                }
                            }
                        }
                        catch (e) {
                            error(e);
                        }
                    });

                    const input = await this.hpClient.submitContractInput(message);
                    const statRes = await input.submissionStatus;
                    if (statRes.status != "accepted") {
                        reject2("Submission failed. reason: " + statRes.reason);
                        return;
                    }

                });
            }, (data: any, error: any) => {
                if (error)
                    reject(error);
                else
                    resolve();
                return;
            }, { timeout: 60000 }).catch(e => {
                reject(e);
                return;
            });
        });
    }

    /**
     * Get the contract config.
     * @returns The contract config.
     */
    public async getContractConfig(): Promise<any> {
        return await this.contractContext.getConfig();
    }

    /**
     * Update the contract config.
     * @returns The contract config.
     */
    public async updateContractConfig(config: any): Promise<void> {
        await this.contractContext.updateConfig(config);
    }

    /**
     * Get the contract unl.
     * @returns The contract unl.
     */
    public getContractUnl(): UnlNode[] {
        return this.contractContext.unl.list();
    }

    /**
     * Update the HotPocket peer list.
     * @param toAdd Peer list to add.
     * @param [toRemove=[]] Peer list to remove.
     */
    public async updatePeers(toAdd: string[] | null, toRemove: string[] | string | null = null): Promise<void> {
        await this.contractContext.updatePeers(toAdd, toRemove);
    }
}

export default HotPocketContext;
