const HotPocket = require('hotpocket-nodejs-contract');
const evp = require('everpocket-nodejs-contract');
const fs = require('fs');

const masterAddress = "r3HfHxf6LeY8y1SGWHoKRRrUGdxruJyXEL";
// const masterSecret = "sniK4psjdEXiogzMjQZonjVvZwmSP";


const destinationAddress = "rwL8pyCFRZ6JcKUjfg61TZKdj3TGaXPbot";
const signerWeight = 1;
const ip = "localhost";
const port = 8081;

const evernodeGovernor = "rGVHr1PrfL93UAjyw3DWZoi9adz2sLp2yL";

const MAX_ACQUIRES = 5;
const MAX_CLUSTER = 8;

const nomadOptions = {
    targetNodeCount: 15,
    targetLifeMoments: 2,
    preferredHosts: [
        "rEiP3muQXyNVuASSEfGo9tGjnhoPHK8oww"
    ],
    instanceCfg: {
        config: {
            log: {
                log_level: "dbg"
            }
        }
    }
}

const testContract = async (contractCtx) => {

    let nonSigners = [];
    // if (contractCtx.unl.list().length > 3)
    //     nonSigners = (contractCtx.unl.list().filter(n => n.publicKey.charCodeAt(9) % 2 === 0)).map(n => n.publicKey);
    // if (!nonSigners.length || nonSigners.length === contractCtx.unl.list().length)
    //     nonSigners = contractCtx.unl.list().slice(0, 1).map(n => n.publicKey);

    const signerToAdd = nonSigners.length ? nonSigners[0] : null;
    const signerCount = contractCtx.unl.list().length - nonSigners.length;
    const quorum = Math.floor(signerCount * signerWeight * 0.6);
    const signerToRemove = contractCtx.unl.list().map(n => n.publicKey).find(p => !nonSigners.includes(p));

    const voteContext = new evp.VoteContext(contractCtx);
    const hpContext = new evp.HotPocketContext(contractCtx, { voteContext: voteContext });

    if (!contractCtx.readonly) {
        // Listen to incoming unl messages and feed them to elector.
        contractCtx.unl.onMessage((node, msg) => {
            voteContext.feedUnlMessage(node, msg);
        });

        ///////// TODO: This part is temporary for preparing multisig /////////
        // if (!fs.existsSync('multisig')) {
        //     const isSigner = !nonSigners.includes(hpContext.publicKey);

        //     await prepareMultiSigner(new evp.XrplContext(hpContext, masterAddress, masterSecret), signerCount, isSigner, quorum);

        //     fs.writeFileSync('multisig', '');
        // }
        ///////////////////////////////////////////////////////////////////////
    }

    const xrplContext = new evp.XrplContext(hpContext, masterAddress);
    const evernodeContext = new evp.EvernodeContext(xrplContext, evernodeGovernor);
    const clusterContext = new evp.ClusterContext(evernodeContext);
    const nomadContext = new evp.NomadContext(clusterContext, nomadOptions);

    // Listen to incoming user messages and feed them to evernodeContext.
    const userHandlers = [];
    for (const user of contractCtx.users.list()) {
        userHandlers.push(new Promise(async (resolve) => {
            for (const input of user.inputs) {
                const buf = await contractCtx.users.read(input);
                info("Received user input", buf.toString());
                await clusterContext.feedUserMessage(user, buf);
            }
            resolve();
        }));
    }
    await Promise.all(userHandlers);

    if (!contractCtx.readonly) {
        const tests = [
            // () => testVote(voteContext),
            // () => addXrplSigner(xrplContext, signerToAdd, quorum + signerWeight),
            // () => renewSignerList(xrplContext),
            // () => removeXrplSigner(xrplContext, signerToRemove, quorum - signerWeight),
            // () => getSignerList(xrplContext),
            // () => multiSignTransaction(xrplContext),
            // () => checkLiveness(hpContext, ip, port),
            // () => acquireNewNode(evernodeContext),
            // () => extendNode(evernodeContext),
            // () => addNewClusterNode(clusterContext),
            // () => removeNode(clusterContext),
            () => runNomadContract(nomadContext)
        ];

        try {
            for (const test of tests) {
                await test();
            }
        }
        catch (e) {
            console.error(`${getDate()}:`, 'Contract Error: ', e);
        }
        finally {
            // Deinitialize at the end of the execution.
            await xrplContext.deinit();
            await evernodeContext.deinit();
            await clusterContext.deinit();
            await nomadContext.deinit();
        }
    }
}

