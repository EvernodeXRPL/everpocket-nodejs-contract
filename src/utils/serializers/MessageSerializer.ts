import { Buffer } from 'buffer';
import * as bson from 'bson';

type Validator = (obj: any) => boolean;

class BSONSerializer {
    public deserialize(msg: Buffer): any {
        return bson.deserialize(msg);

    }

    public serialize(obj: any): Buffer {
        return bson.serialize(obj);
    }
}

class JSONSerializer {
    public deserialize(msg: Buffer): any {
        return JSON.parse(msg.toString());

    }

    public serialize(obj: any): Buffer {
        return Buffer.from(JSON.stringify(obj));
    }
}

class MessageSerializer {
    private serializer: BSONSerializer | JSONSerializer;
    private validate: Validator;

    public constructor(protocol: string, validate: Validator = (obj: any) => { return !!obj }) {
        this.serializer = protocol === 'bson' ? new BSONSerializer() : new JSONSerializer();
        this.validate = validate;
    }

    public deserializeMessage(msg: Buffer): any {
        try {
            const obj = this.serializer.deserialize(msg);
            if (this.validate(obj))
                return obj;
        }
        catch {
            console.error('Invalid message format')
        }

        return null;
    }

    public serializeMessage(data: any): Buffer {
        return this.serializer.serialize(data)
    }
}

export default MessageSerializer;