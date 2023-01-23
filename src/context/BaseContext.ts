import { v4 as uuidv4 } from 'uuid';
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
     * Initialize listener to the incoming unl messages.
     */
    private initUnlListener(): void {
        if (!this.listened) {
            // Listen to incoming unl messages and feed them to elector.
            this.hpContext.unl.onMessage((node: UnlNode, msg: Buffer) => {
                this.feedUnlMessage(node, msg);
            });
            this.listened = true;
        }
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

    /**
     * Send the votes to a election.
     * @param electionName Election identifier to vote for.
     * @param votes Votes for the election.
     * @param elector Elector which evaluates the votes.
     * @returns Evaluated votes as a promise.
     */
    public async vote(electionName: string, votes: any[], elector: AllVoteElector): Promise<any[]> {
        this.initUnlListener();

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

    /**
     * Generates a random number.
     * @param timeout Maximum timeout to generate a random number.
     * @returns A random number between 0-1.
     */
    public async random(timeout: number = 1000): Promise<number | null> {
        // Generate a random number.
        // Vote for the random number each node has generated.
        const number = Math.random();
        const rn = await this.vote(`randomNumber${this.hpContext.timestamp}`, [number], new AllVoteElector(this.hpContext.unl.list().length, timeout));

        // Take the minimum random number.
        return rn.length ? Math.min(...rn.map(v => v.data)) : null;
    }

    /**
     * Generates an uuid string.
     * @param timeout Maximum timeout to generate an uuid.
     * @returns An uuid.
     */
    public async uuid4(timeout: number = 1000): Promise<string | null> {
        // Generate an uuid.
        // Vote for the uuid each node has generated.
        const uuid = uuidv4();
        const uuids = await this.vote(`uuid4${this.hpContext.timestamp}`, [uuid], new AllVoteElector(this.hpContext.unl.list().length, timeout));

        // Take the first ascending uuid.
        return uuids.length ? uuids.map(v => v.data).sort()[0] : null;
    }
}

export default BaseContext;