import EventEmitter = require("events");
import VoteContext from "../context/VoteContext";
import { Signer, SignerListInfo } from "../models";
import { AllVoteElector } from "../vote/vote-electors";

class MultiSignedBlobElector extends AllVoteElector {
    private signerListInfo: SignerListInfo;

    public constructor(desiredVoteCount: number, signerListInfo: SignerListInfo, timeout: number) {
        super(desiredVoteCount, timeout);
        this.signerListInfo = signerListInfo;
    }

    /**
     * Evaluate the election.
     * @param electionName Election identifier.
     * @param voteEmitter Event emitter which the votes are fed into,
     * @param context Vote context for the election.
     * @returns Evaluated votes as a promise.
     */
    override election(electionName: string, voteEmitter: EventEmitter, context: VoteContext): Promise<any[]> {
        return new Promise((resolve) => {
            // Fire up the timeout if we didn't receive enough votes.
            const timer = setTimeout(() => resolve(context.resolveVotes(electionName)), this.timeout);

            voteEmitter.on(electionName, (collected: any[]) => {
                const currSignerWeight = collected.reduce((total: number, co: any) => {
                    const signer = this.signerListInfo.signerList.find((ob: Signer) => ob.account == co.data.account);
                    if (signer)
                        return total + signer.weight;
                    else
                        return 0;
                }, 0);


                // If signer Quorum is satisfied, submit the transaction
                if (currSignerWeight == this.signerListInfo.signerQuorum) {
                    clearTimeout(timer);
                    resolve(context.resolveVotes(electionName));
                }
            });
        });
    }
}

export default MultiSignedBlobElector;