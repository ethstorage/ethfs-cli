const {ethers} = require("ethers");
const {from, mergeMap} = require('rxjs');
const {
    FlatDirectory,
    UPLOAD_TYPE_BLOB,
    UPLOAD_TYPE_CALLDATA
} = require("ethstorage-sdk");
const {NodeFile} = require("ethstorage-sdk/file");

const {
    FlatDirectoryAbi
} = require('../params');
const {
    recursiveFiles
} = require('./utils');

const color = require("colors-cli/safe");
const error = color.red.bold;

class UploadError extends Error {
    constructor(message, value) {
        super(message);
        this.name = "UploadError";
        this.value = value;
    }
}

class Uploader {
    #chainId;
    #flatDirectory;

    #uploadType;

    static async create(pk, rpc, chainId, contractAddress, uploadType) {
        const uploader = new Uploader(chainId);
        const status = await uploader.#init(pk, rpc, contractAddress, uploadType);
        if (status) {
            return uploader;
        }
        return null;
    }

    constructor(chainId) {
        this.#chainId = chainId;
    }

    async #init(pk, rpc, contractAddress, uploadType) {
        const status = await this.#initType(rpc, contractAddress, uploadType);
        if (!status) {
            return false;
        }

        this.#flatDirectory = await FlatDirectory.create({
            rpc: rpc, privateKey: pk, address: contractAddress
        });
        return true;
    }

    async #initType(rpc, contractAddress, uploadType) {
        const provider = new ethers.JsonRpcProvider(rpc);
        const fileContract = new ethers.Contract(contractAddress, FlatDirectoryAbi, provider);
        let isSupportBlob;
        try {
            isSupportBlob = await fileContract.isSupportBlob();
        } catch (e) {
            console.log(`ERROR: Init upload type fail.`, e.message);
            return false;
        }

        if (uploadType) {
            // check upload type
            if (!isSupportBlob && Number(uploadType) === UPLOAD_TYPE_BLOB) {
                console.log(`ERROR: The current network does not support this upload type, please switch to another type. Type=${uploadType}`);
                return false;
            }
            this.#uploadType = Number(uploadType);
        } else {
            this.#uploadType = isSupportBlob ? UPLOAD_TYPE_BLOB : UPLOAD_TYPE_CALLDATA;
        }
        return true;
    }

    // estimate cost
    async estimateCost(spin, path, gasPriceIncreasePercentage) {
        let totalFileCount = 0;
        let totalStorageCost = 0n;
        let totalGasCost = 0n;

        const syncPoolSize = 6;
        const files = recursiveFiles(path, '');
        return new Promise((resolve, reject) => {
            from(files)
                .pipe(mergeMap(info => this.#estimate(info, gasPriceIncreasePercentage), syncPoolSize))
                .subscribe({
                    next: (cost) => {
                        totalFileCount++;
                        totalStorageCost += cost.totalStorageCost;
                        totalGasCost += cost.totalGasCost;
                        spin.text = `Estimating cost progress: ${Math.ceil(totalFileCount / files.length * 100)}%`;
                    },
                    error: (error) => { reject(error) },
                    complete: () => {
                        resolve({
                            totalFileCount,
                            totalStorageCost,
                            totalGasCost,
                        });
                    }
                });
        });
    }

    async #estimate(fileInfo, gasPriceIncreasePercentage) {
        try {
            const {path, name} = fileInfo;
            const file = new NodeFile(path);
            const cost = await this.#flatDirectory.estimateCost({
                key: name,
                content: file,
                type: this.#uploadType,
                gasIncPct: gasPriceIncreasePercentage
            });
            return {
                totalStorageCost: cost.storageCost, totalGasCost: cost.gasCost
            }
        } catch (e) {
            throw new UploadError(e.message, fileInfo.name);
        }
    }


    // upload
    async upload(path, gasPriceIncreasePercentage) {
        const syncPoolSize = 6;
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

    async #upload(fileInfo, gasPriceIncreasePercentage) {
        const {path, name} = fileInfo;

        let totalChunkCount = 0;
        let currentSuccessIndex = -1;
        let totalUploadCount = 0;
        let totalUploadSize = 0;
        let totalStorageCost = 0n;

        const callback = {
            onProgress: (progress, count, isChange) => {
                if (isChange) {
                    console.log(`FlatDirectory: The [${currentSuccessIndex + 1}-${progress}] chunks have been uploaded`, '', name);
                } else {
                    console.log(`FlatDirectory: The [${currentSuccessIndex + 1}-${progress}] chunks is not changed`, '', name);
                }
                currentSuccessIndex = progress;
                totalChunkCount = count;
            },
            onFail: (e) => {
                const length = e.message.length;
                console.log(error(length > 500 ? (e.message.substring(0, 245) + " ... " + e.message.substring(length - 245, length)) : e.message), name);
            },
            onFinish: (totalUploadChunks, totalSize, totalCost) => {
                totalUploadCount = totalUploadChunks;
                totalUploadSize = totalSize;
                totalStorageCost = totalCost;
            }
        };

        const file = new NodeFile(path);
        await this.#flatDirectory.upload({
            key: name,
            content: file,
            type: this.#uploadType,
            gasIncPct: gasPriceIncreasePercentage,
            callback: callback
        });
        return {
            fileName: name,
            totalChunkCount: totalChunkCount,
            currentSuccessIndex: currentSuccessIndex,
            totalUploadCount: totalUploadCount,
            totalUploadSize: totalUploadSize / 1024,
            totalStorageCost: totalStorageCost,
        };
    }
}

module.exports = {
    Uploader
}
