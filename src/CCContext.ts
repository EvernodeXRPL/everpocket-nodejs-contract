// import * as EventEmitter from 'events';
// import { MultiSigner }  from './multi-sign';
// import MessageSerializer from './utils/MessageSerializer';
// import { UnlNode, SignerList } from './models';
// import { AllVoteElector } from './vote-electors';
// const fs = require("fs").promises;

// class Context {
//     private hpContext;
//     private voteEmitter = new EventEmitter();
//     private transactionEmitter = new EventEmitter();
//     private serializer;
//     private nodeResolve: any = null;
//     private signerAddressList: string[] = [];
//     private multiSigner: any = null;
//     private signerListInfo: any = null;
//     private seqResolve: any = null;
//     private sequenceNumberList: number[] = [];
//     private signedBlobs: any[] = [];



//     public constructor(hpContext: any, options: any = {}) {
//         this.hpContext = hpContext;
//         this.serializer = options.serializer || new MessageSerializer("bson");
//         this.transactionEmitter.on("MULTISIGNED_TRANSACTIONS", this.submitSignedBlobs);
//     }

//     public feedUnlMessage(sender: UnlNode, msg: Buffer): void {
//         const msgJson = new MessageSerializer("json").deserializeMessage(msg);    // JSon similar to object in line 37 above
//         if (msgJson.type == "SIGNED_BLOB") {
//             this.signedBlobs.push({blob: msgJson.blob, account:  msgJson.account});

//             const currSignerWeight = this.signedBlobs.reduce((total: number, sb: any) => {
//                 return total + this.signerListInfo.signerList?.find((ob: any) => ob.account === sb.account).weight;
//             }, 0);
            
            
//             // If signer Quorum is satisfied, submit the transaction
//             if (currSignerWeight == this.signerListInfo.signerQuorum) {
//                 this.transactionEmitter.emit("MULTISIGNED_TRANSACTIONS", sender, this.signedBlobs);
//             }
//         }
//         else if (msgJson.type == "NODE_ADDRESS") {
//             this.signerAddressList.push(msgJson.address);

//             // Wait till the addresses of the all nodes are collected
//             if (this.signerAddressList.length == this.hpContext.users.count) {
//                 this.nodeResolve();
//             }
//         }
//         else if (msgJson.type == "SEQUENCE") {
//             this.sequenceNumberList.push(msgJson.sequence);
//             if (this.sequenceNumberList.length == this.hpContext.users.count) {
//                 this.seqResolve();
//             }
//         }
//         else {
//             const vote = this.serializer.deserializeVote(msg);
//             vote && this.voteEmitter.emit(vote.election, sender, vote.data);
//         }

//     }

//     public async vote(electionName: string, votes: any[], elector: AllVoteElector): Promise<any[]> {

//         // Start the election.
//         const election = elector.election(electionName, this.voteEmitter);

//         // Cast our vote(s).
//         await Promise.all(new Array().concat(votes).map(v => {
//             const msg = this.serializer.serializeVote(electionName, v);
//             return this.hpContext.unl.send(msg);
//         }));

//         // Get election result.
//         return await election;
//     }

//     public async enableMultiSigning(masterKey: string, quorum: number, disableMasterKey: boolean = false, signerList: SignerList[] = [], keyLocation = "../node.key") {

//         if (signerList.length == 0) {
//             const generatedAddress = MultiSigner.generateAccount(keyLocation);   // return the address

//             const pr = new Promise((resolve) => {
//                 const msg = JSON.stringify({ type: "NODE_ADDRESS", address: generatedAddress });
//                 this.hpContext.unl.send(msg);
//                 this.nodeResolve = resolve;
//             });

//             await pr;
//             signerList = this.signerAddressList.map(addr => ({ account: addr, weight: 1 }));

//         }
//         // Do set the signing list and disable mastr key if necessary
//         await MultiSigner.enable(quorum, signerList, masterKey, disableMasterKey)

//     }

//     public async submitTransaction(tx: any, masterKey: string) {

//         const filename = "../node.key"
//         let nodeKey = (await fs.readFile(filename)).toString().trim();
//         this.multiSigner = new MultiSigner(nodeKey);   // Relevant Node's wallet secret

//         this.signerListInfo = this.multiSigner.getSignerList(masterKey);

//         const sequenceNumber: number = await this.getSequenceNumber(masterKey);
//         tx.Sequence = sequenceNumber;
//         const { hash, signed_blob}  = this.multiSigner.sign(tx, true);  // true for multisign
//         const msg = JSON.stringify({ type: "SIGNED_BLOB", blob: signed_blob, account: this.multiSigner.nodeAddress });    // Address must be sent instead of the key
//         this.hpContext.unl.send(msg);
//     }
    
//     private async getSequenceNumber(masterKey: string): Promise<number> {
//         const seq = await MultiSigner.getSequenceNumber(masterKey);
//         const msg = JSON.stringify({type: "SEQUENCE", sequence: seq});
//         await this.hpContext.unl.send(msg);

//         const pr = new Promise(resolve => {
//             this.seqResolve = resolve;
//         });

//         await pr;

//         // Return the minimum sequence number
//         return Math.min(...this.sequenceNumberList);
//     }

//     private async submitSignedBlobs(sender: any, signedBlobs: string[]) {
//         return await this.multiSigner.submitSignedBlobs(signedBlobs);
//     }

//     public feedUnlMessageForMultisign(sender: any, msg: string) {
//         const msgJson = JSON.parse(msg);    // JSon similar to object in line 37 above
//         if (msgJson.type == "SIGNED_BLOB") {
//             this.signedBlobs.push({blob: msgJson.blob, account:  msgJson.account});

//             const currSignerWeight = this.signedBlobs.reduce((total: number, sb: any) => {
//                 return total + this.signerListInfo.signerList?.find((ob: any) => ob.account === sb.account).weight;
//             }, 0);
            
            
//             // If signer Quorum is satisfied, submit the transaction
//             if (currSignerWeight == this.signerListInfo.signerQuorum) {
//                 this.transactionEmitter.emit("MULTISIGNED_TRANSACTIONS", sender, this.signedBlobs);
//             }
//         }
//         else if (msgJson.type == "NODE_ADDRESS") {
//             this.signerAddressList.push(msgJson.address);

//             // Wait till the addresses of the all nodes are collected
//             if (this.signerAddressList.length == this.hpContext.users.count) {
//                 this.nodeResolve();
//             }
//         }
//         else if (msgJson.type == "SEQUENCE") {
//             this.sequenceNumberList.push(msgJson.sequence);
//             if (this.sequenceNumberList.length == this.hpContext.users.count) {
//                 this.seqResolve();
//             }
//         }
//     }

// }

// module.exports = {
//     Context
// }