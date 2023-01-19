import * as EventEmitter from 'events';

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
    election(electionName: string, voteEmitter: EventEmitter): Promise<any[]> {
        return new Promise((resolve) => {
            const collected: any[] = [];

            // Fire up the timeout if we didn't receive enough votes.
            const timer = setTimeout(() => resolve(collected), this.timeout);

            voteEmitter.on(electionName, (sender, data) => {
                collected.push({ sender, data });

                // Resolve immediately if we have the required no. of messages.
                if (collected.length === this.desiredVoteCount) {
                    clearTimeout(timer);
                    resolve(collected);
                }
            });
        });
    }
}

export default AllVoteElector;