const fs = require('fs');
const path = require('path');
const ora = require("ora");
const readline = require('readline');
const { FlatDirectory, UploadType} = require("ethstorage-sdk");
const { ethers } = require("ethers");
const {
  PROVIDER_URLS,
  ETH_STORAGE_RPC,
  ETHEREUM_CHAIN_ID,
  TYPE_CALLDATA,
  TYPE_BLOB,
  QUARKCHAIN_L2_TESTNET_CHAIN_ID,
  DEFAULT_THREAD_POOL_SIZE_LOW,
  DEFAULT_THREAD_POOL_SIZE_HIGH,
  LOG_ERROR,
  LOG_WARNING,
  LOG_INFO,
  LOG_SUCCESS
} = require('./params');
const {
  isPrivateKey,
  checkBalance,
  getChainIdByRpc,
  getWebHandler,
  Uploader,
  ERROR_TYPE_VERSION,
  ERROR_TYPE_OTHER
} = require('./utils');

const color = require('colors-cli/safe')
const error = color.red.bold;
const warning = color.yellow.bold;
const info = color.blue.bold;
const success = color.green.bold;

const CHAIN_ID_DEFAULT = ETHEREUM_CHAIN_ID;

// **** external function ****
const createDirectory = async (key, chainId, rpc) => {
  if (!isPrivateKey(key)) {
    logMessage(LOG_ERROR, `invalid private key!`);
    return;
  }

  // get chain id
  if (chainId) {
    chainId = Number(chainId);
    const rpcChainId = await getChainIdByRpc(rpc);
    if (rpcChainId && rpcChainId !== chainId) {
      logMessage(LOG_ERROR, `--chainId(${chainId}) and rpc chainId(${rpcChainId}) conflict.`);
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
    logMessage(LOG_ERROR, `The network need RPC, please try again after setting RPC!`);
    return;
  }

  console.log("chainId =", chainId);
  console.log("providerUrl =", providerUrl);
  const fd = await FlatDirectory.create({
    rpc: providerUrl,
    privateKey: key,
  });
  await fd.deploy();
  logMessage(LOG_SUCCESS, `Deploy success!`);
};

const setDefault = async (key, domain, filename, rpc, chainId) => {
  if (!isPrivateKey(key)) {
    logMessage(LOG_ERROR, `invalid private key!`);
    return;
  }
  if (!domain) {
    logMessage(LOG_ERROR, `invalid address!`);
    return;
  }

  const handler = await getWebHandler(domain, rpc, chainId, CHAIN_ID_DEFAULT);
  if (!handler) {
    return;
  }
  const {providerUrl, address} = handler;
  const fd = await createSDK(providerUrl, key, address);
  if (!fd) {
    return;
  }
  const status = await fd.setDefault(filename);
  if (status) {
    logMessage(LOG_SUCCESS, `Set default success!`);
  }
};

const remove = async (key, domain, fileName, rpc, chainId) => {
  if (!isPrivateKey(key)) {
    logMessage(LOG_ERROR, `invalid private key!`);
    return;
  }
  if (!domain) {
    logMessage(LOG_ERROR, `invalid address!`);
    return;
  }
  if (!fileName) {
    logMessage(LOG_ERROR, `invalid file name!`);
    return;
  }

  const {providerUrl, address} = await getWebHandler(domain, rpc, chainId, CHAIN_ID_DEFAULT);
  if (providerUrl && parseInt(address) > 0) {
    console.log(`Removing file ${fileName}`);
    const provider = new ethers.JsonRpcProvider(providerUrl);
    const wallet = new ethers.Wallet(key, provider);
    const prevInfo = await checkBalance(provider, address, wallet.address);

    const fd = await createSDK(providerUrl, key, address);
    if (!fd) {
        return;
    }
    const status = await fd.remove(fileName);
    if (status) {
      logMessage(LOG_SUCCESS, `Remove success!`);
    }

    const info = await checkBalance(provider, address, wallet.address);
    logMessage(LOG_INFO, `domainBalance: ${info.domainBalance}`);
    logMessage(LOG_INFO, `accountBalance: ${info.accountBalance}`, false);
    logMessage(LOG_INFO, `balanceChange: ${prevInfo.accountBalance - info.accountBalance}`, false);
  } else {
    logMessage(LOG_ERROR, `${domain} domain doesn't exist!`);
  }
}

const download = async (domain, fileName, rpc, chainId) => {
  if (!domain) {
      logMessage(LOG_ERROR, `invalid address!`);
    return;
  }
  if (!fileName) {
      logMessage(LOG_ERROR, `invalid file name!`);
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
    const fd = await createSDK(handler.providerUrl, ethers.hexlify(ethers.randomBytes(32)), handler.address, ethStorageRpc);
    if (!fd) {
        return;
    }
    await fd.download(fileName, {
      onProgress: (progress, count, chunk) => {
        fs.appendFileSync(savePath, chunk);
      },
      onFail: (e) => {
        fs.unlink(savePath, () => {});
        console.error(e.message);
        logMessage(LOG_ERROR, `Download failed!  file=${fileName}`);
      },
      onFinish: () => {
        logMessage(LOG_SUCCESS, `file path is ${savePath}`);
      }
    });
  } else {
    logMessage(LOG_ERROR,`${domain} domain doesn't exist.`);
  }
}

const estimateAndUpload = async (key, domain, path, type, rpc, chainId, gasIncPct, threadPoolSize, estimateGas) => {
  if (!isPrivateKey(key)) {
    logMessage(LOG_ERROR, `invalid private key!`);
    return;
  }
  if (!domain) {
    logMessage(LOG_ERROR, `invalid address!`);
    return;
  }
  if (!path) {
    logMessage(LOG_ERROR, `invalid file!`);
    return;
  }
  if (!fs.existsSync(path)) {
    logMessage(LOG_ERROR, `The file or folder does not exist!`);
    return;
  }
  if (type) {
    const numericType = Number(type);
    if (numericType === UploadType.Calldata || type === TYPE_CALLDATA) {
      type = UploadType.Calldata;
    } else if (numericType === UploadType.Blob || type === TYPE_BLOB) {
      type = UploadType.Blob;
    } else {
      logMessage(LOG_ERROR, `invalid upload type!`);
      return;
    }
  }

  const handler = await getWebHandler(domain, rpc, chainId, CHAIN_ID_DEFAULT, false);
  if (!handler.providerUrl || parseInt(handler.address) <= 0) {
    logMessage(LOG_ERROR, `${domain} domain doesn't exist!`);
    return;
  }

  if (threadPoolSize) {
    threadPoolSize = Number(threadPoolSize);
  } else if (handler.chainId === QUARKCHAIN_L2_TESTNET_CHAIN_ID) {
    threadPoolSize = DEFAULT_THREAD_POOL_SIZE_HIGH;
  } else {
    threadPoolSize = DEFAULT_THREAD_POOL_SIZE_LOW;
  }
  console.log(`threadPoolSize = ${threadPoolSize} \n`);

  // query total cost
  const uploader = await Uploader.create(key, handler.providerUrl, handler.chainId, handler.address, type);
  if (uploader?.errorType) {
    switch (uploader.errorType) {
      case ERROR_TYPE_VERSION:
        logMessage(LOG_ERROR, "Failed to query contract. Please check your network settings or install ethfs-cli 2.x if the contract was created with it.");
        break;
      case ERROR_TYPE_OTHER:
        logMessage(LOG_WARNING, `SDK initialization failed: ${uploader.errorMessage}`);
        logMessage(LOG_ERROR, 'Please check your parameters and network connection, then try again.');
        break;
      default:
        logMessage(LOG_ERROR, 'An unknown error occurred. Please contact technical support.');
        break;
    }
    return;
  }

  if (estimateGas) {
    // get cost
    await estimateCost(uploader, path, gasIncPct, threadPoolSize);
    if (await answer(`Continue?`)) {
      // upload
      console.log();
      await upload(uploader, path, gasIncPct, threadPoolSize);
    }
  } else {
    // upload
    await upload(uploader, path, gasIncPct, threadPoolSize);
  }
  process.exit(0);
}
// **** external function ****

// **** internal function ****
function logMessage(type, message, showSymbol = true) {
  let symbol = '';
  switch (type) {
    case LOG_ERROR:
      symbol = showSymbol ? '❌ ' : '  ';
      console.error(error(`${symbol} ERROR: ${message}`));
      break;
    case LOG_WARNING:
      symbol = showSymbol ? '⚠️ ' : '  ';
      console.warn(warning(`${symbol} WARNING: ${message}`));
      break;
    case LOG_INFO:
      symbol = showSymbol ? 'ℹ️ ' : '   ';
      console.info(info(`${symbol} INFO: ${message}`));
      break;
    case LOG_SUCCESS:
      symbol = showSymbol ? '✅ ' : '  ';
      console.log(success(`${symbol} SUCCESS: ${message}`));
      break;
    default:
      console.log(message);
      break;
  }
}

const createSDK = async (rpc, privateKey, address, ethStorageRpc) => {
  try {
    return await FlatDirectory.create({
      rpc: rpc,
      ethStorageRpc: ethStorageRpc,
      privateKey: privateKey,
      address: address,
    });
  } catch (e) {
    if (e.message.includes('The current SDK does not support this contract')) {
      logMessage(LOG_ERROR, "Failed to query contract. Please check your network settings or install ethfs-cli 2.x if the contract was created with it.");
    } else {
      logMessage(LOG_ERROR, e.message);
    }
  }
  return null;
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

    console.log();
    logMessage(LOG_INFO, `The number of files is ${error(cost.totalFileCount.toString())}`);
    logMessage(LOG_INFO, `Storage cost is expected to be ${error(ethers.formatEther(cost.totalStorageCost))} ETH`, false);
    logMessage(LOG_INFO, `Gas cost is expected to be ${error(ethers.formatEther(cost.totalGasCost))} ETH`, false);
    logMessage(LOG_INFO, `The total cost is ${error(ethers.formatEther(cost.totalStorageCost + cost.totalGasCost))} ETH`, false);
  } catch (e) {
    console.log();
    const length = e.message.length;
    console.log(length > 400 ? (e.message.substring(0, 200) + " ... " + e.message.substring(length - 190, length)) : e.message);
    logMessage(LOG_ERROR, e.value ? `Estimate gas failed, the failure file is ${e.value}` : 'Estimate gas failed');
  } finally {
    spin.stop();
  }
}

