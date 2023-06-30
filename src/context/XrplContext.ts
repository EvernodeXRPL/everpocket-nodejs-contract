import { XrplOptions, Signer, TransactionSubmissionInfo, SignerListInfo, MultiSignOptions, SignerPrivate, Memo, URIToken, HookParameter, Transaction, SignatureInfo, Signature } from '../models';
import { MultiSignedBlobElector, MultiSigner } from '../multi-sign';
import { AllVoteElector } from '../vote/vote-electors';
import * as xrplCodec from 'xrpl-binary-codec';
import * as evernode from 'evernode-js-client';
import { VoteElectorOptions } from '../models/vote';
import HotPocketContext from './HotPocketContext';
import VoteContext from './VoteContext';

const TIMEOUT = 4000;

class XrplContext {
    public hpContext: any;
    public xrplApi: any;
    public xrplAcc: any;
    public multiSigner: MultiSigner;
    public voteContext: VoteContext;

    public constructor(hpContext: HotPocketContext, address: string, secret: string | null = null, options: XrplOptions = {}) {
        this.hpContext = hpContext;
        this.voteContext = hpContext.voteContext;
        this.xrplApi = options.xrplApi || new evernode.XrplApi();
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
        }], new AllVoteElector(this.hpContext.getContractUnl().length, options?.timeout || TIMEOUT))).map(ob => ob.data);

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

        /////// TODO: This should be handled in js lib. //////
        transaction.Fee = `${10 * (signerCount + 2)}`;
        transaction.NetworkID = evernode.Defaults.get().networkID;

        const elector = new MultiSignedBlobElector(signerCount, signerListInfo, options?.voteElectorOptions?.timeout || TIMEOUT);
        const electionName = `sign${this.voteContext.getUniqueNumber()}`;
        let signatures: SignatureInfo[];

        // If this is a signer, Sign the transaction and collect the signed blob list.
        // Otherwise just collect the signed blob list.
        if (this.isSigner()) {
            const signed = await this.multiSigner.sign(transaction);
            const decodedTx = JSON.parse(JSON.stringify(xrplCodec.decode(signed)));
            const signature: SignatureInfo = {
                ...decodedTx.Signers[0],
                weight: this.multiSigner.getSigner()?.weight
            };
            signatures = (await this.voteContext.vote(electionName, [signature], elector)).map(ob => ob.data);
        }
        else {
            signatures = (await this.voteContext.subscribe(electionName, elector)).map(ob => ob.data);
        }

        // Throw error if there're no enough signatures to fulfil the quorum.
        const totalWeight = signatures.map(s => s.weight).reduce((a, b) => a + b, 0);
        if (totalWeight < signerListInfo.signerQuorum)
            throw `No enough signatures: Total weight: ${totalWeight}, Quorum: ${signerListInfo.signerQuorum}.`;

        transaction.Signers = signatures.map(s => <Signature>{ Signer: s.Signer });
        transaction.SigningPubKey = "";

        // Submit the multi-signed transaction.
        const res = await this.submitMultisignedTx(transaction).catch(console.error);
        if (res?.result?.engine_result === "tesSUCCESS")
            console.log("Transaction submitted successfully");
        else if (res?.result?.engine_result === "tefPAST_SEQ" || res?.result?.engine_result === "tefALREADY")
            console.log("Proceeding with pre-submitted transaction");
        else
            throw res?.result?.engine_result ? `Transaction failed with error ${res.result.engine_result}` : 'Transaction failed';

        return res.result;
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
            newSigner.weight = weight;
            signerList = (await this.voteContext.vote(electionName, [<Signer>{
                account: newSigner.account,
                weight: newSigner.weight
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
     * Set a provided signer list to the master account.
     * @param signerListInfo Signer list info.
     * @param [options={}] Multisigner options to set.
     */
    public async setSignerList(signerListInfo: SignerListInfo, options: MultiSignOptions = {}): Promise<void> {
        const tx =
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

        await this.multiSignAndSubmitTransaction(tx, options);
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
            newSigner.weight = weight;
            signer = (await this.voteContext.vote(electionName, [<Signer>{
                account: newSigner.account,
                weight: newSigner.weight
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

    /**
     * Make amount object for a transaction.
     * @param amount Amount value to set.
     * @param currency Currency token to set.
     * @param issuer Issuer of the currency.
     * @returns The prepared amount object.
     */
    public makeAmountObject(amount: string, currency: string, issuer: string) {
        if (typeof amount !== 'string')
            throw "Amount must be a string.";
        if (currency !== evernode.XrplConstants.XRP && !issuer)
            throw "Non-XRP currency must have an issuer.";

        const amountObj = (currency == evernode.XrplConstants.XRP) ? amount : {
            currency: currency,
            issuer: issuer,
            value: amount
        }
        return amountObj;
    }

    /**
     * Perform URITokenBuy transaction
     * @param uriToken URIToken object to be bought.
     * @param [memos=[]]  Memos for the transaction (optional).
     * @param [hookParams=[]]  HookParameters for the transaction (optional).
     * @param [options={}]  Options to be added to the multi signed submission (optional).
     * @returns Result of the submitted transaction.
     */

    public async buyURIToken(uriToken: URIToken, memos: Memo[] = [], hookParams: HookParameter[] = [], options: MultiSignOptions = {}): Promise<void> {

        const tx = {
            Account: this.xrplAcc.address,
            TransactionType: "URITokenBuy",
            Amount: uriToken.Amount,
            URITokenID: uriToken.index,
            Memos: undefined,
            HookParameters: undefined
        }

        if (memos)
            tx.Memos = evernode.TransactionHelper.formatMemos(memos);

        if (hookParams)
            tx.HookParameters = evernode.TransactionHelper.formatHookParams(hookParams);

        return await this.multiSignAndSubmitTransaction(tx, options);
    }

    /**
     * Perform a payment
     * @param toAddr receiver address
     * @param amount Amount to be send
     * @param currency currency type
     * @param [issuer=null]  currency issuer
     * @param [memos=null]  Memos for the transaction (optional).
     * @param [hookParams=null]  HookParameters for the transaction (optional).
     * @param [options={}]  Options to be added to the multi signed submission (optional).
     * @returns Result of the submitted transaction.
     */
    public async makePayment(toAddr: any, amount: any, currency: any, issuer: any = null, memos: Memo[] | null = null, hookParams: HookParameter[] | null = null, options: MultiSignOptions = {}) {
        const amountObj = this.makeAmountObject(amount, currency, issuer);
        const tx: Transaction = {
            TransactionType: 'Payment',
            Account: this.xrplAcc.address,
            Amount: amountObj,
            Destination: toAddr,
        }
        if (memos)
            tx.Memos = evernode.TransactionHelper.formatMemos(memos);
        if (hookParams)
            tx.HookParameters = evernode.TransactionHelper.formatHookParams(hookParams);
        return await this.multiSignAndSubmitTransaction(tx, options);
    }
}

export default XrplContext;