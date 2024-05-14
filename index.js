const fs = require('fs');
const path = require('path');
const { EthStorage, Download } = require("ethstorage-sdk");
const { ethers } = require("ethers");
const { normalize } = require('eth-ens-namehash');
const sha3 = require('js-sha3').keccak_256;
const { Uploader, VERSION_BLOB, VERSION_CALL_DATA} = require("./upload/Uploader");

const color = require('colors-cli/safe')
const error = color.red.bold;
const notice = color.blue;

const nsAbi = [
  "function pointerOf(bytes memory name) public view returns (address)",
  "function resolver(bytes32 node) public view returns (address)",
];
const resolverAbi = [
  "function webHandler(bytes32 node) external view returns (address)",
  "function text(bytes32 node, string calldata key) external view returns (string memory)"
];

const SHORT_NAME_GALILEO = "w3q-g";
const SHORT_NAME_ETHEREUM = "eth";
const SHORT_NAME_GOERLI = "gor";
const SHORT_NAME_SEPOLIA = "sep";
const SHORT_NAME_OPTIMISTIC = "oeth";
const SHORT_NAME_ARBITRUM = "arb1";
const SHORT_NAME_OPTIMISTIC_GOERLI = "ogor";
const SHORT_NAME_ARBITRUM_GOERLI = "arb-goerli";
const SHORT_NAME_EVMOS = "evmos";
const SHORT_NAME_EVMOS_TEST = "evmos-testnet";
const SHORT_NAME_ARBITRUM_NOVE = "arb-nova";
const SHORT_NAME_BINANCE = "bnb";
const SHORT_NAME_BINANCE_TEST = "bnbt";
const SHORT_NAME_AVALANCHE = "avax";
const SHORT_NAME_AVALANCHE_TEST = "fuji";
const SHORT_NAME_FANTOM = "ftm";
const SHORT_NAME_FANTOM_TEST = "tftm";
const SHORT_NAME_HARMONY = "hmy-s0";
const SHORT_NAME_HARMONY_TEST = "hmy-b-s0";
const SHORT_NAME_POLYGON = "matic";
const SHORT_NAME_POLYGON_MUMBAI = "maticmum";
const SHORT_NAME_POLYGON_ZKEVM_TEST = "zkevmtest";
const SHORT_NAME_QUARKCHAIN = "qkc-s0";
const SHORT_NAME_QUARKCHAIN_DEVNET = "qkc-d-s0";

const GALILEO_CHAIN_ID = 3334;
const ETHEREUM_CHAIN_ID = 1;
const GOERLI_CHAIN_ID = 5;
const SEPOLIA_CHAIN_ID = 11155111;
const OPTIMISTIC_CHAIN_ID = 10;
const ARBITRUM_CHAIN_ID = 42161;
const OPTIMISTIC_GOERLI_CHAIN_ID = 420;
const ARBITRUM_GOERLI_CHAIN_ID = 421613;
const EVMOS_CHAIN_ID = 9001;
const EVMOS_TEST_CHAIN_ID = 9000;
const ARBITRUM_NOVE_CHAIN_ID = 42170;
const BINANCE_CHAIN_ID = 56;
const BINANCE_TEST_CHAIN_ID = 97;
const AVALANCHE_CHAIN_ID = 43114;
const AVALANCHE_TEST_CHAIN_ID = 43113;
const FANTOM_CHAIN_ID = 250;
const FANTOM_TEST_CHAIN_ID = 4002;
const HARMONY_CHAIN_ID = 1666600000;
const HARMONY_TEST_CHAIN_ID = 1666700000;
const POLYGON_CHAIN_ID = 137;
const POLYGON_MUMBAI_CHAIN_ID = 80001;
const POLYGON_ZKEVM_TEST_CHAIN_ID = 1402;
const QUARKCHAIN_CHAIN_ID = 100001;
const QUARKCHAIN_DEVNET_CHAIN_ID = 110001;

