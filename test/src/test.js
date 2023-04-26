const HotPocket = require('hotpocket-nodejs-contract');
const evp = require('everpocket-nodejs-contract');
const fs = require('fs');

const masterAddress = "ryniL5Jm5jPdusnkNBi3jaG747zrktZFR";
const masterSecret = "shexbsCShq6yuU4va9LV2x8RYvuj2";
const destinationAddress = "rwL8pyCFRZ6JcKUjfg61TZKdj3TGaXPbot";
const destinationSecret = "ssXtkhrooqhEhjZDsHXPW5cvexFG7";
const signerWeight = 1;

const evernodeGovernor = "rGVHr1PrfL93UAjyw3DWZoi9adz2sLp2yL";

const testContract = async (ctx) => {
    if (!ctx.readonly) {
        let nonSigners = [];
        if (ctx.unl.list().length > 3)
            nonSigners = (ctx.unl.list().filter(n => n.publicKey.charCodeAt(9) % 2 === 0)).map(n => n.publicKey);
        if (!nonSigners.length || nonSigners.length === ctx.unl.list().length)
            nonSigners = ctx.unl.list().slice(0, 1).map(n => n.publicKey);

        const signerToAdd = nonSigners.length ? nonSigners[0] : null;
        const signerCount = ctx.unl.list().length - nonSigners.length;
        const quorum = signerCount * signerWeight;

        const voteContext = new evp.VoteContext(ctx);

        // Listen to incoming unl messages and feed them to elector.
        ctx.unl.onMessage((node, msg) => {
            voteContext.feedUnlMessage(node, msg);
        });

        ///////// TODO: This part is temporary for preparing multisig /////////
        if (!fs.existsSync('multisig')) {
            fs.writeFileSync('multisig', '');

            const isSigner = !nonSigners.includes(ctx.publicKey);

            await prepareMultiSigner(new evp.XrplContext(ctx, masterAddress, masterSecret, { voteContext: voteContext }), signerCount, isSigner, quorum);
        }
        ///////////////////////////////////////////////////////////////////////

        const xrplContext = new evp.XrplContext(ctx, masterAddress, null, { voteContext: voteContext });

        const tests = [
            // () => testVote(voteContext),
            // () => addXrplSigner(xrplContext, signerToAdd, quorum + signerWeight),
            // () => renewSignerList(xrplContext),
            // () => removeXrplSigner(xrplContext, signerToAdd, quorum - signerWeight),
            // () => getSignerList(xrplContext),
            // () => multiSignTransaction(xrplContext),
            () => acquireNewNode(xrplContext)
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

const addXrplSigner = async (xrplContext, publickey, quorum = null) => {
    if (!publickey || xrplContext.hpContext.lclSeqNo % 3 !== 1)
        return;

    await xrplContext.init();

    try {
        console.log(`----------- Adding ${publickey} to signer list`);
        await xrplContext.addXrplSigner(publickey, signerWeight, { quorum: quorum });
        console.log("Signer added");

    } catch (e) {
        console.error(e);
    } finally {
        await xrplContext.deinit();
    }
}


const acquireNewNode = async (xrplContext) => {
    const evernodeCtx = new evp.EvernodeContext(xrplContext.hpContext, masterAddress, evernodeGovernor, { xrplContext: xrplContext });
    try {
        const options = {
            host: "r9kCyGhhwGj3KaSGemFrrPVpXkzVtT2b1N",
            instanceCfg: {
                owner_pubkey: "ed5cb83404120ac759609819591ef839b7d222c84f1f08b3012f490586159d2b50",
                contract_id: "dc411912-bcdd-4f73-af43-32ec45844b9a",
                image: "evernodedev/sashimono:hp.latest-ubt.20.04-njs.16",
                config: {}
            }
        }
        await evernodeCtx.acquireNode(options);
        console.log("acquired a node.");

    } catch (e) {
        console.error(e);
    }
}

const renewSignerList = async (xrplContext) => {
    if (xrplContext.hpContext.lclSeqNo % 3 !== 2)
        return;

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

const removeXrplSigner = async (xrplContext, publickey, quorum = null) => {
    if (!publickey || xrplContext.hpContext.lclSeqNo % 3 !== 0)
        return;

    await xrplContext.init();

    try {
        console.log(`----------- Removing ${publickey} from signer list`);
        await xrplContext.removeXrplSigner(publickey, { quorum: quorum });
        console.log("Signer removed");

    } catch (e) {
        console.error(e);
    } finally {
        await xrplContext.deinit();
    }
}

const getSignerList = async (xrplContext) => {
    await xrplContext.init();

    try {
        console.log("----------- Getting the signer list");
        const signerList = await xrplContext.getSignerList();
        console.log(signerList);

    } catch (e) {
        console.error(e);
    } finally {
        await xrplContext.deinit();
    }
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
        console.log("----------- Multi-Signing Transaction");
        await xrplContext.multiSignAndSubmitTransaction(tx);
        console.log("Transaction submitted");

    } catch (e) {
        console.error(e);
    } finally {
        await xrplContext.deinit();
    }
}

////// TODO: This is a temporary function and will be removed in the future //////
const prepareMultiSigner = async (xrplContext, signerCount, isSigner, quorum) => {
    await xrplContext.init();

    try {
        const elector = new evp.AllVoteElector(signerCount, 4000);

        let signerList;
        let signer;
        if (isSigner) {
            signer = xrplContext.multiSigner.generateSigner();

            signerList = (await xrplContext.voteContext.vote(`multiSignerPrepare`, [{
                account: signer.account,
                weight: signerWeight
            }], elector)).map(ob => ob.data);
        }
        else {
            signerList = (await xrplContext.voteContext.subscribe(`multiSignerPrepare`, elector)).map(ob => ob.data);
        }

        // Set a MessageKey for the account that performs acquire.
        if (! await xrplContext.xrplAcc.getMessageKey()) {
            await xrplContext.xrplAcc.setAccountFields({ MessageKey: xrplContext.xrplAcc.wallet.publicKey });
        }

        const txSubmitInfo = await xrplContext.getTransactionSubmissionInfo();
        if (txSubmitInfo) {
            const res = await xrplContext.xrplAcc.setSignerList(signerList.sort((a, b) => a.account < b.account ? -1 : 1),
                { signerQuorum: quorum, maxLedgerIndex: txSubmitInfo.maxLedgerSequence, sequence: txSubmitInfo.sequence });

            if (res.code === "tesSUCCESS")
                console.log("Transaction submitted successfully");
            else if (res.code === "tefPAST_SEQ" || res.code === "tefALREADY")
                console.log("Proceeding with pre-submitted transaction");
            else
                throw res.code;

            if (isSigner) {
                xrplContext.multiSigner.setSigner(signer);
            }
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