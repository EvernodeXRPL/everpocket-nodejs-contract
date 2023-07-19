const HotPocket = require('hotpocket-nodejs-contract');
const evp = require('everpocket-nodejs-contract');
const fs = require('fs');

const masterAddress = "rh8dQMntB4Rfq2tFLNdhTXAS1jmTkKeyyL";
const masterSecret = "snthHQo7X95yNibxooVQaZu3W4s8e";
// const masterAddress = "rEPcjCRnb92LLBpszboyn9Qf9uvTk3nNET";
// const masterSecret = "ssnUDXJicaoaQ67K1Fjw9m7NqwPNb";
// const masterAddress = "rNZqGPtr4EqzQXua7Wnw8gphcSrmms11KC";
// const masterSecret = "sniJWbbBKMXaDJMGXedPsdQn6e8Wy";
const destinationAddress = "rwL8pyCFRZ6JcKUjfg61TZKdj3TGaXPbot";
const signerWeight = 1;
const ip = "localhost";
const port = 8081;

const evernodeGovernor = "rGVHr1PrfL93UAjyw3DWZoi9adz2sLp2yL";

const MAX_ACQUIRES = 5;
const MAX_CLUSTER = 5;

const nomadOptions = {
    targetNodeCount: 25,
    targetLifeMoments: 2,
    preferredHosts: [
        "rP4zJ6ZWoHYC8cj6GkWHyiUJT15xwzLCLm",
        "rwqWhVJZ1SgXBBpBNQ194sdDNBbUZTaTem",
        "rLkSafYKvf5vBfFyQMVB6touhUnS6j5HR9",
        "rKUq1MnzfqnZAUArkE2ttL1n4UavwUzGrn",
        "rahTwEZefDFtShmgjsArNzxTCT8Zj8HXKN",
        "rw4fF5LDQsonyoYiEYrgPgTC2asnCQQZ6g",
        "rrssGm5h8aWncB3CGMuQ2WGfexubbeCTLV",
        "rEmGJ3uu7DSrNfM5JSZnFtMjYhLbSmVJ3A",
        "rfBQaUjF9UZWjdJ33hGDeas1hEXK7DmfCV",
        "r4dVikgRzdVuZcFfMWJWiUo8iJxmYGDmiS",
        "r9kCyGhhwGj3KaSGemFrrPVpXkzVtT2b1N",
        "rKqDVS5fYEWDNivosnFiri1bXfqt2ebj7q",
        "rErmdQZLmAauqjY7ig8KeLAGhfxeVAHHnA",
        "rnG2Q9cqrmCvWNZvMG4JHzG96deqEg5HDx",
        "rB2SBLDLBUwaUV2QegZxoztpkJLgh1Kvcx",
        "r4LF5L5tq7JdsAUY5YUXjAU1J6xZtm47HP",
        "rEiP3muQXyNVuASSEfGo9tGjnhoPHK8oww",
        "rGnsENqQKqPNQKWMSNxbZcMuubjJaaBpf5",
        "rMaHq7P7ibkbeiykRGyTsdyFEDBRGrLdx6",
        "rHJqCseZFzCveSTdtJuDNpD4ARoMy41E1C",
        "rMu8RLEKTtyWuhko1F5dVZoUAiVpRpi5GB",
        "rhsBuUnoV1yGSpSVYgzFMFeTcFLvg8ZQnh",
        "rhYqbRQpSy7RtQtXjfurprdB4Gj8PAJW2X",
        "rfZFCjpFD1zhJP3DsSWy9NVUCmm9Kkhg4w",
        "raRpwPCbMGfTgEDnHD7nQCUYbXwkNYKThA",
        "rD6Lgdxzq3dr42JD4F1bwF86BaCwAaeQWu",
        "rfuvNytxfavNgN57WqGfQR3duhUAsy8PEY",
        "rHf3nHTdrMRKwP8hVXifsZAGQxhixmrvgu",
        "r3VUJWNCHxq5yV1fcfXPaJ3ozcL2SSy88F",
        "rDMiTtcVEnSvoeS8uh71fS2vdpQpP33gCN",
        "rDt8RqBshBPGRgeWdjpBRzoMYxmLwZKCKo",
        "rEtBQShEjRXGPVC9AsmySJSaVtSsVZcR6p",
        "rsuXd4vQpzyktVhxNMEZdgKLLmA1j4VJQi",
        "rNcXiJ89mQ8ZEx6Wfwq9eMd9mXXn5JSSKs",
        "r4HrG4pxwdbfdqDQkaVKHeCVjLmNfKsyTE",
        "rQLYPp4iGPraESkvkw6Ta5kacgigAabYQQ",
        "rstzrHRW8RMo6Gmvme7DAnbAnZP8VesbA2",
        "rKrSVLgaKQANTSEv1bY4cT4PVThCzFXpX6",
        "r3Y9u4azTbcT95Ja7CDJzUHXV7N3sCSKP1",
        "rhKW2ihYKtd71yeuZK7f2KPXBXJ6byVdVo",
        "rKqvyMy6T4Uuefutu242yVKrtqRRwLxm7a",
        "rH1NTQ73pksxX7Z8rEN6XrcibgEd34uJXo",
        "rMCwzwHRLr8CtHW4RkSXSyTT79Srhn3fYn",
        "rDVBMoZ6QcMS12Ty3aBNwrNPPfvHHdvkde",
        "rL8TFrxk2tAAeRdf2z8AwoNeEdkEhvybk5",
        "rKuuh8E2HR4wxxKDu8whZZw7icgSHxq8aE"
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
                console.log("Received user input", buf.toString());
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
            // () => checkLiveness(utilityContext, ip, port),
            // () => acquireNewNode(evernodeContext),
            // () => extendNode(evernodeContext),
            () => addNewClusterNode(clusterContext),
            // () => removeNode(clusterContext),
            // () => runNomadContract(nomadContext)
        ];

        try {
            for (const test of tests) {
                await test();
            }
        }
        catch (e) {
            console.error(e);
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
    console.log('Second round votes', thirdList);
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
            image: "evernodedev/sashimono:hp.latest-ubt.20.04-njs.16",
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
    await nomadContext.clusterContext.init();

    const pendingNodes = nomadContext.clusterContext.getPendingNodes();
    const clusterNodes = nomadContext.clusterContext.getClusterNodes();

    console.log(`There are ${pendingNodes.length} pending nodes and ${clusterNodes.length} cluster nodes.`);

    console.log("Cluster nodes: ", clusterNodes.map(c => c.pubkey));
    console.log("Unl: ", nomadContext.clusterContext.hpContext.getContractUnl().map(n => n.publicKey));

    //////////////////// Start of test code for the streamer ////////////////////

    if (nomadContext.hpContext.lclSeqNo % 5 === 0) {
        try {
            const ws = require('ws');

            const port = 8080;
            const ip = '45.76.178.184';
            const address = `ws://${ip}:${port}`;
            const message = {
                contract_id: nomadContext.hpContext.contractId,
                cluster: nomadContext.clusterContext.getClusterNodes()
            };

            const connection = new ws(address)

            connection.onopen = () => {
                connection.send(JSON.stringify(message));
                connection.close();
            }

            connection.onerror = (error) => {
                connection.close();
                throw error;
            }
        }
        catch (e) {
            console.error('Stream web socket error: ', e);
        }
    }

    ///////////////////// End of test code for the streamer /////////////////////

    await nomadContext.init();
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
const checkLiveness = async (utilityContext, ip, port) => {
    const checkLiveness = await utilityContext.checkLiveness(ip, port);

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