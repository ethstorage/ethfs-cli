import * as fs from 'fs';
import { ethers } from 'ethers';
import { namehash } from 'eth-ens-namehash';
import {
    NETWORK_MAPPING,
    PROVIDER_URLS,
    NS_ADDRESS,
    GALILEO_CHAIN_ID,

    NSAbi,
    ResolverAbi
} from '../params';
import {
    WebHandlerResult,
    FilePool,
    Nullable
} from "../types/types";

import color from 'colors-cli/safe';
const error = color.red.bold;

export function isPrivateKey(key: any): boolean {
    try {
        if (typeof (key) === 'string' && !key.startsWith('0x')) {
            key = '0x' + key;
        }
        return ethers.isHexString(key, 32);
    } catch {
        return false;
    }
}

export async function getChainIdByRpc(rpc: Nullable<string>): Promise<number | undefined> {
    if (!rpc) {
        return undefined;
    }
    const provider = new ethers.JsonRpcProvider(rpc);
    const network = await provider.getNetwork();
    return Number(network.chainId);
}

export async function getWebHandler(
    domain: string,
    rpc: Nullable<string>,
    chainId: Nullable<number>,
    defaultChainId: number,
    isBr = true
): Promise<WebHandlerResult | undefined> {
    // get web handler address, domain is address, xxx.ens, xxx.w3q

    // get chain id by short name
    let snChainId: number | undefined;
    let address: string;
    const domains = domain.split(':');
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
        if (address.endsWith('.w3q')) {
            chainId = GALILEO_CHAIN_ID;
        }
    }

    // get rpc
    let providerUrl = rpc || PROVIDER_URLS[chainId];
    if (!providerUrl) {
        console.error(error(`ERROR: The network(${chainId}) need RPC, please try again after setting RPC!`));
        return;
    }

    const br = isBr ? '\n' : '';
    const ethAddrReg = /^0x[0-9a-fA-F]{40}$/;
    if (ethAddrReg.test(address)) {
        console.log(`providerUrl = ${providerUrl}\nchainId = ${chainId}\naddress = ${address} ${br}`);
        return { providerUrl, chainId, address };
    }

    // .w3q or .eth domain
    const nameServiceContract = NS_ADDRESS[chainId];
    if (!nameServiceContract) {
        console.log(error(`Not Support Name Service: ${domain}`));
        return;
    }
    let webHandler: string;
    const provider = new ethers.JsonRpcProvider(providerUrl);
    try {
        const nameHash = namehash(address);
        const nsContract = new ethers.Contract(nameServiceContract, NSAbi, provider) as any;
        const resolver = await nsContract.resolver(nameHash);
        const resolverContract = new ethers.Contract(resolver, ResolverAbi, provider) as any;
        if (chainId === GALILEO_CHAIN_ID) {
            webHandler = await resolverContract.webHandler(nameHash);
        } else {
            webHandler = await resolverContract.text(nameHash, 'contentcontract');
        }
    } catch {
        console.log(error(`Not Support Domain: ${domain}`));
        return;
    }

    // address
    if (ethAddrReg.test(webHandler)) {
        console.log(`providerUrl = ${providerUrl}\nchainId = ${chainId}\naddress = ${address} ${br}`);
        return { providerUrl, chainId, address: webHandler };
    }
    const short = webHandler.split(':');
    let shortAdd: string, shortName: string;
    if (short.length > 1) {
        shortName = domains[0];
        shortAdd = domains[1];
    } else {
        console.error(error(`ERROR: invalid web handler=${webHandler}.`));
        return;
    }
    const newChainId = NETWORK_MAPPING[shortName];
    providerUrl = chainId === newChainId ? providerUrl : PROVIDER_URLS[newChainId];
    console.log(`providerUrl = ${providerUrl}\nchainId = ${chainId}\naddress = ${address} ${br}`);
    return {
        providerUrl: providerUrl,
        chainId: newChainId,
        address: shortAdd,
    };
}

export async function checkBalance(
    provider: ethers.JsonRpcProvider,
    domainAddr: string,
    accountAddr: string
): Promise<{ domainBalance: bigint, accountBalance: bigint }> {
    try {
        const [domainBalance, accountBalance] = await Promise.all([
            provider.getBalance(domainAddr),
            provider.getBalance(accountAddr),
        ]);
        return {
            domainBalance,
            accountBalance,
        };
    } catch (error) {
        console.error(error);
        return {
            domainBalance: 0n,
            accountBalance: 0n,
        };
    }
}

export function recursiveFiles(path: string, basePath: string): FilePool[] {
    let filePools: FilePool[] = [];
    const fileStat = fs.statSync(path);
    if (fileStat.isFile()) {
        filePools.push({
            path: path,
            name: path.substring(path.lastIndexOf('/') + 1),
            size: fileStat.size,
        });
        return filePools;
    }

    const files = fs.readdirSync(path);
    for (let file of files) {
        const fileStat = fs.statSync(`${path}/${file}`);
        if (fileStat.isDirectory()) {
            const pools = recursiveFiles(`${path}/${file}`, `${basePath}${file}/`);
            filePools = filePools.concat(pools);
        } else {
            filePools.push({
                path: `${path}/${file}`,
                name: `${basePath}${file}`,
                size: fileStat.size,
            });
        }
    }
    return filePools;
}
