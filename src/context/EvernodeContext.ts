import { VoteContext, XrplContext } from ".";
import { AcquireData, AcquireOptions, AcquiredNode, Instance, LeaseURIInfo, PendingAcquire } from "../models/evernode";
import * as evernode from 'evernode-js-client';
import { Buffer } from 'buffer';
import { AllVoteElector } from "../vote/vote-electors";
import { URIToken } from "../models";
import * as fs from 'fs';
import * as kp from 'ripple-keypairs';
import { JSONHelpers } from "../utils";

class EvernodeContext {
    public hpContext: any;
    public xrplContext: XrplContext;
    public voteContext: VoteContext;
    private acquireDataFile: string = "acquires.json";
    private acquireData: AcquireData;
    private registryClient: any;

    constructor(xrplContext: XrplContext, governorAddress: string) {
        this.xrplContext = xrplContext;
        this.hpContext = this.xrplContext.hpContext;
        this.voteContext = this.xrplContext.voteContext;

        evernode.Defaults.set({
            xrplApi: xrplContext.xrplApi,
            governorAddress: governorAddress,
        });

        if (!fs.existsSync(this.acquireDataFile))
            JSONHelpers.writeToFile(this.acquireDataFile, <AcquireData>{ acquiredNodes: [], pendingAcquires: [] });
        this.acquireData = JSONHelpers.readFromFile<AcquireData>(this.acquireDataFile);
    }

    /**
     * Initialize the context.
     */
    async init(): Promise<void> {
        await this.xrplContext.init();

        try {
            await this.#checkForCompletedAcquires();
        } catch (e) {
            await this.xrplContext.deinit();
            throw e;
        }
    }

    /**
     * Deinitialize the context.
     */
    async deinit(): Promise<void> {
        await this.xrplContext.deinit();
    }

    /**
     * Creates a registry clients for this environment
     * @returns Created client.
     */
    private async getRegistryClient(): Promise<any> {
        if (!this.registryClient) {
            this.registryClient = await evernode.HookClientFactory.create(evernode.HookTypes.registry);
            await this.registryClient.connect();
        }
        return this.registryClient;
    }

