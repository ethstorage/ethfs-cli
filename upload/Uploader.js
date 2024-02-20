const fs = require('fs');
const sha3 = require('js-sha3').keccak_256;
const {ethers} = require("ethers");
const {BlobUploader, EncodeBlobs, BLOB_FILE_SIZE} = require("ethstorage-sdk");
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
    "function getFileMode(bytes memory name) public view returns(uint256)"
];

const GALILEO_CHAIN_ID = 3334;


const REMOVE_FAIL = -1;
const REMOVE_NORMAL = 0;
const REMOVE_SUCCESS = 1;


const MAX_BLOB_COUNT = 3;


const VERSION_CALL_DATA = '1';
const VERSION_BLOB = '2';


const bufferChunk = (buffer, chunkSize) => {
    let i = 0;
    let result = [];
    const len = buffer.length;
    const chunkLength = Math.ceil(len / chunkSize);
    while (i < len) {
        result.push(buffer.slice(i, i += chunkLength));
    }
    return result;
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
        }
        return true;
    }

    getNonce() {
        return this.#nonce++;
    }

    async uploadFile(fileInfo) {
        if (this.#uploadType === VERSION_BLOB) {
            return await this.upload4844File(fileInfo);
        } else {
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

    async getFileMode(hexName) {
        try {
            return await this.#fileContract.getFileMode(hexName);
        } catch (e) {
            await sleep(3000);
            return await this.#fileContract.getFileMode(hexName);
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
        const fileMod = await this.getFileMode(hexName);
        if (fileMod === BigInt(VERSION_CALL_DATA)) {
            console.log(error(`ERROR: This file does not support blob upload! file=${fileName}`));
            return {upload: 0, fileName: fileName};
        }


        const content = fs.readFileSync(filePath);
        const blobs = EncodeBlobs(content);

        // TODO can not remove
        // const clearState = await this.clearOldFile(this.#fileContract, fileName, hexName, blobs.length);
        // if (clearState === REMOVE_FAIL) {
        //     return {upload: 0, fileName: fileName};
        // }
        const clearState = REMOVE_NORMAL;

        const cost = await this.getCost();
        const blobLength = blobs.length;

        const failFile = [];
        let uploadCount = 0;
        for (let i = 0; i < blobLength; i += MAX_BLOB_COUNT) {
            const blobArr = [];
            const indexArr = [];
            const lenArr = [];
            let max = i + MAX_BLOB_COUNT > blobLength ? blobLength : i + MAX_BLOB_COUNT;
            for (let j = i; j < max; j++) {
                blobArr.push(blobs[j]);
                indexArr.push(j);
                if (j === blobLength - 1) {
                    lenArr.push(fileSize - BLOB_FILE_SIZE * (blobLength - 1));
                } else {
                    lenArr.push(BLOB_FILE_SIZE);
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


            const fee = await this.#blobUploader.getFee();
            const value = cost * BigInt(blobArr.length);
            const tx = await this.#fileContract.writeChunks.populateTransaction(hexName, indexArr, lenArr, {
                nonce: this.getNonce(),
                value: value,
                maxFeePerGas: fee.maxFeePerGas * BigInt(6) / BigInt(5),
                maxPriorityFeePerGas: fee.maxPriorityFeePerGas * BigInt(6) / BigInt(5),
            });
            tx.maxFeePerBlobGas = ethers.parseUnits('30', 9);
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
                } else {
                    failFile.push(indexArr[0]);
                    break;
                }
            } else {
                failFile.push(indexArr[0]);
                break;
            }
        }

        return {
            upload: 1,
            fileName: fileName,
            cost: Number(ethers.formatEther(cost)),
            fileSize: fileSize / blobLength / 1024,
            uploadCount: uploadCount,
            failFile: failFile
        };
    }

    async uploadOldFile(fileInfo) {
        const {path, name, size} = fileInfo;
        const filePath = path;
        const fileName = name;
        let fileSize = size;

        const hexName = '0x' + Buffer.from(fileName, 'utf8').toString('hex');
        const fileMod = await this.getFileMode(hexName);
        if (fileMod === BigInt(VERSION_BLOB)) {
            console.log(error(`ERROR: This file does not support calldata upload! file=${fileName}`));
            return {upload: 0, fileName: fileName};
        }

        const content = fs.readFileSync(filePath);
        let chunks = [];
        if (this.#chainId === GALILEO_CHAIN_ID) {
            // Data need to be sliced if file > 475K
            if (fileSize > 475 * 1024) {
                const chunkSize = Math.ceil(fileSize / (475 * 1024));
                chunks = bufferChunk(content, chunkSize);
                fileSize = fileSize / chunkSize;
            } else {
                chunks.push(content);
            }
        } else {
            // Data need to be sliced if file > 24K
            if (fileSize > 24 * 1024 - 326) {
                const chunkSize = Math.ceil(fileSize / (24 * 1024 - 326));
                chunks = bufferChunk(content, chunkSize);
                fileSize = fileSize / chunkSize;
            } else {
                chunks.push(content);
            }
        }

        const clearState = await this.clearOldFile(this.#fileContract, fileName, hexName, chunks.length);
        if (clearState === REMOVE_FAIL) {
            return {upload: 0, fileName: fileName};
        }

        let cost = 0;
        if ((this.#chainId === GALILEO_CHAIN_ID) && (fileSize > 24 * 1024 - 326)) {
            // eth storage need stake
            cost = Math.floor((fileSize + 326) / 1024 / 24);
        }

        let uploadCount = 0;
        const failFile = [];
        for (const index in chunks) {
            const chunk = chunks[index];
            const hexData = '0x' + chunk.toString('hex');

            if (clearState === REMOVE_NORMAL) {
                // check is change
                const localHash = '0x' + sha3(chunk);
                let hash;
                try {
                    hash = await this.#fileContract.getChunkHash(hexName, index);
                } catch (e) {
                    await sleep(3000);
                    hash = await this.#fileContract.getChunkHash(hexName, index);
                }
                if (localHash === hash) {
                    console.log(`File ${fileName} chunkId: ${index}: The data is not changed.`);
                    continue;
                }
            }

            let estimatedGas;
            try {
                estimatedGas = await this.#fileContract.writeChunk.estimateGas(hexName, index, hexData, {
                    value: ethers.parseEther(cost.toString())
                });
            } catch (e) {
                await sleep(3000);
                estimatedGas = await this.#fileContract.writeChunk.estimateGas(hexName, index, hexData, {
                    value: ethers.parseEther(cost.toString())
                });
            }

            // upload file
            const option = {
                nonce: this.getNonce(),
                gasLimit: estimatedGas * BigInt(6) / BigInt(5),
                value: ethers.parseEther(cost.toString())
            };
            let tx;
            try {
                tx = await this.#fileContract.writeChunk(hexName, index, hexData, option);
            } catch (e) {
                await sleep(5000);
                tx = await this.#fileContract.writeChunk(hexName, index, hexData, option);
            }
            console.log(`${fileName}, chunkId: ${index}`);
            console.log(`Transaction Id: ${tx.hash}`);

            // get result
            const txReceipt = await tx.wait();
            if (txReceipt && txReceipt.status) {
                console.log(`File ${fileName} chunkId: ${index} uploaded!`);
                uploadCount++;
            } else {
                failFile.push(index);
                break;
            }
        }

        return {
            upload: 1,
            fileName: fileName,
            cost: cost,
            fileSize: fileSize / 1024,
            uploadCount: uploadCount,
            failFile: failFile
        };
    }
}

module.exports = {
    Uploader,
    VERSION_BLOB
}
