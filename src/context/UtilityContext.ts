import { Buffer } from 'buffer';
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

    async #connectAndHandle(ip: string, port: number, action: Function | null = null, cb: Function | null = null, options: ConnectionOptions = {}): Promise<void> {
        const server = `wss://${ip}:${port}`;
        await this.#initClient(ip, port);

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
                await handleFailure(`Hot Pocket connection failed for ${server}`);
            }
        }
        catch (e) {
            await handleFailure(e);
        }
        return;
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
     * @returns the state of the message sending as a boolean figure.
     */
    public async sendMessage(message: any, ip: string, port: number): Promise<void> {
        return new Promise<void>(async (resolve, reject) => {
            await this.#connectAndHandle(ip, port, async () => {
                console.log(`Hot Pocket live at wss://${ip}:${port}`);

                if (!this.hpContext.readOnly) {
                    const input = await this.hpClient.submitContractInput(message);
                    return await input.submissionStatus;
                }
            }, (data: any, error: any) => {
                if (error)
                    reject(error);
                else {
                    // if (data.status != "accepted")
                    //     reject("Submission failed. reason: " + data.reason);
                    // else
                    resolve();
                }

            }, { timeout: 5000 });
        });
    }
}

export default UtilityContext;