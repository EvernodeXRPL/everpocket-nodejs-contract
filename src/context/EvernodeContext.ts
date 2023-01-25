import Context from './ContractContext';
import { Signature, Signer, TransactionSubmissionInfo } from '../models';
import { MultiSignedBlobCollector, MultiSigner } from '../multi-sign';
import { AllVoteElector } from '../vote/vote-electors';
import * as xrplCodec from 'xrpl-binary-codec';

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

    public async getTransactionSubmissionInfo(timeout: number = 4000): Promise<TransactionSubmissionInfo> {
        if (!this.multiSigner)
            throw 'No multi signer for the context';

        // Decide a sequence number and max ledger sequence to send the same transaction from all the nodes.
        const infos: TransactionSubmissionInfo[] = (await this.vote(`transactionInfo${this.getUniqueNumber()}`, [<TransactionSubmissionInfo>{
            sequence: await this.multiSigner.getSequence(),
            maxLedgerSequence: this.multiSigner.getMaxLedgerSequence()
        }], new AllVoteElector(this.hpContext.unl.list().length, timeout))).map(ob => ob.data);

        return <TransactionSubmissionInfo>{
            sequence: infos.map(i => i.sequence).sort()[0],
            maxLedgerSequence: infos.map(i => i.maxLedgerSequence).sort((a, b) => b - a)[0]
        };
    }

    /**
     * Multi sign and submit a given transaction.
     * @param transaction Transaction to submit.
     * @param timeout Optional timeout for votes to resolve.
     */
    public async multiSignAndSubmitTransaction(transaction: any, timeout: number = 4000): Promise<void> {
        if (!this.multiSigner)
            throw 'No multi signer for the context';

        const txSubmitInfo = await this.getTransactionSubmissionInfo(timeout);
        if (!txSubmitInfo)
            throw 'Could not get transaction submission info';

        transaction.Sequence = txSubmitInfo.sequence;
        transaction.LastLedgerSequence = txSubmitInfo.maxLedgerSequence;

        /////// TODO: This should be handled in js lib. //////
        transaction.Fee = `${10 * (this.hpContext.unl.list().length + 2)}`;

        const signerListInfo = await this.multiSigner.getSignerList();

        // Sign the transaction and collect the signed blob list.
        const signed = await this.multiSigner.sign(transaction);
        const decodedTx = JSON.parse(JSON.stringify(xrplCodec.decode(signed)));
        const signature: Signature = decodedTx.Signers[0];

        const signatures: Signature[] = (await this.vote(`sign${this.hpContext.timestamp}`, [signature],
            new MultiSignedBlobCollector(this.hpContext.users.length, signerListInfo, timeout)))
            .map(ob => ob.data);

        transaction.Signers = [...signatures];
        transaction.SigningPubKey = "";

        // Submit the multi-signed transaction.
        const res = await this.multiSigner.submitMultisignedTx(transaction).catch(console.error);
        if (res.result.engine_result === "tesSUCCESS")
            console.log("Transaction submitted successfully");
        else if (res.result.engine_result === "tefPAST_SEQ" || res.result.engine_result === "tefALREADY")
            console.log("Proceeding with pre-submitted transaction");
        else
            throw `Transaction failed with error ${res.result.engine_result}`;
    }

    public async renewSignerList(timeout: number = 4000) {
        if (!this.multiSigner)
            throw 'No multi signer for the context';

        const curSigner = this.multiSigner.getSigner();
        const curSignerList = await this.multiSigner.getSignerList();
        const curSignerWeight = curSignerList?.signerList.find(s => s.account === curSigner?.account)?.weight;

        if (curSigner && curSignerWeight) {
            const newSigner = this.multiSigner.generateSigner();
            const newSignerList: Signer[] = (await this.vote(`signerList${this.getUniqueNumber()}`, [<Signer>{
                account: newSigner.account,
                weight: curSignerWeight
            }], new AllVoteElector(this.hpContext.unl.list().length, timeout))).map(ob => ob.data);

            const signerListTx =
            {
                Flags: 0,
                TransactionType: "SignerListSet",
                Account: this.multiSigner.masterAcc.address,
                SignerQuorum: curSignerList.signerQuorum,
                SignerEntries: [
                    ...newSignerList.map(signer => ({
                        SignerEntry: {
                            Account: signer.account,
                            SignerWeight: signer.weight
                        }
                    })).sort((a, b) => a.SignerEntry.Account < b.SignerEntry.Account ? -1 : 1)
                ]
            };

            await this.multiSignAndSubmitTransaction(signerListTx, timeout);

            // Set the new signer after signer list is successfully set.
            this.multiSigner.setSigner(newSigner);
        }
        else {
            throw `No signers for ${this.multiSigner.masterAcc.address}`;
        }
    }
}

export default EvernodeContext;