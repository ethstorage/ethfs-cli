import fs from 'fs';
import path from 'path';
import ora from 'ora';
import readline from 'readline';
import {
  FlatDirectory,
  UPLOAD_TYPE_CALLDATA,
  UPLOAD_TYPE_BLOB
} from "ethstorage-sdk";
import { ethers } from "ethers";
import {
  UploadTypeStr,
  PROVIDER_URLS,
  ETH_STORAGE_RPC,
  ETHEREUM_CHAIN_ID,
  FlatDirectoryAbi,
  QUARKCHAIN_L2_TESTNET_CHAIN_ID,
  DEFAULT_THREAD_POOL_SIZE_LOW,
  DEFAULT_THREAD_POOL_SIZE_HIGH
} from './params';
import {
  isPrivateKey,
  checkBalance,
  getChainIdByRpc,
  getWebHandler,
  Uploader
} from './utils';
import {
  Nullable,
  UploadResult
} from "./types/types";

import color from 'colors-cli/safe';
const error = color.red.bold;
const notice = color.blue;

const CHAIN_ID_DEFAULT = ETHEREUM_CHAIN_ID;

// **** function ****
export async function createDirectory(key: string, rpc: Nullable<string>, chainId: Nullable<string>): Promise<void> {
  if (!isPrivateKey(key)) {
    console.error(error(`ERROR: invalid private key!`));
    return;
  }

  // get chain id
  let numerChainId: number;
  if (chainId) {
    numerChainId = Number(chainId);
    const rpcChainId = await getChainIdByRpc(rpc);
    if (rpcChainId && rpcChainId != numerChainId) {
      console.error(error(`ERROR: --chainId(${chainId}) and rpc chainId(${rpcChainId}) conflict.`));
      return;
    }
  } else if (rpc) {
    numerChainId = await getChainIdByRpc(rpc) || CHAIN_ID_DEFAULT;
  } else {
    numerChainId = CHAIN_ID_DEFAULT;
  }

  // get rpc
  const providerUrl = rpc || PROVIDER_URLS[numerChainId];
  if (!providerUrl) {
    console.error(error(`ERROR: The network need RPC, please try again after setting RPC!`));
    return;
  }

  console.log("chainId =", numerChainId);
  console.log("providerUrl =", providerUrl);
  const fd = await FlatDirectory.create({
    rpc: providerUrl,
    privateKey: key,
  });
  await fd.deploy();
}

export async function refund(key: string, domain: string, rpc: Nullable<string>, chainId: Nullable<string>): Promise<void> {
  if (!isPrivateKey(key)) {
    console.error(error(`ERROR: invalid private key!`));
    return;
  }
  if (!domain) {
    console.error(error(`ERROR: invalid address!`));
    return;
  }

  const numerChainId: Nullable<number> = Number(chainId);
  const handler = await getWebHandler(domain, rpc, numerChainId, CHAIN_ID_DEFAULT);
  if (handler && handler.providerUrl && parseInt(handler.address) > 0) {
    const provider = new ethers.JsonRpcProvider(handler.providerUrl);
    const wallet = new ethers.Wallet(key, provider);
    const fileContract = new ethers.Contract(handler.address, FlatDirectoryAbi, wallet) as any;
    try {
      const tx = await fileContract.refund();
      console.log(`FlatDirectory: Tx hash is ${tx.hash}`);
      const txReceipt = await tx.wait();
      if (txReceipt.status) {
        console.log(`Refund success!`);
      }
    } catch (e) {
      console.error(`ERROR: Refund failed!`,  (e as { message?: string }).message || e);
    }
  } else {
    console.log(error(`ERROR: ${domain} domain doesn't exist`));
  }
}

export async function setDefault(key: string, domain: string, filename: string, rpc: Nullable<string>, chainId: Nullable<string>): Promise<void> {
  if (!isPrivateKey(key)) {
    console.error(error(`ERROR: invalid private key!`));
    return;
  }
  if (!domain) {
    console.error(error(`ERROR: invalid address!`));
    return;
  }

  const numerChainId: Nullable<number> = Number(chainId);
  const handler = await getWebHandler(domain, rpc, numerChainId, CHAIN_ID_DEFAULT);
  if (handler && handler.providerUrl && parseInt(handler.address) > 0) {
    const fd = await FlatDirectory.create({
      rpc: handler.providerUrl,
      privateKey: key,
      address: handler.address
    });
    const status = await fd.setDefault(filename);
    if (status) {
      console.log(`Set default success!`);
    }
  } else {
    console.log(error(`ERROR: ${domain} domain doesn't exist`));
  }
}

export async function remove(key: string, domain: string, fileName: string, rpc: Nullable<string>, chainId: Nullable<string>): Promise<void> {
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

  const numerChainId: Nullable<number> = Number(chainId);
  const handler = await getWebHandler(domain, rpc, numerChainId, CHAIN_ID_DEFAULT);
  if (handler && handler.providerUrl && parseInt(handler.address) > 0) {
    console.log(`Removing file ${fileName}`);
    const provider = new ethers.JsonRpcProvider(handler.providerUrl);
    const wallet = new ethers.Wallet(key, provider);
    const prevInfo = await checkBalance(provider, handler.address, wallet.address);

    const fd = await FlatDirectory.create({
      rpc: handler.providerUrl,
      privateKey: key,
      address: handler.address
    });
    const status = await fd.remove(fileName);
    if (status) {
      console.log(`Remove success!`);
    }

    const info = await checkBalance(provider, handler.address, wallet.address);
    console.log(`domainBalance: ${info.domainBalance}, accountBalance: ${info.accountBalance}, balanceChange: ${prevInfo.accountBalance - info.accountBalance}`);
  } else {
    console.log(error(`ERROR: ${domain} domain doesn't exist`));
  }
}