const getDate = () => {
    return new Date().toISOString().
        replace(/T/, ' ').       // Replace T with a space.
        replace(/\..+/, '').     // Delete the dot and everything after.
        replace(/-/g, '');     // Delete the dashes.
}

const info = (...args) => {
    console.log(`${getDate()}:`, ...args);
}

// Voting examples.
const testVote = async (voteContext) => {
    // Send votes to an election.
    const r1 = voteContext.vote("firstRound", [Math.ceil((Math.random() * 10))], new evp.AllVoteElector(10, 1000));
    const r2 = voteContext.vote("secondRound", [Math.ceil((Math.random() * 10))], new evp.AllVoteElector(10, 1000));
    const r3 = voteContext.vote("thirdRound", [{
        SigningPubKey: '03FBBF4D613A46855D393A9C48F17E9935840335665F4F892BD88505CC1CA4E075',
        TxnSignature: '3045022100F13CEAC221F5FEECF954356F21FBFE9944D30A6734DCD24C064937DE2A75E222022020F089A2B59DB5DFDBA7EEC375C2B61A41FB48A2A42BE60DE8E3B52820F870F2',
        Account: 'rhBEKz6Sa26L13TjFB2SiYDjuPFazDnnqH',
        Sequence: Math.ceil((Math.random() * 10))
    }], new evp.AllVoteElector(10, 1000));

    const firstList = (await r1).map(v => v.data);
    console.log('First round votes', firstList);
    fs.appendFileSync('first.txt', firstList?.length ? firstList.sort()[0].toString() : '');
    const secondList = (await r2).map(v => v.data);
    console.log('Second round votes', secondList);
    fs.appendFileSync('second.txt', secondList?.length ? secondList.sort()[0].toString() : '');
    const thirdList = (await r3).map(v => v.data);
    console.log('Third round votes', thirdList);
    fs.appendFileSync('thir.txt', thirdList?.length ? JSON.stringify(thirdList.sort()) : '');
}

const addXrplSigner = async (xrplContext, publickey, quorum = null) => {
    if (!publickey || xrplContext.hpContext.lclSeqNo % 3 !== 1)
        return;

    await xrplContext.init();

    console.log(`----------- Adding ${publickey} to signer list`);
    await xrplContext.addXrplSigner(publickey, signerWeight, { quorum: quorum });
    console.log("Signer added");
}

const acquireNewNode = async (evernodeContext) => {
    await evernodeContext.init();

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
            image: "evernodedev/sashimono:hp.udpvisa-test-0.0.1-ubt.20.04-njs.20",
            config: {}
        }
    }
    console.log('Acquiring a node...');
    await evernodeContext.acquireNode(options);
    console.log('Acquired the node.');
}

const extendNode = async (evernodeContext) => {
    await evernodeContext.init();

    const tokens = await evernodeContext.xrplContext.xrplAcc.getURITokens();
    const token = tokens[0];
    const extendingNodeName = token.index;
    const hostAddress = token.Issuer;
    console.log(`Extending ${extendingNodeName}...`);
    const res = await evernodeContext.extendSubmit(hostAddress, 1, extendingNodeName);
    console.log(`Extended ${extendingNodeName}...`);
}

const addNewClusterNode = async (clusterContext) => {
    await clusterContext.init();

    const pendingNodes = clusterContext.getPendingNodes();
    const clusterNodes = clusterContext.getClusterNodes();

    console.log(`There are ${pendingNodes.length} pending nodes and ${clusterNodes.length} cluster nodes.`);

    if (pendingNodes.length > 0)
        return;

    console.log("Cluster nodes: ", clusterNodes.map(c => c.pubkey));
    console.log("Unl: ", clusterContext.hpContext.getContractUnl().map(n => n.publicKey));

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
}

