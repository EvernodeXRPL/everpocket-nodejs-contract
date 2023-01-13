import * as EventEmitter from 'events';
import { Buffer } from 'buffer';
import { AllVoteElector } from './vote-electors';
import { UnlNode } from '../models';
import VoteSerializer from '../utils/serializers/VoteSerializer';

class Context {
    hpContext: any;
    voteEmitter: EventEmitter = new EventEmitter();
    serializer: VoteSerializer;

    public constructor(hpContext: any) {
        this.hpContext = hpContext;
        this.serializer = new VoteSerializer();
    }

    public feedUnlMessage(sender: UnlNode, msg: Buffer): void {
        const vote = this.serializer.deserializeVote(msg);
        vote && this.voteEmitter.emit(vote.election, sender, vote.data);
    }

    public async vote(electionName: string, votes: any[], elector: AllVoteElector): Promise<any[]> {

        // Start the election.
        const election = elector.election(electionName, this.voteEmitter);

        // Cast our vote(s).
        await Promise.all(new Array().concat(votes).map(v => {
            const msg = this.serializer.serializeVote(electionName, v);
            return this.hpContext.unl.send(msg);
        }));

        // Get election result.
        return await election;
    }
}

export default Context;