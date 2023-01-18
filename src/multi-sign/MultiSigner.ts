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
     * (Master Account method)
     * This submits a signerList transaction to the account and then disable the master key. SignerList is saved to an object.
     * 
     * @param quorum 
     * @param signerList 
     * @param masterKey 
     * @param disableMasterKey 
     */
    public async setSignerList(quorum: number, signerList: Signer[], sequence: number): Promise<void> {
        // Set a signerList for the account
        await this.masterAcc.setSignerList(signerList, { SignerQuorum: quorum, sequence: sequence });
    }

    public async disableMasterKey(sequence: number): Promise<void> {
        // Disable the master key
        await this.masterAcc.setAccountFields({ Flags: { asfDisableMaster: true }, sequence: sequence });
    }

    /**
     * Generate a key for the node and save the node key in a file named by (../\<master address\>.key) .
     * @param masterKey 
     * @returns 
     */
    public generateSigner(): string {
        const nodeSecret = kp.generateSeed({ algorithm: "ecdsa-secp256k1" });
        fs.writeFileSync(this.keyPath, nodeSecret);
        return nodeSecret;
    }

    /**
     * Returns the signer list of the account
     * @returns An object in the form of {signerQuorum: <1> , signerList: [{account: "rawweeeere3e3", weight: 1}, {}, ...]} || null 
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
        const signedTxBlob: string = this.signerAcc.sign(tx, true);
        return signedTxBlob;
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
        try {
            await this.xrplApi.connect();
            const res = await this.xrplApi.submitOnly(finalBlob);
            console.log("Submitted only", res);

            const tx_status = await this.xrplApi.submissionStatus(res.hash)
            if (tx_status == "tesSUCCESS")
                return tx_status;

        } catch (error) {
            console.log("Error in submitting the multisigned transaction.", error);
        } finally {
            await this.xrplApi.disconnect();
        }
    }

}


export default MultiSigner;