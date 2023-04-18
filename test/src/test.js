const HotPocket = require('hotpocket-nodejs-contract');
const evp = require('everpocket-nodejs-contract');
const fs = require('fs');

const masterAddress = "ryniL5Jm5jPdusnkNBi3jaG747zrktZFR";
const masterSecret = "shexbsCShq6yuU4va9LV2x8RYvuj2";
const destinationAddress = "rwL8pyCFRZ6JcKUjfg61TZKdj3TGaXPbot";
const destinationSecret = "ssXtkhrooqhEhjZDsHXPW5cvexFG7";

const testContract = async (ctx) => {
    const voteContext = new evp.VoteContext(ctx);
    const xrplContext = new evp.XrplContext(ctx, masterAddress, masterSecret, { voteContext: voteContext });

    if (!ctx.readonly) {
        // Listen to incoming unl messages and feed them to elector.
        ctx.unl.onMessage((node, msg) => {
            voteContext.feedUnlMessage(node, msg);
        })

        const tests = [
            () => testVote(voteContext),
            () => prepareMultiSigner(xrplContext), // TODO: This is a temporary function and will be removed in the future
            () => multiSignTransaction(xrplContext),
            () => renewSignerList(xrplContext),
        ];

        for (const test of tests) {
            await test();
        }
    }
}

// Voting examples.
const testVote = async (voteContext) => {
    // Send votes to an election.
    const r1 = voteContext.vote("firstRound", [1, 2], new evp.AllVoteElector(10, 1000));
    const r2 = voteContext.vote("secondRound", [6, 7], new evp.AllVoteElector(10, 1000));

    console.log('First round votes', (await r1).map(v => v.data));
    console.log('Second round votes', (await r2).map(v => v.data));
}

const multiSignTransaction = async (xrplContext) => {
    const tx = {
        TransactionType: "Payment",
        Account: masterAddress,
        Destination: destinationAddress,
        Amount: "1000",
        Fee: "12",
        Flags: 2147483648
    };

    await xrplContext.init();

    try {
        console.log("----------- Multi-Signing Test");
        await xrplContext.multiSignAndSubmitTransaction(tx);
        console.log("Transaction submitted");

    } catch (e) {
        console.error(e);
    } finally {
        await xrplContext.deinit();
    }
}

const renewSignerList = async (xrplContext) => {

    await xrplContext.init();

    try {
        console.log("----------- Renew Multi-Signing");
        await xrplContext.renewSignerList();
        console.log("Signer list renewed");

    } catch (e) {
        console.error(e);
    } finally {
        await xrplContext.deinit();
    }
}

////// TODO: This is a temporary function and will be removed in the future //////
const prepareMultiSigner = async (xrplContext) => {
    const keyPath = `../${masterAddress}.key`;
    if (fs.existsSync(keyPath))
        return;

    await xrplContext.init();

    try {
        const signer = xrplContext.multiSigner.generateSigner();

        // Generate and collect signer list if signer list isn't provided.
        const signerList = (await xrplContext.voteContext.vote(`multiSignerPrepare`, [{
            account: signer.account,
            weight: 1
        }], new evp.AllVoteElector(xrplContext.hpContext.unl.list().length, 4000))).map(ob => ob.data);

        const txSubmitInfo = await xrplContext.getTransactionSubmissionInfo();
        if (txSubmitInfo) {
            const res = await xrplContext.xrplAcc.setSignerList(signerList.sort((a, b) => a.account < b.account ? -1 : 1),
                { signerQuorum: 3, maxLedgerIndex: txSubmitInfo.maxLedgerSequence, sequence: txSubmitInfo.sequence });

            if (res.code === "tesSUCCESS")
                console.log("Transaction submitted successfully");
            else if (res.code === "tefPAST_SEQ" || res.code === "tefALREADY")
                console.log("Proceeding with pre-submitted transaction");
            else
                throw res.code;

            xrplContext.multiSigner.setSigner(signer);
            console.log('Prepared multi signing');
        }
        else {
            throw 'Could not get transaction submission info';
        }
    }
    catch (e) {
        console.log(e);
    } finally {
        await xrplContext.deinit();
    }
}
////////////////////////////////////////////////////////////////////////////

const hpc = new HotPocket.Contract();
hpc.init(testContract);