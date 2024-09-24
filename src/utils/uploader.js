const { from, mergeMap, map, scan, filter } = require('rxjs');
const {
    FlatDirectory,
    UPLOAD_TYPE_BLOB,
    UPLOAD_TYPE_CALLDATA,
    OP_BLOB_DATA_SIZE,
    MAX_CHUNKS
} = require("ethstorage-sdk");
const {NodeFile} = require("ethstorage-sdk/file");

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

const GALILEO_CHAIN_ID = 3334;

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
            console.log(e.message);
            return false;
        }

        if (uploadType) {
            // check upload type
            if (!this.#flatDirectory.isSupportBlob() && Number(uploadType) === UPLOAD_TYPE_BLOB) {
                console.log(`ERROR: The current network does not support this upload type, please switch to another type. Type=${uploadType}`);
                return false;
            }
            this.#uploadType = Number(uploadType);
        } else {
            this.#uploadType = this.#flatDirectory.isSupportBlob() ? UPLOAD_TYPE_BLOB : UPLOAD_TYPE_CALLDATA;
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
        if (this.#uploadType === UPLOAD_TYPE_BLOB) {
            return Math.ceil(fileSize / OP_BLOB_DATA_SIZE);
        } else {
            if (GALILEO_CHAIN_ID === this.#chainId) {
                if (fileSize > 475 * 1024) {
                    // Data need to be sliced if file > 475K
                    return Math.ceil(fileSize / (475 * 1024));
                }
            } else {
                if (fileSize > 24 * 1024 - 326) {
                    // Data need to be sliced if file > 24K
                    return Math.ceil(fileSize / (24 * 1024 - 326));
                }
            }
            return 1;
        }
    }

    // estimate cost
    async estimateCost(spin, path, gasIncPct, threadPoolSize) {
        let totalFileCount = 0;
        let totalStorageCost = 0n;
        let totalGasCost = 0n;

        const files = recursiveFiles(path, '');
        return new Promise((resolve, reject) => {
            from(files)
                .pipe(
                    // Group
                    scan((acc, file) => {
                        const files = [...acc.files, file];
                        const totalChunks = acc.totalChunks + this.#getFileChunkCount(file.size);

                        if (totalChunks >= MAX_CHUNKS) {
                            return { files: [], totalChunks: 0, reset: true, batch: files };
                        }
                        return { files, totalChunks, reset: false };
                    }, { files: [], totalChunks: 0 }),
                    filter(acc => acc.reset === true),
                    map(acc => acc.batch),

                    // Execution
                    mergeMap(fileBatch => this.#fetchFileDataBatch(fileBatch), threadPoolSize),
                    mergeMap(files => from(files)),
                    mergeMap(file => this.#estimate(file, gasIncPct), threadPoolSize)
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
        return new Promise((resolve, reject) => {
            from(recursiveFiles(path, ''))
                .pipe(
                    // Group
                    scan((acc, file) => {
                        const files = [...acc.files, file];
                        const totalChunks = acc.totalChunks + this.#getFileChunkCount(file.size);

                        if (totalChunks >= MAX_CHUNKS) {
                            return { files: [], totalChunks: 0, reset: true, batch: files };
                        }
                        return { files, totalChunks, reset: false };
                    }, { files: [], totalChunks: 0 }),
                    filter(acc => acc.reset === true),
                    map(acc => acc.batch),

                    // Execution
                    mergeMap(fileBatch => this.#fetchFileDataBatch(fileBatch), threadPoolSize),
                    mergeMap(files => from(files)),
                    mergeMap(file => this.#upload(file, gasIncPct), threadPoolSize)
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
                    console.log("FlatDirectory: Chunks " + indexArr.join(',') + " have been uploaded", '', name);
                } else {
                    console.log("FlatDirectory: Chunks " + indexArr.join(',') + " have not been changed", '', name);
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
