# everpocket-nodejs-contract

**--work in progress--**

Evernode convenience library for Hot Pocket nodejs contracts.

NPM package: https://www.npmjs.com/package/everpocket-nodejs-contract

This library introduces several wrappers around Evernode, XRPL and HotPocket to aid development of HotPocket smart contracts using NodeJs. It has following main classes which the developers can mix and match and customize according to their needs.

1. HotPocketContext - Wrapper around HotPocket contract and client libraries containing utility functions for high level HotPocket operations.
2. VoteContext - Wrapper around HotPocket NPL messaging to perform NPL voting and data collection.
3. XrplContext - Wrapper around HotPocket contract and xrpl libraries to perform multi-sig xrpl transactions as a cluster.
4. EvernodeContext - Wrapper around XrplContext to perform Evernode operations (sich as lease aquire, extend...) as a cluster.
5. ClusterContext - Wrapper around EvernodeContext which can manage the contract cluster instances using Evernode hosting.
6. NomadContext - Wrapper around ClusterContext which can maintain a "nomadic" cluster according to given tuning parameters.

Some of these components are not well tested and still work in progress. The structure of the library and apis may change in the future.
