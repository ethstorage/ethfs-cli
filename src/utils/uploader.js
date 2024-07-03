const fs = require('fs');
const sha3 = require('js-sha3').keccak_256;
const {ethers} = require("ethers");
const {EthStorage} = require("ethstorage-sdk");
const {from, mergeMap} = require('rxjs');
const {GALILEO_CHAIN_ID, VERSION_CALL_DATA, VERSION_BLOB} = require('../params/constants');

const color = require("colors-cli/safe");
const error = color.red.bold;

const fileBlobAbi = [
    "function writeChunk(bytes memory name, uint256 chunkId, bytes calldata data) external payable",
    "function remove(bytes memory name) external returns (uint256)",
    "function countChunks(bytes memory name) external view returns (uint256)",
    "function getChunkHash(bytes memory name, uint256 chunkId) public view returns (bytes32)",
    "function isSupportBlob() view public returns (bool)",
    "function getStorageMode(bytes memory name) public view returns(uint256)"
];

const REMOVE_FAIL = -1;
const REMOVE_NORMAL = 0;
const REMOVE_SUCCESS = 1;

const getFileChunk = (path, fileSize, start, end) => {
    end = end > fileSize ? fileSize : end;
    const length = end - start;
    const buf = Buffer.alloc(length);
    const fd = fs.openSync(path, 'r');
    fs.readSync(fd, buf, 0, length, start);
    fs.closeSync(fd);
    return buf;
}

function recursiveFiles(path, basePath) {
    let filePools = [];
    const fileStat = fs.statSync(path);
    if (fileStat.isFile()) {
        filePools.push({path: path, name: path.substring(path.lastIndexOf("/") + 1), size: fileStat.size});
        return filePools;
    }

    const files = fs.readdirSync(path);
    for (let file of files) {
        const fileStat = fs.statSync(`${path}/${file}`);
        if (fileStat.isDirectory()) {
            const pools = recursiveFiles(`${path}/${file}`, `${basePath}${file}/`);
            filePools = filePools.concat(pools);
        } else {
            filePools.push({path: `${path}/${file}`, name: `${basePath}${file}`, size: fileStat.size});
        }
    }
    return filePools;
}

class Uploader {
    #chainId;
    #contractAddress;
    #wallet;
    #ethStorage;

    #nonce;
    #uploadType;

    constructor(pk, rpc, chainId, contractAddress) {
        this.#chainId = chainId;
        this.#contractAddress = contractAddress;

        const provider = new ethers.JsonRpcProvider(rpc);
        this.#wallet = new ethers.Wallet(pk, provider);

        this.#ethStorage = new EthStorage(rpc, pk, contractAddress);
    }

    setUploadType(uploadType) {
        this.#uploadType = uploadType;
    }

