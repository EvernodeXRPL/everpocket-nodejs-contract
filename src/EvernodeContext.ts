import Context from './Context';
import { SignedBlob, Signer } from './models';
import { MultiSignedBlobCollector, MultiSigner } from './multi-sign';
import { AllVoteElector } from './vote-electors';
import * as evernode from 'evernode-js-client';

class EvernodeContext extends Context {
    public async getSequenceNumber(address: string, timeout: number = 1000): Promise<number> {
        const xrplAcc = new evernode.XrplAccount(address);

        // Decide a sequence number to send the same transaction from all the nodes.
        const sequence = await xrplAcc.getSequenceNumber();
        const sequences: number[] = (await this.vote(`transactionInfo${this.hpContext.timestamp}`, [sequence], new AllVoteElector(this.hpContext.unl.list().length, timeout))).map(ob => ob.data);

        return sequences.sort()[0];
    }

    public async prepareMultiSigner(quorum: number, secret: string, signerList: Signer[] = [], timeout: number = 1000, disableMasterKey: boolean = false): Promise<MultiSigner> {
        const multiSigner = new MultiSigner(secret);

        // Generate and collect signer list if signer list isn't provided.
        if (!signerList || !signerList.length) {
            const signer = multiSigner.generateSigner();
            signerList = (await this.vote(`multiSigner${this.hpContext.timestamp}`, [signer], new AllVoteElector(this.hpContext.unl.list().length, timeout))).map(ob => ob.data);
        }

        // Configure multisig for the account.
        await multiSigner.setSignerList(quorum, signerList, await this.getSequenceNumber(multiSigner.masterAcc.address));

        if (disableMasterKey)
            await multiSigner.disableMasterKey(await this.getSequenceNumber(multiSigner.masterAcc.address));

        return multiSigner;
    }

    public async submitTransaction(address: string, transaction: any, timeout: number = 2000) {
        const multiSigner = new MultiSigner(address, null);
        const signerListInfo = await multiSigner.getSignerList();

        transaction.Sequence = await this.getSequenceNumber(multiSigner.masterAcc.address);

        // Sign the transaction and collect the signed blob list.
        const signed = multiSigner.sign(transaction);
        const signedBlobs = (await this.vote(`sign${this.hpContext.timestamp}`, [<SignedBlob>{ blob: signed, account: multiSigner.signerAcc.address }],
            new MultiSignedBlobCollector(this.hpContext.npl.count, signerListInfo, timeout)))
            .map(ob => ob.data);

        // Submit the signed blobs.
        await multiSigner.submitSignedBlobs(signedBlobs);
    }
}

export default EvernodeContext;