const fs = require('fs');
const path = require('path');
const ora = require("ora");
const readline = require('readline');
const { FlatDirectory, UploadType } = require("ethstorage-sdk");
const { ethers } = require("ethers");
const {
  PROVIDER_URLS,
  ETH_STORAGE_RPC,
  ETHEREUM_CHAIN_ID,
  TYPE_CALLDATA,
  TYPE_BLOB,
  QUARKCHAIN_L2_TESTNET_CHAIN_ID,
  DEFAULT_THREAD_POOL_SIZE_LOW,
  DEFAULT_THREAD_POOL_SIZE_HIGH
} = require('./params');
const {
  isPrivateKey,
  getChainIdByRpc,
  getWebHandler,
  Uploader,
  Logger,
  createSDK
} = require('./utils');

const color = require('colors-cli/safe');
const error = color.red.bold;

const CHAIN_ID_DEFAULT = ETHEREUM_CHAIN_ID;

// **** external function ****
const createDirectory = async (key, chainId, rpc) => {
  if (!isPrivateKey(key)) {
    Logger.error("Invalid private key.");
    return;
  }

  // get chain id
  if (chainId) {
    chainId = Number(chainId);
    const rpcChainId = await getChainIdByRpc(rpc);
    if (rpcChainId && rpcChainId !== chainId) {
      Logger.error(`Chain ID conflict: provided (${chainId}) vs RPC (${rpcChainId}).`);
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
    Logger.error("RPC is required for the network. Please provide an RPC and try again.");
    return;
  }

  Logger.info(`Using chainId: ${chainId}`);
  Logger.info(`Using provider URL: ${providerUrl}`);
  Logger.log('');
  const fd = await FlatDirectory.create({
    rpc: providerUrl,
    privateKey: key,
  });
  try {
    const address = await fd.deploy();
    if (address) Logger.success("Deployment successful.");
  } finally {
    await safeClose(fd);
  }
};

const setDefault = async (key, domain, filename, rpc, chainId) => {
  if (!isPrivateKey(key)) {
    Logger.error("Invalid private key.");
    return;
  }
  if (!domain) {
    Logger.error("Invalid domain or address.");
    return;
  }

  const handler = await getHandler(domain, rpc, chainId);
  if (!handler) return;

  const { providerUrl, address } = handler;
  const fd = await createSDK(providerUrl, key, address);
  if (!fd) return;

  try {
    const status = await fd.setDefault(filename);
    if (status) Logger.success("Default file set successfully.");
  } finally {
    await safeClose(fd);
  }
};

const remove = async (key, domain, fileName, rpc, chainId) => {
  if (!isPrivateKey(key)) {
    Logger.error("Invalid private key.");
    return;
  }
  if (!domain) {
    Logger.error("Invalid domain address.");
    return;
  }
  if (!fileName) {
    Logger.error("Invalid file name.");
    return;
  }

  const handler = await getHandler(domain, rpc, chainId);
  if (!handler) return;

  Logger.info(`Removing file: ${fileName}`);
  const { providerUrl, address } = handler;
  const fd = await createSDK(providerUrl, key, address);
  if (!fd) return;

  try {
    const status = await fd.remove(fileName);
    if (status) Logger.success("File removed successfully.");
  } finally {
    await safeClose(fd);
  }
}

const download = async (domain, fileName, rpc, chainId) => {
  if (!domain) {
    Logger.error("Invalid domain address.");
    return;
  }
  if (!fileName) {
    Logger.error("Invalid file name.");
    return;
  }

  const handler = await getWebHandler(domain, rpc, chainId, CHAIN_ID_DEFAULT);
  if (!handler || parseInt(handler?.address) <= 0) return Logger.error(`Domain ${domain} does not exist.`);

  const savePath = path.join(process.cwd(), fileName);
  fs.existsSync(path.dirname(savePath)) || fs.mkdirSync(path.dirname(savePath));

  // replace rpc to eth storage
  const esRpc = ETH_STORAGE_RPC[handler.chainId];
  const ethStorageRpc = esRpc || handler.providerUrl;
  const fd = await createSDK(handler.providerUrl, ethers.hexlify(ethers.randomBytes(32)), handler.address, ethStorageRpc);
  if (!fd) {
    return;
  }

  try {
    await fd.download(fileName, {
      onProgress: (progress, count, chunk) => {
        fs.appendFileSync(savePath, chunk);
        Logger.log(`Download progress: ${progress} / ${count}`);
      },
      onFail: (e) => {
        fs.unlink(savePath, () => {});
        Logger.error(`Download failed: ${e.message}`);
      },
      onFinish: () => {
        Logger.success(`Download complete: ${savePath}`);
      }
    });
  } finally {
    await safeClose(fd);
  }
}

const estimateAndUpload = async (key, domain, path, type, rpc, chainId, gasIncPct, threadPoolSize, estimateGas) => {
  if (!isPrivateKey(key)) {
    Logger.error("Invalid private key.");
    return;
  }
  if (!domain) {
    Logger.error("Invalid domain or address.");
    return;
  }
  if (!path) {
    Logger.error("Invalid file path.");
    return;
  }
  if (!fs.existsSync(path)) {
    Logger.error("File or folder does not exist.");
    return;
  }
  if (type) {
    const numericType = Number(type);
    if (numericType === UploadType.Calldata || type === TYPE_CALLDATA) {
      type = UploadType.Calldata;
    } else if (numericType === UploadType.Blob || type === TYPE_BLOB) {
      type = UploadType.Blob;
    } else {
      Logger.error("Invalid upload type.");
      return;
    }
  }

  const handler = await getHandler(domain, rpc, chainId, false);
  if (!handler) return;

  if (threadPoolSize) {
    threadPoolSize = Number(threadPoolSize);
  } else if (handler.chainId === QUARKCHAIN_L2_TESTNET_CHAIN_ID) {
    threadPoolSize = DEFAULT_THREAD_POOL_SIZE_HIGH;
  } else {
    threadPoolSize = DEFAULT_THREAD_POOL_SIZE_LOW;
  }
  Logger.info(`Thread pool size: ${threadPoolSize}`);
  Logger.log('');

  // query total cost
  const uploader = await Uploader.create(key, handler.providerUrl, handler.chainId, handler.address, type);
  if (!uploader) {
    process.exit(1);
    return;
  }

  if (estimateGas) {
    // get cost
    await estimateCost(uploader, path, gasIncPct, threadPoolSize);
    if (!(await answer("Continue?"))) return await safeClose(uploader);
  }

  // upload
  await upload(uploader, path, gasIncPct, threadPoolSize);
  process.exit(0);
}
// **** external function ****

// **** internal function ****

const answer = async (text) => {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question(text + ' (y/n) ', (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'Y' || answer.toLowerCase() === '');
    });
  });
}

