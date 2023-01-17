const HotPocket = require('hotpocket-nodejs-contract');
const evp = require('everpocket-nodejs-contract');
const bson = require('bson');

const testContract = async (ctx) => {
    //await vote(ctx);
    await fileUpload(ctx);
}

// Voting examples
async function vote(ctx) {
    const context = new evp.Context(ctx);

    ctx.unl.onMessage((node, msg) => {
        context.feedUnlMessage(node, msg);
    })

    const r1 = context.vote("firstRound", [1, 2], new evp.AllVoteElector(10, 1000));
    const r2 = context.vote("secondRound", [6, 7], new evp.AllVoteElector(10, 1000));

    console.log((await r1).map(v => v.data));
    console.log((await r2).map(v => v.data));
}

async function fileUpload(ctx) {
    const evpContext = new evp.FilesContext(ctx);

    if (!ctx.readonly) {
        for (const user of ctx.users.list()) {

            for (const input of user.inputs) {
                const buf = await ctx.users.read(input);
                const msg = bson.deserialize(buf);
                switch (msg.type) {
                    case 'file': {
                        if (msg.action == "upload") {
                            const output = evpContext.upload(msg);
                            await user.send(bson.serialize(output));
                        }
                        else if (msg.action == "merge") {
                            const output = evpContext.mergeUploadedFiles(msg);
                            await user.send(bson.serialize(output));
                        }
                        else if (msg.action == "delete") {
                            const output = evpContext.deleteFile(msg.fileName);
                            await user.send(bson.serialize(output));
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

const hpc = new HotPocket.Contract();
hpc.init(testContract);