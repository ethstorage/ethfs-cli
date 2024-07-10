const sha3 = require('js-sha3').keccak_256;
const {ethers} = require("ethers");
const {FlatDirectory, utils} = require("ethstorage-sdk");
const {NodeFile} = require("ethstorage-sdk/file");
const {from, mergeMap, map} = require('rxjs');
const {
    GALILEO_CHAIN_ID, VERSION_CALL_DATA, VERSION_BLOB, FlatDirectoryAbi
} = require('../params');
const {
    recursiveFiles, getFileChunk
} = require('./utils');

const color = require("colors-cli/safe");
const error = color.red.bold;

const REMOVE_FAIL = -1;
const REMOVE_NORMAL = 0;
const REMOVE_SUCCESS = 1;

class Uploader {
    #chainId;
    #contractAddress;
    #wallet;
    #flatDirectory;

    #nonce;
    #uploadType;

    static async create(pk, rpc, chainId, contractAddress, uploadType) {
        const uploader = new Uploader(pk, rpc, chainId, contractAddress);
        const status = await uploader.#init(pk, rpc, contractAddress, uploadType);
        if (status) {
            return uploader;
        }
        return null;
    }

    constructor(pk, rpc, chainId, contractAddress) {
        const provider = new ethers.JsonRpcProvider(rpc);
        this.#wallet = new ethers.Wallet(pk, provider);
        this.#chainId = chainId;
        this.#contractAddress = contractAddress;
    }

    async #init(pk, rpc, contractAddress, uploadType) {
        const status = await this.#initType(uploadType);
        if (!status) {
            return false;
        }

