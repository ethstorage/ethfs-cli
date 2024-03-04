const fs = require('fs');
const sha3 = require('js-sha3').keccak_256;
const {ethers} = require("ethers");
const {BlobUploader, EncodeBlobs, BLOB_DATA_SIZE} = require("ethstorage-sdk");
const color = require("colors-cli/safe");
const error = color.red.bold;

const fileBlobAbi = [
    "function writeChunk(bytes memory name, uint256 chunkId, bytes calldata data) external payable",
    "function writeChunks(bytes memory name, uint256[] memory chunkIds, uint256[] memory sizes) external payable",
    "function upfrontPayment() external view returns (uint256)",
    "function remove(bytes memory name) external returns (uint256)",
    "function countChunks(bytes memory name) external view returns (uint256)",
    "function getChunkHash(bytes memory name, uint256 chunkId) public view returns (bytes32)",
    "function isSupportBlob() view public returns (bool)",
    "function getStorageMode(bytes memory name) public view returns(uint256)"
];

const GALILEO_CHAIN_ID = 3334;


const REMOVE_FAIL = -1;
const REMOVE_NORMAL = 0;
const REMOVE_SUCCESS = 1;


const MAX_BLOB_COUNT = 3;


const VERSION_CALL_DATA = '1';
const VERSION_BLOB = '2';

const getFileChunk = (path, fileSize, start, end) => {
    end = end > fileSize ? fileSize : end;
    const length = end - start;
    const buf = new Buffer(length);
    const fd = fs.openSync(path, 'r');
    fs.readSync(fd, buf, 0, length, start);
    fs.closeSync(fd);
    return buf;
}

