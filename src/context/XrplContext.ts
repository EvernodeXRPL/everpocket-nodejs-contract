import { XrplContextOptions, Signature, Signer, TransactionSubmissionInfo, SignerListInfo, MultiSignOptions, SignerPrivate } from '../models';
import { MultiSignedBlobElector, MultiSigner } from '../multi-sign';
import { AllVoteElector } from '../vote/vote-electors';
import * as xrplCodec from 'xrpl-binary-codec';
import * as evernode from 'evernode-js-client';
import VoteContext from './VoteContext';

const TIMEOUT = 4000;

class XrplContext {
    public hpContext: any;
    public xrplApi: any;
    public xrplAcc: any;
    public multiSigner: MultiSigner;
    public voteContext: VoteContext;

    public constructor(hpContext: any, address: string, secret: string | null = null, options: XrplContextOptions = {}) {
        this.hpContext = hpContext;
        this.xrplApi = options.xrplApi || new evernode.XrplApi();
        this.voteContext = options.voteContext || new VoteContext(this.hpContext, options.voteOptions)
        this.xrplAcc = new evernode.XrplAccount(address, secret, { xrplApi: this.xrplApi });
        this.multiSigner = new MultiSigner(this.xrplAcc);
    }

    public async init(): Promise<void> {
        await this.xrplApi.connect();
    }

    public async deinit(): Promise<void> {
        await this.xrplApi.disconnect();
    }

    public async getSequence(): Promise<number> {
        return await this.xrplAcc.getSequence()
    }

    public getMaxLedgerSequence(): number {
        return Math.ceil((this.xrplApi.ledgerIndex + 30) / 10) * 10; // Get nearest 10th
    }

