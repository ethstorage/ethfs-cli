const fs = require("fs");
const {ethers} = require("ethers");
const {normalize} = require("eth-ens-namehash");
const {keccak_256: sha3} = require("js-sha3");
const {
    NETWORK_MAPPING,
    PROVIDER_URLS,
    NS_ADDRESS,
    GALILEO_CHAIN_ID,

    NSAbi,
    ResolverAbi,
} = require('../params');

const color = require('colors-cli/safe')
const error = color.red.bold;

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

function namehash(inputName) {
    let node = ''
    for (let i = 0; i < 32; i++) {
        node += '00'
    }

    if (inputName) {
        const labels = inputName.split('.');
        for (let i = labels.length - 1; i >= 0; i--) {
            let normalisedLabel = normalize(labels[i])
            let labelSha = sha3(normalisedLabel)
            node = sha3(Buffer.from(node + labelSha, 'hex'))
        }
    }

    return '0x' + node
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
async function getWebHandler(domain, rpc, chainId, defaultChainId) {
    // get web handler address, domain is address, xxx.ens, xxx.w3q

    // get chain id by short name
    let snChainId;
    let address;
    const domains = domain.split(":");
    if (domains.length > 1) {
        snChainId = NETWORK_MAPPING[domains[0]];
        if (!snChainId) {
            console.error(error(`ERROR: invalid shortName=${domains[0]}.`));
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
            console.error(error(`ERROR: --chainId(${chainId}) and short name chainId(${snChainId}) conflict.`));
            return;
        }
        if (rpcChainId && chainId !== rpcChainId) {
            console.error(error(`ERROR: --chainId(${chainId}) and rpc chainId(${rpcChainId}) conflict.`));
            return;
        }
    } else if (snChainId) {
        if (rpcChainId && snChainId !== rpcChainId) {
            console.error(error(`ERROR: short name chainId(${snChainId}) and rpc chainId(${rpcChainId}) conflict.`));
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
        console.error(error(`ERROR: The network(${chainId}) need RPC, please try again after setting RPC!`));
        return;
    }

    // address
    const ethAddrReg = /^0x[0-9a-fA-F]{40}$/;
    if (ethAddrReg.test(address)) {
        console.log(`providerUrl = ${providerUrl}\nchainId = ${chainId}\naddress = ${address}\n`);
        return {providerUrl, chainId, address};
    }

    // .w3q or .eth domain
    let nameServiceContract = NS_ADDRESS[chainId];
    if (!nameServiceContract) {
        console.log(error(`Not Support Name Service: ${domain}`));
        return;
    }
    let webHandler;
    const provider = new ethers.JsonRpcProvider(providerUrl);
    try {
        const nameHash = namehash(address);
        const nsContract = new ethers.Contract(nameServiceContract, NSAbi, provider);
        const resolver = await nsContract.resolver(nameHash);
        const resolverContract = new ethers.Contract(resolver, ResolverAbi, provider);
        if (chainId === GALILEO_CHAIN_ID) {
            webHandler = await resolverContract.webHandler(nameHash);
        } else {
            webHandler = await resolverContract.text(nameHash, "contentcontract");
        }
    } catch (e) {
        console.log(error(`Not Support Domain: ${domain}`));
        return;
    }

    // address
    if (ethAddrReg.test(webHandler)) {
        console.log(`providerUrl = ${providerUrl}\nchainId = ${chainId}\naddress = ${address}\n`);
        return {providerUrl, chainId, address: webHandler};
    }
    const short = webHandler.split(":");
    let shortAdd, shortName;
    if (short.length > 1) {
        shortName = domains[0];
        shortAdd = domains[1];
    } else {
        console.error(error(`ERROR: invalid web handler=${webHandler}.`));
        return;
    }
    const newChainId = NETWORK_MAPPING[shortName];
    providerUrl = chainId === newChainId ? providerUrl : PROVIDER_URLS[newChainId];
    console.log(`providerUrl = ${providerUrl}\nchainId = ${newChainId}\naddress = ${shortAdd}\n`);
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
        console.log(reason);
    });
}

function getFileChunk(path, fileSize, start, end) {
    end = end > fileSize ? fileSize : end;
    const length = end - start;
    const buf = Buffer.alloc(length);
    const fd = fs.openSync(path, 'r');
    fs.readSync(fd, buf, 0, length, start);
    fs.closeSync(fd);
    return buf;
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

module.exports = {
    isPrivateKey,
    getChainIdByRpc,
    getWebHandler,
    checkBalance,
    getFileChunk,
    recursiveFiles
}
