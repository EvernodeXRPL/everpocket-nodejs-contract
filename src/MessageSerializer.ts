import { Buffer } from 'buffer';

const msgFields = {
    type: '_evpType',
    election: 'election',
    data: 'data'
}
Object.freeze(msgFields);

const msgTypes = {
    vote: 'unlVote'
}
Object.freeze(msgTypes);

class MessageSerializer {

    private deserializeMessage(msg: any, expectedType: string): any {
        try {
            const obj = JSON.parse(msg.toString());
            if (obj && obj[msgFields.type] && (!expectedType || obj[msgFields.type] === expectedType))
                return obj;
        }
        catch {
            console.error('Invalid message format')
        }

        return null;
    }

    public deserializeVote(msg: Buffer): any {
        return this.deserializeMessage(msg, msgTypes.vote);
    }

    public serializeVote(electionName: string, data: any): string {
        return JSON.stringify({
            [msgFields.type]: msgTypes.vote,
            [msgFields.election]: electionName,
            [msgFields.data]: data
        })
    }
}

export default MessageSerializer;