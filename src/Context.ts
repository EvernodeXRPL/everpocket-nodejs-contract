import * as EventEmitter from 'events';
import { Buffer } from 'buffer';
import * as fs from 'fs';
import { JSONHelpers } from './utils';
import * as decompress from 'decompress';
import { ContractConfig, Peer } from './models';
import { UnlNode } from './models';
import VoteSerializer from './vote/VoteSerializer';
import { AllVoteElector } from './vote/vote-electors';
import { v4 as uuidv4 } from 'uuid';

const PATCH_CFG = "../patch.cfg";
const HP_POST_EXEC_SCRIPT = "post_exec.sh";

class Context {
    private hpContext: any;
    private eventEmitter: EventEmitter = new EventEmitter();
    private voteSerializer: VoteSerializer;
    private listened: boolean = false;

    /**
     * HotPocket contract context handler.
     * @param hpContext HotPocket contract context.
     */
    public constructor(hpContext: any, options: any = {}) {
        this.hpContext = hpContext;
        this.voteSerializer = options.voteSerializer || new VoteSerializer();
    }

    /**
     * Initialize listener to the incoming unl messages.
     */
    private initUnlListener(): void {
        if (!this.listened) {
            // Listen to incoming unl messages and feed them to elector.
            this.hpContext.unl.onMessage((node: UnlNode, msg: Buffer) => {
                this.feedUnlMessage(node, msg);
            });
            this.listened = true;
        }
    }

    /**
     * Deserialize UNL message and feed to the listeners.
     * @param sender UNLNode which has sent the message.
     * @param msg Message received from UNL.
     */
    public feedUnlMessage(sender: UnlNode, msg: Buffer): void {
        const vote = this.voteSerializer.deserializeVote(msg);
        vote && this.eventEmitter.emit(vote.election, sender, vote.data);
    }

    /**
     * Send the votes to a election.
     * @param electionName Election identifier to vote for.
     * @param votes Votes for the election.
     * @param elector Elector which evaluates the votes.
     * @returns Evaluated votes as a promise.
     */
    public async vote(electionName: string, votes: any[], elector: AllVoteElector): Promise<any[]> {
        this.initUnlListener();

        // Start the election.
        const election = elector.election(electionName, this.eventEmitter);

        // Cast our vote(s).
        await Promise.all(new Array().concat(votes).map(v => {
            const msg = this.voteSerializer.serializeVote(electionName, v);
            return this.hpContext.unl.send(msg);
        }));

        // Get election result.
        return await election;
    }

    /**
     * Get current contract configuration.
     * @returns Contract configuration.
     */
    public async getConfig(): Promise<ContractConfig> {
        // Get the value from contract config and cast to ContractConfig model.
        return JSONHelpers.castToModel<ContractConfig>(await this.hpContext.getConfig(), ['environment']);

    }

    /**
     * Update contract configuration.
     * @param config Configuration with the values that needed to be updated.
     */
    public async updateConfig(config: ContractConfig): Promise<void> {
        let patchCfg: ContractConfig = await this.getConfig();

        // Take only the non empty not null values since the values are optional.

        if (config.binPath)
            patchCfg.binPath = config.binPath;

        if (config.binArgs)
            patchCfg.binArgs = config.binArgs;

        if (config.environment)
            patchCfg.environment = config.environment;

        if (config.version)
            patchCfg.version = config.version;

        if (config.maxInputLedgerOffset == 0 || config.maxInputLedgerOffset)
            patchCfg.maxInputLedgerOffset = config.maxInputLedgerOffset;

        if (config.unl)
            patchCfg.unl = config.unl;

        if (config.consensus) {
            if (!patchCfg.consensus)
                patchCfg.consensus = {};

            if (config.consensus.mode)
                patchCfg.consensus.mode = config.consensus.mode;

            if (config.consensus.roundtime == 0 || config.consensus.roundtime)
                patchCfg.consensus.roundtime = config.consensus.roundtime;

            if (config.consensus.stageSlice == 0 || config.consensus.stageSlice)
                patchCfg.consensus.stageSlice = config.consensus.stageSlice;

            if (config.consensus.threshold == 0 || config.consensus.threshold)
                patchCfg.consensus.threshold = config.consensus.threshold;
        }

        if (config.npl) {
            if (!patchCfg.npl)
                patchCfg.npl = {};

            if (config.npl.mode)
                patchCfg.npl.mode = config.npl.mode;
        }

        if (config.roundLimits) {
            if (!patchCfg.roundLimits)
                patchCfg.roundLimits = {};

            if (config.roundLimits.userInputBytes === 0 || config.roundLimits.userInputBytes)
                patchCfg.roundLimits.userInputBytes = config.roundLimits.userInputBytes;

            if (config.roundLimits.userOutputBytes === 0 || config.roundLimits.userOutputBytes)
                patchCfg.roundLimits.userOutputBytes = config.roundLimits.userOutputBytes;

            if (config.roundLimits.nplOutputBytes === 0 || config.roundLimits.nplOutputBytes)
                patchCfg.roundLimits.nplOutputBytes = config.roundLimits.nplOutputBytes;

            if (config.roundLimits.procCpuSeconds === 0 || config.roundLimits.procCpuSeconds)
                patchCfg.roundLimits.procCpuSeconds = config.roundLimits.procCpuSeconds;

            if (config.roundLimits.procMemBytes === 0 || config.roundLimits.procMemBytes)
                patchCfg.roundLimits.procMemBytes = config.roundLimits.procMemBytes;

            if (config.roundLimits.procOfdCount === 0 || config.roundLimits.procOfdCount)
                patchCfg.roundLimits.procOfdCount = config.roundLimits.procOfdCount;
        }

        // Cast to a snake case object before sending to update.
        await this.hpContext.updateConfig(JSONHelpers.castFromModel(patchCfg, ['environment']));
    }

