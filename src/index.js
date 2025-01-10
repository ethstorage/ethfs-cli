const fs = require('fs');
const path = require('path');
const ora = require("ora");
const readline = require('readline');
const { FlatDirectory, UPLOAD_TYPE_CALLDATA, UPLOAD_TYPE_BLOB} = require("ethstorage-sdk");
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
  checkBalance,
  getChainIdByRpc,
  getWebHandler,
  Uploader,
  Logger
} = require('./utils');

const color = require('colors-cli/safe')
const error = color.red.bold;

const CHAIN_ID_DEFAULT = ETHEREUM_CHAIN_ID;

// **** function ****
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
  const fd = await FlatDirectory.create({
    rpc: providerUrl,
    privateKey: key,
  });
  const address = await fd.deploy();
  if (address) {
    Logger.success("Deployment successful.");
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

  const {providerUrl, address} = await getWebHandler(domain, rpc, chainId, CHAIN_ID_DEFAULT);
  if (providerUrl && parseInt(address) > 0) {
    const fd = await FlatDirectory.create({
      rpc: providerUrl,
      privateKey: key,
      address: address
    });
    const status = await fd.setDefault(filename);
    if (status) {
      Logger.success("Default file set successfully.");
    }
  } else {
    Logger.error(`Domain ${domain} does not exist.`);
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

  const { providerUrl, address } = await getWebHandler(domain, rpc, chainId, CHAIN_ID_DEFAULT);
  if (providerUrl && parseInt(address) > 0) {
    Logger.info(`Removing file: ${fileName}`);
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
      Logger.success("File removed successfully.");
    }

    const info = await checkBalance(provider, address, wallet.address);
    Logger.info(`Domain balance: ${info.domainBalance}`);
    Logger.info(`Account balance: ${info.accountBalance}`);
    Logger.info(`Balance change: ${prevInfo.accountBalance - info.accountBalance}`);
  } else {
    Logger.error(`Domain ${domain} does not exist.`);
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
        Logger.error(`Download failed for file ${fileName}: ${e.message}`);
      },
      onFinish: () => {
        Logger.success(`File downloaded successfully: ${savePath}`);
      }
    });
  } else {
    Logger.error(`Domain ${domain} does not exist.`);
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
    if (type === TYPE_CALLDATA) {
      type = UPLOAD_TYPE_CALLDATA;
    } else if (type === TYPE_BLOB) {
      type = UPLOAD_TYPE_BLOB;
    } else if (Number(type) !== UPLOAD_TYPE_CALLDATA && Number(type) !== UPLOAD_TYPE_BLOB) {
      Logger.error("Invalid upload type.");
      return;
    }
  }

  const handler = await getWebHandler(domain, rpc, chainId, CHAIN_ID_DEFAULT, false);
  if (!handler.providerUrl || parseInt(handler.address) <= 0) {
    Logger.error(`Domain ${domain} does not exist.`);
    return;
  }

  if (threadPoolSize) {
    threadPoolSize = Number(threadPoolSize);
  } else if (handler.chainId === QUARKCHAIN_L2_TESTNET_CHAIN_ID) {
    threadPoolSize = DEFAULT_THREAD_POOL_SIZE_HIGH;
  } else {
    threadPoolSize = DEFAULT_THREAD_POOL_SIZE_LOW;
  }
  Logger.info(`Thread pool size: ${threadPoolSize}`);

  // query total cost
  const uploader = await Uploader.create(key, handler.providerUrl, handler.chainId, handler.address, type);
  if (!uploader) {
    Logger.error("Failed to initialize SDK. Check parameters and network and try again.");
    return;
  }

  if (estimateGas) {
    // get cost
    await estimateCost(uploader, path, gasIncPct, threadPoolSize);
    if (await answer("Continue?")) {
      // upload
      Logger.log();
      await upload(uploader, path, gasIncPct, threadPoolSize);
    }
  } else {
    // upload
    await upload(uploader, path, gasIncPct, threadPoolSize);
  }
  process.exit(0);
}

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

    Logger.log();
    Logger.info(`Total files: ${error(cost.totalFileCount.toString())}`);
    Logger.info(`Expected storage cost: ${error(ethers.formatEther(cost.totalStorageCost))} ETH`);
    Logger.info(`Expected gas cost: ${error(ethers.formatEther(cost.totalGasCost))} ETH`);
    Logger.info(`Total estimated cost: ${error(ethers.formatEther(cost.totalStorageCost + cost.totalGasCost))} ETH`);
  } catch (e) {
    Logger.log();
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
    Logger.log();
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

    Logger.success(`Total files: ${infoArr.length}`);
    Logger.success(`Total chunks uploaded: ${totalChunkCount}`);
    Logger.success(`Total data uploaded: ${totalDataSize} KB`);
    Logger.success(`Total storage cost: ${ethers.formatEther(totalStorageCost)} ETH`);
  } catch (e) {
    const length = e.message.length;
    Logger.error(length > 500 ? (e.message.substring(0, 245) + " ... " + e.message.substring(length - 245, length)) : e.message);
    Logger.error('Execution failed. Please check the parameters and try again.');
  }
};
// **** function ****

module.exports.upload = estimateAndUpload;
module.exports.create = createDirectory;
module.exports.remove = remove;
module.exports.setDefault = setDefault;
module.exports.download = download;
