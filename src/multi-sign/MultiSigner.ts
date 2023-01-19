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

    public constructor(xrplApi: any, address: string | null = null, secret: string | null = null) {
        this.xrplApi = xrplApi;
        this.masterAcc = new evernode.XrplAccount(address, secret, { xrplApi: this.xrplApi });
        this.keyPath = `../${this.masterAcc.address}.key`;
        if (fs.existsSync(this.keyPath)) {
            this.signer = JSONHelpers.castToModel<Signer>(JSON.parse(fs.readFileSync(this.keyPath).toString()));
            this.signerAcc = new evernode.XrplAccount(this.signer.address, this.signer.secret, { xrplApi: this.xrplApi });
        }
    }

    /**
     * Set signer list for the master account
     * @param quorum 
     * @param signerList 
     * @param sequence
     */
    public async setSignerList(quorum: number, signerList: Signer[], sequence: number): Promise<void> {
        // Set a signerList for the account
        await this.masterAcc.setSignerList(signerList, { SignerQuorum: quorum, sequence: sequence });
    }

    /**
     * Get the signer address.
     * @returns Signer info.
     */
    public getSigner(): Signer | null {
        return this.signer;
    }

    /**
     * Generate a key for the node and save the node key in a file named by (../\<master address\>.key).
     * @returns Generated signer info.
     */
    public generateSigner(): Signer {
        const nodeSecret = kp.generateSeed({ algorithm: "ecdsa-secp256k1" });
        const keypair = kp.deriveKeypair(nodeSecret);
        return <Signer>{
            address: kp.deriveAddress(keypair.publicKey),
            secret: nodeSecret
        };
    }

    public persistSigner(): void {
        fs.writeFileSync(this.keyPath, JSON.stringify(JSONHelpers.castFromModel(this.signer)));
    }

    /**
     * Returns the signer list of the account
     * @returns An object in the form of {signerQuorum: <1> , signerList: [{account: "rawweeeere3e3", weight: 1}, {}, ...]} || undefined 
     */
    public async getSignerList(): Promise<{ signerQuorum: number, signerList: Signer[] } | undefined> {
        const accountObjects = await this.masterAcc.getAccountObjects({ type: "signer_list" });
        if (accountObjects.length > 0) {
            const signerObject = accountObjects.filter((ob: any) => ob.LedgerEntryType === 'SignerList')[0];
            const signerList: Signer[] = accountObjects.SignerEntries.map((signer: any) => ({ account: signer.SignerEntry.Account, weight: signer.SignerEntry.SignerWeight }));
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
    public sign(tx: any): string {
        if (!this.signerAcc)
            throw `No signer for ${this.masterAcc.address}`;
        const signedObj = this.signerAcc.sign(tx, true);
        return signedObj.tx_blob;
    }

    /**
     * 
     * @param blobList An array of signed blobs
     * @returns 
     */
    async submitSignedBlobs(blobList: string[] | []) {
        if (blobList.length < 1) {
            throw ("No transaction blobs to submit.")
        }
        const finalBlob = evernode.XrplApi.multiSign(blobList);
        return await this.signerAcc.submitTransactionBlob(finalBlob);
    }
}


export default MultiSigner;