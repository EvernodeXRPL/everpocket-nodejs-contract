import { Buffer } from 'buffer';
import * as bson from 'bson';

type Validator = (obj: any) => boolean;

class BSONSerializer {
    /**
     * Deserialize bson message to a object.
     * @param msg Bson message buffer.
     * @returns Deserialized object.
     */
    public deserialize(msg: Buffer): any {
        return bson.deserialize(msg);

    }

    /**
     * Serialize object to a bson message.
     * @param obj object.
     * @returns Serialized Bson message buffer.
     */
    public serialize(obj: any): Buffer {
        return bson.serialize(obj);
    }
}

class JSONSerializer {
    /**
     * Deserialize stringified message buffer to a object.
     * @param msg Stringified message buffer.
     * @returns Deserialized object.
     */
    public deserialize(msg: Buffer): any {
        return JSON.parse(msg.toString());

    }

    /**
     * Serialize object to a stringified message buffer.
     * @param obj object.
     * @returns Serialized stringified message buffer.
     */
    public serialize(obj: any): Buffer {
        return Buffer.from(JSON.stringify(obj));
    }
}

class MessageSerializer {
    private serializer: BSONSerializer | JSONSerializer;
    private validate: Validator;
    /**
     * Message serializer.
     * @param protocol Message protocol json|bson.
     * @param validator Validator function to validate the object.
     */
    public constructor(protocol: string, validator: Validator = (obj: any) => { return !!obj }) {
        // Instantiate a serializer for given protocol.
        this.serializer = protocol === 'bson' ? new BSONSerializer() : new JSONSerializer();
        this.validate = validator;
    }

    /**
     * Deserialize buffer to a object.
     * @param msg Serialized buffer.
     * @returns Deserialized object.
     */
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

    /**
     * Serialize object to a buffer.
     * @param data Deserialized object.
     * @returns Serialized buffer.
     */
    public serializeMessage(data: any): Buffer | null {
        try {
            if (this.validate(data))
                return null;

            return this.serializer.serialize(data);
        }
        catch {
            console.error('Invalid message format')
        }

        return null;
    }
}

export default MessageSerializer;