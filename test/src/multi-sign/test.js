const HotPocket = require('hotpocket-nodejs-contract');
const evp = require('everpocket-nodejs-contract');
const fs = require("fs").promises;

const testContract = async (ctx) => {

    // User inputs
    const signerList = [{ account: "rafef45v45efefe", weight: 1 }, { account: "rafef4gg5v45efefe", weight: 1 }];
    const quorum = 2;
    const masterKey = "";
    const tx = null;

    const evpContext = new evp.Context(ctx, {});

    if (!ctx.readonly) {
        ctx.unl.onMessage((node, msg) => {
            evpContext.feedUnlMessage(node, msg);
        })


        await evpContext.enableMultiSigning(masterKey, quorum, false, signerList)
        await evpContext.submitTransaction(tx, masterKey);


    }
}

const hpc = new HotPocket.Contract();
hpc.init(testContract);