const estimateCost = async (uploader, path, gasIncPct, threadPoolSize) => {
  const spin = ora('Start estimating cost').start();
  try {
    const cost = await uploader.estimateCost(spin, path, gasIncPct, threadPoolSize);
    spin.succeed('Estimating cost progress: 100%');

    Logger.log('');
    Logger.info(`Total files: ${error(cost.totalFileCount.toString())}`);
    Logger.info(`Expected storage cost: ${error(ethers.formatEther(cost.totalStorageCost))} ETH`);
    Logger.info(`Expected gas cost: ${error(ethers.formatEther(cost.totalGasCost))} ETH`);
    Logger.info(`Total estimated cost: ${error(ethers.formatEther(cost.totalStorageCost + cost.totalGasCost))} ETH`);
  } catch (e) {
    Logger.log('');
    const length = e.message.length;
    Logger.log(length > 400 ? (e.message.substring(0, 200) + " ... " + e.message.substring(length - 190, length)) : e.message);
    Logger.error(e.value ? `Estimate gas failed, the failure file is ${e.value}` : 'Estimate gas failed');
  } finally {
    spin.stop();
  }
}

const upload = async (uploader, path, gasIncPct, threadPoolSize) => {
  try {
    const infoArr = await uploader.upload(path, gasIncPct, threadPoolSize);
    Logger.log('');
    let totalStorageCost = 0n, totalChunkCount = 0, totalDataSize = 0;
    for (const file of infoArr) {
      if (file.currentSuccessIndex >= 0) {
        totalStorageCost += file.totalStorageCost;
        totalChunkCount += file.totalUploadCount;
        totalDataSize += file.totalUploadSize;
        if (file.totalChunkCount > file.currentSuccessIndex + 1) {
          Logger.error(`${file.fileName} upload failed at chunk ${file.currentSuccessIndex + 1}`);
        }
      } else {
        Logger.error(`${file.fileName} upload failed.`);
      }
    }

    Logger.log('');
    Logger.success(`Total files: ${infoArr.length}`);
    Logger.success(`Total chunks uploaded: ${totalChunkCount}`);
    Logger.success(`Total data uploaded: ${totalDataSize} KB`);
    Logger.success(`Total storage cost: ${ethers.formatEther(totalStorageCost)} ETH`);
  } catch (e) {
    const length = e.message.length;
    Logger.error(length > 500 ? (e.message.substring(0, 245) + " ... " + e.message.substring(length - 245, length)) : e.message);
    Logger.error(`Execution failed. Please check the error message and try again after making necessary adjustments.`);
  } finally {
    await safeClose(uploader);
  }
};

const safeClose = async (instance) => {
  try {
    if (instance?.close) await instance.close();
  } catch (err) {
    Logger.error('Resource close error:', err);
  }
};

const getHandler = async (domain, rpc, chainId, isBr = true) => {
  const handler = await getWebHandler(domain, rpc, chainId, CHAIN_ID_DEFAULT, isBr);
  if (!handler?.providerUrl || parseInt(handler?.address) <= 0) {
    Logger.error(`Domain ${domain} does not exist.`);
    return null;
  }
  return handler;
};
// **** internal function ****

module.exports.upload = estimateAndUpload;
module.exports.create = createDirectory;
module.exports.remove = remove;
module.exports.setDefault = setDefault;
module.exports.download = download;
