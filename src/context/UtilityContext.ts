import { ClusterNode } from "../models/evernode";
import { Buffer } from 'buffer';

const HotPocket = require('hotpocket-js-client');
class UtilityContext {
    private hpContext: any;
    private hpClient: any;

    constructor(hpContext: any) {
        this.hpContext = hpContext;
    }

    public async createClientConn(ip: string, port: number, useNewKeyPair: boolean = false) {
        if (!this.hpClient) {
            const server = `wss://${ip}:${port}`;
            const keys = (useNewKeyPair) ? await HotPocket.generateKeys() : {
                privateKey: new Uint8Array(Buffer.from(this.hpContext.privateKey, 'hex')),
                publicKey: new Uint8Array(Buffer.from(this.hpContext.publicKey, 'hex'))
            }

            this.hpClient = await HotPocket.createClient([server], keys);
        }
    }

    public async checkLiveness(ip: string, port: number): Promise<boolean> {
        const server = `wss://${ip}:${port}`;
        await this.createClientConn(ip, port);
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

    public async sendMessage(message: any, node: ClusterNode, readOnly: boolean = false) {
        const server = `wss://${node.ip}:${node.userPort}`;
        await this.createClientConn(node.ip, node.userPort);

        return new Promise<boolean>(async (resolve) => {

            const timer = setTimeout(async () => {
                console.log(`Timeout waiting for Hot Pocket connection`)
                await this.hpClient.close();
                resolve(false);
            }, 120000);

            try {
                if (await this.hpClient.connect()) {
                    console.log(`Hot Pocket live at ${server}`);
                    if (readOnly) {
                        const res = await this.hpClient.submitContractReadRequest(message);
                        console.log(res);
                    }
                    else
                        await this.hpClient.submitContractInput(message);

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
        });
    }
}

export default UtilityContext;