import { VoteContext, XrplContext } from ".";
import { AcquireOptions, EvernodeContextOptions, Instance } from "../models/evernode";
import * as evernode from 'evernode-js-client';
import { Buffer } from 'buffer';
import { AllVoteElector } from "../vote/vote-electors";
import { URIToken } from "../models";
import * as fs from 'fs';
import * as kp from 'ripple-keypairs';
import { ClusterManager } from "../cluster";


const ACQUIRE_MANAGEMENT_CONFIG = {
    pendingAcquires: [],
    acquiredNodes: []
};

const TARGET_NODE_COUNT = 10;

class EvernodeContext {
    public hpContext: any;
    public acquireDataFile: string;
    public xrplContext: XrplContext;
    public clusterManager: ClusterManager;
    public voteContext: VoteContext;
    private registryClient: any;

    /**
     *
     * @param hpContext HotPocket context for this context.
     * @param address Address of the master account.
     * @param governorAddress Relevant Governor address
     * @param options
     */
    constructor(hpContext: any, address: string, governorAddress: string, options: EvernodeContextOptions = {}) {
        this.hpContext = hpContext;
        this.xrplContext = options.xrplContext || new XrplContext(this.hpContext, address, null, options.xrplOptions);
        this.clusterManager = new ClusterManager(hpContext.publicKey);
        this.voteContext = this.xrplContext.voteContext;
        this.acquireDataFile = "acquires.json"

        evernode.Defaults.set({
            xrplApi: this.xrplContext.xrplApi,
            governorAddress: governorAddress,
        });

        const jsonData = JSON.stringify(ACQUIRE_MANAGEMENT_CONFIG, null, 4);
        if (!fs.existsSync(this.acquireDataFile)) {
            fs.writeFileSync(this.acquireDataFile, jsonData);
            console.log('Created the information file.');
        }
    }

