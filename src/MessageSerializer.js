const msgFields = {
    type: '_evpType',
    election: 'election',
    vote: 'vote'
}
Object.freeze(msgFields);

const msgTypes = {
    vote: 'unlVote'
}
Object.freeze(msgTypes);

class MessageSerializer {

    #deserializeMessage(msg, expectedType) {
        try {
            const obj = JSON.parse(msg);
            if (obj && obj[msgFields.type] && (!expectedType || obj[msgFields.type] === expectedType)) {
                return obj;
            }
        }
        catch {
        }

        return null;
    }

    deserializeVote(msg) {
        return this.#deserializeMessage(msg, msgTypes.vote);
    }

    serializeVote(electionName, vote) {
        return JSON.stringify({
            [msgFields.type]: msgTypes.vote,
            [msgFields.election]: electionName,
            [msgFields.vote]: vote
        })
    }
}

module.exports = {
    MessageSerializer
}