        this.#flatDirectory = await FlatDirectory.create({
            rpc: rpc, privateKey: pk, address: contractAddress
        });
        this.#nonce = await this.#wallet.getNonce();
        return true;
    }

    async #initType(uploadType) {
        const fileContract = new ethers.Contract(this.#contractAddress, FlatDirectoryAbi, this.#wallet);
        let isSupportBlob;
        try {
            isSupportBlob = await fileContract.isSupportBlob();
        } catch (e) {
            console.log(`ERROR: Init upload type fail.`, e.message);
            return false;
        }

        if (uploadType) {
            // check upload type
            if (!isSupportBlob && uploadType === VERSION_BLOB) {
                console.log(`ERROR: The current network does not support this upload type, please switch to another type. Type=${uploadType}`);
                return false;
            }
            this.#uploadType = uploadType;
        } else {
            this.#uploadType = isSupportBlob ? VERSION_BLOB : VERSION_CALL_DATA;
        }
        return true;
    }

    increasingNonce() {
        return this.#nonce++;
    }

    // estimate cost
    async estimateCost(path, gasPriceIncreasePercentage) {
        let totalFileCount = 0;
        let totalStorageCost = 0n;
        let totalGasCost = 0n;

        const gasFeeData = await this.#wallet.provider.getFeeData();
        return new Promise((resolve, reject) => {
            from(recursiveFiles(path, ''))
                .pipe(map(info => this.#estimate(info, gasFeeData, gasPriceIncreasePercentage)))
                .subscribe({
                    next: (info) => {
                        totalFileCount++;
                        totalStorageCost += info.totalStorageCost;
                        totalGasCost += info.totalGasCost;
                    }, error: (error) => {
                        reject(error)
                    }, complete: () => {
                        resolve({
                            totalFileCount, totalStorageCost, totalGasCost,
                        });
                    }
                });
        });
    }

    async #estimate(info, gasFeeData, gasPriceIncreasePercentage) {
        if (this.#uploadType === VERSION_BLOB) {
            return await this.#estimateFileByBlob(info);
        } else if (this.#uploadType === VERSION_CALL_DATA) {
            return await this.#estimateFileByCallData(info, gasFeeData, gasPriceIncreasePercentage);
        }
    }

    async #estimateFileByBlob(fileInfo) {
        const {path, name} = fileInfo;
        const file = new NodeFile(path);
        const cost = this.#flatDirectory.estimateFileCost(name, file);
        return {
            totalStorageCost: cost.storageCost, totalGasCost: cost.gasCost
        }
    }

    async #estimateFileByCallData(fileInfo, gasFeeData, gasPriceIncreasePercentage = 0) {
        const {path, name, size} = fileInfo;
        const fileSize = size;
        const hexName = utils.stringToHex(name);
        const fileContract = new ethers.Contract(this.#contractAddress, FlatDirectoryAbi, this.#wallet);
        const [fileMod, oldChunkLength] = await Promise.all([fileContract.getStorageMode(hexName), fileContract.countChunks(hexName)]);
        if (fileMod !== BigInt(VERSION_CALL_DATA) && fileMod !== 0n) {
            throw new Error(`FlatDirectory: This file does not support calldata upload!`);
        }

        let totalStorageCost = 0n;
        let totalGasCost = 0n;

        let chunkDataSize = fileSize;
        let chunkLength = 1;
        let gasLimit = 0;
        if (GALILEO_CHAIN_ID === this.#chainId) {
            if (fileSize > 475 * 1024) {
                // Data need to be sliced if file > 475K
                chunkDataSize = 475 * 1024;
                chunkLength = Math.ceil(fileSize / (475 * 1024));
            }
        } else {
            if (fileSize > 24 * 1024 - 326) {
                // Data need to be sliced if file > 24K
                chunkDataSize = 24 * 1024 - 326;
                chunkLength = Math.ceil(fileSize / (24 * 1024 - 326));
            }
        }
        for (let i = 0; i < chunkLength; i++) {
            const chunk = getFileChunk(path, fileSize, i * chunkDataSize, (i + 1) * chunkDataSize);

            // check is change
            // TODO
            if (oldChunkLength !== 0 && i < oldChunkLength) {
                const localHash = '0x' + sha3(chunk);
                const hash = await fileContract.getChunkHash(hexName, i);
                if (localHash === hash) {
                    continue;
                }
            }

            // get cost
            let cost = 0n;
            if (GALILEO_CHAIN_ID === this.#chainId && chunk.length > (24 * 1024 - 326)) {
                // Galileo need stake
                cost = BigInt(Math.floor((chunk.length + 326) / 1024 / 24));
            }
            if (i === chunkLength - 1 || gasLimit === 0) {
                const hexData = '0x' + chunk.toString('hex');
                gasLimit = await fileContract.writeChunk.estimateGas(hexName, 0, hexData, {
                    value: ethers.parseEther(cost.toString())
                });
            }
            totalStorageCost += cost;
            totalGasCost += (gasFeeData.maxFeePerGas + gasFeeData.maxPriorityFeePerGas) * BigInt(100 + gasPriceIncreasePercentage) / BigInt(100) * gasLimit;
        }

        return {
            totalStorageCost, totalGasCost
        }
    }

    // upload
    async upload(path, syncPoolSize, gasPriceIncreasePercentage = 0) {
        const results = [];
        return new Promise((resolve, reject) => {
            from(recursiveFiles(path, ''))
                .pipe(mergeMap(info => this.#upload(info, gasPriceIncreasePercentage), syncPoolSize))
                .subscribe({
                    next: (info) => { results.push(info); },
                    error: (error) => { reject(error); },
                    complete: () => { resolve(results); }
                });
        });
    }

    async #upload(fileInfo, syncPoolSize, gasPriceIncreasePercentage = 0) {
        if (this.#uploadType === VERSION_BLOB) {
            return await this.#uploadFileByBlob(fileInfo);
        } else if (this.#uploadType === VERSION_CALL_DATA) {
            return await this.#uploadFileByCallData(fileInfo, gasPriceIncreasePercentage);
        }
    }

    async #uploadFileByBlob(fileInfo) {
        const {path, name} = fileInfo;

        let totalChunkCount = 0;
        let currentSuccessIndex = -1;
        let totalUploadCount = 0;
        let totalUploadSize = 0;
        let totalStorageCost = 0n;
        let status = true;

        const file = new NodeFile(path);
        await this.#flatDirectory.uploadFile(name, file, {
            onProgress: (progress, count) => {
                currentSuccessIndex = progress;
                totalChunkCount = count;
            },
            onFail: (err) => {
                status = false;
            },
            onSuccess: (totalUploadChunks, totalSize, totalCost) => {
                totalUploadCount = totalUploadChunks;
                totalUploadSize = totalSize;
                totalStorageCost = totalCost;
            }
        });

        return {
            status: status ? 1 : 0,
            fileName: name,
            totalChunkCount: totalChunkCount,
            currentSuccessIndex: currentSuccessIndex,
            totalUploadCount: totalUploadCount,
            totalUploadSize: totalUploadSize / 1024,
            totalCost: totalStorageCost,
        };
    }

    async #uploadFileByCallData(fileInfo, gasPriceIncreasePercentage = 0) {
        const {path, name, size} = fileInfo;
        const fileName = name;
        const fileSize = size;
        const hexName = ethers.hexlify(ethers.toUtf8Bytes(fileName));

        let fileContract = new ethers.Contract(this.#contractAddress, FlatDirectoryAbi, this.#wallet);
        const [fileMod, oldChunkLength] = await Promise.all([fileContract.getStorageMode(hexName), fileContract.countChunks(hexName)]);
        if (fileMod !== BigInt(VERSION_CALL_DATA) && fileMod !== 0n) {
            console.log(error(`ERROR: ${fileName} does not support calldata upload!`));
            return {status: 0, fileName: fileName};
        }

        let chunkLength = 1;
        let chunkDataSize = fileSize;
        if (this.#chainId === GALILEO_CHAIN_ID) {
            // Data need to be sliced if file > 475K
            if (fileSize > 475 * 1024) {
                chunkDataSize = 475 * 1024;
                chunkLength = Math.ceil(fileSize / (475 * 1024));
            }
        } else {
            // Data need to be sliced if file > 24K
            if (fileSize > 24 * 1024 - 326) {
                chunkDataSize = 24 * 1024 - 326;
                chunkLength = Math.ceil(fileSize / (24 * 1024 - 326));
            }
        }

        // remove old chunk
        const clearState = await this.clearOldFile(fileContract, fileName, hexName, chunkLength, oldChunkLength);
        if (clearState === REMOVE_FAIL) {
            return {status: 0, fileName: fileName};
        }

        let totalUploadCount = 0;
        let totalCost = 0n;
        let totalUploadSize = 0;
        let currentSuccessIndex = -1;
        for (let i = 0; i < chunkLength; i++) {
            try {
                fileContract = new ethers.Contract(this.#contractAddress, FlatDirectoryAbi, this.#wallet);
                const chunk = getFileChunk(path, fileSize, i * chunkDataSize, (i + 1) * chunkDataSize);
                const hexData = '0x' + chunk.toString('hex');

                if (clearState === REMOVE_NORMAL) {
                    // check is change
                    const localHash = '0x' + sha3(chunk);
                    const hash = await fileContract.getChunkHash(hexName, i);
                    if (localHash === hash) {
                        currentSuccessIndex++;
                        console.log(`File ${fileName} chunkId: ${i}: The data is not changed.`);
                        continue;
                    }
                }

                // get cost
                let cost = 0n;
                if ((this.#chainId === GALILEO_CHAIN_ID) && (chunk.length > 24 * 1024 - 326)) {
                    // eth storage need stake
                    cost = BigInt(Math.floor((chunk.length + 326) / 1024 / 24));
                }

                const estimatedGas = await fileContract.writeChunk.estimateGas(hexName, i, hexData, {
                    value: ethers.parseEther(cost.toString())
                });

                // upload file
                const option = {
                    nonce: this.increasingNonce(),
                    gasLimit: estimatedGas * BigInt(6) / BigInt(5),
                    value: ethers.parseEther(cost.toString())
                };

                // Increase % if user requests it
                if (gasPriceIncreasePercentage !== 0) {
                    // Fetch the current gas price and increase it
                    const feeData = await this.#wallet.provider.getFeeData();
                    // Set the increased gas price
                    option.maxFeePerGas = feeData.maxFeePerGas * BigInt(100 + gasPriceIncreasePercentage) / BigInt(100);
                    option.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas * BigInt(100 + gasPriceIncreasePercentage) / BigInt(100);
                }

                const tx = await fileContract.writeChunk(hexName, i, hexData, option);
                console.log(`Send Success: File: ${fileName}, Chunk Id: ${i}, Transaction hash: ${tx.hash}`);
                // get result
                const txReceipt = await tx.wait();
                if (txReceipt && txReceipt.status) {
                    console.log(`File ${fileName} chunkId: ${i} uploaded!`);
                    totalCost += option.value;
                    totalUploadSize += chunk.length;
                    totalUploadCount++;
                    currentSuccessIndex++;
                }
            } catch (e) {
                const length = e.message.length;
                console.log(length > 400 ? (e.message.substring(0, 200) + " ... " + e.message.substring(length - 190, length)) : e.message);
                console.log(error(`ERROR: upload ${fileName} fail!`));
                break;
            }
        }
        return {
            status: 1,
            fileName: fileName,
            totalChunkCount: chunkLength,
            currentSuccessIndex: currentSuccessIndex,
            totalUploadCount: totalUploadCount,
            totalUploadSize: totalUploadSize / 1024,
            totalCost: totalCost,
        };
    }

    async clearOldFile(fileContract, fileName, hexName, chunkLength, oldChunkLength) {
        if (oldChunkLength > chunkLength) {
            // remove
            return this.removeFile(fileContract, fileName, hexName);
        } else if (oldChunkLength === 0) {
            return REMOVE_SUCCESS;
        }
        return REMOVE_NORMAL;
    }

    async removeFile(fileContract, fileName, hexName) {
        const estimatedGas = await fileContract.remove.estimateGas(hexName);
        const option = {
            nonce: this.increasingNonce(), gasLimit: estimatedGas * BigInt(6) / BigInt(5)
        };
        try {
            const tx = await fileContract.remove(hexName, option);
            console.log(`Remove Transaction Id: ${tx.hash}`);
            const receipt = await tx.wait();
            if (receipt.status) {
                console.log(`Remove file: ${fileName} succeeded`);
                return REMOVE_SUCCESS;
            }
        } catch (e) {
            console.log(e.message);
        }
        console.log(error(`ERROR: Failed to remove file: ${fileName}`));
        return REMOVE_FAIL;
    }
}

module.exports = {
    Uploader
}
