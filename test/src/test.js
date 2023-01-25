const HotPocket = require('hotpocket-nodejs-contract');
const evp = require('everpocket-nodejs-contract');
const fs = require('fs');
const archiver = require('archiver');

const testContract = async (ctx) => {
    const baseContext = new evp.BaseContext(ctx);
    const contractContext = new evp.ContractContext(ctx);
    const evernodeContext = new evp.EvernodeContext(ctx);
    const evernodeContextTemp = new evp.EvernodeContext(ctx); // TODO: This is a temporary instance and will be removed in the future

    if (!ctx.readonly) {
        // Listen to incoming unl messages and feed them to elector.
        ctx.unl.onMessage((node, msg) => {
            baseContext.feedUnlMessage(node, msg);
            contractContext.feedUnlMessage(node, msg);
            evernodeContext.feedUnlMessage(node, msg);
            evernodeContextTemp.feedUnlMessage(node, msg); // TODO: This is a temporary function and will be removed in the future
        })

        const tests = [
            () => prepareMultiSigner(evernodeContextTemp, ctx), // TODO: This is a temporary function and will be removed in the future
            // () => testVote(baseContext),
            // () => getContractConfig(contractContext),
            // () => updateContractConfig(contractContext),
            // () => updateContract(contractContext),
            // () => updateUnl(contractContext, ctx),
            // () => updatePeers(contractContext),
            // () => randomNumber(baseContext),
            // () => uuidv4(baseContext),
            // () => multiSignTransaction(evernodeContext),
            () => renewSignerList(evernodeContext)
        ];

        for (const test of tests) {
            await test();
        }
    }
}

// Voting examples.
const testVote = async (baseContext) => {
    // Send votes to an election.
    const r1 = baseContext.vote("firstRound", [1, 2], new evp.AllVoteElector(10, 1000));
    const r2 = baseContext.vote("secondRound", [6, 7], new evp.AllVoteElector(10, 1000));

    console.log('First round votes', (await r1).map(v => v.data));
    console.log('Second round votes', (await r2).map(v => v.data));
}

// Get contract config examples.
const getContractConfig = async (contractContext) => {
    // Get current contract config.
    const config = await contractContext.getConfig();

    console.log('Contract config', JSON.stringify(config));
}

// Update contract config examples.
const updateContractConfig = async (contractContext) => {
    // Print environment variable if exist.
    if (process.env.TEST_VAR)
        console.log(`Env TEST_VAR="${process.env.TEST_VAR}"`);
    else
        console.log('Env TEST_VAR not found');

    let config = new evp.ContractConfig();
    config.consensus = { roundtime: 1000 };
    config.environment = {
        'TEST_VAR': 'test'
    }

    // Update the contract config with updated one.
    await contractContext.updateConfig(config);
}

// Update contract config examples.
const updateContract = async (contractContext) => {
    /*
    In the real case scenario this bundle will be uploaded by the user from a client which can be collected as follows.
    for (const input of user.inputs) {
        const buf = await ctx.users.read(input);
        const msg = bson.deserialize(buf);
        contractContext.updateContract(msg.content);
    }
    */

    // For testing purpose,
    // In following code, a mock contract bundle will be created using current contract binary and a updated config.

    ///// Sample contract bundle creation /////
    const bundle = 'contract_bundle';
    const config = `${bundle}/contract.config`;
    const bin = `${bundle}/index.js`;

    fs.mkdirSync(bundle);
    // Sample contract config.
    fs.writeFileSync(config, JSON.stringify({
        bin_path: '/usr/bin/node',
        bin_args: 'index.js',
        consensus: {
            roundtime: 4000
        }
    }, null, 4));

    // Place current index.js as new binary
    fs.copyFileSync('index.js', bin);

    const zip = `bundle.zip`;
    // Compress contract bundle.
    await new Promise((resolve, reject) => {
        const output = fs.createWriteStream(zip);
        const archive = archiver('zip', {
            zlib: { level: 9 }
        });
        output.on('close', () => {
            resolve(zip);
        });
        archive.on('error', (err) => {
            reject(err);
        });
        archive.pipe(output);
        archive.directory(bundle, false);
        archive.finalize();
    });

    // Remove bundle directory.
    fs.rmSync(bundle, { recursive: true });

    // Send bundle content buffer as it's received from user input.
    await contractContext.updateContract(fs.readFileSync(zip));

    // Remove the zip file after update.
    fs.rmSync(zip);

    ///////////////////////////////////////////
}

// Update unl examples.
const updateUnl = async (contractContext, ctx) => {
    // In this test in first consensus round, remove the last node from the unl and save the pubkey in a text file.
    // In next consensus round add the pubkey again to the unl and remove the text file.
    // So, repeatedly in every one after other consensus round the node will be removed and added.
    const removedNode = 'removed_node.txt';
    const unlList = ctx.unl.list();
    console.log(`Current unl count: ${unlList.length}`)

    // Remove node if text file does not exist.
    if (!fs.existsSync(removedNode)) {
        const pubKey = unlList[unlList.length - 1].publicKey;
        await contractContext.removeUnlNodes([pubKey]);
        fs.writeFileSync(removedNode, pubKey);
    }
    // Add node if text file exist.
    else {
        const pubKey = fs.readFileSync(removedNode).toString();
        await contractContext.addUnlNodes([pubKey]);
        fs.rmSync(removedNode);
    }
}

