import { Signer } from "../models";
import * as evernode from 'evernode-js-client';
import * as fs from 'fs';
import * as kp from 'ripple-keypairs';
import { JSONHelpers } from "../utils";

class MultiSigner {
    private xrplApi: any;
    private keyPath: string;
    private signer: Signer | null = null;
    public masterAcc: any;
    public signerAcc: any;

    public constructor(address: string | null = null) {
        this.xrplApi = new evernode.XrplApi();
        this.masterAcc = new evernode.XrplAccount(address, null, { xrplApi: this.xrplApi });
        this.keyPath = `../${this.masterAcc.address}.key`;
        if (fs.existsSync(this.keyPath)) {
            this.signer = JSONHelpers.castToModel<Signer>(JSON.parse(fs.readFileSync(this.keyPath).toString()));
            this.signerAcc = new evernode.XrplAccount(this.signer.account, this.signer.secret, { xrplApi: this.xrplApi });
        }
    }
    /**
     * Initialize multi signer object.
     */
    public async init(): Promise<void> {
        await this.xrplApi.connect();
    }

    /**
     * De-Initialize multi signer object.
     */
    public async deinit(): Promise<void> {
        await this.xrplApi.disconnect();
    }

    public async getSequence(): Promise<number> {
        return await this.masterAcc.getSequence()
    }

    public getMaxLedgerSequence(): number {
        return Math.ceil((this.xrplApi.ledgerIndex + 30) / 10) * 10; // Get nearest 10th
    }

    /**
     * Get the signer.
     * @returns Signer info.
     */
    public getSigner(): Signer | null {
        return this.signer;
    }

    /**
     * Set the signer.
     * @param signer Signer to set.
    */
    public setSigner(signer: Signer): void {
        this.signer = signer;
        this.signerAcc = new evernode.XrplAccount(this.signer.account, this.signer.secret, { xrplApi: this.xrplApi });
        fs.writeFileSync(this.keyPath, JSON.stringify(JSONHelpers.castFromModel(this.signer)));
    }

    /**
     * Generate a key for the node and save the node key in a file named by (../\<master address\>.key).
     * @returns Generated signer info.
     */
    public generateSigner(): Signer {
        const nodeSecret = kp.generateSeed({ algorithm: "ecdsa-secp256k1" });
        const keypair = kp.deriveKeypair(nodeSecret);
        return <Signer>{
            account: kp.deriveAddress(keypair.publicKey),
            secret: nodeSecret
        };
    }

    /**
     * Returns the signer list of the account
     * @returns An object in the form of {signerQuorum: <1> , signerList: [{account: "rawweeeere3e3", weight: 1}, {}, ...]} || undefined 
     */
    public async getSignerList(): Promise<{ signerQuorum: number, signerList: Signer[] } | undefined> {
        const accountObjects = await this.masterAcc.getAccountObjects({ type: "signer_list" });
        if (accountObjects.length > 0) {
            const signerObject = accountObjects.filter((ob: any) => ob.LedgerEntryType === 'SignerList')[0];
            const signerList: Signer[] = signerObject.SignerEntries.map((signer: any) => ({ account: signer.SignerEntry.Account, weight: signer.SignerEntry.SignerWeight }));
            const res = { signerQuorum: signerObject.SignerQuorum, signerList: signerList };
            return res;
        }
        else
            return undefined;
    }

    /**
     * 
     * @param tx Transaction in json 
     * @returns The signed transaction blob
     */
    public async sign(tx: any): Promise<string> {
        if (!this.signerAcc)
            throw `No signer for ${this.masterAcc.address}`;
        const signedObj = await this.signerAcc.sign(tx, true);
        return signedObj.tx_blob;
    }

    /**
     * 
     * @param tx Multi-signed transaction
     * @returns response
     */
    async submitMultisignedTx(tx: any) {
        const res = await this.xrplApi.submitMultisigned(tx);
        return res;
    }
}


export default MultiSigner;