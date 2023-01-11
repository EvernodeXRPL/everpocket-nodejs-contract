import * as EventEmitter from 'events';
import MessageSerializer from './MessageSerializer';
import { UnlNode } from './models/common';
import AllVoteElector from './vote-electors/AllVoteElector';
import { Buffer } from 'buffer';

class Context {
    hpContext: any;
    voteEmitter: EventEmitter = new EventEmitter();
    serializer: MessageSerializer;

    public constructor(hpContext: any, options: any = {}) {
        this.hpContext = hpContext;
        this.serializer = options.serializer || new MessageSerializer();
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