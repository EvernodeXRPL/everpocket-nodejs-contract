const { notDeepEqual } = require('assert');
const EventEmitter = require('events');
const evernode = require('evernode-js-client');

class MultiSigner {
    xrplApi = null;
    transactionEmitter = new EventEmitter();

    nodeAddress = '';

    // TODO: Get the account masterKey, save it somewhere
    constructor( nodeKey) {
        this.nodeAccount = new evernode.XrplAccount(null, nodeKey);
        this.nodeAddress = this.nodeAccount.address;

        // Use a singleton xrplApi for all tests.
        this.xrplApi = new evernode.XrplApi('wss://hooks-testnet-v2.xrpl-labs.com');
        evernode.Defaults.set({
            registryAddress: registryAddress,
            xrplApi: xrplApi
        })


    }

    /**
     * signerList :   A list with signer objects
     * 
     *  This submits a signerList transaction to the account and then disable the master key. SignerList is saved to an object.
     */
    static async enable(quorum, signerList, masterKey, disableMasterKey = false) {

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
     * @returns The generated public address
     */
    static async generateAccount(keyLocation = "../node.key") {
        const privatekey = evernode.generatePrivate();
        await fs.writeFile(keyLocation, privatekey);

        const nodeAccountAddress = new evernode.XrplAccount(null, privatekey).address;
        return nodeAccountAddress;
    }

    /**
     * 
     * @param {string} masterKey Secret key of the target account
     * @returns An object in the form of {signerQuorum: <1> , signerList: [{address: "rawweeeere3e3", weight: 1}, {}, ...]} || null 
     */
    static async getSignerList(masterKey) {
        const masterAccount = new evernode.XrplAccount(null, masterKey);
        const accountObjects = await masterAccount.getAccountObjects({ type: "signer_list" });
        if (accountObjects.length > 0) {
            const signerObject = accountObjects.filter(ob => ob.LedgerEntryType === 'SignerList')[0];
            const signerList = accountObjects.SignerEntries.map(signer => ({ address: signer.SignerEntry.Account, weight: signer.SignerEntry.SignerWeight }));
            const res = { signerQuorum: signerObject.SignerQuorum, signerList: signerList };
            return res;
        }
        else {
            return null;
        }


    }

    sign(tx) {
        const signedTxBlob = this.nodeAccount.sign(tx);
        return signedTxBlob;
    }


    async submitSignedBlobs(blobList) {
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

    async getSequenceNumber() {
        return await this.nodeAccount.getSequence();
    }


    async isMultiSignedEnabled(masterkey) {
        const masterAccount = new evernode.XrplAccount(null, masterkey);

        try {
            const acc_info = await masterAccount.getInfo();  // Returns account_data field object

        } catch (error) {
            console.log("Error in fetching account info", error)
        } finally {
            await this.xrplApi.disconnect();
        }
    }

    async getAccountInfo(masterkey) {
        let acc_info = null;

        const masterAccount = new evernode.XrplAccount(null, masterkey);
        try {
            acc_info = await masterAccount.getInfo(); // Returns account_data field object
            return acc_info;
        } catch (error) {
            throw ("Error in fetching account info", error);
        } finally {
            await this.xrplApi.disconnect();
        }
    }


}

module.exports = {
    MultiSigner
}