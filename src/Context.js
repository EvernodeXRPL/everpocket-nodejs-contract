const EventEmitter = require('events');
const { MessageSerializer } = require('./MessageSerializer');

class Context {
    hpContext;
    voteEmitter = new EventEmitter();

    constructor(hpContext, options = {}) {
        this.hpContext = hpContext;
        this.serializer = options.serializer || new MessageSerializer();
    }

    feedUnlMessage(sender, msg) {
        const vote = this.serializer.deserializeVote(msg);
        vote && this.voteEmitter.emit(vote.election, sender, vote.data);
    }

    async vote(electionName, votes, elector) {

        // Start the election.
        const election = elector.election(electionName, this.voteEmitter);

        // Cast our vote(s).
        await Promise.all([].concat(votes).map(v => {
            const msg = this.serializer.serializeVote(electionName, v);
            return this.hpContext.unl.send(msg);
        }));

        // Get election result.
        return await election;
    }
}

module.exports = {
    Context
}