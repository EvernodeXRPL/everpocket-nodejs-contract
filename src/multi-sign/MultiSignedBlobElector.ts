import EventEmitter = require("events");
import VoteContext from "../context/VoteContext";
import { AllVoteElector } from "../vote/vote-electors";

class MultiSignedBlobElector extends AllVoteElector {
    public constructor(desiredVoteCount: number, timeout: number) {
        super(desiredVoteCount, timeout);
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
                // Resolve immediately if we have the required no. of messages.
                if (this.desiredVoteCount && collected.length === this.desiredVoteCount) {
                    clearTimeout(timer);
                    resolve(context.resolveVotes(electionName));
                }
            });
        });
    }
}

export default MultiSignedBlobElector;