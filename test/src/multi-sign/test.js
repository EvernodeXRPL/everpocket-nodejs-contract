const HotPocket = require('hotpocket-nodejs-contract');
const evp = require('everpocket-nodejs-contract');
const fs = require("fs").promises;

const testContract = async (ctx) => {

    // uSer inputs
    const signerList = [{ account: "rafef45v45efefe", weight: 1 }, { account: "rafef4gg5v45efefe", weight: 1 }];
    const quorum = 2;

    const evpContext = new evp.Context(ctx, { signerList: signerList, quorum: quorum });

    if (!ctx.readonly) {
        ctx.unl.onMessage((node, msg) => {
            evpContext.feedUnlMessageForMultisign(node, msg);
        })



            // Create separate wallets and save them
        const filename = "../masterkey.log"
        let masterKey = (await fs.readFile(filename)).toString().trim();
        if (masterKey.length == 0) {
            masterKey = "";  // user input
            await fs.writeFile(filename, masterKey);
        }

    }
}

const hpc = new HotPocket.Contract();
hpc.init(testContract);