    async supportBlob() {
        try {
            const fileContract = new ethers.Contract(this.#contractAddress, fileBlobAbi, this.#wallet);
            const isSupportBlob = await fileContract.isSupportBlob();
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
        } catch (e) {
            return false;
        }
    }

    async initNonce() {
        this.#nonce = await this.#wallet.getNonce();
        return this.#nonce;
    }

    increasingNonce() {
        return this.#nonce++;
    }

    async upload(path, syncPoolSize, gasPriceIncreasePercentage = 0) {
        // check
        if (this.#uploadType === VERSION_BLOB) {
            return await this.#ethStorage.upload(path, 1);
        } else if (this.#uploadType === VERSION_CALL_DATA) {
            return await this.uploadFiles(path, syncPoolSize, gasPriceIncreasePercentage);
        }
    }

    async uploadFiles(path, syncPoolSize, gasPriceIncreasePercentage = 0) {
        await this.initNonce();
        const results = [];
        return new Promise((resolve, reject) => {
            from(recursiveFiles(path, ''))
                .pipe(mergeMap(info => this.uploadFile(info, gasPriceIncreasePercentage), syncPoolSize))
                .subscribe({
                    next: (info) => { results.push(info); },
                    error: (error) => { reject(error); },
                    complete: () => { resolve(results); }
                });
        });
    }

    async uploadFile(fileInfo, gasPriceIncreasePercentage = 0) {
        const {path, name, size} = fileInfo;
        const fileName = name;
        const fileSize = size;
        const hexName = ethers.hexlify(ethers.toUtf8Bytes(fileName));

        let fileContract = new ethers.Contract(this.#contractAddress, fileBlobAbi, this.#wallet);
        const [fileMod, oldChunkLength] = await Promise.all([
            fileContract.getStorageMode(hexName),
            fileContract.countChunks(hexName)
        ]);

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
                fileContract = new ethers.Contract(this.#contractAddress, fileBlobAbi, this.#wallet);
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
            nonce: this.increasingNonce(),
            gasLimit: estimatedGas * BigInt(6) / BigInt(5)
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

    async estimateCost(path) {
        if (this.#uploadType === VERSION_BLOB) {
            return await this.#ethStorage.estimateFiles(path);
        } else if (this.#uploadType === VERSION_CALL_DATA) {
            return await this.estimateFiles(path);
        }
    }

    async estimateFiles(path) {
        let totalFileCount = 0;
        let totalTxCount = 0;
        let totalCost = 0n;
        let totalGasCost = 0n;
        let totalBlobGasCost = 0n;

        const gasFeeData = await this.#wallet.provider.getFeeData();
        return new Promise((resolve, reject) => {
            from(recursiveFiles(path, ''))
                .pipe(mergeMap(info => this.estimateFile(info, gasFeeData.gasPrice), 15))
                .subscribe({
                    next: (info) => {
                        totalFileCount++;
                        totalTxCount += info.totalTxCount;
                        totalCost += info.totalCost;
                        totalGasCost += info.totalGasCost;
                    },
                    error: (error) => { reject(error) },
                    complete: () => {
                        resolve({
                            totalFileCount,
                            totalTxCount,
                            totalCost,
                            totalGasCost,
                            totalBlobGasCost,
                        });
                    }
                });
        });
    }

    async estimateFile(fileInfo, gasPrice) {
        let totalTxCount = 0;
        let totalCost = 0n;
        let totalGasCost = 0n;

        const {path, name, size} = fileInfo;
        const fileName = name;
        const fileSize = size;
        const hexName = ethers.hexlify(ethers.toUtf8Bytes(fileName));

        let fileContract = new ethers.Contract(this.#contractAddress, fileBlobAbi, this.#wallet);
        const fileMod = await fileContract.getStorageMode(hexName);
        if (fileMod !== BigInt(VERSION_CALL_DATA) && fileMod !== 0n) {
            return {
                totalTxCount: totalTxCount,
                totalCost: totalCost,
                totalGasCost: totalGasCost
            }
        }

        let chunkDataSize = fileSize;
        let chunkLength = 1;
        let MAX_GAS_LIMIT = 0;
        if (GALILEO_CHAIN_ID === this.#chainId) {
            if (fileSize > 475 * 1024) {
                // Data need to be sliced if file > 475K
                chunkDataSize = 475 * 1024;
                chunkLength = Math.ceil(fileSize / (475 * 1024));
            }
        } else {
            MAX_GAS_LIMIT = 5630000n;
            if (fileSize > 24 * 1024 - 326) {
                // Data need to be sliced if file > 24K
                chunkDataSize = 24 * 1024 - 326;
                chunkLength = Math.ceil(fileSize / (24 * 1024 - 326));
            }
        }

        for (let i = 0; i < chunkLength; i++) {
            fileContract = new ethers.Contract(this.#contractAddress, fileBlobAbi, this.#wallet);
            const chunk = getFileChunk(path, fileSize, i * chunkDataSize, (i + 1) * chunkDataSize);

            // check is change
            const localHash = '0x' + sha3(chunk);
            const hash = await fileContract.getChunkHash(hexName, i);
            if (localHash === hash) {
                continue;
            }

            // get cost
            const hexData = '0x' + chunk.toString('hex');
            let cost = 0n;
            let gasLimit = 0;
            if (GALILEO_CHAIN_ID === this.#chainId) {
                if (chunk.length > (24 * 1024 - 326)) {
                    // eth storage need stake
                    cost = BigInt(Math.floor((chunk.length + 326) / 1024 / 24));
                }
                if (chunk.length === 475 * 1024) {
                    gasLimit = MAX_GAS_LIMIT;
                } else {
                    // must set chunk 0
                    gasLimit = await fileContract.writeChunk.estimateGas(hexName, 0, hexData, {
                        value: ethers.parseEther(cost.toString())
                    });
                }
            } else {
                if (chunk.length === 24 * 1024 - 326) {
                    gasLimit = MAX_GAS_LIMIT;
                } else {
                    gasLimit = await fileContract.writeChunk.estimateGas(hexName, 0, hexData); // must set chunk 0
                }
            }

            totalTxCount++;
            totalCost += cost;
            totalGasCost += gasPrice * gasLimit;
        }

        return {
            totalTxCount: totalTxCount,
            totalCost: totalCost,
            totalGasCost: totalGasCost
        }
    }
}

module.exports = {
    Uploader
}
