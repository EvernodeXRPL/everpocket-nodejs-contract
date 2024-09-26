# Everpocket JS API Documentation
## Classes

<dl>
<dt><a href="#ClusterContext">ClusterContext</a></dt>
<dd><p>Manages the operations and states of the cluster.</p>
</dd>
<dt><a href="#EvernodeContext">EvernodeContext</a></dt>
<dd><p>Handles operations related to node acquisition, host selection, transaction submission, and state management.</p>
</dd>
<dt><a href="#HotPocketContext">HotPocketContext</a></dt>
<dd><p>The HotPocketContext class manages interactions with the HotPocket framework,
including client connections, contract configurations, and peer management.
It provides methods to connect to nodes, send messages, and update contract and peer data.</p>
</dd>
<dt><a href="#NomadContext">NomadContext</a></dt>
<dd><p>The NomadContext class manages the lifecycle of nodes in a Nomad cluster.</p>
</dd>
<dt><a href="#VoteContext">VoteContext</a></dt>
<dd><p>The VoteContext class handles voting operations and manages elections.</p>
</dd>
<dt><a href="#XrplContext">XrplContext</a></dt>
<dd><p>Handles operations related to XRPL transactions.</p>
</dd>
<dt><a href="#MultiSigner">MultiSigner</a></dt>
<dd><p>Manages signing operations for Xahau transactions using a signer key.</p>
</dd>
<dt><a href="#AllVoteElector">AllVoteElector</a></dt>
<dd><p>Evaluates votes in an election based on the desired vote count and timeout.</p>
</dd>
</dl>

<a name="ClusterContext"></a>

## ClusterContext
Manages the operations and states of the cluster.

**Kind**: global class  