    /**
     * Check whether there're any completed pending acquires.
     */
    async #checkForCompletedAcquires(): Promise<void> {
        // Check for pending transactions and their completion.
        for (const item of this.getPendingAcquires()) {
            const txnInfo = await this.xrplContext.xrplApi.getTxnInfo(item.refId, {});
            if (txnInfo && txnInfo.validated) {
                const txList = await this.xrplContext.xrplAcc.getAccountTrx(txnInfo.ledger_index);
                for (let t of txList) {
                    t.tx.Memos = evernode.TransactionHelper.deserializeMemos(t.tx?.Memos);
                    t.tx.HookParameters = evernode.TransactionHelper.deserializeHookParams(t.tx?.HookParameters);

                    const privateKey = fs.existsSync(`../${item.messageKey}.txt`) ?
                        fs.readFileSync(`../${item.messageKey}.txt`, { encoding: 'utf8', flag: 'r' }) : null;
                    const tenantClient = new evernode.TenantClient(this.xrplContext.xrplAcc.address, null, { messagePrivateKey: privateKey });
                    const res = await tenantClient.extractEvernodeEvent(t.tx);
                    if (res && (res?.name === evernode.TenantEvents.AcquireSuccess) && (res?.data?.acquireRefId === item.refId)) {
                        const electionName = `share_payload${this.voteContext.getUniqueNumber()}`;
                        const elector = new AllVoteElector(1, 1000);
                        const payload = (privateKey ? await this.voteContext.vote(electionName, [res.data.payload], elector) : await this.voteContext.subscribe(electionName, elector)).map(ob => ob.data)[0];
                        await this.updateAcquiredNodeInfo({ host: item.host, refId: item.refId, ...JSONHelpers.castToModel<Instance>(payload.content) });
                        await this.updatePendingAcquireInfo(item, "DELETE");
                        if (privateKey)
                            fs.unlinkSync(`../${item.messageKey}.txt`);
                    }
                }
            }
        }
    }

    /**
     * Acquires a node based on the provided options.
     * @param options Options related to a particular acquire operation.
     * @returns Acquire data.
     */
    async acquireNode(options: AcquireOptions = {}): Promise<PendingAcquire> {
        // Use provided host or select a host randomly.
        const hostAddress = options.host || await this.decideHost(options.preferredHosts);
        // Choose the lease offer
        const leaseOffer = await this.decideLeaseOffer(hostAddress);

        const messageKey = await this.decideMessageKey();

        // Perform acquire txn on the selected host.
        const res = await this.acquireSubmit(hostAddress, leaseOffer, messageKey, options);

        const pendingAcquire = <PendingAcquire>{ host: hostAddress, leaseOfferIdx: leaseOffer.index, refId: res.tx_json.hash, messageKey: messageKey };

        // Record as a acquire transaction.
        await this.updatePendingAcquireInfo(pendingAcquire);

        return pendingAcquire;
    }

    /**
     * Get the acquire info if acquired.
     * @param options Options related to a particular acquire operation.
     * @returns Acquire reference.
     */
    getIfAcquired(acquireRefId: string): AcquiredNode | null {
        const acquireData = this.getAcquireData();
        const node = acquireData.acquiredNodes.find(n => n.refId == acquireRefId);
        return node ? node : null;
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
     * @param [preferredHosts=null] List of proffered host addresses.
     * @returns Decided host address.
     */
    async decideHost(preferredHosts: string[] | null = null): Promise<string> {
        const lclBasedNum = parseInt(this.hpContext.lclHash.substr(0, 2), 16);

        // Choose from hosts that have available instances.
        const vacantHosts = (await this.getHosts()).sort((a, b) => (a.maxInstances - a.activeInstances) > (b.maxInstances - b.activeInstances) ? -1 : 1);
        const unusedHosts = preferredHosts ? preferredHosts.filter(a => vacantHosts.find(h => a === h.address)) : vacantHosts.map(h => h.address);

        let hostAddress = null;
        if (unusedHosts.length > 0)
            hostAddress = unusedHosts[lclBasedNum % unusedHosts.length];
        else
            throw 'There are no vacant hosts in the network';

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
    async getHosts(): Promise<any[]> {
        const registryClient = await this.getRegistryClient();
        const allHosts = await registryClient.getActiveHosts();
        return allHosts.filter((h: { maxInstances: number; activeInstances: number; }) => (h.maxInstances - h.activeInstances) > 0);
    }

    /**
     * Fetches details of acquires.
     * @returns an object containing arrays of pending and in progress instance acquisitions.
     */
    getAcquireData(): AcquireData {
        return this.acquireData;
    }

    /**
     * Persist details of acquires.
     */
    persistAcquireData(): void {
        try {
            JSONHelpers.writeToFile(this.acquireDataFile, this.acquireData);
        } catch (error) {
            throw `Error writing file ${this.acquireDataFile}: ${error}`;
        }
    }

    /**
     * Fetches details of successful acquires.
     * @returns an array of instance acquisitions that are completed.
     */
    getAcquiredNodes(): AcquiredNode[] {
        return this.acquireData.acquiredNodes;
    }

    /**
     * Fetches details of pending acquires.
     * @returns an array of instance acquisitions that are in progress.
     */
    getPendingAcquires(): PendingAcquire[] {
        return this.acquireData.pendingAcquires;
    }

    /**
     * Decode the URI of the lease URIToken
     * @param uri URI of the URIToken
     * @returns decoded content of the URI
     */
    decodeLeaseTokenUri(uri: string): LeaseURIInfo {
        return evernode.UtilHelpers.decodeLeaseTokenUri(uri);
    }

    /**
     * Updates the detail file with inserts and deletes of
     * pending acquires
     * @param element Element to be added or removed
     * @param mode Type of operation ("INSERT" or "DELETE")
     */
    async updatePendingAcquireInfo(element: PendingAcquire, mode: string = "INSERT"): Promise<void> {
        if (mode === "INSERT")
            this.acquireData.pendingAcquires.push(element); // modify the array as needed
        else {
            // Find the index of the record to remove
            const indexToRemove = this.acquireData.pendingAcquires.findIndex((record: { leaseOfferIdx: string; }) => record.leaseOfferIdx === element.leaseOfferIdx);

            // Check if the record exists in the array, and remove it if found
            if (indexToRemove !== -1) {
                this.acquireData.pendingAcquires.splice(indexToRemove, 1);
            }
        }
        this.persistAcquireData();
    }

    /**
     * Updates the detail file with inserts and deletes of
     * successful acquires
     * @param element Element to be added or removed
     * @param mode Type of operation ("INSERT" or "DELETE")
     */
    async updateAcquiredNodeInfo(element: AcquiredNode, mode: string = "INSERT"): Promise<void> {
        if (mode === "INSERT")
            this.acquireData.acquiredNodes.push(element); // modify the array as needed
        else {
            // Find the index of the record to remove
            const indexToRemove = this.acquireData.acquiredNodes.findIndex((record: { name: string; }) => record.name === element.name);

            // Check if the record exists in the array, and remove it if found
            if (indexToRemove !== -1) {
                this.acquireData.acquiredNodes.splice(indexToRemove, 1);
            }
        }
        this.persistAcquireData();
    }
}

export default EvernodeContext;