// Update peers examples.
const updatePeers = async (contractContext) => {
    // In this test in first consensus round, remove the 8083 peer from the peer.
    // In next consensus round add the peer again to the peer list.
    // So, repeatedly in every one after other consensus round the peer will be removed and added.
    const removedPeer = 'removed_peer.txt';
    const peer = new evp.Peer('node3', 22863);

    // Remove peer is text file does not exist.
    if (!fs.existsSync(removedPeer)) {
        await contractContext.removePeers([peer]);
        fs.writeFileSync(removedPeer, '22863');
    }
    // Add peer if text file exist.
    else {
        await contractContext.addPeers([peer.toString()]);
        fs.rmSync(removedPeer);
    }
}

// Get a random number.
const randomNumber = async (baseContext) => {
    const random1 = await baseContext.random();
    const random2 = await baseContext.random();

    console.log('Random number 1', random1);
    console.log('Random number 2', random2);
}

// Get an uuid.
const uuidv4 = async (baseContext) => {
    const uuid1 = await baseContext.uuid4();
    const uuid2 = await baseContext.uuid4();

    console.log('UUID 1', uuid1);
    console.log('UUID 2', uuid2);
}

const multiSignTransaction = async (evernodeContext) => {
    const masterAddress = "r3KvcExtEwa851uV8nJmosGkcwG8i1Bpzo";
    const tx = {
        TransactionType: "Payment",
        Account: "r3KvcExtEwa851uV8nJmosGkcwG8i1Bpzo",
        Destination: "rNbmMCHbSjkpGLNfqYxKT8NU1Bxue8r6s3",
        Amount: "1000",
        Fee: "12",
        Flags: 2147483648
    };

    await evernodeContext.setMultiSigner(masterAddress);

    try {
        console.log("----------- Multi-Signing Test");
        await evernodeContext.multiSignAndSubmitTransaction(tx);
        console.log("Transaction submitted");

    } catch (e) {
        console.error(e);
    } finally {
        await evernodeContext.removeMultiSigner();
    }
}

const renewSignerList = async (evernodeContext) => {
    const masterAddress = "r3KvcExtEwa851uV8nJmosGkcwG8i1Bpzo";

    await evernodeContext.setMultiSigner(masterAddress);

    try {
        console.log("----------- Renew Multi-Signing");
        await evernodeContext.renewSignerList();
        console.log("Signer list renewed");

    } catch (e) {
        console.error(e);
    } finally {
        await evernodeContext.removeMultiSigner();
    }
}

////// TODO: This is a temporary function and will be removed in the future //////
const prepareMultiSigner = async (evernodeContext, ctx) => {
    const masterAddress = "r3KvcExtEwa851uV8nJmosGkcwG8i1Bpzo";
    const keyPath = `../${masterAddress}.key`;
    if (fs.existsSync(keyPath))
        return;

    await evernodeContext.setMultiSigner(masterAddress);

    try {
        const kp = require('ripple-keypairs');
        const nodeSecret = kp.generateSeed({ algorithm: "ecdsa-secp256k1" });
        const keypair = kp.deriveKeypair(nodeSecret);
        const signer = {
            account: kp.deriveAddress(keypair.publicKey),
            secret: nodeSecret
        };

        // Generate and collect signer list if signer list isn't provided.
        const signerList = (await evernodeContext.vote(`multiSignerPrepare`, [{
            account: signer.account,
            weight: 1
        }], new evp.AllVoteElector(ctx.unl.list().length, 4000))).map(ob => ob.data);

        const txSubmitInfo = await evernodeContext.getTransactionSubmissionInfo();
        if (txSubmitInfo) {
            const tx = {
                Flags: 0,
                TransactionType: "SignerListSet",
                Account: masterAddress,
                SignerQuorum: 3,
                SignerEntries: [
                    ...signerList.map(signer => ({
                        SignerEntry: {
                            Account: signer.account,
                            SignerWeight: signer.weight
                        }
                    })).sort((a, b) => a.SignerEntry.Account < b.SignerEntry.Account ? -1 : 1)
                ],
                Sequence: txSubmitInfo.sequence,
                LastLedgerSequence: txSubmitInfo.maxLedgerSequence,
                Fee: '10'
            }

            const xrpl = require('xrpl');
            const wallet = xrpl.Wallet.fromSeed("ssJ3BwXRpH5TLDnJDFNNZUJziX3oC");
            const signed = wallet.sign(tx);

            const client = new xrpl.Client('wss://hooks-testnet-v2.xrpl-labs.com');
            await client.connect();
            const res = await client.request({ command: 'submit', tx_blob: signed.tx_blob });
            await client.disconnect();

            if (res.result.engine_result === "tesSUCCESS")
                console.log("Transaction submitted successfully");
            else if (res.result.engine_result === "tefPAST_SEQ" || res.result.engine_result === "tefALREADY")
                console.log("Proceeding with pre-submitted transaction");
            else
                throw err;

            fs.writeFileSync(keyPath, JSON.stringify(signer));
            console.log('Prepared multi signing');
        }
        else {
            throw 'Could not get transaction submission info';
        }
    }
    catch (e) {
        console.log(e);
    } finally {
        await evernodeContext.removeMultiSigner();
    }
}
////////////////////////////////////////////////////////////////////////////

const hpc = new HotPocket.Contract();
hpc.init(testContract);