    /**
     * Creates a registry clients for this environment
     * @returns Created client.
     */
    async #getRegistryClient() {
        if (!this.registryClient) {
            this.registryClient = await evernode.HookClientFactory.create(evernode.HookTypes.registry);
            await this.registryClient.connect();
        }
        return this.registryClient;
    }

    /**
     * Find and record acquired instance details.
     */
    async init(): Promise<void> {
        try {
            await this.xrplContext.init();

            // Log current node acquisition details.
            await this.viewNodeDetails();

            // Check for pending transactions and their completion.
            const pendingAcquires = this.getPendingAcquires();

            if (pendingAcquires.length > 0) {
                const item = pendingAcquires[0];
                try {
                    const txnInfo = await this.xrplContext.xrplApi.getTxnInfo(item.txHash, {});
                    if (txnInfo && txnInfo.validated) {
                        const txList = await this.xrplContext.xrplAcc.getAccountTrx(txnInfo.ledger_index);
                        for (let t of txList) {
                            t.tx.Memos = evernode.TransactionHelper.deserializeMemos(t.tx?.Memos);
                            t.tx.HookParameters = evernode.TransactionHelper.deserializeHookParams(t.tx?.HookParameters);

                            const privateKey = fs.existsSync(`../${item.messageKey}.txt`) ?
                                fs.readFileSync(`../${item.messageKey}.txt`, { encoding: 'utf8', flag: 'r' }) : null;
                            const tenantClient = new evernode.TenantClient(this.xrplContext.xrplAcc.address, null, { messagePrivateKey: privateKey });
                            const res = await tenantClient.extractEvernodeEvent(t.tx);
                            if (res && (res?.name === evernode.TenantEvents.AcquireSuccess) && (res?.data?.acquireRefId === item.txHash)) {
                                const electionName = `share_payload${this.voteContext.getUniqueNumber()}`;
                                const elector = new AllVoteElector(1, 1000);
                                const payload = (privateKey ? await this.voteContext.vote(electionName, [res.data.payload], elector) : await this.voteContext.subscribe(electionName, elector)).map(ob => ob.data)[0];
                                await this.updateAcquiredNodeInfo({ host: item.host, ...payload.content });
                                await this.updatePendingAcquireInfo(item, "DELETE");
                                if (privateKey)
                                    fs.unlinkSync(`../${item.messageKey}.txt`);
                            }
                        }
                    }
                } catch (error) {
                    console.error(error);
                }

            }

        } catch (e) {
            console.error(e);
        } finally {
            await this.xrplContext.deinit();
        }
    }

    async addNode(pubkey: string, options = {}): Promise<void> {
        // Steps related to adding an acquired node to a cluster after performing the liveliness
    }

    /**
     * Acquires a node based on the provided options.
     * @param options Options related to a particular acquire operation.
     */

    async acquireNode(options: AcquireOptions = {}): Promise<void> {
        try {
            await this.xrplContext.init();

            const pendingAcquires = this.getPendingAcquires();

            // // Temporary upper bound.
            // if (pendingAcquires?.length >= 1)
            //     throw 'PENDING_ACQUIRES_LIMIT_EXCEEDED';

            // const acquiredNodes = this.getPendingAcquires();
            // if (acquiredNodes?.length >= TARGET_NODE_COUNT)
            //     throw 'NODE_TARGET_REACHED';

            // Use provided host or select a host randomly.
            const hostAddress = options.host || await this.decideHost();
            // Choose the lease offer
            const leaseOffer = await this.decideLeaseOffer(hostAddress);

            const messageKey = await this.decideMessageKey();

            // Perform acquire txn on the selected host.
            const res = await this.acquireSubmit(hostAddress, leaseOffer, messageKey, options);

            // Record as a acquire transaction.
            await this.updatePendingAcquireInfo({ host: hostAddress, leaseOfferIdx: leaseOffer.index, txHash: res.tx_json.hash, messageKey: messageKey });

            console.log("Successfully acquired a node.");

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

    /**
     * Decides a lease offer collectively.
     * @param hostAddress Host that should be used to take lease offers.
     * @returns URIToken related to the lease offer.
     */
    async decideLeaseOffer(hostAddress: string): Promise<URIToken> {
        // Get transaction details to use for xrpl tx submission.
        const hostClient = new evernode.HostClient(hostAddress);
        const leaseOffers = await hostClient.getLeaseOffers();
        const leaseOffer = leaseOffers && leaseOffers[0];

        if (!leaseOffer)
            throw "NO_LEASE_OFFER";

        const electionName = `lease_selector${this.voteContext.getUniqueNumber()}`;
        const voteRound = this.voteContext.vote(electionName, [leaseOffer], new AllVoteElector(3, 1000));
        let collection = (await voteRound).map((v) => v.data);

        let sortCollection = collection.sort((a, b) => {
            if (a.index === b.index) {
                return 0;
            }
            return a.index > b.index ? 1 : -1;
        });

        return sortCollection[0];
    }

    /**
     * Decides a host collectively.
     * @returns Decided host address.
     */
    async decideHost(): Promise<string> {
        const lclBasedNum = parseInt(this.hpContext.lclHash.substr(0, 2), 16);

        // Choose from hosts that have available hosts.
        const vacantHosts = (await this.getHosts()).sort((a: { address: number }, b: { address: number }) => a.address > b.address ? -1 : 1);
        const unusedHosts = vacantHosts.filter((h: { address: string }) => !this.clusterManager.nodes.find((n) => n.account === h.address));

        let hostAddress = null;
        if (unusedHosts.length > 0) {
            console.log(`Selecting a host from ${unusedHosts.length} unused hosts.`);
            hostAddress = unusedHosts[lclBasedNum % unusedHosts.length].address;
        }

        const electionName = `host_selector${this.voteContext.getUniqueNumber()}`;
        const voteRound = this.voteContext.vote(electionName, [hostAddress], new AllVoteElector(3, 1000));
        let collection = (await voteRound).map((v) => v.data);

        let sortCollection = collection.sort((a, b) => {
            if (a === b) {
                return 0;
            }
            return a > b ? 1 : -1;
        });

        return sortCollection[0];
    }

    /**
     * Decide a encryption key pair collectively
     * @returns Public key of the decided key pair.
     */
    async decideMessageKey(): Promise<string> {
        const seed = kp.generateSeed();
        const keyPair: Record<string, any> = kp.deriveKeypair(seed);

        const electionName = `message_key_selection${this.voteContext.getUniqueNumber()}`;
        const voteRound = this.voteContext.vote(electionName, [keyPair.publicKey], new AllVoteElector(3, 1000));
        let collection = (await voteRound).map((v) => v.data);

        let sortCollection = collection.sort((a, b) => {
            if (a === b) {
                return 0;
            }
            return a > b ? 1 : -1;
        });

        if (sortCollection[0] === keyPair.publicKey) {
            fs.writeFile(`../${keyPair.publicKey}.txt`, keyPair.privateKey, (err) => {
                if (err) {
                    console.error(err);
                    return;
                }
                console.log("Wrote Key file.");
            });
        }

        return collection[0];
    }

    /**
     * Submits the acquire transaction
     * @param hostAddress Relevant host address
     * @param leaseOffer Relevant URIToken of the lease offer
     * @param messageKey Encryption key of the tenant.
     * @param options
     * @returns Result of the submitted transaction.
     */
    async acquireSubmit(hostAddress: string, leaseOffer: URIToken, messageKey: string, options: AcquireOptions = {}): Promise<any> {
        // Get transaction details to use for xrpl tx submission.
        const hostClient = new evernode.HostClient(hostAddress);

        // Get host encryption key (public key).
        const encKey = await hostClient.xrplAcc.getMessageKey();
        if (!encKey)
            throw { reason: evernode.ErrorReasons.INTERNAL_ERR, error: "Host encryption key not set." };

        // Derive a seed buffer from the lclHash.
        const seed = Buffer.from(this.hpContext.lclHash, "hex");
        const encrypted = await evernode.EncryptionHelper.encrypt(encKey, { ...options.instanceCfg, messageKey: messageKey }, {
            iv: seed.slice(0, 16),
            ephemPrivateKey: seed.slice(0, 32)
        });
        // Set encrypted prefix flag and data.
        const data = Buffer.concat([Buffer.from([0x01]), Buffer.from(encrypted, "base64")]).toString("base64");

        return await this.xrplContext.buyURIToken(
            leaseOffer,
            [
                { type: evernode.EventTypes.ACQUIRE_LEASE, format: "base64", data: data }
            ],
            [
                { name: evernode.HookParamKeys.PARAM_EVENT_TYPE_KEY, value: evernode.EventTypes.ACQUIRE_LEASE }
            ],
            options
        );
    }
    /**
     * This function is called by a tenant client to submit the extend lease transaction in certain host. This function will be called directly in test. This function can take four parameters as follows.
     * @param {string} hostAddress XRPL account address of the host.
     * @param {number} amount Cost for the extended moments , in EVRs.
     * @param {string} tokenID Tenant received instance name. this name can be retrieve by performing acquire Lease.
     * @param {object} options This is an optional field and contains necessary details for the transactions.
     * @returns The transaction result.
     */
    async extendSubmit(hostAddress: string, amount: number, tokenID: string, options: any = {}): Promise<any> {
        const hostClient = new evernode.HostClient(hostAddress);
        await hostClient.connect();
        const evrIssuer = hostClient.config.evrIssuerAddress;
        await hostClient.disconnect();
        return this.xrplContext.makePayment(hostClient.xrplAcc.address, amount.toString(), evernode.EvernodeConstants.EVR, evrIssuer, null,
            [
                { name: evernode.HookParamKeys.PARAM_EVENT_TYPE_KEY, value: evernode.EventTypes.EXTEND_LEASE },
                { name: evernode.HookParamKeys.PARAM_EVENT_DATA1_KEY, value: tokenID }
            ],
            options
        );
    }

    /**
     * Fetches registered hosts
     * @returns An array of hosts that are having vacant leases.
     */
    async getHosts() {
        const registryClient = await this.#getRegistryClient();
        const allHosts = await registryClient.getActiveHosts();
        return allHosts.filter((h: { maxInstances: number; activeInstances: number; }) => (h.maxInstances - h.activeInstances) > 0);
    }

    /**
     * Fetches details of successful acquires.
     * @returns an array of instance acquisitions that are completed.
     */
    getAcquiredNodes(): any {
        try {
            const rawData = fs.readFileSync(this.acquireDataFile, 'utf8');
            const data = JSON.parse(rawData);
            return data.acquiredNodes;
        } catch (error) {
            console.error(`Error reading file ${this.acquireDataFile}: ${error}`);
            return undefined;
        }
    }

    /**
     * Fetches details of pending acquires.
     * @returns an array of instance acquisitions that are in progress.
     */
    getPendingAcquires(): any {
        try {
            const rawData = fs.readFileSync(this.acquireDataFile, 'utf8');
            const data = JSON.parse(rawData);
            return data.pendingAcquires;
        } catch (error) {
            console.error(`Error reading file ${this.acquireDataFile}: ${error}`);
            return undefined;
        }
    }

    /**
     * Updates the detail file with inserts and deletes of
     * pending acquires
     * @param element Element to be added or removed
     * @param mode Type of operation ("INSERT" or "DELETE")
     */

    async updatePendingAcquireInfo(element: any, mode: string = "INSERT") {
        try {
            const data = fs.readFileSync(this.acquireDataFile);

            if (data) {
                const jsonData = JSON.parse(data.toString());
                if (mode === "INSERT")
                    jsonData.pendingAcquires.push(element); // modify the array as needed
                else {
                    // Find the index of the record to remove
                    const indexToRemove = jsonData.pendingAcquires.findIndex((record: { leaseOfferIdx: string; }) => record.leaseOfferIdx === element.leaseOfferIdx);

                    // Check if the record exists in the array, and remove it if found
                    if (indexToRemove !== -1) {
                        jsonData.pendingAcquires.splice(indexToRemove, 1);
                    }
                }
                const updatedData = JSON.stringify(jsonData, null, 4); // convert the updated data back to JSON string
                fs.writeFileSync(this.acquireDataFile, updatedData);
            }
        } catch (e) {
            console.log(e);
        }
    }

    /**
     * Updates the detail file with inserts and deletes of
     * successful acquires
     * @param element Element to be added or removed
     * @param mode Type of operation ("INSERT" or "DELETE")
     */
    async updateAcquiredNodeInfo(element: any, mode: string = "INSERT") {
        try {
            const data = fs.readFileSync(this.acquireDataFile);

            if (data) {
                const jsonData = JSON.parse(data.toString());
                if (mode === "INSERT")
                    jsonData.acquiredNodes.push(element); // modify the array as needed
                else {
                    // Find the index of the record to remove
                    const indexToRemove = jsonData.acquiredNodes.findIndex((record: { name: string; }) => record.name === element.name);

                    // Check if the record exists in the array, and remove it if found
                    if (indexToRemove !== -1) {
                        jsonData.acquiredNodes.splice(indexToRemove, 1);
                    }
                }
                const updatedData = JSON.stringify(jsonData, null, 4); // convert the updated data back to JSON string

                fs.writeFileSync(this.acquireDataFile, updatedData);
            }
        } catch (e) {
            console.log(e);
        }
    }

    /**
     * View the content of the files which contains acquire details.
     */
    async viewNodeDetails() {
        const rawData = fs.readFileSync(this.acquireDataFile, 'utf8');
        const data = JSON.parse(rawData);
        if (data) {
            console.log("ACQUIRE INFO BEGIN: ______________________________________________________________________");
            console.log(data);
            console.log("ACQUIRE INFO END  : ______________________________________________________________________");
        }
    }
}

export default EvernodeContext;