const removeNode = async (clusterContext) => {
    await clusterContext.init();

    const unlNodes = clusterContext.getClusterUnlNodes();

    // Remove nodes if max cluster size reached and 5 ledgers after the last node added to UNL.
    if (unlNodes.length === MAX_CLUSTER && clusterContext.hpContext.lclSeqNo > (Math.max(...unlNodes.filter(n => n.addedToUnlOnLcl).map(n => n.addedToUnlOnLcl)) + 2)) {
        const quorumNode = unlNodes.find(n => n.signerAddress);
        if (quorumNode) {
            console.log("Removing node ", quorumNode.pubkey);
            await clusterContext.removeNode(quorumNode.pubkey);
        }
    }
}

const runNomadContract = async (nomadContext) => {
    info("Entered Nomad Contract...");
    await nomadContext.clusterContext.init();

    const pendingNodes = nomadContext.clusterContext.getPendingNodes();
    const clusterNodes = nomadContext.clusterContext.getClusterNodes();

    info(`There are ${pendingNodes.length} pending nodes and ${clusterNodes.length} cluster nodes.`);

    info("Cluster nodes: ", clusterNodes.map(c => c.pubkey));
    info("Unl: ", nomadContext.clusterContext.hpContext.getContractUnl().map(n => n.publicKey));

    // ////////////////// Start of the code for cluster info streaming ////////////////////

    // await new Promise((resolve, reject) => {
    //     const data = fs.existsSync("streamer.config") && fs.readFileSync("streamer.config", 'utf8');
    //     const streamerCfg = data ? JSON.parse(data) : {};
    //     const isValidStreamer = streamerCfg?.ip?.length > 0 && streamerCfg?.port > 0;

    //     if (isValidStreamer && nomadContext.hpContext.lclSeqNo % 5 === 0) {
    //         try {
    //             const ws = require('ws');

    //             const address = `ws://${streamerCfg.ip}:${streamerCfg.port}`;
    //             const message = {
    //                 contract_id: nomadContext.hpContext.contractId,
    //                 cluster: nomadContext.clusterContext.getClusterNodes()
    //             };

    //             const connection = new ws(address)

    //             connection.onopen = () => {
    //                 connection.send(JSON.stringify(message));
    //                 connection.close();
    //                 resolve();
    //             }

    //             connection.onerror = (error) => {
    //                 connection.close();
    //                 reject(error);
    //             }
    //         }
    //         catch (e) {
    //             console.error(`${getDate()}:`, 'Stream web socket error: ', e);
    //             reject(e);
    //         }
    //     }
    // });

    // ///////////////////// End of the code for cluster info streaming /////////////////////

    await nomadContext.init();
    info("Exited Nomad Contract...");
}

const renewSignerList = async (xrplContext) => {
    if (xrplContext.hpContext.lclSeqNo % 3 !== 2)
        return;

    await xrplContext.init();

    console.log("----------- Renew Multi-Signing");
    await xrplContext.renewSignerList();
    console.log("Signer list renewed");
}

const removeXrplSigner = async (xrplContext, publickey, quorum = null) => {
    if (!publickey || xrplContext.hpContext.lclSeqNo % 3 !== 0)
        return;

    await xrplContext.init();

    console.log(`----------- Removing ${publickey} from signer list`);
    await xrplContext.removeXrplSigner(publickey, { quorum: quorum });
    console.log("Signer removed");
}

const getSignerList = async (xrplContext) => {
    await xrplContext.init();

    console.log("----------- Getting the signer list");
    const signerList = xrplContext.getSignerList();
    console.log(signerList);
}

const multiSignTransaction = async (xrplContext) => {
    await xrplContext.init();

    const tx = await xrplContext.xrplAcc.prepareMakePayment(destinationAddress, "1000", "XRP")

    console.log("----------- Multi-Signing Transaction");
    await xrplContext.multiSignAndSubmitTransaction(tx);
    console.log("Transaction submitted");
}

// Checking Hot Pocket liveness.
const checkLiveness = async (hpContext, ip, port) => {

    const peer = new evp.Peer(ip, port);
    const checkLiveness = await hpContext.checkLiveness(peer);

    console.log(`Hotpocket liveness ${checkLiveness}`);
}

////// TODO: This is a temporary function and will be removed in the future //////
const prepareMultiSigner = async (xrplContext, signerCount, isSigner, quorum) => {
    try {
        await xrplContext.init();

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