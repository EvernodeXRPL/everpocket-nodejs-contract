import { XrplOptions, Signature, Signer, TransactionSubmissionInfo, SignerListInfo, MultiSignOptions, SignerPrivate, Memo, URIToken, HookParameter, Transaction } from '../models';
import { MultiSignedBlobElector, MultiSigner } from '../multi-sign';
import { AllVoteElector } from '../vote/vote-electors';
import * as xrplCodec from 'xrpl-binary-codec';
import * as evernode from 'evernode-js-client';
import VoteContext from './VoteContext';
import { VoteElectorOptions } from '../models/vote';

const TIMEOUT = 4000;

class XrplContext {
    public hpContext: any;
    public xrplApi: any;
    public xrplAcc: any;
    public multiSigner: MultiSigner;
    public voteContext: VoteContext;

    public constructor(hpContext: any, address: string, secret: string | null = null, options: XrplOptions = {}) {
        this.hpContext = hpContext;
        this.xrplApi = options.xrplApi || new evernode.XrplApi();
        this.voteContext = options.voteContext || new VoteContext(this.hpContext, options.voteOptions)
        this.xrplAcc = new evernode.XrplAccount(address, secret, { xrplApi: this.xrplApi });
        this.multiSigner = new MultiSigner(this.xrplAcc);
    }

    /**
     * Initialize the xrpl context.
     */
    public async init(): Promise<void> {
        await this.xrplApi.connect();
    }

    /**
     * Deinitialize the xrpl context.
     */
    public async deinit(): Promise<void> {
        await this.xrplApi.disconnect();
    }

    /**
     * Get current sequence value of the master account.
     * @returns Current sequence number.
     */
    public async getSequence(): Promise<number> {
        return await this.xrplAcc.getSequence()
    }

    /**
     * Get a maximum ledger number to validate a transaction.
     * @returns The maximum ledger number.
     */
    public getMaxLedgerSequence(): number {
        return Math.ceil((this.xrplApi.ledgerIndex + 30) / 10) * 10; // Get nearest 10th
    }

    /**
     * Decide a transaction submission info for a transaction.
     * @param [options={}] Vote options to decide the transaction submission info.
     * @returns Transaction submission info.
     */
    public async getTransactionSubmissionInfo(options: VoteElectorOptions = {}): Promise<TransactionSubmissionInfo> {
        // Decide a sequence number and max ledger sequence to send the same transaction from all the nodes.
        const infos: TransactionSubmissionInfo[] = (await this.voteContext.vote(`transactionInfo${this.voteContext.getUniqueNumber()}`, [<TransactionSubmissionInfo>{
            sequence: await this.getSequence(),
            maxLedgerSequence: this.getMaxLedgerSequence()
        }], new AllVoteElector(this.hpContext.unl.list().length, options?.timeout || TIMEOUT))).map(ob => ob.data);

        return <TransactionSubmissionInfo>{
            sequence: infos.map(i => i.sequence).sort()[0],
            maxLedgerSequence: infos.map(i => i.maxLedgerSequence).sort((a, b) => b - a)[0]
        };
    }

    /**
     * Submit a multisigned transaction.
     * @param tx Multi-signed transaction
     * @returns The transaction response.
     */
    async submitMultisignedTx(tx: any) {
        const res = await this.xrplApi.submitMultisigned(tx);
        return res;
    }

    /**
     * Multi sign and submit a given transaction.
     * @param transaction Transaction to submit.
    * @param [options={}] Multisigner options.
     */
    public async multiSignAndSubmitTransaction(transaction: any, options: MultiSignOptions = {}): Promise<any> {
        const txSubmitInfo = await this.getTransactionSubmissionInfo(options?.voteElectorOptions);
        if (!txSubmitInfo)
            throw 'Could not get transaction submission info';

        transaction = { ...transaction, ...options.txOptions };
        transaction.Sequence = txSubmitInfo.sequence;
        transaction.LastLedgerSequence = txSubmitInfo.maxLedgerSequence;

        const signerListInfo = await this.getSignerList();
        const signerCount = signerListInfo?.signerList.length;

        if (!signerListInfo || !signerCount)
            throw 'Could not get signer list';

        transaction.Fee = `${Number(transaction.Fee) * (signerCount + 2)}`;

        const elector = new MultiSignedBlobElector(signerCount, signerListInfo, options?.voteElectorOptions?.timeout || TIMEOUT);
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

        // Submit the multi-signed transaction.
        return await this.xrplAcc.submitMultisigned(transaction);
    }

