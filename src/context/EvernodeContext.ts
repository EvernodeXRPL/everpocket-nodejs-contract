import Context from './ContractContext';
import { SignedBlob, Signer, TransactionSubmissionInfo } from '../models';
import { MultiSignedBlobCollector, MultiSigner } from '../multi-sign';
import { AllVoteElector } from '../vote/vote-electors';

class EvernodeContext extends Context {
    private multiSigner: MultiSigner | null = null;

    public constructor(hpContext: any, options: any = {}) {
        super(hpContext, options);
    }

    public async setMultiSigner(address: string): Promise<void> {
        this.multiSigner = new MultiSigner(address);
        await this.multiSigner.init();
    }

    public async removeMultiSigner(): Promise<void> {
        await this.multiSigner?.deinit();
        this.multiSigner = null;
    }

    public async getTransactionSubmissionInfo(timeout: number = 5000): Promise<TransactionSubmissionInfo> {
        if (!this.multiSigner)
            throw 'No multi signer for the context';

        // Decide a sequence number and max ledger sequence to send the same transaction from all the nodes.
        const infos: TransactionSubmissionInfo[] = (await this.vote(`transactionInfo${this.hpContext.timestamp}`, [<TransactionSubmissionInfo>{
            sequence: await this.multiSigner.getSequence(),
            maxLedgerSequence: this.multiSigner.getMaxLedgerSequence()
        }], new AllVoteElector(this.hpContext.unl.list().length, timeout))).map(ob => ob.data);
        console.log(`Collected ${infos.length} submission info`);
        return infos.sort((a, b) => a.sequence - b.sequence)[0];
    }

    /**
     * Set the provided signer list to the master account and disable the master key if necessary. If provided signer lsi is empty, it generates xrpl accounts for each node and set all those accounts as the signer list of the master key.
     * @param quorum Signer quorum
     * @param secret Secret of the master account
     * @param signerList (optional) Signer list for the master account
     * @param timeout  (optional)
     */
    public async prepareMultiSigner(quorum: number, secret: string, signerList: Signer[] = [], timeout: number = 4000): Promise<void> {
        if (!this.multiSigner)
            throw 'No multi signer for the context';

        // Generate and collect signer list if signer list isn't provided.
        if (!signerList || !signerList.length) {
            const signer = this.multiSigner.generateSigner();
            signerList = (await this.vote(`multiSigner${this.hpContext.timestamp}`, [<Signer>{
                account: signer.account,
                weight: 1
            }], new AllVoteElector(this.hpContext.unl.list().length, timeout))).map(ob => ob.data);
        }

        // Configure multisig for the account.
        const txSubmitInfo = await this.getTransactionSubmissionInfo();
        console.log(txSubmitInfo);
        const multiSigner = new MultiSigner(null, secret);
        await multiSigner.init();
        await multiSigner.setSignerList(quorum, signerList.sort((a, b) => a.account < b.account ? -1 : 1), txSubmitInfo.sequence, txSubmitInfo.maxLedgerSequence);
        await multiSigner.deinit();

        this.multiSigner.persistSigner();
    }

    /**
     * Submit a transaction with multi signs.
     * @param address Address of the master account
     * @param transaction Transaction object
     * @param timeout (optional) Defaults to 2000 in ms
     */
    public async submitTransaction(transaction: any, timeout: number = 10000): Promise<void> {
        if (!this.multiSigner)
            throw 'No multi signer for the context';

        const signerListInfo = await this.multiSigner.getSignerList();

        const txSubmitInfo = await this.getTransactionSubmissionInfo();
        transaction.Sequence = txSubmitInfo.sequence;
        transaction.LastLedgerSequence = txSubmitInfo.maxLedgerSequence;

        // This should be handled in js lib.
        transaction.Fee = '1000';

        // Sign the transaction and collect the signed blob list.
        const signed = await this.multiSigner.sign(transaction);
        const signedBlobs: SignedBlob[] = (await this.vote(`sign${this.hpContext.timestamp}`, [<SignedBlob>{ blob: signed, account: this.multiSigner.signerAcc.address }],
            new MultiSignedBlobCollector(this.hpContext.users.length, signerListInfo, timeout)))
            .map(ob => ob.data);
        console.log(`Collected ${signedBlobs.length} signed blobs`);
        // Submit the signed blobs.
        await this.multiSigner.submitSignedBlobs(signedBlobs.map(sb => sb.blob));
    }

    public async renewSignerList(timeout: number = 2000) {
        if (!this.multiSigner)
            throw 'No multi signer for the context';

        const curSigner = this.multiSigner.getSigner();
        const curSignerList = await this.multiSigner.getSignerList();
        const curSignerWeight = curSignerList?.signerList.find(s => s.account === curSigner?.account)?.weight;

        if (curSigner && curSignerWeight) {
            let newSigner = this.multiSigner.generateSigner();
            const newSignerList: Signer[] = (await this.vote(`multiSigner${this.hpContext.timestamp}`, [<Signer>{
                account: newSigner.account,
                weight: curSigner.weight
            }], new AllVoteElector(this.hpContext.unl.list().length, timeout))).map(ob => ob.data);

            const txSubmitInfo = await this.getTransactionSubmissionInfo();
            const signerListTx =
            {
                Flags: 0,
                TransactionType: "SignerListSet",
                Account: this.multiSigner.masterAcc.address,
                SignerQuorum: curSignerList.signerQuorum,
                Sequence: txSubmitInfo.sequence,
                LastLedgerSequence: txSubmitInfo.maxLedgerSequence,
                SignerEntries: [
                    ...newSignerList.map(signer => ({
                        SignerEntry: {
                            Account: signer.account,
                            SignerWeight: signer.weight
                        }
                    })).sort((a, b) => a.SignerEntry.Account < b.SignerEntry.Account ? -1 : 1)
                ]
            };

            // Sign the transaction and collect the signed blob list.
            const signed = await this.multiSigner.sign(signerListTx);
            const signedBlobs: SignedBlob[] = (await this.vote(`sign${this.hpContext.timestamp}`, [<SignedBlob>{ blob: signed, account: this.multiSigner.signerAcc.address }],
                new MultiSignedBlobCollector(this.hpContext.npl.count, curSignerList, timeout)))
                .map(ob => ob.data);

            // Submit the signed blobs.
            await this.multiSigner.submitSignedBlobs(signedBlobs.map(sb => sb.blob));

            this.multiSigner.persistSigner();
        }
        else {
            throw `No signers for ${this.multiSigner.masterAcc.address}`;
        }
    }
}

export default EvernodeContext;