const NETWORK_MAPING = {
  [SHORT_NAME_GALILEO]: GALILEO_CHAIN_ID,
  [SHORT_NAME_ETHEREUM]: ETHEREUM_CHAIN_ID,
  [SHORT_NAME_GOERLI]: GOERLI_CHAIN_ID,
  [SHORT_NAME_SEPOLIA]: SEPOLIA_CHAIN_ID,
  [SHORT_NAME_OPTIMISTIC]: OPTIMISTIC_CHAIN_ID,
  [SHORT_NAME_ARBITRUM]: ARBITRUM_CHAIN_ID,
  [SHORT_NAME_OPTIMISTIC_GOERLI]: OPTIMISTIC_GOERLI_CHAIN_ID,
  [SHORT_NAME_ARBITRUM_GOERLI]: ARBITRUM_GOERLI_CHAIN_ID,
  [SHORT_NAME_EVMOS]: EVMOS_CHAIN_ID,
  [SHORT_NAME_EVMOS_TEST]: EVMOS_TEST_CHAIN_ID,
  [SHORT_NAME_ARBITRUM_NOVE]: ARBITRUM_NOVE_CHAIN_ID,
  [SHORT_NAME_BINANCE]: BINANCE_CHAIN_ID,
  [SHORT_NAME_BINANCE_TEST]: BINANCE_TEST_CHAIN_ID,
  [SHORT_NAME_AVALANCHE]: AVALANCHE_CHAIN_ID,
  [SHORT_NAME_AVALANCHE_TEST]: AVALANCHE_TEST_CHAIN_ID,
  [SHORT_NAME_FANTOM]: FANTOM_CHAIN_ID,
  [SHORT_NAME_FANTOM_TEST]: FANTOM_TEST_CHAIN_ID,
  [SHORT_NAME_HARMONY]: HARMONY_CHAIN_ID,
  [SHORT_NAME_HARMONY_TEST]: HARMONY_TEST_CHAIN_ID,
  [SHORT_NAME_POLYGON]: POLYGON_CHAIN_ID,
  [SHORT_NAME_POLYGON_MUMBAI]: POLYGON_MUMBAI_CHAIN_ID,
  [SHORT_NAME_POLYGON_ZKEVM_TEST]: POLYGON_ZKEVM_TEST_CHAIN_ID,
  [SHORT_NAME_QUARKCHAIN]: QUARKCHAIN_CHAIN_ID,
  [SHORT_NAME_QUARKCHAIN_DEVNET]: QUARKCHAIN_DEVNET_CHAIN_ID,
}

const PROVIDER_URLS = {
  [GALILEO_CHAIN_ID]: 'https://galileo.web3q.io:8545',
  [ETHEREUM_CHAIN_ID]: 'https://ethereum.publicnode.com',
  [GOERLI_CHAIN_ID]: 'https://rpc.ankr.com/eth_goerli',
  [SEPOLIA_CHAIN_ID]: 'http://88.99.30.186:8545/',
  [OPTIMISTIC_CHAIN_ID]: 'https://mainnet.optimism.io',
  [ARBITRUM_CHAIN_ID]: 'https://arb1.arbitrum.io/rpc',
  [OPTIMISTIC_GOERLI_CHAIN_ID]: 'https://goerli.optimism.io',
  [ARBITRUM_GOERLI_CHAIN_ID]: 'https://goerli-rollup.arbitrum.io/rpc',
  [EVMOS_CHAIN_ID]: 'https://evmos-evm.publicnode.com',
  [EVMOS_TEST_CHAIN_ID]: 'https://eth.bd.evmos.dev:8545',
  [ARBITRUM_NOVE_CHAIN_ID]: 'https://nova.arbitrum.io/rpc',
  [BINANCE_CHAIN_ID]: 'https://bsc-dataseed2.binance.org',
  [BINANCE_TEST_CHAIN_ID]: 'https://data-seed-prebsc-1-s1.binance.org:8545',
  [AVALANCHE_CHAIN_ID]: 'https://api.avax.network/ext/bc/C/rpc',
  [AVALANCHE_TEST_CHAIN_ID]: 'https://avalanchetestapi.terminet.io/ext/bc/C/rpc',
  [FANTOM_CHAIN_ID]: 'https://rpcapi.fantom.network',
  [FANTOM_TEST_CHAIN_ID]: 'https://rpc.testnet.fantom.network',
  [HARMONY_CHAIN_ID]: 'https://a.api.s0.t.hmny.io',
  [HARMONY_TEST_CHAIN_ID]: 'https://api.s0.b.hmny.io',
  [POLYGON_CHAIN_ID]: 'https://polygon-rpc.com',
  [POLYGON_MUMBAI_CHAIN_ID]: 'https://matic-mumbai.chainstacklabs.com',
  [POLYGON_ZKEVM_TEST_CHAIN_ID]: 'https://rpc.public.zkevm-test.net',
  [QUARKCHAIN_CHAIN_ID]: 'https://mainnet-s0-ethapi.quarkchain.io',
  [QUARKCHAIN_DEVNET_CHAIN_ID]: 'https://devnet-s0-ethapi.quarkchain.io',
}

