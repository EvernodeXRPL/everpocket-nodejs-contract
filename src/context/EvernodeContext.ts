import { VoteContext, XrplContext } from ".";
import { AcquireData, AcquireOptions, AcquiredNode, Instance, LeaseURIInfo, PendingAcquire } from "../models/evernode";
import * as evernode from 'evernode-js-client';
import { Buffer } from 'buffer';
import { AllVoteElector } from "../vote/vote-electors";
import { URIToken } from "../models";
import * as fs from 'fs';
import * as kp from 'ripple-keypairs';
import { JSONHelpers } from "../utils";
import { VoteElectorOptions } from "../models/vote";
import HotPocketContext from "./HotPocketContext";
import { error, log } from "../helpers/logger";
import NumberHelpers from "../utils/helpers/NumberHelper";

const TIMEOUT = 10000;
const ACQUIRE_ABANDON_LCL_THRESHOLD = 10;

class EvernodeContext {
    private acquireDataFile: string = "acquires.json";
    private acquireData: AcquireData = { acquiredNodes: [], pendingAcquires: [] };
    private registryClient: any;
    private updatedData: boolean = false;
    private initialized: boolean = false;
    public hpContext: HotPocketContext;
    public xrplContext: XrplContext;
    public voteContext: VoteContext;

    public constructor(xrplContext: XrplContext) {
        this.xrplContext = xrplContext;
        this.hpContext = this.xrplContext.hpContext;
        this.voteContext = this.xrplContext.voteContext;

        evernode.Defaults.set({
            xrplApi: xrplContext.xrplApi
        });

        const data = JSONHelpers.readFromFile<AcquireData>(this.acquireDataFile);
        if (data)
            this.acquireData = data;
        else
            JSONHelpers.writeToFile(this.acquireDataFile, this.acquireData);
    }

    /**
     * Initialize the context.
     */
    public async init(): Promise<void> {
        if (this.initialized)
            return;

        await this.xrplContext.init();

        try {
            this.registryClient = await evernode.HookClientFactory.create(evernode.HookTypes.registry);
            await this.registryClient.connect();

            await this.#checkForCompletedAcquires();
            this.initialized = true;
        } catch (e) {
            await this.deinit();
            throw e;
        }
    }

    /**
     * Deinitialize the context.
     */
    public async deinit(): Promise<void> {
        this.#persistAcquireData();
        if (this.registryClient)
            await this.registryClient.disconnect();
        await this.xrplContext.deinit();
        this.initialized = false;
    }

    /**
     * Persist details of acquires.
     */
    #persistAcquireData(): void {
        if (!this.updatedData)
            return;

