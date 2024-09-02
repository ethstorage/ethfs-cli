
export interface WebHandlerResult {
    providerUrl: string;
    chainId: number;
    address: string;
}

export interface FilePool {
    path: string;
    name: string;
    size: number;
}

export interface EstimateResult {
    totalFileCount: number,
    totalStorageCost: bigint,
    totalGasCost: bigint,
}

export interface UploadResult {
    fileName: string,
    totalChunkCount: number,
    currentSuccessIndex: number,
    totalUploadCount: number,
    totalUploadSize: number,
    totalStorageCost: bigint,
}

export type Nullable<T> = T | undefined;
