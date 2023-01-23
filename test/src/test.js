const HotPocket = require('hotpocket-nodejs-contract');
const evp = require('everpocket-nodejs-contract');
const fs = require('fs');
const archiver = require('archiver');

const testContract = async (ctx) => {
    const baseContext = new evp.BaseContext(ctx);
    const contractContext = new evp.ContractContext(ctx);
    const evernodeContext = new evp.EvernodeContext(ctx);


    if (!ctx.readonly) {
        const tests = [
            // () => testVote(baseContext),
            // () => getContractConfig(contractContext),
            // () => updateContractConfig(contractContext),
            // () => updateContract(contractContext),
            // () => updateUnl(contractContext, ctx),
            // () => updatePeers(contractContext),
            // () => randomNumber(baseContext),
            // () => uuidv4(baseContext),
            () => multiSignTransaction(evernodeContext)
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
const randomNumber = async (evpContext) => {
    const random1 = await evpContext.random();
    const random2 = await evpContext.random();

    console.log('Random number 1', random1);
    console.log('Random number 2', random2);
}

// Get an uuid.
const uuidv4 = async (evpContext) => {
    const uuid1 = await evpContext.uuid4();
    const uuid2 = await evpContext.uuid4();

    console.log('UUID 1', uuid1);
    console.log('UUID 2', uuid2);
}

const multiSignTransaction = async (evernodeContext) => {

    // user inputs
    const signerList = []; // [{ account: "rafef45v45efefe", weight: 1 }, { account: "rafef4gg5v45efefe", weight: 1 }];
    const quorum = 3;
    const masterKey = "ssJ3BwXRpH5TLDnJDFNNZUJziX3oC";
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
        console.log("----------- Multi-Signing Test")
        await evernodeContext.prepareMultiSigner(quorum, masterKey, signerList, 2000, true);
        console.log("Signer list added");
        await evernodeContext.submitTransaction(tx);

    } catch (e) {
        console.log(e);
    } finally {
        await evernodeContext.removeMultiSigner();
    }
}

const hpc = new HotPocket.Contract();
hpc.init(testContract);