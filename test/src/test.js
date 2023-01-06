const HotPocket = require('hotpocket-nodejs-contract');
const evp = require('everpocket-nodejs-contract');

const test = async (ctx) => {
    if (!ctx.readonly) {
        ctx.unl.onMessage((node, msg) => { // msg is a Buffer
            console.log(msg.toString() + " from " + node.publicKey);
        })
        await ctx.unl.send("Hello");
    }
}

const hpc = new HotPocket.Contract();
hpc.init(test);