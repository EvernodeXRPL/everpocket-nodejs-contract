import { Buffer } from 'buffer';
import { ClusterNode } from '../models/cluster';
import { ConnectionOptions } from '../models';

const HotPocket = require('hotpocket-js-client');
class UtilityContext {
    private hpContext: any;
    private hpClient: any;

    constructor(hpContext: any) {
        this.hpContext = hpContext;
    }

    /**
     * Initiates a client connection for a given ip and a port.
     * @param ip IP address of a node.
     * @param port User port of a node.
     * @param useNewKeyPair If new key pair needs to be utilized.
     */
    async #initClient(ip: string, port: number, useNewKeyPair: boolean = false): Promise<void> {
        if (this.hpClient)
            await this.hpClient.close();

        const server = `wss://${ip}:${port}`;
        const keys = (useNewKeyPair) ? await HotPocket.generateKeys() : {
            privateKey: new Uint8Array(Buffer.from(this.hpContext.privateKey, 'hex')),
            publicKey: new Uint8Array(Buffer.from(this.hpContext.publicKey, 'hex'))
        }

        this.hpClient = await HotPocket.createClient([server], keys);
    }

    async #connectAndHandle(ip: string, port: number, cb: Function | null = null, options: ConnectionOptions = {}): Promise<void> {
        const server = `wss://${ip}:${port}`;
        await this.#initClient(ip, port);

        const timer = setTimeout(async () => {
            this.hpClient.clear(HotPocket.events.contractOutput);
            await this.hpClient.close();
            throw `Timeout waiting for Hot Pocket connection`;
        }, options.timeout || 60000);

        const handleFailure = async () => {
            clearTimeout(timer);
            this.hpClient.clear(HotPocket.events.contractOutput);
            await this.hpClient.close();
        }
        const handleSuccess = async () => {
            clearTimeout(timer);
            await this.hpClient.close();
        }

        try {
            if (await this.hpClient.connect()) {
                if (cb) {
                    try {
                        await cb;
                    }
                    catch (e) {
                        handleFailure();
                        throw e;
                    }
                    handleSuccess();
                }
            }
            else {
                clearTimeout(timer);
                throw `Hot Pocket connection failed for ${server}`;
            }
        }
        catch (err) {
            clearTimeout(timer);
            throw err;
        }
    }

    /**
     * Checks the liveliness of a node.
     * @param ip IP address of a node.
     * @param port User port of a node.
     * @returns the liveliness as a boolean figure.
     */
    public async checkLiveness(ip: string, port: number): Promise<boolean> {
        return new Promise<boolean>(async (resolve) => {
            await this.#connectAndHandle(ip, port, () => {
                console.log(`Hot Pocket live at wss://${ip}:${port}`);
                resolve(true);
            }, { timeout: 120000 }).catch(e => {
                console.error(e);
                resolve(false);
            })
        });
    }

    /**
     * Sends a message to a cluster node.
     * @param message Message to be sent.
     * @param node Corresponding Node.
     * @returns the state of the message sending as a boolean figure.
     */
    public async sendMessage(message: any, node: ClusterNode): Promise<void> {
        return new Promise<void>(async (resolve, reject) => {
            await this.#connectAndHandle(node.ip, node.userPort, async () => {
                console.log(`Hot Pocket live at wss://${node.ip}:${node.userPort}`);

                if (!this.hpContext.readOnly) {
                    const input = await this.hpClient.submitContractInput(message);
                    const submission = await input.submissionStatus;
                    if (submission.status != "accepted")
                        reject("Submission failed. reason: " + submission.reason);
                    else
                        resolve();
                }
            }, { timeout: 60000 }).catch(e => {
                reject(e);
            })
        });
    }
}

export default UtilityContext;