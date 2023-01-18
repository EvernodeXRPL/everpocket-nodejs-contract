import Context from './Context';
import { SignedBlob, Signer } from './models';
import { MultiSignedBlobCollector, MultiSigner } from './multi-sign';
import { AllVoteElector } from './vote-electors';
import * as evernode from 'evernode-js-client';

class EvernodeContext extends Context {
    private xrplApi: any;

    public constructor(hpContext: any, options: any = {}) {
        super(hpContext, options);
        this.xrplApi = new evernode.XrplApi('wss://hooks-testnet-v2.xrpl-labs.com');
    }

    public async getSequenceNumber(address: string, timeout: number = 1000): Promise<number> {
        const xrplAcc = new evernode.XrplAccount(address, { xrplApi: this.xrplApi });

        await this.xrplApi.connect();

        try {
            // Decide a sequence number to send the same transaction from all the nodes.
            const sequence = await xrplAcc.getSequenceNumber();
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
     * @param disableMasterKey (optinal) Whether to disable the master key after setting the signr list. Defaults to false.
     */
    public async prepareMultiSigner(quorum: number, secret: string, signerList: Signer[] = [], timeout: number = 1000, disableMasterKey: boolean = false): Promise<void> {
        const multiSigner = new MultiSigner(null, secret);
        await this.xrplApi.connect();

        try {
            // Generate and collect signer list if signer list isn't provided.
            if (!signerList || !signerList.length) {
                const signerAddress = multiSigner.generateSigner();
                const addressList: string[] = (await this.vote(`multiSigner${this.hpContext.timestamp}`, [signerAddress], new AllVoteElector(this.hpContext.unl.list().length, timeout))).map(ob => ob.data);
                signerList = addressList.map(addr => (<Signer>{account: addr, weight: 1}));
            }

            // Configure multisig for the account.
            await multiSigner.setSignerList(quorum, signerList, await this.getSequenceNumber(multiSigner.masterAcc.address));

            if (disableMasterKey)
                await multiSigner.disableMasterKey(await this.getSequenceNumber(multiSigner.masterAcc.address));
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
    public async submitTransaction(address: string, transaction: any, timeout: number = 2000): Promise<void> {
        const multiSigner = new MultiSigner(address, null);
        await this.xrplApi.connect();

        try {
            const signerListInfo = await multiSigner.getSignerList();

            transaction.Sequence = await this.getSequenceNumber(multiSigner.masterAcc.address);

            // Sign the transaction and collect the signed blob list.
            const signed = multiSigner.sign(transaction);
            const signedBlobs: SignedBlob[] = (await this.vote(`sign${this.hpContext.timestamp}`, [<SignedBlob>{ blob: signed, account: multiSigner.signerAcc.address }],
                new MultiSignedBlobCollector(this.hpContext.npl.count, signerListInfo, timeout)))
                .map(ob => ob.data);

            // Submit the signed blobs.
            await multiSigner.submitSignedBlobs(signedBlobs.map(sb => sb.blob));
        }
        finally {
            await this.xrplApi.disconnect();
        }
    }
}

export default EvernodeContext;