        try {
            JSONHelpers.writeToFile(this.acquireDataFile, this.acquireData);
        } catch (error) {
            throw `Error writing file ${this.acquireDataFile}: ${error}`;
        }
    }

    /**
     * Updates the detail file with inserts and deletes of
     * pending acquires
     * @param element Element to be added or removed
     * @param mode Type of operation ("INSERT" or "DELETE")
     */
    #updatePendingAcquireInfo(element: PendingAcquire, mode: string = "INSERT"): void {
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
        this.updatedData = true;
    }

    /**
     * Updates the detail file with inserts and deletes of
     * successful acquires
     * @param element Element to be added or removed
     * @param mode Type of operation ("INSERT" or "DELETE")
     */
    #updateAcquiredNodeInfo(element: AcquiredNode, mode: string = "INSERT"): void {
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
        this.updatedData = true;
    }

    /**
     * Check whether there're any completed pending acquires.
     * @param [options={}] Vote options for payload sharing.
     */
    async #checkForCompletedAcquires(options: VoteElectorOptions = {}): Promise<void> {
        // Check for pending transactions and their completion.
        for (const item of this.getPendingAcquires()) {
            // Check if transaction is validated. If not skip.
            const validated = this.xrplContext.getValidatedTransaction(item.refId);
            if (!validated)
                continue;

            const privateKey = fs.existsSync(`../${item.messageKey}.txt`) ?
                fs.readFileSync(`../${item.messageKey}.txt`, { encoding: 'utf8', flag: 'r' }) : null;

            let remove = false;
            // Remove transaction if failed.
            if (validated.resultCode !== "tesSUCCESS") {
                log(`Transaction failed for ${item.refId} with code: ${validated.resultCode}.`);
                remove = true;
            }
            // Remove if no ledger index.
            else if (!validated.ledgerIndex) {
                log(`No ledger index for the transaction ${item.refId}.`);
                remove = true;
            }
            // Abandon waiting for this node if threshold reached.
            else if (item.acquireSentOnLcl < (this.hpContext.lclSeqNo - ACQUIRE_ABANDON_LCL_THRESHOLD)) {
                log(`Maximum acquire wait threshold reached, Abandoning waiting for ${item.refId}.`);
                remove = true;
            }

            if (remove) {
                this.#updatePendingAcquireInfo(item, "DELETE");
                if (privateKey)
                    fs.unlinkSync(`../${item.messageKey}.txt`);
                continue;
            }

            const txList = await this.xrplContext.getTransactions(validated.ledgerIndex!);

            for (let t of txList) {
                t.tx.Memos = evernode.TransactionHelper.deserializeMemos(t.tx?.Memos);
                t.tx.HookParameters = evernode.TransactionHelper.deserializeHookParams(t.tx?.HookParameters);

                const tenantClient = new evernode.TenantClient(this.xrplContext.xrplAcc.address, null, { messagePrivateKey: privateKey });
                const res = await tenantClient.extractEvernodeEvent(t.tx);
                let payload = null;
                if (res?.name === evernode.TenantEvents.AcquireSuccess && res?.data?.acquireRefId === item.refId)
                    payload = res.data.payload;
                else if (res?.name === evernode.TenantEvents.AcquireError && res?.data?.acquireRefId === item.refId)
                    payload = 'acquire_error';

                if (payload) {
                    const electionName = `share_payload${this.voteContext.getUniqueNumber()}`;
                    const elector = new AllVoteElector(1, options?.timeout || TIMEOUT);
                    payload = (privateKey ? await this.voteContext.vote(electionName, [payload], elector) : await this.voteContext.subscribe(electionName, elector)).map(ob => ob.data)[0];

                    // Updated the acquires if there's a success response.
                    if (payload) {
                        if (payload !== 'acquire_error') {
                            // Assign ip to domain and outbound_ip for instance created from old sashimono version.
                            if ('ip' in payload.content) {
                                payload.content.domain = payload.content.ip;
                                delete payload.content.ip;
                            }
                            this.#updateAcquiredNodeInfo({ host: item.host, refId: item.refId, ...JSONHelpers.castToModel<Instance>(payload.content) });
                        }
                        this.#updatePendingAcquireInfo(item, "DELETE");
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
    public async acquireNode(options: AcquireOptions = {}): Promise<PendingAcquire> {
        // Use provided host or select a host randomly.
        const hostAddress = options.host || await this.decideHost(options.preferredHosts);
        // Choose the lease offer
        const leaseOffer = await this.decideLeaseOffer(hostAddress);

        const messageKey = await this.decideMessageKey();

        if (!leaseOffer || !messageKey)
            throw "Could not decide acquire params.";

        // Perform acquire txn on the selected host.
        const res = await this.acquireSubmit(hostAddress, leaseOffer, messageKey, options);

        const pendingAcquire = <PendingAcquire>{
            host: hostAddress,
            leaseOfferIdx: leaseOffer.index,
            refId: res.hash,
            messageKey: messageKey,
            acquireSentOnLcl: this.hpContext.lclSeqNo
        };

        // Record as a acquire transaction.
        this.#updatePendingAcquireInfo(pendingAcquire);

        return pendingAcquire;
    }

    /**
     * Get the acquire info if acquired.
     * @param acquireRefId Acquire reference.
     * @returns Acquired node.
     */
    public getIfAcquired(acquireRefId: string): AcquiredNode | null {
        const node = this.acquireData.acquiredNodes.find(n => n.refId == acquireRefId);
        return node ? node : null;
    }

    /**
     * Get the acquire info if pending.
     * @param acquireRefId Acquire reference.
     * @returns Pending node.
     */
    public getIfPending(acquireRefId: string): PendingAcquire | null {
        const node = this.acquireData.pendingAcquires.find(n => n.refId == acquireRefId);
        return node ? node : null;
    }

    /**
     * Decides a lease offer collectively.
     * @param hostAddress Host that should be used to take lease offers.
     * @returns URIToken related to the lease offer.
     */
    public async decideLeaseOffer(hostAddress: string): Promise<URIToken> {
        // Get transaction details to use for xrpl tx submission.
        const hostClient = new evernode.HostClient(hostAddress);
        const leaseOffers = await hostClient.getLeaseOffers();
        const leaseOffer = leaseOffers && leaseOffers.length > 0 && leaseOffers.sort((a: any, b: any) => a.index.localeCompare(b.index))[0];

        if (!leaseOffer)
            throw "NO_LEASE_OFFER";

        return leaseOffer;
    }

    /**
     * Decides a host collectively.
     * @param [preferredHosts=null] List of proffered host addresses.
     * @returns Decided host address.
     */
    public async decideHost(preferredHosts: string[] | null = null): Promise<string> {
        // Choose from hosts that have available instances.
        const vacantHosts = await this.getHosts();
        const unusedHosts = preferredHosts ? preferredHosts.filter(a => vacantHosts.find(h => a === h.address)) : vacantHosts.map(h => h.address);

        let hostAddress = null;
        if (unusedHosts.length > 0) {
            const randomIndex = NumberHelpers.getRandomNumber(this.hpContext, 0, unusedHosts.length);
            hostAddress = unusedHosts.sort((a: any, b: any) => a.localeCompare(b))[randomIndex];
        }
        else
            throw 'There are no vacant hosts in the network';

        return hostAddress;
    }

    /**
     * Decide a encryption key pair collectively
     * @param [options={}] Vote options for message key decision.
     * @returns Public key of the decided key pair.
     */
    public async decideMessageKey(options: VoteElectorOptions = {}): Promise<string> {
        const seed = kp.generateSeed();
        const keyPair: Record<string, any> = kp.deriveKeypair(seed);

        const electionName = `message_key_selection${this.voteContext.getUniqueNumber()}`;
        const voteRound = this.voteContext.vote(electionName, [keyPair.publicKey], new AllVoteElector(this.hpContext.getContractUnl().length, options?.timeout || TIMEOUT));
        let collection = (await voteRound).map((v) => v.data);

        let sortCollection = collection.sort((a, b) => a.localeCompare(b));

        if (sortCollection[0] === keyPair.publicKey) {
            fs.writeFileSync(`../${keyPair.publicKey}.txt`, keyPair.privateKey);
            log("Wrote Key file.");
        }

        return collection[0];
    }

    /**
     * Get evernode configuration.
     * @returns The evernode configuration.
     */
    public getEvernodeConfig() {
        return this.registryClient.config;
    }

    /**
     * Get the current evernode moment.
     * @param [options={}] Vote options to collect the current moment value.
     * @returns The current moment value
     */
    public async getCurMoment(options: VoteElectorOptions = {}) {
        // Vote for node created moment.
        const electionName = `share_node_create_moment${this.voteContext.getUniqueNumber()}`;
        const elector = new AllVoteElector(this.hpContext.getContractUnl().length, options?.timeout || TIMEOUT);
        const moment = await this.registryClient.getMoment();
        const nodes: number[] = (await this.voteContext.vote(electionName, [moment], elector)).map(ob => ob.data).sort();
        return nodes[0];
    }

    /**
     * Submits the acquire transaction
     * @param hostAddress Relevant host address
     * @param leaseOffer Relevant URIToken of the lease offer
     * @param messageKey Encryption key of the tenant.
     * @param options
     * @returns Result of the submitted transaction.
     */
    public async acquireSubmit(hostAddress: string, leaseOffer: URIToken, messageKey: string, options: AcquireOptions = {}): Promise<any> {
        // Get transaction details to use for xrpl tx submission.
        const tenantClient = new evernode.TenantClient(this.xrplContext.xrplAcc.address);
        await tenantClient.connect();

        const seed = Buffer.from(this.hpContext.lclHash, "hex");
        const preparedAcquireTxn = await tenantClient.prepareAcquireLeaseTransaction(hostAddress, { ...(JSONHelpers.castFromModel(options.instanceCfg)), messageKey: messageKey }, { leaseOfferIndex: leaseOffer.index, iv: seed.slice(0, 16), ephemPrivateKey: seed.slice(0, 32) })
        await tenantClient.disconnect();

        return await this.xrplContext.multiSignAndSubmitTransaction(preparedAcquireTxn, options);
    }

    /**
     * This function is called by a tenant client to submit the extend lease transaction in certain host. This function will be called directly in test. This function can take four parameters as follows.
     * @param {string} hostAddress XRPL account address of the host.
     * @param {number} extension Moments to extend.
     * @param {string} tokenID Tenant received instance name. this name can be retrieve by performing acquire Lease.
     * @param {object} options This is an optional field and contains necessary details for the transactions.
     * @returns The transaction result.
     */
    public async extendSubmit(hostAddress: string, extension: number, tokenID: string, options: any = {}): Promise<any> {
        const leaseToken = (await this.xrplContext.xrplAcc.getURITokens()).find((t: any) => t.index === tokenID);
        if (!leaseToken)
            throw 'No lease token for given token id';

        const uriInfo = this.decodeLeaseTokenUri(leaseToken.URI);
        const tenantClient = new evernode.TenantClient(this.xrplContext.xrplAcc.address);
        await tenantClient.connect();

        const preparedAcquireTxn = await tenantClient.prepareExtendLeaseTransaction(hostAddress, ((uriInfo.leaseAmount * extension)).toString(), tokenID, options)
        await tenantClient.disconnect();

        return await this.xrplContext.multiSignAndSubmitTransaction(preparedAcquireTxn, options);
    }

    /**
     * Fetches registered hosts
     * @returns An array of hosts that are having vacant leases.
     */
    public async getHosts(): Promise<any[]> {
        const allHosts = await this.registryClient.getActiveHostsFromLedger();
        return allHosts.filter((h: { maxInstances: number; activeInstances: number; }) => (h.maxInstances - h.activeInstances) > 0);
    }

    /**
     * Fetches details of successful acquires.
     * @returns an array of instance acquisitions that are completed.
     */
    public getAcquiredNodes(): AcquiredNode[] {
        return this.acquireData.acquiredNodes;
    }

    /**
     * Fetches details of pending acquires.
     * @returns an array of instance acquisitions that are in progress.
     */
    public getPendingAcquires(): PendingAcquire[] {
        return this.acquireData.pendingAcquires;
    }

    /**
     * Decode the URI of the lease URIToken
     * @param uri URI of the URIToken
     * @returns decoded content of the URI
     */
    public decodeLeaseTokenUri(uri: string): LeaseURIInfo {
        return evernode.UtilHelpers.decodeLeaseTokenUri(uri);
    }
}

export default EvernodeContext;