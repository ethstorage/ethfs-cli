import { ethers } from "ethers";
import { from, mergeMap } from 'rxjs';
import {
    FlatDirectory,
    CostEstimate,
    UploadCallback,
    UPLOAD_TYPE_BLOB,
    UPLOAD_TYPE_CALLDATA
} from "ethstorage-sdk";
import { NodeFile } from "ethstorage-sdk/file";

import {
    EstimateResult,
    FilePool,
    UploadResult
} from "../types/types";
import { FlatDirectoryAbi } from '../params';
import { recursiveFiles } from './utils';

import color from "colors-cli/safe";
const error = color.red.bold;

export class UploadError extends Error {
    value: any;
    constructor(message: string, value: any) {
        super(message);
        this.name = "UploadError";
        this.value = value;
    }
}

export class Uploader {
    private chainId!: number;
    private flatDirectory!: FlatDirectory;

    private uploadType!: number;

    static async create(
        pk: string,
        rpc: string,
        chainId: number,
        contractAddress: string,
        uploadType?: number
    ): Promise<Uploader | null> {
        const uploader = new Uploader();
        return await uploader.init(pk, rpc, chainId, contractAddress, uploadType);
    }

    private async init(
        pk: string,
        rpc: string,
        chainId: number,
        contractAddress: string,
        uploadType?: number
    ): Promise<Uploader | null> {
        const status = await this.initType(rpc, contractAddress, uploadType);
        if (!status) {
            return null;
        }

        this.chainId = chainId;
        this.flatDirectory = await FlatDirectory.create({
            rpc: rpc,
            privateKey: pk,
            address: contractAddress
        });
        return this;
    }

    // TODO
    private async initType(rpc: string, contractAddress: string, uploadType?: number): Promise<boolean> {
        const provider = new ethers.JsonRpcProvider(rpc);
        const fileContract = new ethers.Contract(contractAddress, FlatDirectoryAbi, provider) as any;
        let isSupportBlob: boolean;
        try {
            isSupportBlob = await fileContract.isSupportBlob();
        } catch (e) {
            console.log(`ERROR: Init upload type fail.`, (e as { message?: string }).message || e);
            return false;
        }

        if (uploadType) {
            // check upload type
            if (!isSupportBlob && Number(uploadType) === UPLOAD_TYPE_BLOB) {
                console.log(`ERROR: The current network does not support this upload type, please switch to another type. Type=${uploadType}`);
                return false;
            }
            this.uploadType = Number(uploadType);
        } else {
            this.uploadType = isSupportBlob ? UPLOAD_TYPE_BLOB : UPLOAD_TYPE_CALLDATA;
        }
        return true;
    }

    // estimate cost
    async estimateCost(spin: any, path: string, gasIncPct: number, threadPoolSize: number): Promise<EstimateResult> {
        let totalFileCount = 0;
        let totalStorageCost = 0n;
        let totalGasCost = 0n;

        const files = recursiveFiles(path, '');
        return new Promise<EstimateResult>((resolve, reject) => {
            from(files)
                .pipe(mergeMap(info => this.estimate(info, gasIncPct), threadPoolSize))
                .subscribe({
                    next: (cost) => {
                        totalFileCount++;
                        totalStorageCost += cost.storageCost;
                        totalGasCost += cost.gasCost;
                        spin.text = `Estimating cost progress: ${Math.ceil(totalFileCount / files.length * 100)}%`;
                    },
                    error: (error) => { reject(error); },
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

    private async estimate(fileInfo: FilePool, gasIncPct: number): Promise<CostEstimate> {
        try {
            const { path, name } = fileInfo;
            const file = new NodeFile(path);
            return await this.flatDirectory.estimateCost({
                key: name,
                content: file,
                type: this.uploadType,
                gasIncPct: gasIncPct
            });
        } catch (e) {
            const errorMessage = (e as { message?: string }).message || String(e);
            throw new UploadError(errorMessage, fileInfo.name);
        }
    }


    // upload
    async upload(path: string, gasIncPct: number, threadPoolSize: number): Promise<UploadResult[]> {
        const results: any[] = [];
        return new Promise<UploadResult[]>((resolve, reject) => {
            from(recursiveFiles(path, ''))
                .pipe(mergeMap(info => this.uploadFile(info, gasIncPct), threadPoolSize))
                .subscribe({
                    next: (info) => { results.push(info); },
                    error: (error) => { reject(error); },
                    complete: () => { resolve(results); }
                });
        });
    }

    private async uploadFile(fileInfo: { path: string; name: string }, gasIncPct: number): Promise<UploadResult> {
        const { path, name } = fileInfo;

        let totalChunkCount = 0;
        let currentSuccessIndex = -1;
        let totalUploadCount = 0;
        let totalUploadSize = 0;
        let totalStorageCost = 0n;

        const callback: UploadCallback = {
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
        await this.flatDirectory.upload({
            key: name,
            content: file,
            type: this.uploadType,
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