    /**
     * Add public keys to the contract UNL.
     * @param pubKeys List of public keys that needed to be added.
     */
    public async addUnlNodes(pubKeys: string[]) {
        let config = await this.getConfig();
        if (!config.unl)
            config.unl = [];
        config.unl.push(...pubKeys);
        await this.hpContext.updateConfig(JSONHelpers.castFromModel(config, ['environment']));
    }

    /**
     * Remove public keys from contract UNL.
     * @param pubKeys Public keys to remove.
     */
    public async removeUnlNodes(pubKeys: string[]) {
        let config = await this.getConfig();
        if (config.unl)
            config.unl = config.unl.filter(p => !pubKeys.includes(p));
        await this.hpContext.updateConfig(JSONHelpers.castFromModel(config, ['environment']));
    }

    /**
     * Add peers to the peer list.
     * @param peers Peers to add.
     */
    public async addPeers(peers: Peer[]): Promise<void> {
        await this.hpContext.updatePeers(peers.map(p => p.toString()), null);
    }

    /**
     * Remove peers from the peer list.
     * @param peers Peers to remove.
     */
    public async removePeers(peers: Peer[]): Promise<void> {
        await this.hpContext.updatePeers(null, peers.map(p => p.toString()));
    }

    /**
     * Update the contract binaries with given zip bundle.
     * @param bundle Byte array of the contract bundle zip (Can include: contract binaries, contract.config, install.sh).
     */
    public async updateContract(bundle: Buffer): Promise<void> {
        const CONFIG = "contract.config";
        const PATCH_CFG_BK = "../patch.cfg.bk";
        const INSTALL_SCRIPT = "install.sh";

        // Create a temporary directory and unzip the bundle into it.
        const tmpDir = `bundle_${this.hpContext.lclHash.substr(0, 10)}`;
        fs.mkdirSync(tmpDir);
        const files = await new Promise<decompress.File[]>((resolve, reject) => {
            decompress(bundle, tmpDir).then((files) => {
                resolve(files);
            }).catch((error) => {
                reject(error);
            });
        });

        // If there's a configuration file inside the bundle update the contract configuration with it.
        const cfgFile = files.find(f => f.path === CONFIG);
        if (cfgFile) {
            const cfg: ContractConfig = JSONHelpers.castToModel<ContractConfig>(JSON.parse(cfgFile.data.toString()), ['environment']);
            // Create backup of patch.config before update.
            fs.copyFileSync(PATCH_CFG, PATCH_CFG_BK);
            await this.updateConfig(cfg);
            fs.rmSync(`${tmpDir}/${CONFIG}`);
        }

        // Prepare the post execution script to place the new contract binaries.
        let postExecScript = `#!/bin/bash`;

        // Run install.sh script if there's one.
        const installScript = files.find(f => f.path === INSTALL_SCRIPT);
        if (installScript) {
            postExecScript += `
chmod +x ${tmpDir}/${INSTALL_SCRIPT}
./${tmpDir}/${INSTALL_SCRIPT}
installcode=$?

rm ${tmpDir}/${INSTALL_SCRIPT}

if [ "$installcode" -eq "0" ]; then
    echo "${INSTALL_SCRIPT} executed successfully."
else
    echo "${INSTALL_SCRIPT} ended with exit code:$installcode"
    rm -r ${tmpDir}
    rm ${PATCH_CFG} && mv ${PATCH_CFG_BK} ${PATCH_CFG}
    rm ${HP_POST_EXEC_SCRIPT}
    exit 1
fi`;
        }

        // If success place contract binaries in state directory, remove temporary directory and patch config backup
        postExecScript += `
mv ${tmpDir}/* ./ && rm -r ${tmpDir}
rm ${PATCH_CFG_BK}
exit 0
`;
        // Create post execution script and change it's permissions.
        fs.writeFileSync(HP_POST_EXEC_SCRIPT, postExecScript);
        fs.chmodSync(HP_POST_EXEC_SCRIPT, 0o777);
    }

    /**
     * Generates a random number.
     * @param timeout Maximum timeout to generate a random number.
     * @returns A random number between 0-1.
     */
    public async random(timeout: number = 1000): Promise<number | null> {
        this.initUnlListener();

        // Generate a random number.
        // Vote for the random number each node has generated.
        const number = Math.random();
        const rn = await this.vote(`randomNumber${this.hpContext.timestamp}`, [number], new AllVoteElector(this.hpContext.unl.list().length, timeout));

        // Take the minimum random number.
        return rn.length ? Math.min(...rn.map(v => v.data)) : null;
    }

    /**
     * Generates an uuid string.
     * @param timeout Maximum timeout to generate an uuid.
     * @returns An uuid.
     */
    public async uuid4(timeout: number = 1000): Promise<string | null> {
        this.initUnlListener();

        // Generate an uuid.
        // Vote for the uuid each node has generated.
        const uuid = uuidv4();
        const uuids = await this.vote(`uuid4${this.hpContext.timestamp}`, [uuid], new AllVoteElector(this.hpContext.unl.list().length, timeout));

        // Take the first ascending uuid.
        return uuids.length ? uuids.map(v => v.data).sort()[0] : null;
    }
}

export default Context;