import { SignerList } from "../models";
import kp = require('ripple-keypairs');

const evernode = require('evernode-js-client');
const fs = require("fs").promises;

class MultiSigner {
    public xrplApi: any = null;
    public nodeAddress: string = '';
    public nodeAccount: any;

    public constructor(nodeKey: string) {
        this.nodeAccount = new evernode.XrplAccount(null, nodeKey);
        this.nodeAddress = this.nodeAccount.address;

        // Use a singleton xrplApi for all tests.
        this.xrplApi = new evernode.XrplApi('wss://hooks-testnet-v2.xrpl-labs.com');
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
    public async enable(quorum: number, signerList: SignerList[], disableMasterKey: boolean = false): Promise<void> {

        // const masterAccount = new evernode.XrplAccount(null, masterKey);
        // Add a validation to check if the account has a signerList already.

        try {
            // Set a signerList for the account
            await this.nodeAccount.setSignerList(signerList, { SignerQuorum: quorum });

            if (disableMasterKey)
                // Disable the master key
                await this.nodeAccount.setAccountFields({ Flags: { asfDisableMaster: true } });

        } catch (e) {
            throw (e);
        }

    }

    /**
     * Generate a key for the node and save the node key in a file named by (../\<master address\>.key) .
     * @param masterKey 
     * @returns 
     */
    static async generateAccount(masterKey: string): Promise<{address: string, secret: string}> {
        const nodeSecret = kp.generateSeed({algorithm:"ecdsa-secp256k1"});

        const keyPair = kp.deriveKeypair(masterKey);
        const keyFileName = kp.deriveAddress(keyPair.publicKey);
        await fs.writeFile(`../${keyFileName}.key`, nodeSecret);

        const nodeAccount = new evernode.XrplAccount(null, nodeSecret);
        const nodeAddress: string  = nodeAccount.address;
        return {address: nodeAddress, secret: nodeSecret};
    }

   /**
    * Returns the signer list of the account
    * @returns An object in the form of {signerQuorum: <1> , signerList: [{account: "rawweeeere3e3", weight: 1}, {}, ...]} || null 
    */
    public async getSignerList(): Promise<{signerQuorum: number, signerList: SignerList[]} | undefined> {
        const accountObjects = await this.nodeAccount.getAccountObjects({ type: "signer_list" });
        if (accountObjects.length > 0) {
            const signerObject = accountObjects.filter((ob: any) => ob.LedgerEntryType === 'SignerList')[0];
            const signerList: SignerList[] = accountObjects.SignerEntries.map((signer: any) => ({ account: signer.SignerEntry.Account, weight: signer.SignerEntry.SignerWeight }));
            const res = { signerQuorum: signerObject.SignerQuorum, signerList: signerList };
            return res;
        } 
        else 
         return undefined;
    }

    /**
     * 
     * @returns 
     */
    public async getSequenceNumber(): Promise<number> {
        return await this.nodeAccount.getSequence();
    }

    /**
     * 
     * @param tx Transaction in json 
     * @returns The signed transaction blob
     */
    public sign(tx: any): string {
        const signedTxBlob: string = this.nodeAccount.sign(tx, true);
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