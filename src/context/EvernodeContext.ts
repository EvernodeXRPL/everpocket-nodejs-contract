import { XrplContext } from ".";
import { ClusterManager } from "../cluster";
import { AcquireOptions, EvernodeContextOptions } from "../models/evernode";
import * as evernode from 'evernode-js-client';
import { Buffer } from 'buffer';


class EvernodeContext {
    public hpContext: any;
    public xrplContext: XrplContext;
    public clusterManager: ClusterManager;
    private registryClient: any;

    constructor(hpContext: any, address: string, governorAddress: string, options: EvernodeContextOptions = {}) {
        this.hpContext = hpContext;
        this.xrplContext = options.xrplContext || new XrplContext(this.hpContext, address, null, options.xrplOptions);
        this.clusterManager = new ClusterManager(hpContext.publicKey);

        evernode.Defaults.set({
            xrplApi: this.xrplContext.xrplApi,
            governorAddress: governorAddress
        });
    }

    async #getRegistryClient() {
        if (!this.registryClient) {
            this.registryClient = await evernode.HookClientFactory.create(evernode.HookTypes.registry);
            await this.registryClient.connect();
        }
        return this.registryClient;
    }

    async init(): Promise<void> {
        // Check for pending transactions and their completion.
    }

    async addNode(options: AcquireOptions = {}): Promise<void> {
        try {
            await this.xrplContext.init();

            // Use provided host or select a host randomly.
            const hostAddress = options.host || await this.selectHost();

            // Perform acquire txn on the selected host.
            await this.acquireSubmit(hostAddress, this.hpContext.lclHash, options);


            // Record as a pending transaction.
        } catch (e) {
            console.error(e);
        } finally {
            await this.xrplContext.deinit();
        }
    }

    async removeNode(pubkey: string): Promise<void> {
        // // Update patch config.
        // let config = await this.hpContext.getConfig();
        // config.unl = config.unl.filter((p: string) => p != pubkey);
        // await this.hpContext.updateConfig(config);

        // // Update peer list.
        // let peer = '';// find peer from local state file.
        // await this.hpContext.updatePeers(null, [peer]);
    }

    async selectHost(): Promise<string> {

        const lclBasedNum = parseInt(this.hpContext.lclHash.substr(0, 2), 16);

        // Choose from hosts that have available hosts.
        const vacantHosts = (await this.getHosts()).sort((a: { address: number; }, b: { address: number; }) => a.address > b.address ? -1 : 1);
        const unusedHosts = vacantHosts.filter((h: { address: string; }) => !this.clusterManager.nodes.find(n => n.account === h.address));

        let hostAddress = null;
        if (unusedHosts.length > 0) {
            console.log(`Selecting a host from ${unusedHosts.length} unused hosts.`);
            hostAddress = unusedHosts[lclBasedNum % unusedHosts.length].address
        }

        console.log("Selected Host Address", hostAddress);

        return hostAddress;
    }

    async acquireSubmit(hostAddress: string, lclHash: string, options: AcquireOptions = {}): Promise<any> {

        // Get transaction details to use for xrpl tx submission.
        const hostClient = new evernode.HostClient(hostAddress);
        const leaseOffers = await hostClient.getLeaseOffers();
        const leaseOffer = leaseOffers && leaseOffers[0];

        if (!leaseOffer)
            throw { reason: evernode.ErrorReasons.NO_OFFER, error: "No offers available." };

        const seed = Buffer.from(lclHash, "hex");

        // Encrypt the requirements with the host's encryption key (Specified in MessageKey field of the host account).
        const encKey = await hostClient.xrplAcc.getMessageKey();
        if (!encKey)
            throw { reason: evernode.ErrorReasons.INTERNAL_ERR, error: "Host encryption key not set." };

        const ecrypted = await evernode.EncryptionHelper.encrypt(encKey, options.instanceCfg, {
            iv: seed.slice(0, 16),
            ephemPrivateKey: seed.slice(0, 32),
        });

        await this.xrplContext.buyURIToken(
            leaseOffers[0],
            [
                { type: evernode.EventTypes.ACQUIRE_LEASE, format: 'base64', data: ecrypted }
            ],
            [
                { name: evernode.HookParamKeys.PARAM_EVENT_TYPE_KEY, value: evernode.EventTypes.ACQUIRE_LEASE }
            ],
            options
        );
    }

    async getHosts() {
        const registryClient = await this.#getRegistryClient();
        const allHosts = await registryClient.getActiveHosts();
        return allHosts.filter((h: { maxInstances: number; activeInstances: number; }) => (h.maxInstances - h.activeInstances) > 0);
    }
}

export default EvernodeContext;