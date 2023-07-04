const readline = require('readline');
const HotPocket = require('hotpocket-js-client');

async function main() {
    if (process.argv.length < 4) {
        console.log('Server and port required');
        return;
    }
    const server = 'wss://' + process.argv[2] + ':' + process.argv[3]

    const keys = await HotPocket.generateKeys();

    const pkhex = Buffer.from(keys.publicKey).toString('hex');
    console.log('My public key is: ' + pkhex);

    const hpc = await HotPocket.createClient([server], keys);

    // This will get fired if HP server disconnects unexpectedly.
    hpc.on(HotPocket.events.disconnect, () => {
        console.log('Disconnected');
        rl.close();
    })

    // This will get fired as servers connects/disconnects.
    hpc.on(HotPocket.events.connectionChange, (server, action) => {
        console.log(server + " " + action);
    })

    // This will get fired when contract sends outputs.
    hpc.on(HotPocket.events.contractOutput, (r) => {
        r.outputs.forEach(o => {
            console.log(`Output (ledger:${r.ledgerSeqNo})>> ${outputLog}`);
        });
    })

    // This will get fired when the unl public key list changes.
    hpc.on(HotPocket.events.unlChange, (unl) => {
        console.log("New unl received:");
        console.log(unl); // unl is an array of public keys.
    })

    // This will get fired when any ledger event occurs (ledger created, sync status change).
    hpc.on(HotPocket.events.ledgerEvent, (ev) => {
        console.log(ev);
    })

    // This will get fired when any health event occurs (proposal stats, connectivity changes...).
    hpc.on(HotPocket.events.healthEvent, (ev) => {
        console.log(ev);
    })

    // Establish HotPocket connection.
    if (!await hpc.connect()) {
        console.log('Connection failed.');
        return;
    }
    console.log('HotPocket Connected.');

    // After connecting, we can subscribe to events from the HotPocket node.
    await hpc.subscribe(HotPocket.notificationChannels.unlChange);
    // await hpc.subscribe(HotPocket.notificationChannels.ledgerEvent);
    // await hpc.subscribe(HotPocket.notificationChannels.healthEvent);

    // start listening for stdin
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    // On ctrl + c we should close HP connection gracefully.
    rl.on('SIGINT', () => {
        console.log('SIGINT received...');
        rl.close();
        hpc.close();
    });

    console.log("Ready to accept inputs.");

    const input_pump = () => {
        rl.question('', (inp) => {

            if (inp.length > 0) {
                if (inp === 'cluster') {
                    hpc.submitContractReadRequest(JSON.stringify({
                        type: 'cluster_nodes'
                    })).then(reply => {
                        const res = JSON.parse(reply);
                        if (res && res.type === 'cluster_nodes' && res.status === 'ok')
                            console.log(res.data);
                        else
                            console.log(res);
                    });
                }
            }

            input_pump();
        })
    }
    input_pump();
}

main();