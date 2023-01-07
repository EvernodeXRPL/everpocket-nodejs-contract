const HotPocket = require('hotpocket-nodejs-contract');
const evp = require('everpocket-nodejs-contract');

const testContract = async (ctx) => {

    const evpContext = new evp.Context(ctx);

    if (!ctx.readonly) {
        ctx.unl.onMessage((node, msg) => {
            evpContext.feedUnlMessage(node, msg);
        })

        console.log(await evpContext.vote("firstRound", 1, new evp.AllVoteElector(1, 3000)));
    }
}

const hpc = new HotPocket.Contract();
hpc.init(testContract);