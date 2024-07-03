const fs = require('fs');
const path = require('path');
const { EthStorage, Download } = require("ethstorage-sdk");
const { ethers } = require("ethers");
const {
  PROVIDER_URLS,
  ETH_STORAGE_ADDRESS,
  ETH_STORAGE_RPC,
  ARBITRUM_NOVE_CHAIN_ID,
  ETHEREUM_CHAIN_ID
} = require('./src/params/constants');
const { Uploader } = require("./src/utils/uploader");
const {
  isPrivateKey,
  checkBalance,
  getChainIdByRpc,
  getWebHandler,
} = require('./src/utils/utils');

const color = require('colors-cli/safe')
const error = color.red.bold;
const notice = color.blue;

const CHAIN_ID_DEFAULT = ETHEREUM_CHAIN_ID;

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

  const {providerUrl, address} = await getWebHandler(domain, rpc, chainId, CHAIN_ID_DEFAULT);
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

  const {providerUrl, address} = await getWebHandler(domain, rpc, chainId, CHAIN_ID_DEFAULT);
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

  const {providerUrl, address} = await getWebHandler(domain, rpc, chainId, CHAIN_ID_DEFAULT);
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

  let handler = await getWebHandler(domain, rpc, chainId, CHAIN_ID_DEFAULT);
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

const upload = async (handler, key, domain, path, type, rpc, chainId) => {
  chainId = handler.chainId;
  let syncPoolSize = 15;
  if (chainId === ARBITRUM_NOVE_CHAIN_ID) {
    syncPoolSize = 4;
  }

  const uploader = new Uploader(key, handler.providerUrl, chainId, handler.address);
  uploader.setUploadType(type);
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
};
// **** function ****

module.exports.upload = upload;
module.exports.create = createDirectory;
module.exports.refund = refund;
module.exports.remove = remove;
module.exports.setDefault = setDefault;
module.exports.download = download;
