import { XrplOptions, Signer, TransactionSubmissionInfo, SignerListInfo, MultiSignOptions, SignerKey, Signature, TransactionData, TransactionInfo } from '../models';
import { MultiSigner } from '../multi-sign';
import { AllVoteElector } from '../vote/vote-electors';
import * as evernode from 'evernode-js-client';
import * as crypto from 'crypto';
import { VoteElectorOptions } from '../models/vote';
import HotPocketContext from './HotPocketContext';
import VoteContext from './VoteContext';
import { JSONHelpers } from '../utils';
import { error, log } from '../helpers/logger';

const TIMEOUT = 10000;
const TRANSACTION_VOTE_THRESHOLD = 0.5;
const VOTE_PERCENTAGE_THRESHOLD = 60;

class XrplContext {
    private transactionDataFile: string = "transactions.json";
    private transactionData: TransactionData = { pending: [], validated: [] };
    private signerListInfo: SignerListInfo | null = null;
    private updatedData: boolean = false;
    public hpContext: HotPocketContext;
    public xrplApi: any;
    public xrplAcc: any;
    public multiSigner: MultiSigner;
    public voteContext: VoteContext;

    public constructor(hpContext: HotPocketContext, address: string, secret: string | null = null, options: XrplOptions = {}) {
        this.hpContext = hpContext;
        this.voteContext = hpContext.voteContext;
        // autoReconnect: false - Do not handle connection failures in XrplApi to avoid contract hanging.
        this.xrplApi = options.xrplApi || new evernode.XrplApi(null, { autoReconnect: false });
        this.xrplAcc = new evernode.XrplAccount(address, secret, { xrplApi: this.xrplApi });
        this.multiSigner = new MultiSigner(this.xrplAcc);

        const data = JSONHelpers.readFromFile<TransactionData>(this.transactionDataFile);
        if (data)
            this.transactionData = data;
        else
            JSONHelpers.writeToFile(this.transactionDataFile, this.transactionData);
    }

    /**
     * Initialize the xrpl context.
     */
    public async init(): Promise<void> {
        await this.xrplApi.connect();
        await this.loadSignerList();
        this.#checkSignerValidity();
        await this.#checkForValidateTransactions();
    }

    /**
     * Deinitialize the xrpl context.
     */
    public async deinit(): Promise<void> {
        this.#persistTransactionData();
        await this.xrplApi.disconnect();
    }

    /**
     * Persist details of transactions.
     */
    #persistTransactionData(): void {
        if (!this.updatedData)
            return;

