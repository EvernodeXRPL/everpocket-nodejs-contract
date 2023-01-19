import EventEmitter = require("events");
import { SignedBlob, Signer, SignerListInfo, UnlNode } from "../models";
import { AllVoteElector } from "../vote/vote-electors";

class MultiSignedBlobCollector extends AllVoteElector {
    private signerListInfo?: SignerListInfo;

    public constructor(desiredVoteCount: number, signerListInfo: SignerListInfo | undefined, timeout: number) {
        super(desiredVoteCount, timeout);
        this.signerListInfo = signerListInfo;
    }

    override election(electionName: string, voteEmitter: EventEmitter): Promise<any[]> {
        return new Promise((resolve) => {
            const collected: any[] = [];

            // Fire up the timeout if we didn't receive enough votes.
            const timer = setTimeout(() => resolve(collected), this.timeout);

            voteEmitter.on(electionName, (sender: UnlNode, data: SignedBlob) => {
                collected.push({ sender, data });

                const currSignerWeight = collected.reduce((total: number, co: any) => {
                    const signer = this.signerListInfo?.signerList.find((ob: Signer) => ob.account == co.data.account);
                    if (signer)
                        return total + signer.weight;
                    else
                        return 0;
                }, 0);


                // If signer Quorum is satisfied, submit the transaction
                if (currSignerWeight == this.signerListInfo?.signerQuorum) {
                    clearTimeout(timer);
                    resolve(collected);
                }
            });
        });
    }
}

export default MultiSignedBlobCollector;