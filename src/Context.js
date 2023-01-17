const EventEmitter = require('events');
const { EvernodeConstants } = require('evernode-js-client');
const { MessageSreializer } = require('./MessageSerializer');
const { MultiSigner } = require('./multi-sign');

class Context {
    hpContext;
    voteEmitter = new EventEmitter();
    transactionEmitter = new EventEmitter();

    constructor(hpContext, options = {}) {
        this.hpContext = hpContext;
        this.serializer = options.serializer || new MessageSerializer();
        this.quorum = options.quorum || 0;
        this.signerList = options.signerList || [];

        this.transactionEmitter.on("MULTISIGNED_TRANSACTIONS", this.#submitSignedBlobs);

    }

    feedUnlMessage(sender, msg) {
        const vote = this.serializer.deserializeVote(msg);
        vote && this.voteEmitter.emit(vote.election, sender, vote.data);
    }

    async vote(electionName, votes, elector) {

        // Start the election.
        const election = elector.election(electionName, this.voteEmitter);

        // Cast our vote(s).
        await Promise.all([].concat(votes).map(v => {
            const msg = this.serializer.serializeVote(electionName, v);
            return this.hpContext.unl.send(msg);
        }));

        // Get election result.
        return await election;
    }

    nodeResolve = null;
    signerAddressList = [];
    async enableMultiSigning(masterKey, quorum, disableMasterKey = false, signerList = [], keyLocation = "../node.key") {

        if (signerList.length == 0) {
            const generatedAddress = MultiSigner.generateAccount(keyLocation);   // return the address

            const pr = new Promise((resolve) => {
                const msg = JSON.stringify({ type: "NODE_ADDRESS", address: generatedAddress });
                this.hpContext.unl.send(msg);
                nodeResolve = resolve;
            });

            await pr;
            signerList = this.signerAddressList.map(addr => ({ address: addr, weight: 1 }));

        }
        // Do set the signing list and disable mastr key if necessary
        await MultiSigner.enable(quorum, signerList, masterKey, disableMasterKey)

    }

    multiSigner = null;

    async submitTransaction(tx, masterKey) {

        const filename = "../node.key"
        let nodeKey = (await fs.readFile(filename)).toString().trim();
        this.multiSigner = new MultiSigner(nodeKey);   // Relevant Node's wallet secret

        this.signerListInfo = this.multiSigner.getSignerList(masterKey);

        const sequenceNumber = await this.getSequenceNumber();
        tx.Sequence = sequenceNumber;
        const { hash, signed_blob}  = this.multiSigner.sign(msgJson.tx, true);  // true for multisign
        const msg = JSON.stringify({ type: "SIGNED_BLOB", blob: signed_blob, address: this.multiSigner.nodeAddress });    // Address must be sent instead of the key
        this.hpContext.unl.send(msg);
    }

    seqResolve = null;
    async getSequenceNumber() {
        const seq = await this.multiSigner.getSequenceNumber();
        const msg = JSON.stringify({type: "SEQUENCE", sequence: seq});
        await this.hpContext.unl.send(msg);

        const pr = new Promise(resolve => {
            this.seqResolve = resolve;
        });

        await pr;

        // Return the minimum sequence number
        return Math.min(...this.sequenceNumberList);
    }

    async #submitSignedBlobs(signedBobs) {
        return await this.multiSigner.submitSignedBlobs(signedBlobs);
    }

    signedBlobs = [];
    sequenceNumberList = [];
    feedUnlMessageForMultisign(sender, msg) {
        const msgJson = JSON.parse(msg);    // JSon similar to object in line 37 above
        if (msgJson.type == "SIGNED_BLOB") {
            this.signedBlobs.push({blob: msgJson.blob, address: msgJson.address});

            const currSignerWeight = this.signedBlobs.reduce((total, sb) => {
                return total + this.signerListInfo.signerList?.find(ob => ob.address === sb.address).weight;
            }, 0);
            
            
            // If signer Quorum is satisfied, submit the transaction
            if (currSignerWeight == this.signerListInfo.signerQuorum) {
                this.transactionEmitter.emit("MULTISIGNED_TRANSACTIONS", this.signedBlobs);
            }
        }
        else if (msgJson.type == "NODE_ADDRESS") {
            this.signerAddressList.push(msgJson.address);

            if (this.signerAddressList.length == this.hpContext.users.count) {
                this.nodeResolve();
            }
        }
        else if (msgJson.type == "SEQUENCE") {
            this.sequenceNumberList.push(msgJson.sequence);
            if (this.sequenceNumberList.length == this.hpContext.users.count) {
                this.seqResolve();
            }
        }
    }



    // tcxx = {};
    // multisigner = new MultiSigner("sadsdffffr44r");
    // multisigner.enable(3, []);
    // multisigner.submit(tcxx);
}

module.exports = {
    Context
}