        try {
            JSONHelpers.writeToFile(this.transactionDataFile, this.transactionData);
        } catch (error) {
            throw `Error writing file ${this.transactionDataFile}: ${error}`;
        }
    }

    /**
     * Add transaction to the pending list.
     * @param info Transaction info to be add as pending.
     */
    #addPendingTransaction(info: TransactionInfo): void {
        const resultCode = info.resultCode;
        if (resultCode !== "tesSUCCESS" && resultCode !== "tefPAST_SEQ" && resultCode !== "tefALREADY")
            throw resultCode ? `Transaction failed with error ${resultCode}` : 'Transaction failed';

        if (this.transactionData.pending.findIndex(t => t.hash === info.hash) >= 0)
            return;

        this.transactionData.pending.push(info);
        this.updatedData = true;
    }

    /**
     * Remove transaction from the pending list.
     * @param hash Transaction hash to be removed.
     */
    #removePendingTransaction(hash: string): void {
        const index = this.transactionData.pending.findIndex(t => t.hash === hash);
        if (index === -1)
            return;

        this.transactionData.pending.splice(index, 1);
        this.updatedData = true;
    }

    /**
     * Mark a transaction as validated.
     * @param hash Transaction hash to be validated.
     * @param ledgerIndex Ledger index the transaction is validated.
     * @param resultCode Transaction result code.
     */
    #markTransactionAsValidated(hash: string, ledgerIndex: number, resultCode: string): void {
        const index = this.transactionData.pending.findIndex(t => t.hash === hash);

        if (index === -1)
            throw 'Invalid validated transaction.'

        if (this.transactionData.validated.findIndex(t => t.hash === hash) == -1) {
            let pending = this.transactionData.pending[index];
            pending.ledgerIndex = ledgerIndex;
            pending.resultCode = resultCode;
            this.transactionData.validated.push(pending);
        }

        this.transactionData.pending.splice(index, 1);
        this.updatedData = true;
    }

    /**
     * Check whether there're any validated.
     */
    async #checkForValidateTransactions(): Promise<void> {
        for (const item of this.getPendingTransactions()) {
            const txnInfo = await this.xrplApi.getTxnInfo(item.hash, {});
            if (txnInfo && txnInfo.validated) {
                log(`${txnInfo?.TransactionType} | Transaction validated with code ${txnInfo?.meta?.TransactionResult}.`);
                this.#markTransactionAsValidated(txnInfo.hash, txnInfo.ledger_index, txnInfo.meta.TransactionResult);
                return;
            }

            const latestLedger = this.xrplApi.ledgerIndex;

            if (item.lastLedgerSequence < latestLedger) {
                error(`The latest ledger sequence ${latestLedger} is greater than the transaction's LastLedgerSequence (${item.lastLedgerSequence}).\n` +
                    `Preliminary result: ${item}`);
                this.#removePendingTransaction(item.hash);
            }
        }
    }

    /**
     * Check signer validity and remove if not a signer.
     */
    #checkSignerValidity(): void {
        if (this.isSigner()) {
            const signer = this.multiSigner.getSigner();
            if (signer) {
                // Check wether this signer is in the signer list. Otherwise remove the signer.
                if (!this.signerListInfo?.signerList.find(s => s.account === signer.account))
                    this.multiSigner.removeSigner();
            }
        }
    }

    /**
     * Fetches details of submitted non validated transactions.
     * @returns an array of transactions that are not validated.
     */
    public getPendingTransactions(): TransactionInfo[] {
        return this.transactionData.pending;
    }

    /**
     * Fetches details of submitted validated transactions.
     * @returns an array of transactions that are validated.
     */
    public getValidatedTransactions(): TransactionInfo[] {
        return this.transactionData.validated;
    }

    /**
     * Get the transaction of the hash if validated.
     * @param hash Transaction hash.
     * @returns The transaction if validated.
     */
    public getValidatedTransaction(hash: string): TransactionInfo | null {
        return (this.getValidatedTransactions().find(t => t.hash === hash) || null);
    }

    /**
     * Load signer list of the account
     */
    public async loadSignerList(): Promise<void> {
        const accountObjects = await this.xrplAcc.getAccountObjects({ type: "signer_list" });
        if (accountObjects.length > 0) {
            const signerObject = accountObjects.filter((ob: any) => ob.LedgerEntryType === 'SignerList')[0];
            const signerList: Signer[] = signerObject.SignerEntries.map((signer: any) => ({ account: signer.SignerEntry.Account, weight: signer.SignerEntry.SignerWeight }));
            this.signerListInfo = { signerQuorum: signerObject.SignerQuorum, signerList: signerList };
        }
    }

    /**
     * Get current sequence value of the master account.
     * @returns Current sequence number.
     */
    public async getSequence(): Promise<number> {
        return await this.xrplAcc.getSequence();
    }

    /**
     * Get transaction list of the master account starting from a ledger.
     * @param ledgerIndex Starting ledger index.
     * @returns LIst of transactions
     */
    public async getTransactions(ledgerIndex: number): Promise<any[]> {
        return await this.xrplAcc.getAccountTrx(ledgerIndex);
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
        }], new AllVoteElector(this.hpContext.getContractUnl().length, options?.timeout || TIMEOUT))).map(ob => ob.data);

        return <TransactionSubmissionInfo>{
            sequence: infos.map(i => i.sequence).sort((a, b) => b - a)[0],
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
            throw `${transaction.TransactionType} | Could not get transaction submission info`;

        transaction = { ...transaction, ...options.txOptions };
        transaction.Sequence = txSubmitInfo.sequence;
        transaction.LastLedgerSequence = txSubmitInfo.maxLedgerSequence;

        const signerCount = this.signerListInfo?.signerList.length;

        if (!this.signerListInfo || !signerCount)
            throw `${transaction.TransactionType} | Could not get signer list`;

        transaction.Fee = `${Number(transaction.Fee) * (signerCount + 2)}`;

        const elector = new AllVoteElector(signerCount, options?.voteElectorOptions?.timeout || TIMEOUT);
        const electionName = `sign${this.voteContext.getUniqueNumber()}`;
        let signatures: Signature[];

        // If this is a signer, Sign the transaction and collect the signed blob list.
        // Otherwise just collect the signed blob list.
        if (this.isSigner()) {
            const signed = await this.multiSigner.sign(transaction);
            const decodedTx = JSON.parse(JSON.stringify(this.xrplApi.xrplHelper.decode(signed)));
            const signature: Signature = decodedTx.Signers[0];
            const pollResults = (await this.voteContext.vote(electionName, [signature], elector)).map(ob => { return { pubkey: ob.sender.publicKey, data: ob.data } });
            signatures = pollResults.map(ob => ob.data);
        }
        else {
            const pollResults = (await this.voteContext.subscribe(electionName, elector)).map(ob => { return { pubkey: ob.sender.publicKey, data: ob.data } });
            signatures = pollResults.map(ob => ob.data);
        }

        // Filter only the signatures which are in the signer list.
        signatures = signatures.filter(si => this.signerListInfo?.signerList.find(s => s.account === si.Signer.Account));

        // Throw error if there're no enough signatures to fulfil the quorum.
        const totalWeight = signatures.map(s => {
            return (this.signerListInfo?.signerList?.find(i => i.account === s.Signer.Account)?.weight || 0);
        }).reduce((a, b) => a + b, 0);
        if (totalWeight < this.signerListInfo.signerQuorum)
            throw `${transaction.TransactionType} | No enough signatures: Total weight: ${totalWeight}, Quorum: ${this.signerListInfo.signerQuorum}.`;

        transaction.Signers = signatures.map(s => <Signature>{ Signer: s.Signer }).sort((a, b) => a.Signer.SigningPubKey.localeCompare(b.Signer.SigningPubKey));

        const voteHash = crypto.createHash('sha256');
        voteHash.update(JSON.stringify(transaction));
        const voteDigest = voteHash.digest('hex');

        const txVoteHashElector = new AllVoteElector(this.hpContext.getContractUnl().length, options?.voteElectorOptions?.timeout || TIMEOUT);
        const txVoteHashElectionName = `txVoteHash${this.voteContext.getUniqueNumber()}`;
        let txnPollResults = (await this.voteContext.vote(txVoteHashElectionName, [voteDigest], txVoteHashElector)).map(o => { return { pubkey: o.sender.publicKey, data: o.data } })
        let txVoteHashes = txnPollResults.map(ob => ob.data);

        let votes: any = {};

        for (const txVoteHash of txVoteHashes) {
            if (!votes[txVoteHash])
                votes[txVoteHash] = 1;
            else
                votes[txVoteHash]++;
        }

        const sorted = Object.entries<number>(votes).sort((a, b) => b[1] - a[1]);
        const totalVotes = sorted.map(n => n[1]).reduce((acc, curr) => acc + curr, 0);

        const unlNodeCount = this.hpContext.getContractUnl().length;

        // NOTE : Total Vote count should be considerable enough to make submission decision.
        if (sorted.length && (unlNodeCount && (Math.ceil(totalVotes * 100 / unlNodeCount)) < VOTE_PERCENTAGE_THRESHOLD))
            throw `${transaction.TransactionType} | Could not decide a transaction to submit.`;

        const txSubmitElector = new AllVoteElector(unlNodeCount, options?.voteElectorOptions?.timeout || TIMEOUT);
        const txSubmitElectionName = `txSubmit${this.voteContext.getUniqueNumber()}`;
        let txResults;
        let voteResults;
        if (sorted.length && sorted[0][1] > (unlNodeCount * TRANSACTION_VOTE_THRESHOLD) && voteDigest === sorted[0][0]) {
            let error;
            const res = await this.xrplAcc.submitMultisigned(transaction).catch((e: any) => {
                error = e;
            });
            
            // In order to share a light weight content via NPL.
            const customRes = res ? <TransactionInfo>{
                hash: res.result.tx_json.hash,
                lastLedgerSequence: res.result.tx_json.LastLedgerSequence,
                resultCode: res.result.engine_result
            } : null;

            voteResults = (await this.voteContext.vote(txSubmitElectionName, [res ? { res: customRes } : { error: error }], txSubmitElector)).map(o => { return { pubkey: o.sender.publicKey, data: o.data } });
            txResults = voteResults.map(ob => ob.data);
        }
        else {
            voteResults = (await this.voteContext.subscribe(txSubmitElectionName, txSubmitElector)).map(o => { return { pubkey: o.sender.publicKey, data: o.data } });
            txResults = voteResults.map(ob => ob.data);
        }

        if (!txResults || !txResults.length)
            throw `${transaction.TransactionType} | Could not consider as a valid transaction.`;

        // Check whether majority aligned submission or not.
        const successfulSubmissions = txResults.filter(r => (r.res?.resultCode === "tesSUCCESS" || r.res?.resultCode === "tefPAST_SEQ" || r.res?.resultCode === "tefALREADY"));
        if (successfulSubmissions.length === 0)
            throw `${transaction.TransactionType} | Could not consider as a valid submission.`;

        const sortedResults = txResults.sort((a, b) => {
            if ("res" in a && !("res" in b)) {
                return -1;
            } else if (!("res" in a) && "res" in b) {
                return 1;
            } else {
                return 0;
            }
        });

        const txResult = sortedResults.find(r => r.res?.resultCode === "tesSUCCESS") || sortedResults[0];

        // NOTE : Commented as it will not hit with above throwing condition.
        // if (txResult.error)
        //     throw txResult.error;

        log(`${transaction.TransactionType} | Transaction submitted with code ${txResult.res.resultCode}.`);

        this.#addPendingTransaction(txResult.res);

        return txResult.res;
    }

    /**
     * Generate new signer list.
     * @param [options={}] Multisigner options.
     * @returns The new signer list.
     */
    public async generateNewSignerList(options: MultiSignOptions = {}): Promise<[SignerListInfo, SignerKey]> {
        const quorum = options.quorum || this.signerListInfo?.signerQuorum;
        const signerCount = options.signerCount || this.signerListInfo?.signerList.length;

        if (!signerCount)
            throw 'Signer count cannot be empty.';

        const elector = new AllVoteElector(signerCount, options?.voteElectorOptions?.timeout || TIMEOUT);
        const electionName = `signerList${this.voteContext.getUniqueNumber()}`;

        let newSigner: SignerKey | null = null;
        let signerList: Signer[];

        // If this is a signer, Generate new signer and send it.
        // Otherwise just collect the signer list.
        if (this.isSigner()) {
            const curSigner = this.multiSigner.getSigner();
            const weight = options.weight || this.signerListInfo?.signerList.find(s => s.account === curSigner?.account)?.weight;

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

        return <[SignerListInfo, SignerKey]>[{
            signerQuorum: quorum,
            signerList: signerList,
        }, newSigner]
    }

    /**
     * Set a provided signer list to the master account.
     * @param signerListInfo Signer list info.
     * @param [options={}] Multisigner options to set.
     */
    public async setSignerList(signerListInfo: SignerListInfo, options: MultiSignOptions = {}): Promise<void> {
        const preparedTxn = await this.xrplAcc.prepareSetSignerList(signerListInfo.signerList, { ...options, signerQuorum: signerListInfo.signerQuorum });

        await this.multiSignAndSubmitTransaction(preparedTxn, options);

        // Reload the signer list after resetting.
        await this.loadSignerList();
    }

    /**
     * Renew the current signer list.
     * @param [options={}] Multisigner options to override.
     */
    public async renewSignerList(options: MultiSignOptions = {}): Promise<void> {
        const [signerListInfo, newSigner] = await this.generateNewSignerList(options);
        await this.setSignerList(signerListInfo, options);

        // Set the signer if this is a signer node.
        if (newSigner)
            this.multiSigner.setSigner(newSigner);
    }

    /**
     * Add new signer node to the signer list.
     * @param pubkey Public key of the node to add.
     * @param weight Signer weight for the new signer.
     * @param [options={}] Multisigner options to override.
     * @returns New signer address.
     */
    async addXrplSigner(pubkey: string, weight: number, options: MultiSignOptions = {}): Promise<string> {
        const elector = new AllVoteElector(1, options?.voteElectorOptions?.timeout || TIMEOUT);
        const electionName = `addSigner${this.voteContext.getUniqueNumber()}`;

        let signer: Signer;
        let newSigner: SignerKey | null = null;
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

        // Add signer to the list and renew the signer list. Clone objet to avoid reference.
        let signerListInfo = <SignerListInfo>{};
        if (this.signerListInfo)
            Object.assign(signerListInfo, this.signerListInfo);

        signerListInfo.signerList.push(signer);
        if (options.quorum)
            signerListInfo.signerQuorum = options.quorum;

        await this.setSignerList(signerListInfo, options);

        if (newSigner)
            this.multiSigner.setSigner(newSigner);

        return signer.account;
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
        let curSigner: SignerKey | null = null;
        // If this is a the owner, Generate new signer and send it.
        // Otherwise just collect the signer.
        if (pubkey === this.hpContext.publicKey) {
            curSigner = this.multiSigner.getSigner();
            signer = (await this.voteContext.vote(electionName, [<Signer>{
                account: curSigner?.account
            }], elector)).map(ob => ob.data)[0];
        }
        else {
            signer = (await this.voteContext.subscribe(electionName, elector)).map(ob => ob.data)[0];
        }

        // Remove signer from the list and renew the signer list. Clone objet to avoid reference.
        let signerListInfo = <SignerListInfo>{};
        if (this.signerListInfo)
            Object.assign(signerListInfo, this.signerListInfo);

        if (signerListInfo && signer) {
            signerListInfo.signerList = signerListInfo.signerList.filter(s => s.account != signer.account);
            if (options.quorum)
                signerListInfo.signerQuorum = options.quorum;

            await this.setSignerList(signerListInfo, options);
        }

        if (curSigner)
            this.multiSigner.removeSigner();
    }

    /**
     * Replaces a signer node from a new node.
     * @param oldPubKey Old pubkey to remove.
     * @param oldSignerAddress Signer address of old node.
     * @param newPubKey New pubkey to add a signer.
     * @param [options={}] Multisigner options to override.
     * @returns New signer address.
     */
    async replaceSignerList(oldPubKey: string, oldSignerAddress: string, newPubKey: string, options: MultiSignOptions = {}): Promise<string> {
        const elector = new AllVoteElector(1, options?.voteElectorOptions?.timeout || TIMEOUT);
        const electionName = `replaceSigner${this.voteContext.getUniqueNumber()}`;

        // Replace signer from the list and renew the signer list. Clone objet to avoid reference.
        let signerListInfo = <SignerListInfo>{};
        if (this.signerListInfo)
            Object.assign(signerListInfo, this.signerListInfo);

        if (!signerListInfo?.signerList)
            throw `Current signer list does not exist.`

        // Remove signer from the list and renew the signer list.
        const oldSignerIndex = signerListInfo.signerList.findIndex(s => s.account === oldSignerAddress);
        if (oldSignerIndex === -1)
            throw `Could not find a old signer with given address.`

        let signer: Signer;
        let newSigner: SignerKey | null = null;
        // If this is a the owner, Generate new signer and send it.
        // Otherwise just collect the signer.
        if (newPubKey === this.hpContext.publicKey) {
            newSigner = this.multiSigner.generateSigner();
            const createdSigners = (await this.voteContext.vote(electionName, [<Signer>{
                account: newSigner.account,
                weight: signerListInfo.signerList[oldSignerIndex].weight
            }], elector)).map(o => { return { pubkey: o.sender.publicKey, data: o.data } });

            signer = (createdSigners).map(ob => ob.data)[0];
        }
        else {
            const subscriptions = (await this.voteContext.subscribe(electionName, elector)).map(o => { return { pubkey: o.sender.publicKey, data: o.data } });
            signer = (subscriptions).map(ob => ob.data)[0];
        }

        if (!signer)
            throw `Could not generate a new signer.`

        // Replace old signer with new signer.
        signerListInfo.signerList[oldSignerIndex].account = signer.account;
        if (options.quorum)
            signerListInfo.signerQuorum = options.quorum;

        await this.setSignerList(signerListInfo, options);

        if (newSigner)
            this.multiSigner.setSigner(newSigner);

        // Remove old signer and add new signer.
        if (oldPubKey === this.hpContext.publicKey)
            this.multiSigner.removeSigner();

        return signer.account;
    }

    /**
     * Returns the signer list of the account
     * @returns An object in the form of {signerQuorum: <1> , signerList: [{account: "rawweeeere3e3", weight: 1}, {}, ...]} || null 
     */
    public getSignerList(): SignerListInfo | null {
        return this.signerListInfo;
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