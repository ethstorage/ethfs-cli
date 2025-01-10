const { from, mergeMap, map, scan, filter } = require('rxjs');
const {
    FlatDirectory,
    UploadType,
    OP_BLOB_DATA_SIZE,
    MAX_CHUNKS
} = require("ethstorage-sdk");
const {NodeFile} = require("ethstorage-sdk/file");

const { recursiveFiles } = require('./utils');
const { Logger } = require('./log');


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
        const uploader = new Uploader();
        const status = await uploader.#init(pk, rpc, chainId, contractAddress, uploadType);
        if (status) {
            return uploader;
        }
        return null;
    }

    async #init(pk, rpc, chainId, contractAddress, uploadType) {
        this.#chainId = chainId;
        try {
            this.#flatDirectory = await FlatDirectory.create({
                rpc: rpc, privateKey: pk, address: contractAddress
            });
        } catch (e) {
            if (e.message.includes('The current SDK does not support this contract')) {
                Logger.error("Failed to query contract. Please check your network settings or install ethfs-cli 2.x if the contract was created with it.");
            } else {
                Logger.error(`SDK initialization failed, Please check your parameters and network connection, and try again.  info=${e.message}`);
            }
            return false;
        }

        if (uploadType) {
            // check upload type
            if (!this.#flatDirectory.isSupportBlob && uploadType === UploadType.Blob) {
                Logger.error(`Network does not support this upload type. Please switch to another type. Type=${uploadType}`);
                return false;
            }
            this.#uploadType = uploadType;
        } else {
            this.#uploadType = this.#flatDirectory.isSupportBlob ? UploadType.Blob : UploadType.Calldata;
        }
        return true;
    }

    async #fetchFileDataBatch(fileBatch) {
        const keys = fileBatch.map(file => file.name);
        const fileHashArr = await this.#flatDirectory.fetchHashes(keys);
        return fileBatch.map(file => {
            file.chunkHashes = fileHashArr[file.name];
            return file;
        })
    }

    #getFileChunkCount(fileSize) {
        if (this.#uploadType === UploadType.Blob) {
            return Math.ceil(fileSize / OP_BLOB_DATA_SIZE);
        } else {
            if (fileSize > 24 * 1024 - 326) {
                // Data need to be sliced if file > 24K
                return Math.ceil(fileSize / (24 * 1024 - 326));
            }
            return 1;
        }
    }

    #groupFiles(files) {
        return from(files).pipe(
            scan((acc, file) => {
                const newFiles = [...acc.files, file];
                const totalChunks = acc.totalChunks + this.#getFileChunkCount(file.size);
                const totalFileCount = acc.totalFileCount + 1;

                if (totalChunks >= MAX_CHUNKS || totalFileCount === files.length) {
                    return { files: [], totalChunks: 0, totalFileCount, batch: newFiles };
                }
                return { files: newFiles, totalChunks, totalFileCount, batch: [] };
            }, { files: [], totalChunks: 0, totalFileCount: 0, batch: [] }),
            filter(acc => acc.batch.length > 0), // Intercept unpacked data
            map(acc => acc.batch)
        );
    }

    // estimate cost
    async estimateCost(spin, path, gasIncPct, threadPoolSize) {
        let totalFileCount = 0;
        let totalStorageCost = 0n;
        let totalGasCost = 0n;
        // Execution
        const files = recursiveFiles(path, '');
        return new Promise((resolve, reject) => {
            this.#groupFiles(files) // Pack files into n groups
                .pipe(
                    mergeMap(fileBatch => this.#fetchFileDataBatch(fileBatch), threadPoolSize),
                    mergeMap(files => from(files)), // Split a group of files into a single emission
                    mergeMap(info => this.#estimate(info, gasIncPct), threadPoolSize)
                )
                .subscribe({
                    next: (cost) => {
                        totalFileCount++;
                        totalStorageCost += cost.storageCost;
                        totalGasCost += cost.gasCost;
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

    async #estimate(fileInfo, gasIncPct) {
        try {
            const {path, name, chunkHashes} = fileInfo;
            const file = new NodeFile(path);
            return await this.#flatDirectory.estimateCost({
                key: name,
                content: file,
                chunkHashes: chunkHashes,
                type: this.#uploadType,
                gasIncPct: gasIncPct
            });
        } catch (e) {
            throw new UploadError(e.message, fileInfo.name);
        }
    }


    // upload
    async upload(path, gasIncPct, threadPoolSize) {
        const results = [];
        // Execution
        const files = recursiveFiles(path, '');
        return new Promise((resolve, reject) => {
            this.#groupFiles(files)
                .pipe(
                    mergeMap(fileBatch => this.#fetchFileDataBatch(fileBatch), threadPoolSize),
                    mergeMap(files => from(files)),
                    mergeMap(info => this.#upload(info, gasIncPct), threadPoolSize)
                )
                .subscribe({
                    next: (info) => { results.push(info); },
                    error: (error) => { reject(error); },
                    complete: () => { resolve(results); }
                });
        });
    }

    async #upload(fileInfo, gasIncPct) {
        const {path, name, chunkHashes} = fileInfo;

        let totalChunkCount = 0;
        let currentSuccessIndex = -1;
        let totalUploadCount = 0;
        let totalUploadSize = 0;
        let totalStorageCost = 0n;

        const callback = {
            onProgress: (progress, count, isChange) => {
                const indexArr = [];
                for (let i = currentSuccessIndex + 1; i <= progress; i++) {
                    indexArr.push(i);
                }
                if (isChange) {
                    Logger.log(`FlatDirectory: Chunks ${indexArr.join(',')} have been uploaded for ${name}.`);
                } else {
                    Logger.log(`FlatDirectory: Chunks ${indexArr.join(',')} have not been changed for ${name}.`);
                }
                currentSuccessIndex = progress;
                totalChunkCount = count;
            },
            onFail: (e) => {
                const length = e.message.length;
                console.log(`${length > 500 ? (e.message.substring(0, 245) + " ... " + e.message.substring(length - 245, length)) : e.message}`, name);
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
            chunkHashes: chunkHashes,
            type: this.#uploadType,
            gasIncPct: gasIncPct,
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
