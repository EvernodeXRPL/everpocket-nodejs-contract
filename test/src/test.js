const HotPocket = require('hotpocket-nodejs-contract');
const evp = require('everpocket-nodejs-contract');
const fs = require('fs');

const masterAddress = "rNC3aBTwEVJXdHo5yP73H8hCJNju4GqvJ1";
const masterSecret = "snCUGkxT4bEZMPTf6WArK9itc2yYK";
const destinationAddress = "rwL8pyCFRZ6JcKUjfg61TZKdj3TGaXPbot";
const signerWeight = 1;
const ip = "localhost";
const port = 8081;

const evernodeGovernor = "raVhw4Q8FQr296jdaDLDfZ4JDhh7tFG7SF";

const MAX_ACQUIRES = 5;
const MAX_CLUSTER = 8;

const testContract = async (hpContext) => {
    if (!hpContext.readonly) {
        let nonSigners = [];
        if (hpContext.unl.list().length > 3)
            nonSigners = (hpContext.unl.list().filter(n => n.publicKey.charCodeAt(9) % 2 === 0)).map(n => n.publicKey);
        if (!nonSigners.length || nonSigners.length === hpContext.unl.list().length)
            nonSigners = hpContext.unl.list().slice(0, 1).map(n => n.publicKey);

        const signerToAdd = nonSigners.length ? nonSigners[0] : null;
        const signerCount = hpContext.unl.list().length - nonSigners.length;
        const quorum = signerCount * signerWeight;

        const voteContext = new evp.VoteContext(hpContext);

        // Listen to incoming unl messages and feed them to elector.
        hpContext.unl.onMessage((node, msg) => {
            voteContext.feedUnlMessage(node, msg);
        });

        ///////// TODO: This part is temporary for preparing multisig /////////
        if (!fs.existsSync('multisig')) {
            const isSigner = !nonSigners.includes(hpContext.publicKey);

            await prepareMultiSigner(new evp.XrplContext(hpContext, masterAddress, masterSecret, { voteContext: voteContext }), signerCount, isSigner, quorum);

            fs.writeFileSync('multisig', 'MULTISIG');
        }
        ///////////////////////////////////////////////////////////////////////

        const contract = {
            targetNodeCount: 5,
            targetLifeTime: 2,
        }

        const xrplContext = new evp.XrplContext(hpContext, masterAddress, null, { voteContext: voteContext });
        const evernodeContext = new evp.EvernodeContext(xrplContext, evernodeGovernor);
        const utilityContext = new evp.UtilityContext(hpContext);
        const clusterContext = new evp.ClusterContext(evernodeContext, contract, { utilityContext: utilityContext });

        // Listen to incoming user messages and feed them to evernodeContext.
        const userHandlers = [];
        for (const user of hpContext.users.list()) {
            userHandlers.push(new Promise(async (resolve) => {
                for (const input of user.inputs) {
                    const buf = await hpContext.users.read(input);
                    console.log("Received user input", buf.toString());
                    await clusterContext.feedUserMessage(user, buf);
                }
                resolve();
            }));
        }
        await Promise.all(userHandlers);


        const tests = [
            // () => testVote(voteContext),
            // () => addXrplSigner(xrplContext, signerToAdd, quorum + signerWeight),
            // () => renewSignerList(xrplContext),
            // () => removeXrplSigner(xrplContext, signerToAdd, quorum - signerWeight),
            // () => getSignerList(xrplContext),
            // () => multiSignTransaction(xrplContext),
            // () => checkLiveness(utilityContext, ip, port),
            // () => acquireNewNode(evernodeContext),
            // () => extendNode(evernodeContext),
            // () => addNewClusterNode(clusterContext),
            // () => removeNode(clusterContext),
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

const acquireNewNode = async (evernodeContext) => {
    await evernodeContext.init();

    try {
        const pendingAcquires = evernodeContext.getPendingAcquires();
        const acquiredNodes = evernodeContext.getAcquiredNodes();

        console.log(`There are ${pendingAcquires.length} pending acquires and ${acquiredNodes.length} acquired nodes.`);

        if (pendingAcquires.length > 0)
            return;

        if (acquiredNodes.length == MAX_ACQUIRES) {
            console.log(`Reached max acquire limit ${MAX_ACQUIRES}`);
            return;
        }

        const options = {
            instanceCfg: {
                ownerPubkey: "ed3b4f907632e222987809a35e8ea55ed3b5d2e406b7d230a5e6f39a5e9834bafb",
                contractId: "dc411912-bcdd-4f73-af43-32ec45844b9a",
                image: "evernodedev/sashimono:hp.latest-ubt.20.04-njs.16",
                config: {}
            }
        }
        console.log('Acquiring a node...');
        await evernodeContext.acquireNode(options);
        console.log('Acquired the node.')
    } catch (e) {
        console.error(e);
    } finally {
        await evernodeContext.deinit();
    }
}

const extendNode = async (evernodeContext) => {
    await evernodeContext.init();

    try {
        const tokens = await evernodeContext.xrplContext.xrplAcc.getURITokens();
        const token = tokens[0];
        const extendingNodeName = token.index;
        const hostAddress = token.Issuer;
        const res = await evernodeContext.extendSubmit(hostAddress, 1, extendingNodeName);
        console.log(res?.engine_result);
    } catch (e) {
        console.error(e);
    } finally {
        await evernodeContext.deinit();
    }
}

const addNewClusterNode = async (clusterContext) => {
    await clusterContext.init();

    try {
        const pendingNodes = clusterContext.getPendingNodes();
        const clusterNodes = clusterContext.getClusterNodes();

        console.log(`There are ${pendingNodes.length} pending nodes and ${clusterNodes.length} cluster nodes.`);

        if (pendingNodes.length > 0)
            return;

        console.log("Cluster nodes: ", clusterNodes.map(c => c.pubkey));
        console.log("Unl: ", clusterContext.hpContext.unl.list().map(n => n.publicKey));

        if (clusterNodes.length == MAX_CLUSTER) {
            console.log(`Reached max cluster size ${MAX_CLUSTER}`);
            return;
        }

        await clusterContext.addNewClusterNode(1, {
            host: "rEiP3muQXyNVuASSEfGo9tGjnhoPHK8oww",
            instanceCfg: {
                config: {
                    log: {
                        log_level: "dbg"
                    }
                }
            }
        });
    } catch (e) {
        console.error(e);
    } finally {
        await clusterContext.deinit();
    }
}

const removeNode = async (clusterContext) => {
    await clusterContext.init();

    try {
        const unlNodes = clusterContext.getClusterUnlNodes();

        // Remove nodes if max cluster size reached and 5 ledgers after the last node added to UNL.
        if (unlNodes.length === MAX_CLUSTER && clusterContext.hpContext.lclSeqNo > (Math.max(...unlNodes.filter(n => n.addedToUnlOnLcl).map(n => n.addedToUnlOnLcl)) + 5)) {
            console.log("Removing node ", unlNodes[unlNodes.length - 1].pubkey);
            await clusterContext.removeNode(unlNodes[unlNodes.length - 1].pubkey);
            console.log("Removing node ", unlNodes[unlNodes.length - 2].pubkey);
            await clusterContext.removeNode(unlNodes[unlNodes.length - 2].pubkey);
        }
    } catch (e) {
        console.error(e);
    } finally {
        await clusterContext.deinit();
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

// Checking Hot Pocket liveness.
const checkLiveness = async (utilityContext, ip, port) => {
    const checkLiveness = await utilityContext.checkLiveness(ip, port);

    console.log(`Hotpocket liveness ${checkLiveness}`);
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