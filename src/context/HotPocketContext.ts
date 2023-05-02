import { EvernodeContextOptions } from "../models/evernode";
// @ts-ignore
const HotPocket = require('hotpocket-js-client');

class HotPocketContext {
    private hpContext: any;

    constructor(hpContext: any, options: EvernodeContextOptions = {}) {
        this.hpContext = hpContext;
    }

    public async checkLiveness(ip: string, port: number): Promise<boolean> {
        const server = `wss://${ip}:${port}`;
        console.log(`Checking Hot Pocket liveness at ${server}`);

        const keys = await HotPocket.generateKeys();
        const hpclient = await HotPocket.createClient([server], keys);

        return new Promise<boolean>(async (resolve) => {

            const timer = setTimeout(async () => {
                console.log(`Timeout waiting for Hot Pocket liveness of ${server}`)
                await hpclient.close();
                resolve(false);
            }, 120000);

            try {
                if (await hpclient.connect()) {
                    console.log(`Hot Pocket live at ${server}`);
                    clearTimeout(timer);
                    await hpclient.close();
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
}

export default HotPocketContext;