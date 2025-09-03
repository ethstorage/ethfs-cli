const fs = require("fs");
const {ethers} = require("ethers");
const {
    NETWORK_MAPPING,
    PROVIDER_URLS,
    NS_ADDRESS,
    GALILEO_CHAIN_ID,

    NSAbi,
    ResolverAbi,
} = require('../params');
const { Logger } = require('./log');
const { FlatDirectory } = require("ethstorage-sdk");

function isPrivateKey(key) {
    try {
        if (typeof (key) === "string" && !key.startsWith("0x")) {
            key = "0x" + key;
        }
        return ethers.isHexString(key, 32);
    } catch (error) {
        return false;
    }
}

async function getChainIdByRpc(rpc) {
    if (!rpc) {
        return;
    }
    const provider = new ethers.JsonRpcProvider(rpc);
    const network = await provider.getNetwork();
    return Number(network.chainId);
}

// return address or eip3770 address
async function getWebHandler(domain, rpc, chainId, defaultChainId, isBr = true) {
    // get web handler address, domain is address, xxx.ens, xxx.w3q

    // get chain id by short name
    let snChainId;
    let address;
    const domains = domain.split(":");
    if (domains.length > 1) {
        snChainId = NETWORK_MAPPING[domains[0]];
        if (!snChainId) {
            Logger.error(`Invalid shortName: ${domains[0]} not found in network mapping.`);
            return;
        }
        address = domains[1];
    } else {
        address = domain;
    }

    // get rpc chain id
    const rpcChainId = await getChainIdByRpc(rpc);

    // get chain id
    if (chainId) {
        chainId = Number(chainId);
        if (snChainId && chainId !== snChainId) {
            Logger.error(`Conflict: Provided chainId (${chainId}) and shortName chainId (${snChainId}) do not match.`);
            return;
        }
        if (rpcChainId && chainId !== rpcChainId) {
            Logger.error(`Conflict: Provided chainId (${chainId}) and RPC chainId (${rpcChainId}) do not match.`);
            return;
        }
    } else if (snChainId) {
        if (rpcChainId && snChainId !== rpcChainId) {
            Logger.error(`Conflict: shortName chainId (${snChainId}) and RPC chainId (${rpcChainId}) do not match.`);
            return;
        }
        chainId = snChainId;
    } else if (rpcChainId) {
        chainId = rpcChainId;
    } else {
        chainId = defaultChainId;
        if (address.endsWith(".w3q")) {
            chainId = GALILEO_CHAIN_ID;
        }
    }

    // get rpc
    let providerUrl = rpc || PROVIDER_URLS[chainId];
    if (!providerUrl) {
        Logger.error(`No RPC found for chainId ${chainId}. Please provide a valid RPC.`);
        return;
    }

    // address
    const ethAddrReg = /^0x[0-9a-fA-F]{40}$/;
    if (ethAddrReg.test(address)) {
        Logger.info(`Provider URL: ${providerUrl}`);
        Logger.info(`Chain ID: ${chainId}`);
        Logger.info(`Address: ${address}`);
        if (isBr) Logger.log('');
        return { providerUrl, chainId, address };
    }

    // .w3q or .eth domain
    let nameServiceContract = NS_ADDRESS[chainId];
    if (!nameServiceContract) {
        Logger.error(`Name Service not supported for domain ${domain}.`);
        return;
    }
    let webHandler;
    const provider = new ethers.JsonRpcProvider(providerUrl);
    try {
        const nameHash = ethers.namehash(address);
        const nsContract = new ethers.Contract(nameServiceContract, NSAbi, provider);
        const resolver = await nsContract.resolver(nameHash);
        const resolverContract = new ethers.Contract(resolver, ResolverAbi, provider);
        if (chainId === GALILEO_CHAIN_ID) {
            webHandler = await resolverContract.webHandler(nameHash);
        } else {
            webHandler = await resolverContract.text(nameHash, "contentcontract");
        }
    } catch (e) {
        Logger.error(`Unable to resolve domain ${domain}.`);
        return;
    }

    // address
    if (ethAddrReg.test(webHandler)) {
        Logger.info(`Provider URL: ${providerUrl}`);
        Logger.info(`Chain ID: ${chainId}`);
        Logger.info(`Address: ${webHandler}`);
        if (isBr) Logger.log('');
        return { providerUrl, chainId, address: webHandler };
    }
    const short = webHandler.split(":");
    let shortAdd, shortName;
    if (short.length > 1) {
        shortName = domains[0];
        shortAdd = domains[1];
    } else {
        Logger.error(`Invalid web handler format: ${webHandler}.`);
        return;
    }
    const newChainId = NETWORK_MAPPING[shortName];
    providerUrl = chainId === newChainId ? providerUrl : PROVIDER_URLS[newChainId];
    Logger.info(`Provider URL: ${providerUrl}`);
    Logger.info(`Chain ID: ${newChainId}`);
    Logger.info(`Address: ${shortAdd}`);
    if (isBr) Logger.log('');
    return {
        providerUrl: providerUrl,
        chainId: newChainId,
        address: shortAdd
    };
}

async function checkBalance(provider, domainAddr, accountAddr) {
    return Promise.all([
        provider.getBalance(domainAddr),
        provider.getBalance(accountAddr)
    ]).then(values => {
        return {
            domainBalance: values[0],
            accountBalance: values[1]
        };
    }, reason => {
        Logger.error(`Balance check failed: ${reason}`);
    });
}

function recursiveFiles(path, basePath) {
    let filePools = [];
    const fileStat = fs.statSync(path);
    if (fileStat.isFile()) {
        filePools.push({path: path, name: path.substring(path.lastIndexOf("/") + 1), size: fileStat.size});
        return filePools;
    }

    const files = fs.readdirSync(path);
    for (let file of files) {
        const fileStat = fs.statSync(`${path}/${file}`);
        if (fileStat.isDirectory()) {
            const pools = recursiveFiles(`${path}/${file}`, `${basePath}${file}/`);
            filePools = filePools.concat(pools);
        } else {
            filePools.push({path: `${path}/${file}`, name: `${basePath}${file}`, size: fileStat.size});
        }
    }
    return filePools;
}

const createSDK = async (rpc, privateKey, address, ethStorageRpc) => {
    try {
        return await FlatDirectory.create({ rpc, privateKey, address, ethStorageRpc });
    } catch (e) {
        if (e.message.includes('The current SDK no longer supports this contract version')) {
            const match = e.message.match(/\(([\d\.]+)\)/);
            const contractVersion = match ? match[1] : 'unknown';

            let cliSuggestion;
            if (contractVersion === '1.0.0') {
                cliSuggestion = 'ethfs-cli v2.0';
            } else {
                cliSuggestion = 'ethfs-cli v1.x';
            }

            Logger.error(
                `Failed to initialize SDK: The contract version (${contractVersion}) is not supported.\n` +
                `Please either:\n` +
                `  1) Deploy a new compatible contract, or\n` +
                `  2) Use ${cliSuggestion} to interact with this contract.`
            );
        } else {
            Logger.error(`SDK initialization failed. Please check parameters/network. info=${e.message}`);
        }
        return null;
    }
}

module.exports = {
    isPrivateKey,
    getChainIdByRpc,
    getWebHandler,
    checkBalance,
    recursiveFiles,
    createSDK
}
