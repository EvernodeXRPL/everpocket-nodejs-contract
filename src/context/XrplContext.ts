import { XrplContextOptions, Signature, Signer, TransactionSubmissionInfo, SignerListInfo, MultiSignOptions } from '../models';
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

        transaction.Sequence = txSubmitInfo.sequence;
        transaction.LastLedgerSequence = txSubmitInfo.maxLedgerSequence;

        /////// TODO: This should be handled in js lib. //////
        transaction.Fee = `${10 * (this.hpContext.unl.list().length + 2)}`;
        transaction.NetworkID = evernode.Defaults.get().networkID;

        const signerListInfo = await this.multiSigner.getSignerList();

        if (!signerListInfo)
            throw 'Could not get signer list';

        // Sign the transaction and collect the signed blob list.
        const signed = await this.multiSigner.sign(transaction);
        const decodedTx = JSON.parse(JSON.stringify(xrplCodec.decode(signed)));
        const signature: Signature = decodedTx.Signers[0];

        const signatures: Signature[] = (await this.voteContext.vote(`sign${this.hpContext.timestamp}`, [signature],
            new MultiSignedBlobElector(this.hpContext.users.length, signerListInfo, options.voteTimeout || TIMEOUT)))
            .map(ob => ob.data);

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

    public async generateNewSignerList(options: MultiSignOptions = {}): Promise<SignerListInfo> {
        const curSigner = this.multiSigner.getSigner();
        const curSignerList = await this.multiSigner.getSignerList();

        const weight = options.weight || curSignerList?.signerList.find(s => s.account === curSigner?.account)?.weight;
        const quorum = options.quorum || curSignerList?.signerQuorum;

        if (!weight || !quorum)
            throw 'Weight or Signer Quorum cannot be empty.';

        const newSigner = this.multiSigner.generateSigner();

        const signerList = (await this.voteContext.vote(`signerList${this.voteContext.getUniqueNumber()}`, [<Signer>{
            account: newSigner.account,
            weight: weight
        }], new AllVoteElector(this.hpContext.unl.list().length, options.voteTimeout || TIMEOUT))).map(ob => ob.data);
        return <SignerListInfo>{
            signer: newSigner,
            signerQuorum: quorum,
            signerList: signerList,
        }
    }

    public async setSignerList(signerListInfo: SignerListInfo, options: MultiSignOptions = {}): Promise<void> {
        const signerListTx =
        {
            Flags: 0,
            TransactionType: "SignerListSet",
            Account: this.multiSigner.masterAcc.address,
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
        const signerListInfo = await this.generateNewSignerList(options);
        await this.setSignerList(signerListInfo, options);
        this.multiSigner.setSigner(signerListInfo.signer!);
    }
}

export default XrplContext;