    /**
     * Generate new signer list.
     * @param [options={}] Multisigner options.
     * @returns The new signer list.
     */
    public async generateNewSignerList(options: MultiSignOptions = {}): Promise<[SignerListInfo, SignerPrivate]> {
        const curSignerList = await this.getSignerList();
        const quorum = options.quorum || curSignerList?.signerQuorum;
        const signerCount = options.signerCount || curSignerList?.signerList.length;

        if (!signerCount)
            throw 'Signer count cannot be empty.';

        const elector = new AllVoteElector(signerCount, options?.voteElectorOptions?.timeout || TIMEOUT);
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



    /**
     * Renew the current signer list.
     * @param [options={}] Multisigner options to override.
     */
    public async renewSignerList(options: MultiSignOptions = {}): Promise<void> {
        const [signerListInfo, newSigner] = await this.generateNewSignerList(options);
        const preparedTxn = await this.xrplAcc.prepareSetSignerList(signerListInfo.signerList, { ...options, signerQuorum: signerListInfo.signerQuorum });

        await this.multiSignAndSubmitTransaction(preparedTxn, options);

        // Set the signer if this is a signer node.
        if (newSigner)
            this.multiSigner.setSigner(newSigner);
    }

    /**
     * Add new signer node to the signer list.
     * @param pubkey Public key of the node to add.
     * @param weight Signer weight for the new signer.
     * @param [options={}] Multisigner options to override.
     */
    async addXrplSigner(pubkey: string, weight: number, options: MultiSignOptions = {}): Promise<void> {
        const elector = new AllVoteElector(1, options?.voteElectorOptions?.timeout || TIMEOUT);
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
        let signerListInfo = await this.getSignerList() || <SignerListInfo>{};
        signerListInfo.signerList.push(signer);
        if (options.quorum)
            signerListInfo.signerQuorum = options.quorum;

        const preparedTxn = await this.xrplAcc.prepareSetSignerList(signerListInfo.signerList, { ...options, signerQuorum: signerListInfo.signerQuorum });
        await this.multiSignAndSubmitTransaction(preparedTxn, options);

        if (newSigner)
            this.multiSigner.setSigner(newSigner);
    }

    /**
     * Remove a signer node from the signer list.
     * @param pubkey Public key of the signer node to remove.
     * @param [options={}] Multisigner options to override.
     */
    async removeXrplSigner(pubkey: string, options: MultiSignOptions = {}): Promise<void> {
        const elector = new AllVoteElector(1, options?.voteElectorOptions?.timeout || TIMEOUT);
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
        let signerListInfo = await this.getSignerList();

        if (signerListInfo && signer) {
            signerListInfo.signerList = signerListInfo.signerList.filter(s => s.account != signer.account);
            if (options.quorum)
                signerListInfo.signerQuorum = options.quorum;

            const preparedTxn = await this.xrplAcc.prepareSetSignerList(signerListInfo.signerList, { ...options, signerQuorum: signerListInfo.signerQuorum });
            await this.multiSignAndSubmitTransaction(preparedTxn, options);
        }

        if (curSigner)
            this.multiSigner.removeSigner();
    }

    async replaceSignerList(oldPubKey: string, newPubKey: string, options: MultiSignOptions = {}): Promise<void> {
        const elector = new AllVoteElector(1, options?.voteElectorOptions?.timeout || TIMEOUT);

        const removeElection = `removeSigner${this.voteContext.getUniqueNumber()}`;
        let oldSigner: Signer;
        let oldSignerKey: SignerPrivate | null = null;
        // If this is a the owner, get the signer and send it.
        // Otherwise just collect the signer.
        if (oldPubKey === this.hpContext.publicKey) {
            oldSignerKey = this.multiSigner.getSigner();
            oldSigner = (await this.voteContext.vote(removeElection, [<Signer>{
                account: oldSignerKey?.account
            }], elector)).map(ob => ob.data)[0];
        }
        else {
            oldSigner = (await this.voteContext.subscribe(removeElection, elector)).map(ob => ob.data)[0];
        }

        const addElection = `addSigner${this.voteContext.getUniqueNumber()}`;
        let newSigner: Signer;
        let newSignerKey: SignerPrivate | null = null;
        // If this is a the owner, generate a new signer and send it.
        // Otherwise just collect the signer.
        if (newPubKey === this.hpContext.publicKey) {
            newSignerKey = this.multiSigner.generateSigner();
            newSigner = (await this.voteContext.vote(addElection, [<Signer>{
                account: newSignerKey?.account
            }], elector)).map(ob => ob.data)[0];
        }
        else {
            newSigner = (await this.voteContext.subscribe(addElection, elector)).map(ob => ob.data)[0];
        }

        let signerListInfo = await this.getSignerList();

        if (signerListInfo && newSigner && oldSigner) {
            // Remove signer from the list and renew the signer list.
            newSigner.weight = signerListInfo.signerList.find(s => s.account === oldSigner.account)?.weight!;
            signerListInfo.signerList = signerListInfo.signerList.filter(s => s.account != oldSigner.account);

            // Add signer to the list and renew the signer list.
            signerListInfo.signerList.push(newSigner);

            if (options.quorum) {
                signerListInfo.signerQuorum = options.quorum;
            }

            const preparedTxn = await this.xrplAcc.prepareSetSignerList(signerListInfo.signerList, { ...options, signerQuorum: signerListInfo.signerQuorum });
            await this.multiSignAndSubmitTransaction(preparedTxn, options);
        }
        else {
            throw `Cluster signer params cannot be fetched.`
        }

        // Remove old signer and add new signer.
        if (oldSignerKey)
            this.multiSigner.removeSigner();

        if (newSignerKey)
            this.multiSigner.setSigner(newSignerKey);

    }

    /**
     * Returns the signer list of the account
     * @returns An object in the form of {signerQuorum: <1> , signerList: [{account: "rawweeeere3e3", weight: 1}, {}, ...]} || null 
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

    /**
     * Check wether this node is a signer.
     * @returns true or false if signer or not.
     */
    public isSigner(): boolean {
        return this.multiSigner.isSignerNode();
    }

}

export default XrplContext;