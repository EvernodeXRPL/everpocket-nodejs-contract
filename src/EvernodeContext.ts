import Context from './Context';
import { Signer } from './models';
import { MultiSigner } from './multi-sign';
import { AllVoteElector } from './vote-electors';
import * as evernode from 'evernode-js-client';

class EvernodeContext extends Context {
    public async getSequenceNumber(address: string, timeout: number = 1000): Promise<number> {
        const xrplAcc = new evernode.XrplAccount(address);

        // Decide a sequence number to send the same transaction from all the nodes.
        const sequence = await xrplAcc.getSequenceNumber();
        const sequences: number[] = await this.vote(`transactionInfo${this.hpContext.timestamp}`, [sequence], new AllVoteElector(this.hpContext.unl.list().length, timeout));

        return sequences.sort()[0];
    }

    public async prepareMultiSigner(quorum: number, secret: string, signerList: Signer[] = [], timeout: number = 1000, disableMasterKey: boolean = false): Promise<MultiSigner> {
        const multiSigner = new MultiSigner(secret);

        // Generate and collect signer list if signer list isn't provided.
        if (!signerList || !signerList.length) {
            const signer = multiSigner.generateAccount();
            signerList = await this.vote(`multiSigner${this.hpContext.timestamp}`, [signer], new AllVoteElector(this.hpContext.unl.list().length, timeout));
        }

        // Configure multisig for the account.
        await multiSigner.setSignerList(quorum, signerList, await this.getSequenceNumber(multiSigner.nodeAccount.address));

        if (disableMasterKey)
            await multiSigner.disableMasterKey(await this.getSequenceNumber(multiSigner.nodeAccount.address));

        return multiSigner;
    }

    public async submitTransaction(address: string, transaction: any, timeout: number = 1000) {
        const multiSigner = new MultiSigner(address, null);

        transaction.Sequence = await this.getSequenceNumber(multiSigner.nodeAccount.address);

        // Sign the transaction and collect the signed blob list.
        const signed = multiSigner.sign(transaction);
        const signList = await this.vote(`sign${this.hpContext.timestamp}`, [signed], new AllVoteElector(this.hpContext.unl.list().length, timeout));

        // Submit the signed blobs.
        await multiSigner.submitSignedBlobs(signList);
    }
}

export default EvernodeContext;