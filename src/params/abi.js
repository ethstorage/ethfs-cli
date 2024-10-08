
const NSAbi = [
    "function pointerOf(bytes memory name) public view returns (address)",
    "function resolver(bytes32 node) public view returns (address)",
];

const ResolverAbi = [
    "function webHandler(bytes32 node) external view returns (address)",
    "function text(bytes32 node, string calldata key) external view returns (string memory)"
];

const FlatDirectoryAbi = [
    "function writeChunk(bytes memory name, uint256 chunkId, bytes calldata data) external payable",
    "function remove(bytes memory name) external returns (uint256)",
    "function countChunks(bytes memory name) external view returns (uint256)",
    "function getChunkHash(bytes memory name, uint256 chunkId) public view returns (bytes32)",
    "function isSupportBlob() view public returns (bool)",
    "function getStorageMode(bytes memory name) public view returns(uint256)",
    "function refund() public",
];

module.exports = {
    NSAbi,
    ResolverAbi,
    FlatDirectoryAbi,
}
