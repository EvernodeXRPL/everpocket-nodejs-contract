import { Buffer } from 'buffer';
import MessageSerializer from './MessageSerializer';

class FileSerializer extends MessageSerializer {
    public constructor() {
        super('bson')
    }

    public deserializeFile(msg: Buffer): any {
        return super.deserializeMessage(msg);
    }

    public serializeFile(data: any): Buffer {
        return super.serializeMessage(data);
    }
}

export default FileSerializer;