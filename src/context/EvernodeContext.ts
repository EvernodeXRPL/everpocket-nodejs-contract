import { XrplContext } from ".";
import { AcquireOptions, EvernodeContextOptions } from "../models/evernode";

class EvernorContext {
    public hpContext: any;
    public xrplContext: XrplContext;

    constructor(hpContext: any, address: string, options: EvernodeContextOptions = {}) {
        this.hpContext = hpContext;
        this.xrplContext = options.xrplContext || new XrplContext(this.hpContext, address, null, options.xrplOptions);
    }

    async init(): Promise<void> {
        // Check for pending transactions and their completion.
    }

    async addNode(options: AcquireOptions = {}): Promise<void> {
        // const host = options.host || pick a random host.

        const tx = {
            // Acquire tx,
            ...options.txOptions
        };

        await this.xrplContext.init();

        try {
            await this.xrplContext.multiSignAndSubmitTransaction(tx);

            // Record as a pending transaction.
        } catch (e) {
            console.error(e);
        } finally {
            await this.xrplContext.deinit();
        }
    }

    async removeNode(pubkey: string): Promise<void> {
        // // Update patch config.
        // let config = await this.hpContext.getConfig();
        // config.unl = config.unl.filter((p: string) => p != pubkey);
        // await this.hpContext.updateConfig(config);
        
        // // Update peer list.
        // let peer = '';// find peer from local state file.
        // await this.hpContext.updatePeers(null, [peer]);
    }

    async addXrplSigner(pubkey: string): Promise<void> {
        // // If pubkey is my pubkey.
        // const signer = this.xrplContext.multiSigner.generateSigner();

        // // Add signer to the list and renew the signer list.
        // const signerList = await this.xrplContext.multiSigner.getSignerList();
        // signerList?.signerList.push(signer);
        // this.xrplContext.setSignerList(signerList!);

        // this.xrplContext.multiSigner.setSigner(signer);
    }

    async removeXrplSigner(pubkey: string): Promise<void> {
        // // If pubkey is my pubkey.
        // const signer = this.xrplContext.multiSigner.generateSigner();

        // // Remove signer from the list and renew the signer list.
        // const signerList = await this.xrplContext.multiSigner.getSignerList();
        // signerList.signerList = signerList?.signerList.filter(s => s != signer);
        // this.xrplContext.setSignerList(signerList!);


        // this.xrplContext.multiSigner.removeSigner();
    }
}

export default EvernorContext;