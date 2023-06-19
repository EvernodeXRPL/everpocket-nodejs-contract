import { Buffer } from 'buffer';
import { ConnectionOptions, Peer } from '../models';

const HotPocket = require('hotpocket-js-client');
class UtilityContext {
    private hpContext: any;
    private hpClient: any;

    constructor(hpContext: any) {
        this.hpContext = hpContext;
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
            privateKey: new Uint8Array(Buffer.from(this.hpContext.privateKey, 'hex')),
            publicKey: new Uint8Array(Buffer.from(this.hpContext.publicKey, 'hex'))
        }

        this.hpClient = await HotPocket.createClient(nodes.map(n => `wss://${n.toString()}`), keys);
    }

    async #connectAndHandle(nodes: Peer[], action: Function | null = null, cb: Function | null = null, options: ConnectionOptions = {}): Promise<void> {
        await this.#initClient(nodes);

        const timer = setTimeout(async () => {
            await handleFailure(`Timeout waiting for Hot Pocket connection`);
        }, options.timeout || 60000);

        const handleFailure = async (error: any) => {
            clearTimeout(timer);
            this.hpClient.clear(HotPocket.events.contractOutput);
            await this.hpClient.close();
            if (cb)
                await cb(null, error);
        }
        const handleSuccess = async (data: any) => {
            clearTimeout(timer);
            await this.hpClient.close();
            if (cb)
                await cb(data, null);
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
                    await handleFailure(e);
                }
            }
            else {
                await handleFailure(`Hot Pocket connection failed for requested nodes`);
            }
        }
        catch (e) {
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
        return new Promise<boolean>(async (resolve) => {
            await this.#connectAndHandle([node], () => {
                console.log(`Hot Pocket live at wss://${node.toString()}`);
            }, (data: any, error: any) => {
                if (error) {
                    console.error(error);
                    resolve(false);
                }
                else
                    resolve(true);
            }, { timeout: 6000 });
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
                if (!this.hpContext.readOnly) {
                    const input = await this.hpClient.submitContractInput(message);
                    return await input.submissionStatus;
                }
            }, (data: any, error: any) => {
                if (error)
                    reject(error);
                else {
                    if (data.status != "accepted")
                        reject("Submission failed. reason: " + data.reason);
                    else
                        resolve();
                }

            }, { timeout: 60000 });
        });
    }
}

export default UtilityContext;