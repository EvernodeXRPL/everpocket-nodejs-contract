import { Buffer } from 'buffer';
import * as fs from 'fs';
import { MessageSerializer } from '../utils';
import Context from './Context';

const outputFormat = {
    type: 'file',
}

class FilesContext extends Context {

    private messageSerializer: MessageSerializer;

    public constructor(hpContext: any, options: any = {}) {
        super(hpContext);
        this.messageSerializer = new MessageSerializer('bson');
    }

    public async handleFileOperation() {
        if (!this.hpContext.readonly) {
            for (const user of this.hpContext.users.list()) {
                for (const input of user.inputs) {
                    const buf = await this.hpContext.users.read(input);
                    const msg = this.messageSerializer.deserializeMessage(buf);
                    switch (msg.type) {
                        case 'file': {
                            if (msg.action == "upload") {
                                const output = this.upload(msg);
                                await user.send(this.messageSerializer.serializeMessage(output));
                            }
                            else if (msg.action == "merge") {
                                const output = this.mergeUploadedFiles(msg);
                                await user.send(this.messageSerializer.serializeMessage(output));
                            }
                            else if (msg.action == "delete") {
                                const output = this.deleteFile(msg.fileName);
                                await user.send(this.messageSerializer.serializeMessage(output));
                            }
                        }
                            break;

                        default:
                            break;
                    }
                }
            }
        }
    }

    public upload(msg: any): any {
        const fileName = msg?.directory ? `${msg?.directory}/${msg.fileName}` : msg.fileName;

        const output = { ...outputFormat, action: "upload" }

        if (msg?.directory && !fs.existsSync(msg.directory)) {
            fs.mkdirSync(msg.directory);
        }
        if (fs.existsSync(fileName)) {
            return {
                ...output,
                status: "already_exists",
                data: { fileName: msg.fileName }
            }
        }
        else if (msg.content.length > 10 * 1024 * 1024) {
            return {
                ...output,
                status: "too_large",
                data: { fileName: msg.fileName }
            };
        }
        else {

            // Save the file.
            fs.writeFileSync(fileName, msg.content.buffer);

            const payload = {
                ...output,
                status: "ok",
                data: { fileName: msg.fileName }
            };

            return msg?.directory ? { ...payload, directory: msg?.directory } : payload;
        }
    }

    public mergeUploadedFiles(msg: any): any {

        const output = { ...outputFormat, action: "merge" }

        if (!fs.existsSync(msg.directory)) {
            return {
                ...output,
                status: "failed",
                data: {
                    fileName: msg.fileName,
                    message: "File not found"
                }
            };
        }
        else {
            const tempFileCount = fs.readdirSync(msg.directory).length;
            if (tempFileCount != msg.chunkCount) {
                fs.rmSync(msg.directory, { recursive: true, force: true });
                return {
                    ...output,
                    status: "failed",
                    data: {
                        fileName: msg.fileName,
                        message: "File count miss match"
                    }
                };
            } else {
                let tempFiles = [];

                for (let i = 0; i < tempFileCount; i++) {
                    tempFiles.push(fs.readFileSync(`${msg.directory}/SEQ-${i}`));
                }

                fs.createWriteStream(msg.rebuildFileName).write(Buffer.concat(tempFiles));
                fs.rmSync(msg.directory, { recursive: true, force: true });

                return {
                    ...output,
                    status: "ok",
                    data: {
                        fileName: msg.rebuildFileName
                    }
                };
            }
        }
    }

    public deleteFile(fileName: string): any {
        const output = { ...outputFormat, action: "delete" }
        if (fs.existsSync(fileName)) {
            fs.unlinkSync(fileName);
            return {
                ...output,
                status: "ok",
                data: {
                    fileName: fileName
                }
            };
        }
        else {
            return {
                ...output,
                status: "not_found",
                data: {
                    fileName: fileName
                }
            };
        }
    }
}

export default FilesContext;