import { Signer } from "../models";
import * as evernode from 'evernode-js-client';
import * as fs from 'fs';
import * as kp from 'ripple-keypairs';

class MultiSigner {
    private xrplApi: any;
    private keyPath: string;
    public masterAcc: any;
    public signerAcc: any;

    public constructor(xrplApi: any, address: string | null = null, secret: string | null = null) {
        this.xrplApi = xrplApi;
        this.masterAcc = new evernode.XrplAccount(address, secret, { xrplApi: this.xrplApi });
        this.keyPath = `../${this.masterAcc.address}.key`;
        if (fs.existsSync(this.keyPath)) {
            this.signerAcc = new evernode.XrplAccount(null, fs.readFileSync(this.keyPath), { xrplApi: this.xrplApi });
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
        console.log("B1");
        await this.masterAcc.setSignerList(signerList, { SignerQuorum: quorum, sequence: sequence });
        console.log("B2");
    }

    /**
     * Disable the master key
     * @param sequence 
     */
    public async disableMasterKey(sequence: number): Promise<void> {
        await this.masterAcc.setAccountFields({ Flags: { asfDisableMaster: true }, sequence: sequence });
    }

    /**
     * Generate a key for the node and save the node key in a file named by (../\<master address\>.key) .
     * @param masterKey 
     * @returns Generated account's public address
     */
    public generateSigner(): string {
        const nodeSecret = kp.generateSeed({ algorithm: "ecdsa-secp256k1" });
        fs.writeFileSync(this.keyPath, nodeSecret);
        const keypair = kp.deriveKeypair(nodeSecret);
        return kp.deriveAddress(keypair.publicKey);
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