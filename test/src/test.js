const HotPocket = require('hotpocket-nodejs-contract');
const evp = require('everpocket-nodejs-contract');
const fs = require('fs');
const archiver = require('archiver');

const exectsFile = "exects.txt";

const testContract = async (ctx) => {
    if (!ctx.readonly) {
        const tests = [
            () => testVote(ctx),
            () => getContractConfig(ctx),
            () => updateContractConfig(ctx),
            () => updateContract(ctx),
            () => updateUnl(ctx),
        ];

        for (const test of tests) {
            await test();
        }

        fs.appendFileSync(exectsFile, "ts:" + ctx.timestamp + "\n");
    }
}

// Voting examples
const testVote = async (ctx) => {
    const context = new evp.VoteContext(ctx);

    ctx.unl.onMessage((node, msg) => {
        context.feedUnlMessage(node, msg);
    })

    const r1 = context.vote("firstRound", [1, 2], new evp.AllVoteElector(10, 1000));
    const r2 = context.vote("secondRound", [6, 7], new evp.AllVoteElector(10, 1000));

    console.log((await r1).map(v => v.data));
    console.log((await r2).map(v => v.data));
}

const getContractConfig = async (ctx) => {
    const context = new evp.ContractContext(ctx);
    const config = await context.getConfig();

    console.log(JSON.stringify(config));
}

const updateContractConfig = async (ctx) => {
    const context = new evp.ContractContext(ctx);
    let config = await context.getConfig();
    config.consensus.roundtime = 1000;
    await context.updateConfig(config);

    console.log(`Config Updated`);
}

const updateContract = async (ctx) => {
    const context = new evp.ContractContext(ctx);
    const bundle = 'contract_bundle';
    const config = `${bundle}/contract.config`;
    const bin = `${bundle}/index.js`;

    fs.mkdirSync(bundle);
    fs.writeFileSync(config, JSON.stringify({
        bin_path: '/usr/bin/node',
        bin_args: 'index.js'
    }, null, 4));
    fs.copyFileSync('index.js', bin);

    const zip = `bundle.zip`;

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

    fs.rmSync(bundle, { recursive: true });
    context.updateContract(fs.readFileSync(zip));
    fs.rmSync(zip);
}

const updateUnl = async (ctx) => {
    const context = new evp.ContractContext(ctx);
    const removed = 'removed.txt';
    const unlList = ctx.unl.list();
    console.log(`Current unl count: ${unlList.length}`)
    
    if (!fs.existsSync(removed)) {
        const pubKey = unlList[0].publicKey;
        context.removeNodes([pubKey]);
        fs.writeFileSync(removed, pubKey);
    }
    else {
        const pubKey = fs.readFileSync(removed).toString();
        context.addNodes([pubKey]);
        fs.rmSync(removed);
    }
}

const hpc = new HotPocket.Contract();
hpc.init(testContract);