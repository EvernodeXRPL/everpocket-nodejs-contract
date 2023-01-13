import { Buffer } from 'buffer';
import MessageSerializer from './MessageSerializer';

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

class VoteSerializer extends MessageSerializer {
    public constructor() {
        super('json', (obj: any) => { return obj && obj[msgFields.type] && (!msgTypes.vote || obj[msgFields.type] === msgTypes.vote) })
    }

    /**
     * Deserialize user vote to a object.
     * @param msg Serialized buffer.
     * @returns Deserialized object.
     */
    public deserializeVote(msg: Buffer): any {
        return super.deserializeMessage(msg);
    }

    /**
     * Serialize vote message.
     * @param electionName Election name that's voting for.
     * @param data Vote data object.
     * @returns Serialized buffer.
     */
    public serializeVote(electionName: string, data: any): Buffer | null {
        return super.serializeMessage({
            [msgFields.type]: msgTypes.vote,
            [msgFields.election]: electionName,
            [msgFields.data]: data
        });
    }
}

export default VoteSerializer;