const HotPocket = require('hotpocket-nodejs-contract');
const evp = require('everpocket-nodejs-contract');

const testContract = async (ctx) => {

    const evpContext = new evp.Context(ctx);

    if (!ctx.readonly) {
        ctx.unl.onMessage((node, msg) => {
            evpContext.feedUnlMessage(node, msg);
        })

        // Voting examples

        const r1 = evpContext.vote("firstRound", [1,2], new evp.AllVoteElector(10, 1000));
        const r2 = evpContext.vote("secondRound", [6,7], new evp.AllVoteElector(10, 1000));

        console.log((await r1).map(v => v.data));
        console.log((await r2).map(v => v.data));
    }
}

const hpc = new HotPocket.Contract();
hpc.init(testContract);