const NS_ADDRESS = {
  [GALILEO_CHAIN_ID]: '0xD379B91ac6a93AF106802EB076d16A54E3519CED',
  [ETHEREUM_CHAIN_ID]: '0x00000000000c2e074ec69a0dfb2997ba6c7d2e1e',
  [GOERLI_CHAIN_ID]: '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e',
}

// eip-4844
const ETH_STORAGE_ADDRESS = {
  [SEPOLIA_CHAIN_ID]: '0x804C520d3c084C805E37A35E90057Ac32831F96f',
}
const ETH_STORAGE_RPC = {
  [SEPOLIA_CHAIN_ID]: 'http://65.108.236.27:9540',
}

const CHAIN_ID_DEFAULT = ETHEREUM_CHAIN_ID;


// **** utils ****
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
async function getWebHandler(domain, rpc, chainId) {
  // get web handler address, domain is address, xxx.ens, xxx.w3q

  // get chain id by short name
  let snChainId;
  let address;
  const domains = domain.split(":");
  if (domains.length > 1) {
    snChainId = NETWORK_MAPING[domains[0]];
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
    chainId = CHAIN_ID_DEFAULT;
    if (address.endsWith(".w3q")) {
      chainId = GALILEO_CHAIN_ID;
    }
  }

  // get rpc
  let providerUrl = rpc ?? PROVIDER_URLS[chainId];
  if (!providerUrl) {
    console.error(error(`ERROR: The network(${chainId}) need RPC, please try again after setting RPC!`));
    return;
  }

  // address
  const ethAddrReg = /^0x[0-9a-fA-F]{40}$/;
  if (ethAddrReg.test(address)) {
    console.log(`providerUrl = ${providerUrl}\nchainId = ${chainId}\naddress: ${address}\n`);
    return {providerUrl, chainId, address};
  }

  // .w3q or .eth domain
  let nameServiceContract = NS_ADDRESS[chainId];
  if(!nameServiceContract) {
    console.log(error(`Not Support Name Service: ${domain}`));
    return;
  }
  let webHandler;
  const provider = new ethers.JsonRpcProvider(providerUrl);
  try {
    const nameHash = namehash(address);
    const nsContract = new ethers.Contract(nameServiceContract, nsAbi, provider);
    const resolver = await nsContract.resolver(nameHash);
    const resolverContract = new ethers.Contract(resolver, resolverAbi, provider);
    if (chainId === GALILEO_CHAIN_ID) {
      webHandler = await resolverContract.webHandler(nameHash);
    } else {
      webHandler = await resolverContract.text(nameHash, "contentcontract");
    }
  } catch (e){
    console.log(error(`Not Support Domain: ${domain}`));
    return;
  }

  // address
  if (ethAddrReg.test(webHandler)) {
    console.log(`providerUrl = ${providerUrl}\nchainId = ${chainId}\naddress: ${address}\n`);
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
  const newChainId = NETWORK_MAPING[shortName];
  providerUrl = chainId === newChainId ? providerUrl : PROVIDER_URLS[newChainId];
  console.log(`providerUrl = ${providerUrl}\nchainId = ${newChainId}\naddress: ${shortAdd}\n`);
  return {
    providerUrl: providerUrl,
    chainId: newChainId,
    address: shortAdd
  };
}

const checkBalance = async (provider, domainAddr, accountAddr) => {
  return Promise.all([provider.getBalance(domainAddr), provider.getBalance(accountAddr)])
      .then(values => {
          return {
              domainBalance: values[0],
              accountBalance: values[1]
          };
      }, reason => {
          console.log(reason);
      });
}

function isPrivateKey(key) {
  try {
    if (typeof(key) === "string" && !key.startsWith("0x")) {
      key = "0x" + key;
    }
    return ethers.isHexString(key, 32);
  } catch (error) {
    return false;
  }
}
// **** utils ****

// **** function ****
const createDirectory = async (key, chainId, rpc) => {
  if (!isPrivateKey(key)) {
    console.error(error(`ERROR: invalid private key!`));
    return;
  }

  // get chain id
  if (chainId) {
    chainId = Number(chainId);
    const rpcChainId = await getChainIdByRpc(rpc);
    if (rpcChainId && rpcChainId !== chainId) {
      console.error(error(`ERROR: --chainId(${chainId}) and rpc chainId(${rpcChainId}) conflict.`));
      return;
    }
  } else if (rpc) {
    chainId = await getChainIdByRpc(rpc);
  } else {
    chainId = CHAIN_ID_DEFAULT;
  }

  // get rpc
  const providerUrl = rpc ?? PROVIDER_URLS[chainId];
  if (!providerUrl) {
    console.error(error(`ERROR: The network need RPC, please try again after setting RPC!`));
    return;
  }

  console.log("chainId =", chainId);
  console.log("providerUrl =", providerUrl);
  const ethStorage = new EthStorage(providerUrl, key);
  const ethStorageAdd = ETH_STORAGE_ADDRESS[chainId];
  await ethStorage.deploy(ethStorageAdd);
};

const refund = async (key, domain, rpc, chainId) => {
  if (!isPrivateKey(key)) {
    console.error(error(`ERROR: invalid private key!`));
    return;
  }
  if (!domain) {
    console.error(error(`ERROR: invalid address!`));
    return;
  }

  const {providerUrl, address} = await getWebHandler(domain, rpc, chainId);
  if (providerUrl && parseInt(address) > 0) {
    const ethStorage = new EthStorage(providerUrl, key, address);
    await ethStorage.refund();
  } else {
    console.log(error(`ERROR: ${domain} domain doesn't exist`));
  }
};

const setDefault = async (key, domain, filename, rpc, chainId) => {
  if (!isPrivateKey(key)) {
    console.error(error(`ERROR: invalid private key!`));
    return;
  }
  if (!domain) {
    console.error(error(`ERROR: invalid address!`));
    return;
  }

  const {providerUrl, address} = await getWebHandler(domain, rpc, chainId);
  if (providerUrl && parseInt(address) > 0) {
    const ethStorage = new EthStorage(providerUrl, key, address);
    await ethStorage.setDefault(filename);
  } else {
    console.log(error(`ERROR: ${domain} domain doesn't exist`));
  }
};

const remove = async (key, domain, fileName, rpc, chainId) => {
  if (!isPrivateKey(key)) {
    console.error(error(`ERROR: invalid private key!`));
    return;
  }
  if (!domain) {
    console.error(error(`ERROR: invalid address!`));
    return;
  }
  if (!fileName) {
    console.error(error(`ERROR: invalid file name!`));
    return;
  }

  const {providerUrl, address} = await getWebHandler(domain, rpc, chainId);
  if (providerUrl && parseInt(address) > 0) {
    console.log(`Removing file ${fileName}`);
    const provider = new ethers.JsonRpcProvider(providerUrl);
    const wallet = new ethers.Wallet(key, provider);
    let prevInfo;
    await checkBalance(provider, address, wallet.address).then(info => {
      prevInfo = info;
    })

    const ethStorage = new EthStorage(providerUrl, key, address);
    await ethStorage.remove(fileName);

    await checkBalance(provider, address, wallet.address).then(info => {
      console.log(`domainBalance: ${info.domainBalance}, accountBalance: ${info.accountBalance}, balanceChange: ${prevInfo.accountBalance - info.accountBalance}`);
    })
  }
}

const download = async (domain, fileName, rpc, chainId) => {
  if (!domain) {
    console.error(error(`ERROR: invalid address!`));
    return;
  }
  if (!fileName) {
    console.error(error(`ERROR: invalid file name!`));
    return;
  }

  let handler = await getWebHandler(domain, rpc, chainId);
  if (parseInt(handler.address) > 0) {
    // replace rpc to eth storage
    const esRpc = ETH_STORAGE_RPC[handler.chainId];
    rpc = esRpc ?? handler.providerUrl;
    const buf = await Download(rpc, handler.address, fileName);
    if (buf.length > 0) {
      const savePath = path.join(process.cwd(), fileName);
      if (!fs.existsSync(path.dirname(savePath))) {
        fs.mkdirSync(path.dirname(savePath));
      }
      fs.writeFileSync(savePath, buf);
      console.log(`Success: file path is ${savePath}`);
    } else {
      console.log(error(`ERROR: The download of ${fileName} failed or the file does not exist.`));
    }
  } else {
    console.log(error(`ERROR: ${domain} domain doesn't exist`));
  }
}

const upload = async (key, domain, path, type, rpc, chainId) => {
  if (!isPrivateKey(key)) {
    console.error(error(`ERROR: invalid private key!`));
    return;
  }
  if (!domain) {
    console.error(error(`ERROR: invalid address!`));
    return;
  }
  if (!path) {
    console.error(error(`ERROR: invalid file!`));
    return;
  }
  if (type && type !== VERSION_BLOB && type !== VERSION_CALL_DATA) {
    console.error(error(`ERROR: invalid upload type!`));
    return;
  }

  // {providerUrl, chainId, address}
  const handler = await getWebHandler(domain, rpc, chainId);
  if (handler.providerUrl && parseInt(handler.address) > 0) {
    chainId = handler.chainId;
    let syncPoolSize = 15;
    if (chainId === ARBITRUM_NOVE_CHAIN_ID) {
      syncPoolSize = 4;
    }

    const uploader = new Uploader(key, handler.providerUrl, chainId, handler.address);
    const status = await uploader.init(type);
    if (!status) {
      console.log(`ERROR: Failed to initialize SDK!`);
      return;
    }
    const infoArr = await uploader.upload(path, syncPoolSize);

    console.log();
    let totalCost = 0n, totalChunkCount = 0, totalFileSize = 0;
    for (const file of infoArr) {
      if (file.status) {
        totalCost += file.totalCost;
        totalChunkCount += file.totalUploadCount;
        totalFileSize += file.totalUploadSize;
        if (file.totalChunkCount > file.currentSuccessIndex + 1) {
          console.log(error(`ERROR: ${file.fileName} uploaded failed. The chunkId is ${file.currentSuccessIndex + 1}`));
        }
      } else {
        console.log(error(`ERROR: ${file.fileName} uploaded failed.`));
      }
    }

    console.log();
    console.log(notice(`Total Upload Chunk Count: ${totalChunkCount}`));
    console.log(notice(`Total Upload File Size: ${totalFileSize} KB`));
    console.log(notice(`Total Cost: ${ethers.formatEther(totalCost)} ETH`));
  } else {
    console.log(error(`ERROR: ${domain} domain doesn't exist`));
  }
};
// **** function ****

module.exports.upload = upload;
module.exports.create = createDirectory;
module.exports.refund = refund;
module.exports.remove = remove;
module.exports.setDefault = setDefault;
module.exports.download = download;
