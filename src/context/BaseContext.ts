import * as EventEmitter from 'events';
import { Buffer } from 'buffer';
import { UnlNode } from '../models';
import VoteSerializer from '../vote/VoteSerializer';
import { AllVoteElector } from '../vote/vote-electors';

class BaseContext {
    hpContext: any;
    private eventEmitter: EventEmitter = new EventEmitter();
    private voteSerializer: VoteSerializer;
    private listened: boolean = false;

    /**
     * HotPocket contract context handler.
     * @param hpContext HotPocket contract context.
     */
    public constructor(hpContext: any, options: any = {}) {
        this.hpContext = hpContext;
        this.voteSerializer = options.voteSerializer || new VoteSerializer();
    }

    /**
     * Deserialize UNL message and feed to the listeners.
     * @param sender UNLNode which has sent the message.
     * @param msg Message received from UNL.
     */
    public feedUnlMessage(sender: UnlNode, msg: Buffer): void {
        const vote = this.voteSerializer.deserializeVote(msg);
        vote && this.eventEmitter.emit(vote.election, sender, vote.data);
    }

    public initListener(): void {
        if (!this.listened) {
            // Listen to incoming unl messages and feed them to elector.
            this.hpContext.unl.onMessage((node: UnlNode, msg: Buffer) => {
                this.feedUnlMessage(node, msg);
            });
            this.listened = true;
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
        this.initListener();

        // Start the election.
        const election = elector.election(electionName, this.eventEmitter);

        // Cast our vote(s).
        await Promise.all(new Array().concat(votes).map(v => {
            const msg = this.voteSerializer.serializeVote(electionName, v);
            return this.hpContext.unl.send(msg);
        }));

        // Get election result.
        return await election;
    }
}

export default BaseContext;