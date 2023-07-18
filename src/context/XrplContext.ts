import { XrplOptions, Signer, TransactionSubmissionInfo, SignerListInfo, MultiSignOptions, SignerKey, Signature } from '../models';
import { MultiSignedBlobElector, MultiSigner } from '../multi-sign';
import { AllVoteElector } from '../vote/vote-electors';
import * as xrplCodec from 'xrpl-binary-codec';
import * as evernode from 'evernode-js-client';
import { VoteElectorOptions } from '../models/vote';
import HotPocketContext from './HotPocketContext';
import VoteContext from './VoteContext';

const TIMEOUT = 10000;

class XrplContext {
    private signerListInfo: SignerListInfo | null = null;
    public hpContext: HotPocketContext;
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
        await this.loadSignerList();
    }

    /**
     * Deinitialize the xrpl context.
     */
    public async deinit(): Promise<void> {
        await this.xrplApi.disconnect();
    }

    /**
     * Load signer list of the account
     */
    public async loadSignerList(): Promise<void> {
        const accountObjects = await new Promise<any[]>(async (resolve) => {
            let accountObjects: any[] = [];
            setTimeout(() => {
                resolve(accountObjects);
            }, 5000);
            accountObjects = await this.xrplAcc.getAccountObjects({ type: "signer_list" });
        });
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
        return await new Promise<number>(async (resolve) => {
            let sequence = -1;
            setTimeout(() => {
                resolve(sequence);
            }, 2000);
            sequence = await this.xrplAcc.getSequence();
        });
    }

    /**
     * Get transaction list of the master account starting from a ledger.
     * @param ledgerIndex Starting ledger index.
     * @returns LIst of transactions
     */
    public async getTransactions(ledgerIndex: number): Promise<any[]> {
        return await new Promise<any[]>(async (resolve) => {
            let txList: any[] = [];
            setTimeout(() => {
                resolve(txList);
            }, 5000);
            txList = await this.xrplAcc.getAccountTrx(ledgerIndex);
        });
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
        const electionName = `transactionInfo${this.voteContext.getUniqueNumber()}`;
        const elector = new AllVoteElector(this.hpContext.getContractUnl().length, options?.timeout || TIMEOUT);
        let infos: TransactionSubmissionInfo[];
        const sequence = await this.getSequence();
        if (sequence >= 0) {
            infos = (await this.voteContext.vote(electionName, [<TransactionSubmissionInfo>{
                sequence: sequence,
                maxLedgerSequence: this.getMaxLedgerSequence()
            }], elector)).map(ob => ob.data);
        }
        else {
            infos = (await this.voteContext.subscribe(electionName, elector)).map(ob => ob.data);
        }

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

        const signerCount = this.signerListInfo?.signerList.length;

        if (!this.signerListInfo || !signerCount)
            throw 'Could not get signer list';

        transaction.Fee = `${Number(transaction.Fee) * (signerCount + 2)}`;

        const elector = new MultiSignedBlobElector(signerCount, options?.voteElectorOptions?.timeout || TIMEOUT);
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

        // Throw error if there're no enough signatures to fulfil the quorum.
        const totalWeight = signatures.map(s => {
            return (this.signerListInfo?.signerList?.find(i => i.account === s.Signer.Account)?.weight || 0);
        }).reduce((a, b) => a + b, 0);
        if (totalWeight < this.signerListInfo.signerQuorum)
            throw `No enough signatures: Total weight: ${totalWeight}, Quorum: ${this.signerListInfo.signerQuorum}.`;

        transaction.Signers = signatures.map(s => <Signature>{ Signer: s.Signer }).sort((a, b) => a.Signer.SigningPubKey.localeCompare(b.Signer.SigningPubKey));

        console.log(transaction);
        console.log(transaction.Signers.map((s: any) => s.Signer));

        return await this.xrplAcc.submitMultisigned(transaction);
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
    async replaceSignerList(oldPubKey: string, oldSignerAddress: string, newPubKey: string, options: MultiSignOptions = {}): Promise<string | null> {
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
            signer = (await this.voteContext.vote(electionName, [<Signer>{
                account: newSigner.account,
                weight: signerListInfo.signerList[oldSignerIndex].weight
            }], elector)).map(ob => ob.data)[0];

        }
        else {
            signer = (await this.voteContext.subscribe(electionName, elector)).map(ob => ob.data)[0];
        }

        if (signer) {
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

        return null;
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