const sleep = (ms) => {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

class Uploader {
    #chainId;
    #wallet;
    #nonce;
    #uploadType;

    #fileContract;
    #blobUploader;


    constructor(pk, rpc, chainId, contractAddress, uploadType) {
        this.#uploadType = uploadType;
        this.#chainId = chainId;
        const provider = new ethers.JsonRpcProvider(rpc);
        this.#wallet = new ethers.Wallet(pk, provider);

        this.#fileContract = new ethers.Contract(contractAddress, fileBlobAbi, this.#wallet);
        this.#blobUploader = new BlobUploader(rpc, pk);
    }

    async init() {
        this.#nonce = await this.#wallet.getNonce();
        if (this.#uploadType === VERSION_BLOB) {
            return await this.supportBlob();
        } else if (this.#uploadType === VERSION_CALL_DATA) {
            return true;
        }
        return false;
    }

    getNonce() {
        return this.#nonce++;
    }

    async uploadFile(fileInfo) {
        if (this.#uploadType === VERSION_BLOB) {
            return await this.upload4844File(fileInfo);
        } else if (this.#uploadType === VERSION_CALL_DATA) {
            return await this.uploadOldFile(fileInfo);
        }
    };

    async supportBlob() {
        try {
            return await this.#fileContract.isSupportBlob();
        } catch (e) {
            return false;
        }
    }

    async getStorageMode(hexName) {
        try {
            return await this.#fileContract.getStorageMode(hexName);
        } catch (e) {
            await sleep(3000);
            return await this.#fileContract.getStorageMode(hexName);
        }
    }

    async getCost() {
        let cost;
        try {
            cost = await this.#fileContract.upfrontPayment();
        } catch (e) {
            await sleep(3000);
            cost = await this.#fileContract.upfrontPayment();
        }
        return cost;
    }

    async getChunkHash(hexName, chunkId) {
        let hash;
        try {
            hash = await this.#fileContract.getChunkHash(hexName, chunkId);
        } catch (e) {
            await sleep(3000);
            hash = await this.#fileContract.getChunkHash(hexName, chunkId);
        }
        return hash;
    }

    async clearOldFile(fileContract, fileName, hexName, chunkLength) {
        let oldChunkLength;
        try {
            oldChunkLength = await fileContract.countChunks(hexName);
        } catch (e) {
            await sleep(3000);
            oldChunkLength = await fileContract.countChunks(hexName);
        }
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
            nonce: this.getNonce(),
            gasLimit: estimatedGas * BigInt(6) / BigInt(5)
        };

        let tx;
        try {
            tx = await fileContract.remove(hexName, option);
        } catch (e) {
            await sleep(3000);
            tx = await fileContract.remove(hexName, option);
        }
        console.log(`Remove Transaction Id: ${tx.hash}`);
        const receipt = await tx.wait();
        if (receipt.status) {
            console.log(`Remove file: ${fileName} succeeded`);
            return REMOVE_SUCCESS;
        } else {
            console.log(`Failed to remove file: ${fileName}`);
            return REMOVE_FAIL;
        }
    }

    async upload4844File(fileInfo) {
        const {path, name, size} = fileInfo;
        const filePath = path;
        const fileName = name;
        const fileSize = size;

        const hexName = '0x' + Buffer.from(fileName, 'utf8').toString('hex');
        const fileMod = await this.getStorageMode(hexName);
        if (fileMod !== 0n && fileMod !== BigInt(VERSION_BLOB)) {
            console.log(error(`ERROR: This file does not support blob upload! file=${fileName}`));
            return {upload: 0, fileName: fileName};
        }

        // TODO OP_BLOB_DATA_SIZE;
        const blobDataSize = BLOB_DATA_SIZE;
        const blobLength = Math.ceil(fileSize / blobDataSize);

        const clearState = await this.clearOldFile(this.#fileContract, fileName, hexName, blobLength);
        if (clearState === REMOVE_FAIL) {
            return {upload: 0, fileName: fileName};
        }

        const cost = await this.getCost();

        let uploadCount = 0;
        let failIndex = -1;
        let totalCost = 0;
        let totalUploadSize = 0;
        for (let i = 0; i < blobLength; i += MAX_BLOB_COUNT) {
            const content = getFileChunk(filePath, fileSize, i * blobDataSize, (i + MAX_BLOB_COUNT) * blobDataSize);
            const blobs = EncodeBlobs(content);

            const blobArr = [];
            const indexArr = [];
            const lenArr = [];
            for (let j = 0; j < blobs.length; j++) {
                blobArr.push(blobs[j]);
                indexArr.push(i + j);
                if (i + j === blobLength - 1) {
                    lenArr.push(fileSize - blobDataSize * (blobLength - 1));
                } else {
                    lenArr.push(blobDataSize);
                }
            }


            if (clearState === REMOVE_NORMAL) {
                let hasChange = false;
                for (let j = 0; j < blobArr.length; j++) {
                    const dataHash = await this.getChunkHash(hexName, indexArr[j]);
                    const localHash = this.#blobUploader.getBlobHash(blobArr[j]);
                    if (dataHash !== localHash) {
                        hasChange = true;
                        break;
                    }
                }
                if (!hasChange) {
                    console.log(`File ${fileName} chunkId: ${indexArr}: The data is not changed.`);
                    continue;
                }
            }


            const value = cost * BigInt(blobArr.length);
            const tx = await this.#fileContract.writeChunks.populateTransaction(hexName, indexArr, lenArr, {
                nonce: this.getNonce(),
                value: value,
            });
            console.log(`${fileName}, chunkId: ${indexArr}`);

            let hash;
            try {
                hash = await this.#blobUploader.sendTx(tx, blobArr);
                console.log(`Transaction Id: ${hash}`);
            } catch (e) {}
            // get result
            if (hash) {
                const txReceipt = await this.#blobUploader.getTxReceipt(hash);
                if (txReceipt && txReceipt.status) {
                    console.log(`File ${fileName} chunkId: ${indexArr} uploaded!`);
                    uploadCount += indexArr.length;
                    totalCost += Number(ethers.formatEther(value));
                    for (let j = 0; j < lenArr.length; j++) {
                        totalUploadSize += lenArr[j];
                    }
                } else {
                    failIndex = indexArr[0];
                    break;
                }
            } else {
                failIndex = indexArr[0];
                break;
            }
        }

        return {
            upload: 1,
            fileName: fileName,
            totalCost: totalCost,
            totalUploadSize: totalUploadSize / 1024,
            uploadCount: uploadCount,
            failIndex: failIndex
        };
    }

    async uploadOldFile(fileInfo) {
        const {path, name, size} = fileInfo;
        const fileName = name;
        const fileSize = size;
        const hexName = '0x' + Buffer.from(fileName, 'utf8').toString('hex');

        const fileMod = await this.getStorageMode(hexName);
        if (fileMod !== BigInt(VERSION_CALL_DATA) && fileMod !== 0n) {
            console.log(error(`ERROR: This file does not support calldata upload! file=${fileName}`));
            return {upload: 0, fileName: fileName};
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
        const clearState = await this.clearOldFile(this.#fileContract, fileName, hexName, chunkLength);
        if (clearState === REMOVE_FAIL) {
            return {upload: 0, fileName: fileName};
        }

        let uploadCount = 0;
        let failIndex = -1;
        let totalCost = 0;
        let totalUploadSize = 0;
        for (let i = 0; i < chunkLength; i++) {
            const chunk = getFileChunk(path, fileSize, i * chunkDataSize, (i + 1) * chunkDataSize);
            console.log("chunk length",chunk.length);
            const hexData = '0x' + chunk.toString('hex');

            if (clearState === REMOVE_NORMAL) {
                // check is change
                const localHash = '0x' + sha3(chunk);
                let hash;
                try {
                    hash = await this.#fileContract.getChunkHash(hexName, i);
                } catch (e) {
                    await sleep(3000);
                    hash = await this.#fileContract.getChunkHash(hexName, i);
                }
                if (localHash === hash) {
                    console.log(`File ${fileName} chunkId: ${i}: The data is not changed.`);
                    continue;
                }
            }

            // get cost
            let cost = 0;
            if ((this.#chainId === GALILEO_CHAIN_ID) && (chunk.length > 24 * 1024 - 326)) {
                // eth storage need stake
                cost = Math.floor((chunk.length + 326) / 1024 / 24);
            }

            // upload file
            const option = {
                nonce: this.getNonce(),
                gasLimit: 21000000n,
                value: ethers.parseEther(cost.toString())
            };
            let tx;
            try {
                tx = await this.#fileContract.writeChunk(hexName, i, hexData, option);
            } catch (e) {
                await sleep(5000);
                tx = await this.#fileContract.writeChunk(hexName, i, hexData, option);
            }
            console.log(`${fileName}, chunkId: ${i}`);
            console.log(`Transaction Id: ${tx.hash}`);

            // get result
            const txReceipt = await tx.wait();
            if (txReceipt && txReceipt.status) {
                console.log(`File ${fileName} chunkId: ${i} uploaded!`);
                uploadCount++;
                totalCost += cost;
                totalUploadSize += chunk.length;
            } else {
                failIndex = i;
                break;
            }
        }

        return {
            upload: 1,
            fileName: fileName,
            totalCost: totalCost,
            totalUploadSize: totalUploadSize / 1024,
            uploadCount: uploadCount,
            failIndex: failIndex
        };
    }
}

module.exports = {
    Uploader,
    VERSION_CALL_DATA,
    VERSION_BLOB
}
