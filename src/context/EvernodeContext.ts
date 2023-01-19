import Context from './ContractContext';
import { SignedBlob, Signer } from '../models';
import { MultiSignedBlobCollector, MultiSigner } from '../multi-sign';
import { AllVoteElector } from '../vote/vote-electors';
import * as evernode from 'evernode-js-client';

class EvernodeContext extends Context {
    private xrplApi: any;

    public constructor(hpContext: any, options: any = {}) {
        super(hpContext, options);
        this.xrplApi = new evernode.XrplApi('wss://hooks-testnet-v2.xrpl-labs.com');
    }

    public async getSequenceNumber(address: string, timeout: number = 5000): Promise<number> {
        const xrplAcc = new evernode.XrplAccount(address, null, { xrplApi: this.xrplApi });
        await this.xrplApi.connect();
        try {
            // Decide a sequence number to send the same transaction from all the nodes.
            const sequence = await xrplAcc.getSequence();
            const sequences: number[] = (await this.vote(`transactionInfo${this.hpContext.timestamp}`, [sequence], new AllVoteElector(this.hpContext.unl.list().length, timeout))).map(ob => ob.data);
            return sequences.sort()[0];
        }
        finally {
            await this.xrplApi.disconnect();
        }
    }

    /**
     * Set the provided signer list to the master account and disable the master key if necessary. If provided signer lsi is empty, it generates xrpl accounts for each node and set all those accounts as the signer list of the master key.
     * @param quorum Signer quorum
     * @param secret Secret of the master account
     * @param signerList (optional) Signer list for the master account
     * @param timeout  (optional)
     */
    public async prepareMultiSigner(quorum: number, secret: string, signerList: Signer[] = [], timeout: number = 1000): Promise<void> {
        const multiSigner = new MultiSigner(this.xrplApi, null, secret);
        await this.xrplApi.connect();

        try {
            // Generate and collect signer list if signer list isn't provided.
            if (!signerList || !signerList.length) {
                const signer = multiSigner.generateSigner();
                signerList = (await this.vote(`multiSigner${this.hpContext.timestamp}`, [<Signer>{
                    address: signer.address,
                    weight: 1
                }], new AllVoteElector(this.hpContext.unl.list().length, timeout))).map(ob => ob.data);
            }

            // Configure multisig for the account.
            await multiSigner.setSignerList(quorum, signerList, (await this.getSequenceNumber(multiSigner.masterAcc.address)));

            multiSigner.persistSigner();
        }
        finally {
            await this.xrplApi.disconnect();
        }
    }

    /**
     * Submit a transaction with multi signs.
     * @param address Address of the master account
     * @param transaction Transaction object
     * @param timeout (optional) Defaults to 2000 in ms
     */
    public async submitTransaction(address: string, transaction: any, timeout: number = 4000): Promise<void> {
        const multiSigner = new MultiSigner(this.xrplApi, address, null);
        await this.xrplApi.connect();

        try {
            const signerListInfo = await multiSigner.getSignerList();

            transaction.Sequence = await this.getSequenceNumber(multiSigner.masterAcc.address);

            // Sign the transaction and collect the signed blob list.
            const signed = multiSigner.sign(transaction);
            const signedBlobs: SignedBlob[] = (await this.vote(`sign${this.hpContext.timestamp}`, [<SignedBlob>{ blob: signed, account: multiSigner.signerAcc.address }],
                new MultiSignedBlobCollector(this.hpContext.users.length, signerListInfo, timeout)))
                .map(ob => ob.data);
            // Submit the signed blobs.
            await multiSigner.submitSignedBlobs(signedBlobs.map(sb => sb.blob));
        }
        finally {
            await this.xrplApi.disconnect();
        }
    }

    public async renewSignerList(address: string, timeout: number = 2000) {
        const multiSigner = new MultiSigner(address);
        await this.xrplApi.connect();

        try {
            const curSigner = multiSigner.getSigner();
            const curSignerList = await multiSigner.getSignerList();
            const curSignerWeight = curSignerList?.signerList.find(s => s.address === curSigner?.address)?.weight;

            if (curSigner && curSignerWeight) {
                let newSigner = multiSigner.generateSigner();
                const newSignerList: Signer[] = (await this.vote(`multiSigner${this.hpContext.timestamp}`, [<Signer>{
                    address: newSigner.address,
                    weight: curSigner.weight
                }], new AllVoteElector(this.hpContext.unl.list().length, timeout))).map(ob => ob.data);

                const signerListTx =
                {
                    Flags: 0,
                    TransactionType: "SignerListSet",
                    Account: address,
                    SignerQuorum: curSignerList.signerQuorum,
                    Sequence: await this.getSequenceNumber(multiSigner.masterAcc.address),
                    SignerEntries: [
                        ...newSignerList.map(signer => ({
                            SignerEntry: {
                                Account: signer.address,
                                SignerWeight: signer.weight
                            }
                        })).sort((a, b) => a.SignerEntry.Account < b.SignerEntry.Account ? -1 : 1)
                    ]
                };

                // Sign the transaction and collect the signed blob list.
                const signed = multiSigner.sign(signerListTx);
                const signedBlobs: SignedBlob[] = (await this.vote(`sign${this.hpContext.timestamp}`, [<SignedBlob>{ blob: signed, account: multiSigner.signerAcc.address }],
                    new MultiSignedBlobCollector(this.hpContext.npl.count, curSignerList, timeout)))
                    .map(ob => ob.data);

                // Submit the signed blobs.
                await multiSigner.submitSignedBlobs(signedBlobs.map(sb => sb.blob));

                multiSigner.persistSigner();
            }
            else {
                throw `No signers for ${address}`;
            }
        }
        finally {
            await this.xrplApi.disconnect();
        }
    }
}

export default EvernodeContext;