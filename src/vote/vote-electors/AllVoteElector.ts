import * as EventEmitter from 'events';
import VoteContext from '../../context/VoteContext';

class AllVoteElector {
    desiredVoteCount: number;
    timeout: number;

    public constructor(desiredVoteCount: number, timeout: number) {
        this.desiredVoteCount = desiredVoteCount;
        this.timeout = timeout;
    }

    /**
     * Evaluate the election.
     * @param electionName Election identifier.
     * @param voteEmitter Event emitter which the votes are fed into,
     * @returns Evaluated votes as a promise.
     */
    election(electionName: string, voteEmitter: EventEmitter, context: VoteContext): Promise<any[]> {
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


export default AllVoteElector;