const upload = async (uploader, path, gasIncPct, threadPoolSize) => {
  try {
    const infoArr = await uploader.upload(path, gasIncPct, threadPoolSize);
    console.log();
    let totalStorageCost = 0n, totalChunkCount = 0, totalDataSize = 0;
    for (const file of infoArr) {
      if (file.currentSuccessIndex >= 0) {
        totalStorageCost += file.totalStorageCost;
        totalChunkCount += file.totalUploadCount;
        totalDataSize += file.totalUploadSize;
        if (file.totalChunkCount > file.currentSuccessIndex + 1) {
          logMessage(LOG_ERROR, `${file.fileName} uploaded failed. The chunkId is ${file.currentSuccessIndex + 1}`);
        }
      } else {
        logMessage(LOG_ERROR, `${file.fileName} uploaded failed.`);
      }
    }

    logMessage(LOG_SUCCESS, `Total File Count: ${infoArr.length}`);
    logMessage(LOG_SUCCESS, `Total Upload Chunk Count: ${totalChunkCount}`, false);
    logMessage(LOG_SUCCESS, `Total Upload Data Size: ${totalDataSize} KB`, false);
    logMessage(LOG_SUCCESS, `Total Storage Cost: ${ethers.formatEther(totalStorageCost)} ETH`, false);
  } catch (e) {
    const length = e.message.length;
    console.log(length > 500 ? (e.message.substring(0, 245) + " ... " + e.message.substring(length - 245, length)) : e.message);
    logMessage(LOG_ERROR, `ERROR: Execution failed. Please check the parameters and try again!`);
  }
};
// **** internal function ****

module.exports.upload = estimateAndUpload;
module.exports.create = createDirectory;
module.exports.remove = remove;
module.exports.setDefault = setDefault;
module.exports.download = download;
