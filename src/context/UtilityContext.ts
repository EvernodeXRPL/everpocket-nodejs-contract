import { ClusterNode } from "../models/evernode";
import { Buffer } from 'buffer';

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
    async #initClient(ip: string, port: number, useNewKeyPair: boolean = false) {
        if (this.hpClient)
            await this.hpClient.close();

        const server = `wss://${ip}:${port}`;
        const keys = (useNewKeyPair) ? await HotPocket.generateKeys() : {
            privateKey: new Uint8Array(Buffer.from(this.hpContext.privateKey, 'hex')),
            publicKey: new Uint8Array(Buffer.from(this.hpContext.publicKey, 'hex'))
        }

        this.hpClient = await HotPocket.createClient([server], keys);
    }

    /**
     * Checks the liveliness of a node.
     * @param ip IP address of a node.
     * @param port User port of a node.
     * @returns the liveliness as a boolean figure.
     */
    public async checkLiveness(ip: string, port: number): Promise<boolean> {
        const server = `wss://${ip}:${port}`;
        await this.#initClient(ip, port);
        console.log(`Checking Hot Pocket liveness at ${server}`);

        return new Promise<boolean>(async (resolve) => {

            const timer = setTimeout(async () => {
                console.log(`Timeout waiting for Hot Pocket liveness of ${server}`)
                await this.hpClient.close();
                resolve(false);
            }, 120000);

            try {
                if (await this.hpClient.connect()) {
                    console.log(`Hot Pocket live at ${server}`);
                    clearTimeout(timer);
                    await this.hpClient.close();
                    resolve(true)
                }
                else {
                    console.log(`Hot Pocket connection failed for ${server}`);
                    clearTimeout(timer);
                    resolve(false);
                }
            }
            catch (err) {
                console.log(`Exception on Hot Pocket connection to ${server}`, err);
                clearTimeout(timer);
                resolve(false);
            }
        })
    }

    /**
     * Sends a message to a cluster node.
     * @param message Message to be sent.
     * @param node Corresponding Node.
     * @returns the state of the message sending as a boolean figure.
     */
    public async sendMessage(message: any, node: ClusterNode) {
        const server = `wss://${node.ip}:${node.userPort}`;
        await this.#initClient(node.ip, node.userPort);

        return new Promise<boolean>(async (resolve) => {

            const timer = setTimeout(async () => {
                console.log(`Timeout waiting for Hot Pocket connection`);
                this.hpClient.clear(HotPocket.events.contractOutput);
                await this.hpClient.close();
                resolve(false);
            }, 60000);

            const handleFailure = async () => {
                clearTimeout(timer);
                this.hpClient.clear(HotPocket.events.contractOutput);
                await this.hpClient.close();
                resolve(false);
            }
            const handleSuccess = async () => {
                clearTimeout(timer);
                await this.hpClient.close();
                resolve(true);
            }

            try {
                if (await this.hpClient.connect()) {
                    console.log(`Hot Pocket live at ${server}`);

                    // This will get fired when contract sends an output.
                    this.hpClient.on(HotPocket.events.contractOutput, (r: { outputs: any[]; }) => {

                        r.outputs.forEach(async (output: any) => {
                            let result;
                            try {
                                result = JSON.parse(output);
                                result?.status === "ok" ? handleSuccess() : handleFailure();
                            }
                            catch (e) {
                                console.log("Failed in parsing the result.")
                                handleFailure()
                            }
                        });
                    });

                    if (!this.hpContext.readOnly) {
                        const input = await this.hpClient.submitContractInput(message);
                        const submission = await input.submissionStatus;
                        if (submission.status != "accepted") {
                            console.log("Submission failed. reason: " + submission.reason);
                            handleFailure();
                        }
                    }

                }
                else {
                    console.log(`Hot Pocket connection failed for ${server}`);
                    clearTimeout(timer);
                    resolve(false);
                }
            }
            catch (err) {
                console.log(`Exception on Hot Pocket connection to ${server}`, err);
                clearTimeout(timer);
                resolve(false);
            }
        });
    }
}

export default UtilityContext;