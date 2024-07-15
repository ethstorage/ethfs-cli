const fs = require('fs');
const path = require('path');
const ora = require("ora");
const { confirm } = require("@inquirer/prompts");
const { FlatDirectory } = require("ethstorage-sdk");
const { ethers } = require("ethers");
const {
  PROVIDER_URLS,
  ETH_STORAGE_RPC,
  ARBITRUM_NOVE_CHAIN_ID,
  ETHEREUM_CHAIN_ID,
  VERSION_BLOB,
  VERSION_CALL_DATA,
  FlatDirectoryAbi
} = require('./params');
const {
  isPrivateKey,
  checkBalance,
  getChainIdByRpc,
  getWebHandler,
  Uploader
} = require('./utils');

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
  const providerUrl = rpc || PROVIDER_URLS[chainId];
  if (!providerUrl) {
    console.error(error(`ERROR: The network need RPC, please try again after setting RPC!`));
    return;
  }

  console.log("chainId =", chainId);
  console.log("providerUrl =", providerUrl);
  const fd = await FlatDirectory.create({
    rpc: providerUrl,
    privateKey: key,
  });
  await fd.deploy();
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
    const provider = new ethers.JsonRpcProvider(providerUrl);
    const wallet = new ethers.Wallet(key, provider);
    const fileContract = new ethers.Contract(address, FlatDirectoryAbi, wallet);
    try {
      const tx = await fileContract.refund();
      console.log(`FlatDirectory: Tx hash is ${tx.hash}`);
      const txReceipt = await tx.wait();
      if (txReceipt.status) {
        console.log(`Refund success!`);
      }
    } catch (e) {
      console.error(`ERROR: Refund failed!`, e.message);
    }
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
    const fd = await FlatDirectory.create({
      rpc: providerUrl,
      privateKey: key,
      address: address
    });
    const status = await fd.setDefault(filename);
    if (status) {
      console.log(`Set default success!`);
    }
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
    const prevInfo = await checkBalance(provider, address, wallet.address);

    const fd = await FlatDirectory.create({
      rpc: providerUrl,
      privateKey: key,
      address: address
    });
    const status = await fd.remove(fileName);
    if (status) {
      console.log(`Remove success!`);
    }

    const info = await checkBalance(provider, address, wallet.address);
    console.log(`domainBalance: ${info.domainBalance}, accountBalance: ${info.accountBalance}, balanceChange: ${prevInfo.accountBalance - info.accountBalance}`);
  } else {
    console.log(error(`ERROR: ${domain} domain doesn't exist`));
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
    const savePath = path.join(process.cwd(), fileName);
    if (!fs.existsSync(path.dirname(savePath))) {
      fs.mkdirSync(path.dirname(savePath));
    }

    // replace rpc to eth storage
    const esRpc = ETH_STORAGE_RPC[handler.chainId];
    const ethStorageRpc = esRpc || handler.providerUrl;
    const fd = await FlatDirectory.create({
      rpc: handler.providerUrl,
      ethStorageRpc: ethStorageRpc,
      privateKey: ethers.hexlify(ethers.randomBytes(32)),
      address: handler.address,
    });
    await fd.download(fileName, {
      onProgress: (progress, count, chunk) => {
        fs.appendFileSync(savePath, chunk);
      },
      onFail: (e) => {
        fs.unlink(savePath, () => {});
        console.error(e.message);
        console.log(error("ERROR: Download failed"), fileName);
      },
      onFinish: () => {
        console.log(`Success: file path is ${savePath}`);
      }
    });
  } else {
    console.log(error(`ERROR: ${domain} domain doesn't exist`));
  }
}

const uploadEvent = async (key, domain, path, type, rpc, chainId, gasPriceIncreasePercentage) => {
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
  if (!fs.existsSync(path)) {
    console.error(error(`ERROR: The file or folder does not exist!`), path);
    return;
  }
  if (type && type !== VERSION_BLOB && type !== VERSION_CALL_DATA) {
    console.error(error(`ERROR: invalid upload type!`));
    return;
  }

  const handler = await getWebHandler(domain, rpc, chainId, CHAIN_ID_DEFAULT);
  if (!handler.providerUrl || parseInt(handler.address) <= 0) {
    console.log(error(`ERROR: ${domain} domain doesn't exist`));
    return;
  }

  // query total cost
  const uploader = await Uploader.create(key, handler.providerUrl, handler.chainId, handler.address, type);
  if (!uploader) {
    console.log(error(`ERROR: Failed to initialize the SDK, please check the parameters and network and try again.`));
    return;
  }

  let syncPoolSize = 15;
  if (handler.chainId === ARBITRUM_NOVE_CHAIN_ID) {
    syncPoolSize = 4;
  }

  // get cost
  const spin = ora('Start estimating cost').start();
  try {
    const cost = await uploader.estimateCost(path, syncPoolSize, gasPriceIncreasePercentage);
    console.log();
    console.log(`Info: The number of files is ${error(cost.totalFileCount.toString())}`);
    console.log(`Info: Storage cost is expected to be ${error(ethers.formatEther(cost.totalStorageCost))} ETH`);
    console.log(`Info: Gas cost is expected to be ${error(ethers.formatEther(cost.totalGasCost))} ETH`);
    console.log(`Info: The total cost is ${error(ethers.formatEther(cost.totalStorageCost + cost.totalGasCost))} ETH`);
  } catch (e) {
    console.log();
    const length = e.message.length;
    console.log(length > 400 ? (e.message.substring(0, 200) + " ... " + e.message.substring(length - 190, length)) : e.message);
    console.log(error(`Estimate gas failed, the failure file is ${e.value}`));
  } finally {
    spin.stop();
  }

  // upload
  console.log();
  let answer = false;
  try {
    answer = await confirm({message: `Continue?`});
  } catch (e) {}
  if (answer) {
    await upload(uploader, syncPoolSize, path, gasPriceIncreasePercentage);
  }
}

const upload = async (uploader, syncPoolSize, path, gasPriceIncreasePercentage) => {
  const infoArr = await uploader.upload(path, syncPoolSize, gasPriceIncreasePercentage);
  console.log();
  let totalStorageCost = 0n, totalChunkCount = 0, totalDataSize = 0;
  for (const file of infoArr) {
    if (file.currentSuccessIndex >= 0) {
      totalStorageCost += file.totalStorageCost;
      totalChunkCount += file.totalUploadCount;
      totalDataSize += file.totalUploadSize;
      if (file.totalChunkCount > file.currentSuccessIndex + 1) {
        console.log(error(`ERROR: ${file.fileName} uploaded failed. The chunkId is ${file.currentSuccessIndex + 1}`));
      }
    } else {
      console.log(error(`ERROR: ${file.fileName} uploaded failed.`));
    }
  }

  console.log(notice(`Total File Count: ${infoArr.length}`));
  console.log(notice(`Total Upload Chunk Count: ${totalChunkCount}`));
  console.log(notice(`Total Upload Data Size: ${totalDataSize} KB`));
  console.log(notice(`Total Storage Cost: ${ethers.formatEther(totalStorageCost)} ETH`));
};
// **** function ****

module.exports.upload = uploadEvent;
module.exports.create = createDirectory;
module.exports.refund = refund;
module.exports.remove = remove;
module.exports.setDefault = setDefault;
module.exports.download = download;
