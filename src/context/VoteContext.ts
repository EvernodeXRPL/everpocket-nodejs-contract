import * as EventEmitter from 'events';
import { Buffer } from 'buffer';
import { UnlNode } from '../models';
import VoteSerializer from '../vote/VoteSerializer';
import { AllVoteElector } from '../vote/vote-electors';
import { VoteOptions } from '../models/vote';

class VoteContext {
    private contractContext: any;
    private eventEmitter: EventEmitter = new EventEmitter();
    private voteSerializer: VoteSerializer;
    private uniqueNumber: number = 0;
    private voteCollection: any = {};

    public constructor(contractContext: any, options: VoteOptions = {}) {
        this.contractContext = contractContext;
        this.voteSerializer = options.voteSerializer || new VoteSerializer();
    }

    /**
     * Gives an unique number every time this method is called.
     * @returns An unique number.
     */
    public getUniqueNumber(): number {
        return this.uniqueNumber++;
    }

    /**
     * Deserialize UNL message and feed to the listeners.
     * @param sender UNLNode which has sent the message.
     * @param msg Message received from UNL.
     */
    public feedUnlMessage(sender: UnlNode, msg: Buffer): void {
        const vote = this.voteSerializer.deserializeVote(msg);
        if (vote) {
            const data = vote.data;
            if (this.voteCollection[vote.election])
                this.voteCollection[vote.election].push({ sender, data });
            else
                this.voteCollection[vote.election] = [{ sender, data }];
            this.eventEmitter.emit(vote.election, this.voteCollection[vote.election]);
        }
    }

    /**
     * Send the votes to a election.
     * @param electionName Election identifier to vote for.
     * @param votes Votes for the election.
     * @param elector Elector which evaluates the votes.
     * @returns Evaluated votes as a promise.
     */
    public async vote(electionName: string, votes: any[], elector: AllVoteElector): Promise<any[]> {
        // Start the election.
        const election = this.subscribe(electionName, elector);

        // Cast our vote(s).
        await Promise.all(new Array().concat(votes).map(v => {
            const msg = this.voteSerializer.serializeVote(electionName, v);
            return this.contractContext.unl.send(msg);
        }));

        // Get election result.
        return await election;
    }

    /**
     * Send the votes to a election.
     * @param electionName Election identifier to vote for.
     * @param votes Votes for the election.
     * @param elector Elector which evaluates the votes.
     * @returns Evaluated votes as a promise.
     */
    public async subscribe(electionName: string, elector: AllVoteElector): Promise<any[]> {
        // Start the election.
        const election = elector.election(electionName, this.eventEmitter, this);

        // Get election result.
        return await election;
    }

    /**
     * Resolve all the collected votes.
     * @param electionName Name of the election to resolve.
     * @returns The vote collection.
     */
    public resolveVotes(electionName: string): any[] {
        const votes = this.voteCollection[electionName];
        delete this.voteCollection[electionName];
        return votes ?? [];
    }
}

export default VoteContext;