    public async getTransactionSubmissionInfo(timeout: number = TIMEOUT): Promise<TransactionSubmissionInfo> {
        // Decide a sequence number and max ledger sequence to send the same transaction from all the nodes.
        const infos: TransactionSubmissionInfo[] = (await this.voteContext.vote(`transactionInfo${this.voteContext.getUniqueNumber()}`, [<TransactionSubmissionInfo>{
            sequence: await this.getSequence(),
            maxLedgerSequence: this.getMaxLedgerSequence()
        }], new AllVoteElector(this.hpContext.unl.list().length, timeout))).map(ob => ob.data);

        return <TransactionSubmissionInfo>{
            sequence: infos.map(i => i.sequence).sort()[0],
            maxLedgerSequence: infos.map(i => i.maxLedgerSequence).sort((a, b) => b - a)[0]
        };
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

    /**
     * Multi sign and submit a given transaction.
     * @param transaction Transaction to submit.
     * @param timeout Optional timeout for votes to resolve.
     */
    public async multiSignAndSubmitTransaction(transaction: any, options: MultiSignOptions = {}): Promise<void> {
        const txSubmitInfo = await this.getTransactionSubmissionInfo(options.voteTimeout);
        if (!txSubmitInfo)
            throw 'Could not get transaction submission info';

        transaction = { ...transaction, ...options.txOptions };
        transaction.Sequence = txSubmitInfo.sequence;
        transaction.LastLedgerSequence = txSubmitInfo.maxLedgerSequence;

        const signerListInfo = await this.getSignerList();
        const signerCount = signerListInfo?.signerList.length;

        if (!signerListInfo || !signerCount)
            throw 'Could not get signer list';

        /////// TODO: This should be handled in js lib. //////
        transaction.Fee = `${10 * (signerCount + 2)}`;
        transaction.NetworkID = evernode.Defaults.get().networkID;

        const elector = new MultiSignedBlobElector(signerCount, signerListInfo, options.voteTimeout || TIMEOUT);
        const electionName = `sign${this.voteContext.getUniqueNumber()}`;
        let signatures: Signature[];

        // If this is a signer, Sign the transaction and collect the signed blob list.
        // Otherwise just collect the signed blob list.
        if (this.isSigner()) {
            const signed = await this.multiSigner.sign(transaction);
            const decodedTx = JSON.parse(JSON.stringify(xrplCodec.decode(signed)));
            const signature: Signature = decodedTx.Signers[0];
            signatures = (await this.voteContext.vote(electionName, [signature], elector)).map(ob => ob.data);
        }
        else {
            signatures = (await this.voteContext.subscribe(electionName, elector)).map(ob => ob.data);
        }

        transaction.Signers = [...signatures];
        transaction.SigningPubKey = "";

        // Submit the multi-signed transaction.
        const res = await this.submitMultisignedTx(transaction).catch(console.error);
        if (res.result.engine_result === "tesSUCCESS")
            console.log("Transaction submitted successfully");
        else if (res.result.engine_result === "tefPAST_SEQ" || res.result.engine_result === "tefALREADY")
            console.log("Proceeding with pre-submitted transaction");
        else
            throw `Transaction failed with error ${res.result.engine_result}`;
    }

    public async generateNewSignerList(options: MultiSignOptions = {}): Promise<[SignerListInfo, SignerPrivate]> {
        const curSignerList = await this.getSignerList();
        const quorum = options.quorum || curSignerList?.signerQuorum;
        const signerCount = options.signerCount || curSignerList?.signerList.length;

        if (!signerCount)
            throw 'Signer count cannot be empty.';

        const elector = new AllVoteElector(signerCount, options.voteTimeout || TIMEOUT);
        const electionName = `signerList${this.voteContext.getUniqueNumber()}`;

        let newSigner: SignerPrivate | null = null;
        let signerList: Signer[];

        // If this is a signer, Generate new signer and send it.
        // Otherwise just collect the signer list.
        if (this.isSigner()) {
            const curSigner = this.multiSigner.getSigner();
            const weight = options.weight || curSignerList?.signerList.find(s => s.account === curSigner?.account)?.weight;

            if (!weight || !quorum)
                throw 'Weight or Signer Quorum cannot be empty.';

            newSigner = this.multiSigner.generateSigner();
            signerList = (await this.voteContext.vote(electionName, [<Signer>{
                account: newSigner.account,
                weight: weight
            }], elector)).map(ob => ob.data);

        }
        else {
            signerList = (await this.voteContext.subscribe(electionName, elector)).map(ob => ob.data);
        }

        return <[SignerListInfo, SignerPrivate]>[{
            signerQuorum: quorum,
            signerList: signerList,
        }, newSigner]
    }

    public async setSignerList(signerListInfo: SignerListInfo, options: MultiSignOptions = {}): Promise<void> {
        const signerListTx =
        {
            Flags: 0,
            TransactionType: "SignerListSet",
            Account: this.xrplAcc.address,
            SignerQuorum: signerListInfo.signerQuorum,
            SignerEntries: [
                ...signerListInfo.signerList.map(signer => ({
                    SignerEntry: {
                        Account: signer.account,
                        SignerWeight: signer.weight
                    }
                })).sort((a, b) => a.SignerEntry.Account < b.SignerEntry.Account ? -1 : 1)
            ]
        };

        await this.multiSignAndSubmitTransaction(signerListTx, options);
    }

    public async renewSignerList(options: MultiSignOptions = {}): Promise<void> {
        const [signerListInfo, newSigner] = await this.generateNewSignerList(options);
        await this.setSignerList(signerListInfo, options);

        // Set the signer if this is a signer node.
        if (newSigner)
            this.multiSigner.setSigner(newSigner);
    }

    async addXrplSigner(pubkey: string, weight: number, options: MultiSignOptions = {}): Promise<void> {
        const elector = new AllVoteElector(1, options.voteTimeout || TIMEOUT);
        const electionName = `addSigner${this.voteContext.getUniqueNumber()}`;

        let signer: Signer;
        let newSigner: SignerPrivate | null = null;
        // If this is a the owner, Generate new signer and send it.
        // Otherwise just collect the signer.
        if (pubkey === this.hpContext.publicKey) {
            newSigner = this.multiSigner.generateSigner();
            signer = (await this.voteContext.vote(electionName, [<Signer>{
                account: newSigner.account,
                weight: weight
            }], elector)).map(ob => ob.data)[0];

        }
        else {
            signer = (await this.voteContext.subscribe(electionName, elector)).map(ob => ob.data)[0];
        }

        // Add signer to the list and renew the signer list.
        let signerList = await this.getSignerList() || <SignerListInfo>{};
        signerList.signerList.push(signer);
        if (options.quorum)
            signerList.signerQuorum = options.quorum;
        await this.setSignerList(signerList!, options);

        if (newSigner)
            this.multiSigner.setSigner(newSigner);
    }

    async removeXrplSigner(pubkey: string, options: MultiSignOptions = {}): Promise<void> {
        const elector = new AllVoteElector(1, options.voteTimeout || TIMEOUT);
        const electionName = `removeSigner${this.voteContext.getUniqueNumber()}`;

        let signer: Signer;
        let curSigner: SignerPrivate | null = null;
        // If this is a the owner, Generate new signer and send it.
        // Otherwise just collect the signer.
        if (pubkey === this.hpContext.publicKey) {
            curSigner = this.multiSigner.getSigner();
            signer = (await this.voteContext.vote(electionName, [<Signer>{
                account: curSigner?.account,
                weight: curSigner?.weight
            }], elector)).map(ob => ob.data)[0];
        }
        else {
            signer = (await this.voteContext.subscribe(electionName, elector)).map(ob => ob.data)[0];
        }

        // Remove signer from the list and renew the signer list.
        let signerList = await this.getSignerList();

        if (signerList && signer) {
            signerList.signerList = signerList.signerList.filter(s => s.account != signer.account);
            if (options.quorum)
                signerList.signerQuorum = options.quorum;
            await this.setSignerList(signerList!, options);
        }

        if (curSigner)
            this.multiSigner.removeSigner();
    }

    /**
     * Returns the signer list of the account
     * @returns An object in the form of {signerQuorum: <1> , signerList: [{account: "rawweeeere3e3", weight: 1}, {}, ...]} || undefined 
     */
    public async getSignerList(): Promise<SignerListInfo | null> {
        const accountObjects = await this.xrplAcc.getAccountObjects({ type: "signer_list" });
        if (accountObjects.length > 0) {
            const signerObject = accountObjects.filter((ob: any) => ob.LedgerEntryType === 'SignerList')[0];
            const signerList: Signer[] = signerObject.SignerEntries.map((signer: any) => ({ account: signer.SignerEntry.Account, weight: signer.SignerEntry.SignerWeight }));
            const res = { signerQuorum: signerObject.SignerQuorum, signerList: signerList };
            return res;
        }
        else
            return null;
    }

    public isSigner(): boolean {
        return this.multiSigner.isSignerNode();
    }
}

export default XrplContext;