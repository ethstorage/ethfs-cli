declare module 'eth-ens-namehash' {
    export function namehash (inputName: string): string;
    export function normalize(name: string): string;
}
