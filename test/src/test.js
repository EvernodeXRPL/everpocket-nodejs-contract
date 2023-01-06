const HotPocket = require('hotpocket-nodejs-contract');
const evp = require('everpocket-nodejs-contract');

const test = async (ctx) => {
    // Your smart contract logic.
    console.log('Blank contract');
}

const hpc = new HotPocket.Contract();
hpc.init(test);