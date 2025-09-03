
const NSAbi = [
    "function pointerOf(bytes memory name) public view returns (address)",
    "function resolver(bytes32 node) public view returns (address)",
];

const ResolverAbi = [
    "function webHandler(bytes32 node) external view returns (address)",
    "function text(bytes32 node, string calldata key) external view returns (string memory)"
];

module.exports = {
    NSAbi,
    ResolverAbi,
}
