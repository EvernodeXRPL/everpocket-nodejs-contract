import { signerList } from "../models";

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
     * signerList :   A list with signer objects
     * 
     *  This submits a signerList transaction to the account and then disable the master key. SignerList is saved to an object.
     */
    static async enable(quorum: number, signerList: signerList[], masterKey: string, disableMasterKey: boolean = false): Promise<void> {

        const masterAccount = new evernode.XrplAccount(null, masterKey);
        // Add a validation to check if the account has a signerList already.

        try {
            // Set a signerList for the account
            await masterAccount.setSignerList(signerList, { SignerQuorum: quorum });

            if (disableMasterKey)
                // Disable the master key
                await masterAccount.setAccountFields({ Flags: { asfDisableMaster: true } });

        } catch (e) {
            throw (e);
        }

    }

    /**
     * 
     * @param {string} keyLocation Defaults to "../node.key"
     * @returns The generated public address as a promise
     */
    static async generateAccount(keyLocation = "../node.key"): Promise<string> {
        const privatekey = evernode.generatePrivate();
        await fs.writeFile(keyLocation, privatekey);

        const nodeAccountAddress = new evernode.XrplAccount(null, privatekey).address;
        return nodeAccountAddress;
    }

    /**
     * 
     * @param {string} masterKey Secret key of the target account
     * @returns An object in the form of {signerQuorum: <1> , signerList: [{account: "rawweeeere3e3", weight: 1}, {}, ...]} || null 
     */
    static async getSignerList(masterKey: string): Promise<any> {
        const masterAccount = new evernode.XrplAccount(null, masterKey);
        const accountObjects = await masterAccount.getAccountObjects({ type: "signer_list" });
        if (accountObjects.length > 0) {
            const signerObject = accountObjects.filter((ob: any) => ob.LedgerEntryType === 'SignerList')[0];
            const signerList = accountObjects.SignerEntries.map((signer: any) => ({ account: signer.SignerEntry.Account, weight: signer.SignerEntry.SignerWeight }));
            const res = { signerQuorum: signerObject.SignerQuorum, signerList: signerList };
            return res;
        }
        else {
            return null;
        }
    }

    /**
     * 
     * @returns The sequence number of the given account.
     */
    static async getSequenceNumber(masterKey: string): Promise<number> {
        const masterAccount = new evernode.XrplAccount(null, masterKey);
        return await masterAccount.getSequence();
    }

    /**
     * 
     * @param tx Transaction in json 
     * @returns The signed transaction blob
     */
    public sign(tx: any): string {
        const signedTxBlob: string = this.nodeAccount.sign(tx);
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
                return true;

        } catch (error) {
            console.log("Error in submitting the multisigned transaction.", error);
        } finally {
            await this.xrplApi.disconnect();
        }
    }

    // Not in Use
    async isMultiSignedEnabled(masterkey: string) {
        const masterAccount = new evernode.XrplAccount(null, masterkey);

        try {
            const acc_info = await masterAccount.getInfo();  // Returns account_data field object

        } catch (error) {
            console.log("Error in fetching account info", error)
        } finally {
            await this.xrplApi.disconnect();
        }
    }

    // Not in Use
    async getAccountInfo(masterkey: string) {
        let acc_info = null;

        const masterAccount = new evernode.XrplAccount(null, masterkey);
        try {
            acc_info = await masterAccount.getInfo(); // Returns account_data field object
            return acc_info;
        } catch (error) {
            throw (`Error in fetching account info:  ${error}`);
        } finally {
            await this.xrplApi.disconnect();
        }
    }

}


export default MultiSigner;