export async function download(domain: string, fileName: string, rpc: Nullable<string>, chainId: Nullable<string>): Promise<void> {
  if (!domain) {
    console.error(error(`ERROR: invalid address!`));
    return;
  }
  if (!fileName) {
    console.error(error(`ERROR: invalid file name!`));
    return;
  }

  const numerChainId: Nullable<number> = Number(chainId);
  const handler = await getWebHandler(domain, rpc, numerChainId, CHAIN_ID_DEFAULT);
  if (handler && parseInt(handler.address) > 0) {
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
      onProgress: (progress: number, count: number, chunk: Buffer) => {
        fs.appendFileSync(savePath, chunk);
      },
      onFail: (e: Error) => {
        fs.unlink(savePath, () => { });
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

export async function estimateAndUpload(
    key: string,
    domain: string,
    path: string,
    type: Nullable<string>,
    rpc: Nullable<string>,
    chainId: Nullable<string>,
    gasIncPct: Nullable<string>,
    threadPoolSize: Nullable<string>,
    estimateGas: Nullable<string>
): Promise<void> {
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

  let numerType: Nullable<number>;
  if (type) {
    if (type == UploadTypeStr.CALLDATA) {
      numerType = UPLOAD_TYPE_CALLDATA;
    } else if (type == UploadTypeStr.BLOB) {
      numerType = UPLOAD_TYPE_BLOB;
    } else if (Number(type) != UPLOAD_TYPE_CALLDATA && Number(type) != UPLOAD_TYPE_BLOB) {
      console.error(error(`ERROR: invalid upload type!`));
      return;
    } else {
      numerType = Number(type);
    }
  }

  const numberGasPct = Number(gasIncPct || 0);

  const numerChainId: Nullable<number> = Number(chainId);
  const handler = await getWebHandler(domain, rpc, numerChainId, CHAIN_ID_DEFAULT, false);
  if (!handler || !handler.providerUrl || parseInt(handler.address) <= 0) {
    console.log(error(`ERROR: ${domain} domain doesn't exist`));
    return;
  }

  let numerPools: Nullable<number>;
  if (threadPoolSize) {
    numerPools = Number(threadPoolSize);
  } else if (numerChainId === QUARKCHAIN_L2_TESTNET_CHAIN_ID) {
    numerPools = DEFAULT_THREAD_POOL_SIZE_HIGH;
  } else {
    numerPools = DEFAULT_THREAD_POOL_SIZE_LOW;
  }
  console.log(`threadPoolSize = ${numerPools} \n`);

  // query total cost
  const uploader = await Uploader.create(key, handler.providerUrl, handler.chainId, handler.address, numerType);
  if (!uploader) {
    console.log(error(`ERROR: Failed to initialize the SDK, please check the parameters and network and try again.`));
    return;
  }

  if (estimateGas) {
    // get cost
    await estimateCost(uploader, path, numberGasPct, numerPools);
    if (await answer(`Continue?`)) {
      // upload
      console.log();
      await upload(uploader, path, numberGasPct, numerPools);
    }
  } else {
    // upload
    await upload(uploader, path, numberGasPct, numerPools);
  }
  process.exit(0);
}

const answer = async (text: string): Promise<boolean> => {
  return new Promise<boolean>((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question(`${text} (y/n) `, (response) => {
      rl.close();
      resolve(response.toLowerCase() === 'y' || response.toLowerCase() === 'Y' || response.toLowerCase() === '');
    });
  });
};

async function estimateCost(
    uploader: Uploader,
    path: string,
    gasIncPct: number,
    threadPoolSize: number
): Promise<void> {
  const spin = ora('Start estimating cost').start();
  try {
    const cost = await uploader.estimateCost(spin, path, gasIncPct, threadPoolSize);
    spin.succeed('Estimating cost progress: 100%');

    console.log();
    console.log(`Info: The number of files is ${error(cost.totalFileCount.toString())}`);
    console.log(`Info: Storage cost is expected to be ${error(ethers.formatEther(cost.totalStorageCost))} ETH`);
    console.log(`Info: Gas cost is expected to be ${error(ethers.formatEther(cost.totalGasCost))} ETH`);
    console.log(`Info: The total cost is ${error(ethers.formatEther(cost.totalStorageCost + cost.totalGasCost))} ETH`);
  } catch (e: any) {
    console.log();
    const length = e.message.length;
    console.log(length > 400 ? `${e.message.substring(0, 200)} ... ${e.message.substring(length - 190, length)}` : e.message);
    console.log(error(e.value ? `Estimate gas failed, the failure file is ${e.value}` : 'Estimate gas failed'));
  } finally {
    spin.stop();
  }
}

async function upload(
    uploader: Uploader,
    path: string,
    gasIncPct: number,
    threadPoolSize: number
): Promise<void> {
  try {
    const infoArr: UploadResult[] = await uploader.upload(path, gasIncPct, threadPoolSize);
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
  } catch (e: any) {
    const length = e.message.length;
    console.log(length > 500 ? `${e.message.substring(0, 245)} ... ${e.message.substring(length - 245, length)}` : e.message);
    console.log(error('ERROR: Execution failed. Please check the parameters and try again!'));
  }
}