* [ClusterContext](#ClusterContext)
    * [new ClusterContext(evernodeContext, [options])](#new_ClusterContext_new)
    * [.init()](#ClusterContext+init)
    * [.deinit()](#ClusterContext+deinit)
    * [.addNodeQueueCount()](#ClusterContext+addNodeQueueCount) ⇒
    * [.getClusterUnlNodes()](#ClusterContext+getClusterUnlNodes) ⇒
    * [.getClusterNodes()](#ClusterContext+getClusterNodes) ⇒
    * [.getPendingNodes()](#ClusterContext+getPendingNodes) ⇒
    * [.totalCount()](#ClusterContext+totalCount) ⇒
    * [.feedUserMessage(user, msg)](#ClusterContext+feedUserMessage) ⇒
    * [.addNewClusterNode([maxLifeMoments], [lifeMoments], [options&#x3D;])](#ClusterContext+addNewClusterNode)
    * [.addToCluster(node)](#ClusterContext+addToCluster)
    * [.addToUnl(pubkey)](#ClusterContext+addToUnl)
    * [.extendNode(pubkey, lifeMoments)](#ClusterContext+extendNode)
    * [.removeNode(pubkey, [force])](#ClusterContext+removeNode)

<a name="new_ClusterContext_new"></a>

### new ClusterContext(evernodeContext, [options])
Creates an instance of `ClusterContext`


| Param | Type | Default | Description |
| --- | --- | --- | --- |
| evernodeContext | [<code>EvernodeContext</code>](#EvernodeContext) |  | The context associated with Evernode for interacting with its environment. |
| [options] | <code>ClusterOptions</code> | <code>{}</code> | Optional parameters for configuring the cluster thresholds. |

<a name="ClusterContext+init"></a>

### clusterContext.init()
Initiates the operations regarding the cluster.

**Kind**: instance method of [<code>ClusterContext</code>](#ClusterContext)  
<a name="ClusterContext+deinit"></a>

### clusterContext.deinit()
Deinitiates the operations regarding the cluster.

**Kind**: instance method of [<code>ClusterContext</code>](#ClusterContext)  
<a name="ClusterContext+addNodeQueueCount"></a>

### clusterContext.addNodeQueueCount() ⇒
Get the queued add node operations.

**Kind**: instance method of [<code>ClusterContext</code>](#ClusterContext)  
**Returns**: Total number of cluster nodes.  
<a name="ClusterContext+getClusterUnlNodes"></a>

### clusterContext.getClusterUnlNodes() ⇒
Get all Unl nodes in the cluster.

**Kind**: instance method of [<code>ClusterContext</code>](#ClusterContext)  
**Returns**: List of nodes in the cluster which are in Unl.  
<a name="ClusterContext+getClusterNodes"></a>

### clusterContext.getClusterNodes() ⇒
Get all nodes in the cluster.

**Kind**: instance method of [<code>ClusterContext</code>](#ClusterContext)  
**Returns**: List of nodes in the cluster.  
<a name="ClusterContext+getPendingNodes"></a>

### clusterContext.getPendingNodes() ⇒
Get all pending nodes.

**Kind**: instance method of [<code>ClusterContext</code>](#ClusterContext)  
**Returns**: List of pending nodes.  
<a name="ClusterContext+totalCount"></a>

### clusterContext.totalCount() ⇒
Get the pending + cluster node count in the cluster.

**Kind**: instance method of [<code>ClusterContext</code>](#ClusterContext)  
**Returns**: Total number of cluster nodes.  
<a name="ClusterContext+feedUserMessage"></a>

### clusterContext.feedUserMessage(user, msg) ⇒
Feed user message to the cluster context.

**Kind**: instance method of [<code>ClusterContext</code>](#ClusterContext)  
**Returns**: Response for the cluster message with status.  

| Param | Description |
| --- | --- |
| user | Contract client user. |
| msg | Message sent by the user. |

<a name="ClusterContext+addNewClusterNode"></a>

### clusterContext.addNewClusterNode([maxLifeMoments], [lifeMoments], [options&#x3D;])
Acquire and add new node to the cluster.

**Kind**: instance method of [<code>ClusterContext</code>](#ClusterContext)  

| Param | Default | Description |
| --- | --- | --- |
| [maxLifeMoments] | <code>0</code> | Amount of maximum life moments for the instance. 0 means there's no max life limit for the node. |
| [lifeMoments] | <code>1</code> | Amount of life moments for the instance. |
| [options=] |  | Acquire instance options. |

<a name="ClusterContext+addToCluster"></a>

### clusterContext.addToCluster(node)
Add a node to cluster and mark as UNL.

**Kind**: instance method of [<code>ClusterContext</code>](#ClusterContext)  

| Param | Description |
| --- | --- |
| node | Cluster node to be added. |

<a name="ClusterContext+addToUnl"></a>

### clusterContext.addToUnl(pubkey)
Mark existing node as a UNL node.

**Kind**: instance method of [<code>ClusterContext</code>](#ClusterContext)  

| Param | Description |
| --- | --- |
| pubkey | Public key of the node. |

<a name="ClusterContext+extendNode"></a>

### clusterContext.extendNode(pubkey, lifeMoments)
Record a provided node for extend.

**Kind**: instance method of [<code>ClusterContext</code>](#ClusterContext)  

| Param | Description |
| --- | --- |
| pubkey | Public key of the node to be extended. |
| lifeMoments | Number of moments to be extended. |

<a name="ClusterContext+removeNode"></a>

### clusterContext.removeNode(pubkey, [force])
Removes a provided a node from the cluster.

**Kind**: instance method of [<code>ClusterContext</code>](#ClusterContext)  

| Param | Default | Description |
| --- | --- | --- |
| pubkey |  | Public key of the node to be removed. |
| [force] | <code>false</code> | Force remove. (This might cause to fail some pending operations). |

<a name="EvernodeContext"></a>

## EvernodeContext
Handles operations related to node acquisition, host selection, transaction submission, and state management.

**Kind**: global class  

* [EvernodeContext](#EvernodeContext)
    * [new EvernodeContext(xrplContext)](#new_EvernodeContext_new)
    * [.init()](#EvernodeContext+init)
    * [.deinit()](#EvernodeContext+deinit)
    * [.acquireNode(options)](#EvernodeContext+acquireNode) ⇒
    * [.getIfAcquired(acquireRefId)](#EvernodeContext+getIfAcquired) ⇒
    * [.getIfPending(acquireRefId)](#EvernodeContext+getIfPending) ⇒
    * [.decideLeaseOffer(hostAddress)](#EvernodeContext+decideLeaseOffer) ⇒
    * [.decideHost([preferredHosts])](#EvernodeContext+decideHost) ⇒
    * [.decideMessageKey([options&#x3D;])](#EvernodeContext+decideMessageKey) ⇒
    * [.getEvernodeConfig()](#EvernodeContext+getEvernodeConfig) ⇒
    * [.getCurMoment([options&#x3D;])](#EvernodeContext+getCurMoment) ⇒
    * [.acquireSubmit(hostAddress, leaseOffer, messageKey, options)](#EvernodeContext+acquireSubmit) ⇒
    * [.extendSubmit(hostAddress, extension, tokenID, options)](#EvernodeContext+extendSubmit) ⇒
    * [.getHosts()](#EvernodeContext+getHosts) ⇒
    * [.getAcquiredNodes()](#EvernodeContext+getAcquiredNodes) ⇒
    * [.getPendingAcquires()](#EvernodeContext+getPendingAcquires) ⇒
    * [.decodeLeaseTokenUri(uri)](#EvernodeContext+decodeLeaseTokenUri) ⇒

<a name="new_EvernodeContext_new"></a>

### new EvernodeContext(xrplContext)
Creates an instance of EvernodeContext.


| Param | Type | Description |
| --- | --- | --- |
| xrplContext | [<code>XrplContext</code>](#XrplContext) | The XRPL context object that handles communication with the XRPL network. |

<a name="EvernodeContext+init"></a>

### evernodeContext.init()
Initialize the context.

**Kind**: instance method of [<code>EvernodeContext</code>](#EvernodeContext)  
<a name="EvernodeContext+deinit"></a>

### evernodeContext.deinit()
Deinitialize the context.

**Kind**: instance method of [<code>EvernodeContext</code>](#EvernodeContext)  
<a name="EvernodeContext+acquireNode"></a>

### evernodeContext.acquireNode(options) ⇒
Acquires a node based on the provided options.

**Kind**: instance method of [<code>EvernodeContext</code>](#EvernodeContext)  
**Returns**: Acquire data.  

| Param | Description |
| --- | --- |
| options | Options related to a particular acquire operation. |

<a name="EvernodeContext+getIfAcquired"></a>

### evernodeContext.getIfAcquired(acquireRefId) ⇒
Get the acquire info if acquired.

**Kind**: instance method of [<code>EvernodeContext</code>](#EvernodeContext)  
**Returns**: Acquired node.  

| Param | Description |
| --- | --- |
| acquireRefId | Acquire reference. |

<a name="EvernodeContext+getIfPending"></a>

### evernodeContext.getIfPending(acquireRefId) ⇒
Get the acquire info if pending.

**Kind**: instance method of [<code>EvernodeContext</code>](#EvernodeContext)  
**Returns**: Pending node.  

| Param | Description |
| --- | --- |
| acquireRefId | Acquire reference. |

<a name="EvernodeContext+decideLeaseOffer"></a>

### evernodeContext.decideLeaseOffer(hostAddress) ⇒
Decides a lease offer collectively.

**Kind**: instance method of [<code>EvernodeContext</code>](#EvernodeContext)  
**Returns**: URIToken related to the lease offer.  

| Param | Description |
| --- | --- |
| hostAddress | Host that should be used to take lease offers. |

<a name="EvernodeContext+decideHost"></a>

### evernodeContext.decideHost([preferredHosts]) ⇒
Decides a host collectively.

**Kind**: instance method of [<code>EvernodeContext</code>](#EvernodeContext)  
**Returns**: Decided host address.  

| Param | Default | Description |
| --- | --- | --- |
| [preferredHosts] | <code></code> | List of proffered host addresses. |

<a name="EvernodeContext+decideMessageKey"></a>

### evernodeContext.decideMessageKey([options&#x3D;]) ⇒
Decide a encryption key pair collectively

**Kind**: instance method of [<code>EvernodeContext</code>](#EvernodeContext)  
**Returns**: Public key of the decided key pair.  

| Param | Description |
| --- | --- |
| [options=] | Vote options for message key decision. |

<a name="EvernodeContext+getEvernodeConfig"></a>

### evernodeContext.getEvernodeConfig() ⇒
Get evernode configuration.

**Kind**: instance method of [<code>EvernodeContext</code>](#EvernodeContext)  
**Returns**: The evernode configuration.  
<a name="EvernodeContext+getCurMoment"></a>

### evernodeContext.getCurMoment([options&#x3D;]) ⇒
Get the current evernode moment.

**Kind**: instance method of [<code>EvernodeContext</code>](#EvernodeContext)  
**Returns**: The current moment value  

| Param | Description |
| --- | --- |
| [options=] | Vote options to collect the current moment value. |

<a name="EvernodeContext+acquireSubmit"></a>

### evernodeContext.acquireSubmit(hostAddress, leaseOffer, messageKey, options) ⇒
Submits the acquire transaction

**Kind**: instance method of [<code>EvernodeContext</code>](#EvernodeContext)  
**Returns**: Result of the submitted transaction.  

| Param | Description |
| --- | --- |
| hostAddress | Relevant host address |
| leaseOffer | Relevant URIToken of the lease offer |
| messageKey | Encryption key of the tenant. |
| options |  |

<a name="EvernodeContext+extendSubmit"></a>

### evernodeContext.extendSubmit(hostAddress, extension, tokenID, options) ⇒
This function is called by a tenant client to submit the extend lease transaction in certain host. This function will be called directly in test. This function can take four parameters as follows.

**Kind**: instance method of [<code>EvernodeContext</code>](#EvernodeContext)  
**Returns**: The transaction result.  

| Param | Type | Description |
| --- | --- | --- |
| hostAddress | <code>string</code> | XRPL account address of the host. |
| extension | <code>number</code> | Moments to extend. |
| tokenID | <code>string</code> | Tenant received instance name. this name can be retrieve by performing acquire Lease. |
| options | <code>object</code> | This is an optional field and contains necessary details for the transactions. |

<a name="EvernodeContext+getHosts"></a>

### evernodeContext.getHosts() ⇒
Fetches registered hosts

**Kind**: instance method of [<code>EvernodeContext</code>](#EvernodeContext)  
**Returns**: An array of hosts that are having vacant leases.  
<a name="EvernodeContext+getAcquiredNodes"></a>

### evernodeContext.getAcquiredNodes() ⇒
Fetches details of successful acquires.

**Kind**: instance method of [<code>EvernodeContext</code>](#EvernodeContext)  
**Returns**: an array of instance acquisitions that are completed.  
<a name="EvernodeContext+getPendingAcquires"></a>

### evernodeContext.getPendingAcquires() ⇒
Fetches details of pending acquires.

**Kind**: instance method of [<code>EvernodeContext</code>](#EvernodeContext)  
**Returns**: an array of instance acquisitions that are in progress.  
<a name="EvernodeContext+decodeLeaseTokenUri"></a>

### evernodeContext.decodeLeaseTokenUri(uri) ⇒
Decode the URI of the lease URIToken

**Kind**: instance method of [<code>EvernodeContext</code>](#EvernodeContext)  
**Returns**: decoded content of the URI  

| Param | Description |
| --- | --- |
| uri | URI of the URIToken |

<a name="HotPocketContext"></a>

## HotPocketContext
The HotPocketContext class manages interactions with the HotPocket framework,
including client connections, contract configurations, and peer management.
It provides methods to connect to nodes, send messages, and update contract and peer data.

**Kind**: global class  

* [HotPocketContext](#HotPocketContext)
    * [new HotPocketContext(contractContext, [options])](#new_HotPocketContext_new)
    * [.checkLiveness(node)](#HotPocketContext+checkLiveness) ⇒
    * [.sendMessage(message, nodes)](#HotPocketContext+sendMessage) ⇒
    * [.getContractConfig()](#HotPocketContext+getContractConfig) ⇒
    * [.updateContractConfig()](#HotPocketContext+updateContractConfig) ⇒
    * [.getContractUnl()](#HotPocketContext+getContractUnl) ⇒
    * [.updatePeers(toAdd, [toRemove])](#HotPocketContext+updatePeers)

<a name="new_HotPocketContext_new"></a>

### new HotPocketContext(contractContext, [options])
Creates an instance of HotPocketContext.


| Param | Type | Default | Description |
| --- | --- | --- | --- |
| contractContext | <code>any</code> |  | The contract context containing the necessary contract and sequence details. |
| [options] | <code>HotPocketOptions</code> | <code>{}</code> | Optional configuration options. |

<a name="HotPocketContext+checkLiveness"></a>

### hotPocketContext.checkLiveness(node) ⇒
Checks the liveliness of a node.

**Kind**: instance method of [<code>HotPocketContext</code>](#HotPocketContext)  
**Returns**: the liveliness as a boolean figure.  

| Param | Description |
| --- | --- |
| node | Node to check the connection. |

<a name="HotPocketContext+sendMessage"></a>

### hotPocketContext.sendMessage(message, nodes) ⇒
Sends a message to a cluster node.

**Kind**: instance method of [<code>HotPocketContext</code>](#HotPocketContext)  
**Returns**: the state of the message sending as a boolean figure.  

| Param | Description |
| --- | --- |
| message | Message to be sent. |
| nodes | Nodes to send the message. |

<a name="HotPocketContext+getContractConfig"></a>

### hotPocketContext.getContractConfig() ⇒
Get the contract config.

**Kind**: instance method of [<code>HotPocketContext</code>](#HotPocketContext)  
**Returns**: The contract config.  
<a name="HotPocketContext+updateContractConfig"></a>

### hotPocketContext.updateContractConfig() ⇒
Update the contract config.

**Kind**: instance method of [<code>HotPocketContext</code>](#HotPocketContext)  
**Returns**: The contract config.  
<a name="HotPocketContext+getContractUnl"></a>

### hotPocketContext.getContractUnl() ⇒
Get the contract unl.

**Kind**: instance method of [<code>HotPocketContext</code>](#HotPocketContext)  
**Returns**: The contract unl.  
<a name="HotPocketContext+updatePeers"></a>

### hotPocketContext.updatePeers(toAdd, [toRemove])
Update the HotPocket peer list.

**Kind**: instance method of [<code>HotPocketContext</code>](#HotPocketContext)  

| Param | Default | Description |
| --- | --- | --- |
| toAdd |  | Peer list to add. |
| [toRemove] | <code>[]</code> | Peer list to remove. |

<a name="NomadContext"></a>

## NomadContext
The NomadContext class manages the lifecycle of nodes in a Nomad cluster.

**Kind**: global class  

* [NomadContext](#NomadContext)
    * [new NomadContext(clusterContext, contract)](#new_NomadContext_new)
    * [.init()](#NomadContext+init)
    * [.deinit()](#NomadContext+deinit)
    * [.grow()](#NomadContext+grow)
    * [.extend()](#NomadContext+extend)
    * [.prune()](#NomadContext+prune)

<a name="new_NomadContext_new"></a>

### new NomadContext(clusterContext, contract)
Creates an instance of NomadContext.


| Param | Type | Description |
| --- | --- | --- |
| clusterContext | [<code>ClusterContext</code>](#ClusterContext) | The cluster context for managing the cluster. |
| contract | <code>NomadOptions</code> | Configuration options for the Nomad contract. |

<a name="NomadContext+init"></a>

### nomadContext.init()
Initialize the nomad context.

**Kind**: instance method of [<code>NomadContext</code>](#NomadContext)  
<a name="NomadContext+deinit"></a>

### nomadContext.deinit()
Deinitialize the nomad contract.

**Kind**: instance method of [<code>NomadContext</code>](#NomadContext)  
<a name="NomadContext+grow"></a>

### nomadContext.grow()
Grow the cluster upto target one by one.

**Kind**: instance method of [<code>NomadContext</code>](#NomadContext)  
<a name="NomadContext+extend"></a>

### nomadContext.extend()
Check for expiring nodes and send for extend.

**Kind**: instance method of [<code>NomadContext</code>](#NomadContext)  
<a name="NomadContext+prune"></a>

### nomadContext.prune()
Prune the nodes which fulfils the prune conditions.

**Kind**: instance method of [<code>NomadContext</code>](#NomadContext)  
<a name="VoteContext"></a>

## VoteContext
The VoteContext class handles voting operations and manages elections.

**Kind**: global class  

* [VoteContext](#VoteContext)
    * [new VoteContext(contractContext, [options&#x3D;])](#new_VoteContext_new)
    * [.getUniqueNumber()](#VoteContext+getUniqueNumber) ⇒
    * [.feedUnlMessage(sender, msg)](#VoteContext+feedUnlMessage)
    * [.vote(electionName, votes, elector)](#VoteContext+vote) ⇒
    * [.subscribe(electionName, votes, elector)](#VoteContext+subscribe) ⇒
    * [.resolveVotes(electionName)](#VoteContext+resolveVotes) ⇒

<a name="new_VoteContext_new"></a>

### new VoteContext(contractContext, [options&#x3D;])
Creates an instance of VoteContext.


| Param | Description |
| --- | --- |
| contractContext | The contract context to use. |
| [options=] | Options for vote context, including voteSerializer. |

<a name="VoteContext+getUniqueNumber"></a>

### voteContext.getUniqueNumber() ⇒
Gives an unique number every time this method is called.

**Kind**: instance method of [<code>VoteContext</code>](#VoteContext)  
**Returns**: An unique number.  
<a name="VoteContext+feedUnlMessage"></a>

### voteContext.feedUnlMessage(sender, msg)
Deserialize UNL message and feed to the listeners.

**Kind**: instance method of [<code>VoteContext</code>](#VoteContext)  

| Param | Description |
| --- | --- |
| sender | UNLNode which has sent the message. |
| msg | Message received from UNL. |

<a name="VoteContext+vote"></a>

### voteContext.vote(electionName, votes, elector) ⇒
Send the votes to a election.

**Kind**: instance method of [<code>VoteContext</code>](#VoteContext)  
**Returns**: Evaluated votes as a promise.  

| Param | Description |
| --- | --- |
| electionName | Election identifier to vote for. |
| votes | Votes for the election. |
| elector | Elector which evaluates the votes. |

<a name="VoteContext+subscribe"></a>

### voteContext.subscribe(electionName, votes, elector) ⇒
Send the votes to a election.

**Kind**: instance method of [<code>VoteContext</code>](#VoteContext)  
**Returns**: Evaluated votes as a promise.  

| Param | Description |
| --- | --- |
| electionName | Election identifier to vote for. |
| votes | Votes for the election. |
| elector | Elector which evaluates the votes. |

<a name="VoteContext+resolveVotes"></a>

### voteContext.resolveVotes(electionName) ⇒
Resolve all the collected votes.

**Kind**: instance method of [<code>VoteContext</code>](#VoteContext)  
**Returns**: The vote collection.  

| Param | Description |
| --- | --- |
| electionName | Name of the election to resolve. |

<a name="XrplContext"></a>

## XrplContext
Handles operations related to XRPL transactions.

**Kind**: global class  

* [XrplContext](#XrplContext)
    * [new XrplContext(hpContext, address, [secret], [options])](#new_XrplContext_new)
    * [.init()](#XrplContext+init)
    * [.deinit()](#XrplContext+deinit)
    * [.getPendingTransactions()](#XrplContext+getPendingTransactions) ⇒
    * [.getValidatedTransactions()](#XrplContext+getValidatedTransactions) ⇒
    * [.getValidatedTransaction(hash)](#XrplContext+getValidatedTransaction) ⇒
    * [.loadSignerList()](#XrplContext+loadSignerList)
    * [.getSequence()](#XrplContext+getSequence) ⇒
    * [.getTransactions(ledgerIndex)](#XrplContext+getTransactions) ⇒
    * [.getMaxLedgerSequence()](#XrplContext+getMaxLedgerSequence) ⇒
    * [.getTransactionSubmissionInfo([options&#x3D;], [decisionOptions])](#XrplContext+getTransactionSubmissionInfo) ⇒
    * [.submitMultisignedTx(tx)](#XrplContext+submitMultisignedTx) ⇒
    * [.multiSignAndSubmitTransaction(transaction, [options&#x3D;])](#XrplContext+multiSignAndSubmitTransaction)
    * [.generateNewSignerList([options&#x3D;])](#XrplContext+generateNewSignerList) ⇒
    * [.setSignerList(signerListInfo, [options&#x3D;])](#XrplContext+setSignerList)
    * [.renewSignerList([options&#x3D;])](#XrplContext+renewSignerList)
    * [.addXrplSigner(pubkey, weight, [options&#x3D;])](#XrplContext+addXrplSigner) ⇒
    * [.removeXrplSigner(pubkey, [options&#x3D;])](#XrplContext+removeXrplSigner)
    * [.replaceSignerList(oldSignerAddress, newSignerAddress, [options&#x3D;])](#XrplContext+replaceSignerList) ⇒
    * [.getSignerList()](#XrplContext+getSignerList) ⇒ <code>Object</code> \| <code>null</code>
    * [.isSigner()](#XrplContext+isSigner) ⇒

<a name="new_XrplContext_new"></a>

### new XrplContext(hpContext, address, [secret], [options])
Creates an instance of XrplContext.


| Param | Type | Default | Description |
| --- | --- | --- | --- |
| hpContext | [<code>HotPocketContext</code>](#HotPocketContext) |  | The HotPocket context to use. |
| address | <code>string</code> |  | The XRPL account address. |
| [secret] | <code>string</code> \| <code>null</code> | <code>null</code> | The XRPL account secret. |
| [options] | <code>XrplOptions</code> | <code>{}</code> | Options for XRPL context. |

<a name="XrplContext+init"></a>

### xrplContext.init()
Initialize the xrpl context.

**Kind**: instance method of [<code>XrplContext</code>](#XrplContext)  
<a name="XrplContext+deinit"></a>

### xrplContext.deinit()
Deinitialize the xrpl context.

**Kind**: instance method of [<code>XrplContext</code>](#XrplContext)  
<a name="XrplContext+getPendingTransactions"></a>

### xrplContext.getPendingTransactions() ⇒
Fetches details of submitted non validated transactions.

**Kind**: instance method of [<code>XrplContext</code>](#XrplContext)  
**Returns**: an array of transactions that are not validated.  
<a name="XrplContext+getValidatedTransactions"></a>

### xrplContext.getValidatedTransactions() ⇒
Fetches details of submitted validated transactions.

**Kind**: instance method of [<code>XrplContext</code>](#XrplContext)  
**Returns**: an array of transactions that are validated.  
<a name="XrplContext+getValidatedTransaction"></a>

### xrplContext.getValidatedTransaction(hash) ⇒
Get the transaction of the hash if validated.

**Kind**: instance method of [<code>XrplContext</code>](#XrplContext)  
**Returns**: The transaction if validated.  

| Param | Description |
| --- | --- |
| hash | Transaction hash. |

<a name="XrplContext+loadSignerList"></a>

### xrplContext.loadSignerList()
Load signer list of the account

**Kind**: instance method of [<code>XrplContext</code>](#XrplContext)  
<a name="XrplContext+getSequence"></a>

### xrplContext.getSequence() ⇒
Get current sequence value of the master account.

**Kind**: instance method of [<code>XrplContext</code>](#XrplContext)  
**Returns**: Current sequence number.  
<a name="XrplContext+getTransactions"></a>

### xrplContext.getTransactions(ledgerIndex) ⇒
Get transaction list of the master account starting from a ledger.

**Kind**: instance method of [<code>XrplContext</code>](#XrplContext)  
**Returns**: LIst of transactions  

| Param | Description |
| --- | --- |
| ledgerIndex | Starting ledger index. |

<a name="XrplContext+getMaxLedgerSequence"></a>

### xrplContext.getMaxLedgerSequence() ⇒
Get a maximum ledger number to validate a transaction.

**Kind**: instance method of [<code>XrplContext</code>](#XrplContext)  
**Returns**: The maximum ledger number.  
<a name="XrplContext+getTransactionSubmissionInfo"></a>

### xrplContext.getTransactionSubmissionInfo([options&#x3D;], [decisionOptions]) ⇒
Decide a transaction submission info for a transaction.

**Kind**: instance method of [<code>XrplContext</code>](#XrplContext)  
**Returns**: Transaction submission info.  

| Param | Default | Description |
| --- | --- | --- |
| [options=] |  | Vote options to decide the transaction submission info. |
| [decisionOptions] | <code></code> | Any other options that needed to be decided. |

<a name="XrplContext+submitMultisignedTx"></a>

### xrplContext.submitMultisignedTx(tx) ⇒
Submit a multisigned transaction.

**Kind**: instance method of [<code>XrplContext</code>](#XrplContext)  
**Returns**: The transaction response.  

| Param | Description |
| --- | --- |
| tx | Multi-signed transaction |

<a name="XrplContext+multiSignAndSubmitTransaction"></a>

### xrplContext.multiSignAndSubmitTransaction(transaction, [options&#x3D;])
Multi sign and submit a given transaction.

**Kind**: instance method of [<code>XrplContext</code>](#XrplContext)  

| Param | Description |
| --- | --- |
| transaction | Transaction to submit. |
| [options=] | Multisigner options. |

<a name="XrplContext+generateNewSignerList"></a>

### xrplContext.generateNewSignerList([options&#x3D;]) ⇒
Generate new signer list.

**Kind**: instance method of [<code>XrplContext</code>](#XrplContext)  
**Returns**: The new signer list.  

| Param | Description |
| --- | --- |
| [options=] | Multisigner options. |

<a name="XrplContext+setSignerList"></a>

### xrplContext.setSignerList(signerListInfo, [options&#x3D;])
Set a provided signer list to the master account.

**Kind**: instance method of [<code>XrplContext</code>](#XrplContext)  

| Param | Description |
| --- | --- |
| signerListInfo | Signer list info. |
| [options=] | Multisigner options to set. |

<a name="XrplContext+renewSignerList"></a>

### xrplContext.renewSignerList([options&#x3D;])
Renew the current signer list.

**Kind**: instance method of [<code>XrplContext</code>](#XrplContext)  

| Param | Description |
| --- | --- |
| [options=] | Multisigner options to override. |

<a name="XrplContext+addXrplSigner"></a>

### xrplContext.addXrplSigner(pubkey, weight, [options&#x3D;]) ⇒
Add new signer node to the signer list.

**Kind**: instance method of [<code>XrplContext</code>](#XrplContext)  
**Returns**: New signer address.  

| Param | Description |
| --- | --- |
| pubkey | Public key of the node to add. |
| weight | Signer weight for the new signer. |
| [options=] | Multisigner options to override. |

<a name="XrplContext+removeXrplSigner"></a>

### xrplContext.removeXrplSigner(pubkey, [options&#x3D;])
Remove a signer node from the signer list.

**Kind**: instance method of [<code>XrplContext</code>](#XrplContext)  

| Param | Description |
| --- | --- |
| pubkey | Public key of the signer node to remove. |
| [options=] | Multisigner options to override. |

<a name="XrplContext+replaceSignerList"></a>

### xrplContext.replaceSignerList(oldSignerAddress, newSignerAddress, [options&#x3D;]) ⇒
Replaces a signer node from a new node.

**Kind**: instance method of [<code>XrplContext</code>](#XrplContext)  
**Returns**: New signer address.  

| Param | Description |
| --- | --- |
| oldSignerAddress | Signer address of old node. |
| newSignerAddress | New address to add as signer. |
| [options=] | Multisigner options to override. |

<a name="XrplContext+getSignerList"></a>

### xrplContext.getSignerList() ⇒ <code>Object</code> \| <code>null</code>
Returns the signer list of the account

**Kind**: instance method of [<code>XrplContext</code>](#XrplContext)  
**Returns**: <code>Object</code> \| <code>null</code> - An object in the form of {signerQuorum: <1> , signerList: [{account: "rawweeeere3e3", weight: 1}, {}, ...]} || null  
<a name="XrplContext+isSigner"></a>

### xrplContext.isSigner() ⇒
Check wether this node is a signer.

**Kind**: instance method of [<code>XrplContext</code>](#XrplContext)  
**Returns**: true or false if signer or not.  
<a name="MultiSigner"></a>

## MultiSigner
Manages signing operations for Xahau transactions using a signer key.

**Kind**: global class  

* [MultiSigner](#MultiSigner)
    * [new MultiSigner(masterAcc)](#new_MultiSigner_new)
    * [.getSigner()](#MultiSigner+getSigner) ⇒
    * [.setSigner(signer)](#MultiSigner+setSigner)
    * [.removeSigner()](#MultiSigner+removeSigner)
    * [.generateSigner()](#MultiSigner+generateSigner) ⇒
    * [.sign(tx)](#MultiSigner+sign) ⇒
    * [.isSignerNode()](#MultiSigner+isSignerNode) ⇒

<a name="new_MultiSigner_new"></a>

### new MultiSigner(masterAcc)
Creates an instance of MultiSigner.


| Param | Type | Description |
| --- | --- | --- |
| masterAcc | <code>any</code> | The master account containing XRPL API and address information. |

<a name="MultiSigner+getSigner"></a>

### multiSigner.getSigner() ⇒
Get the signer.

**Kind**: instance method of [<code>MultiSigner</code>](#MultiSigner)  
**Returns**: Signer info.  
<a name="MultiSigner+setSigner"></a>

### multiSigner.setSigner(signer)
Set the signer.

**Kind**: instance method of [<code>MultiSigner</code>](#MultiSigner)  

| Param | Description |
| --- | --- |
| signer | Signer to set. |

<a name="MultiSigner+removeSigner"></a>

### multiSigner.removeSigner()
Remove the signer.

**Kind**: instance method of [<code>MultiSigner</code>](#MultiSigner)  
<a name="MultiSigner+generateSigner"></a>

### multiSigner.generateSigner() ⇒
Generate a key for the node and save the node key in a file named by (../\<master address\>.key).

**Kind**: instance method of [<code>MultiSigner</code>](#MultiSigner)  
**Returns**: Generated signer info.  
<a name="MultiSigner+sign"></a>

### multiSigner.sign(tx) ⇒
**Kind**: instance method of [<code>MultiSigner</code>](#MultiSigner)  
**Returns**: The signed transaction blob.  

| Param | Description |
| --- | --- |
| tx | Transaction in json. |

<a name="MultiSigner+isSignerNode"></a>

### multiSigner.isSignerNode() ⇒
Check wether this is a signer.

**Kind**: instance method of [<code>MultiSigner</code>](#MultiSigner)  
**Returns**: true or false based on signer or not.  
<a name="AllVoteElector"></a>

## AllVoteElector
Evaluates votes in an election based on the desired vote count and timeout.

**Kind**: global class  

* [AllVoteElector](#AllVoteElector)
    * [new AllVoteElector(desiredVoteCount, timeout)](#new_AllVoteElector_new)
    * [.election(electionName, voteEmitter, context)](#AllVoteElector+election) ⇒

<a name="new_AllVoteElector_new"></a>

### new AllVoteElector(desiredVoteCount, timeout)
Creates an instance of AllVoteElector.


| Param | Type | Description |
| --- | --- | --- |
| desiredVoteCount | <code>number</code> | The number of votes needed to complete the election. |
| timeout | <code>number</code> | The timeout period in milliseconds for the election. |

<a name="AllVoteElector+election"></a>

### allVoteElector.election(electionName, voteEmitter, context) ⇒
Evaluate the election.

**Kind**: instance method of [<code>AllVoteElector</code>](#AllVoteElector)  
**Returns**: Evaluated votes as a promise.  

| Param | Description |
| --- | --- |
| electionName | Election identifier. |
| voteEmitter | Event emitter which the votes are fed into, |
| context | Vote context for the election. |

