
const nsAbi = [
    "function pointerOf(bytes memory name) public view returns (address)",
    "function resolver(bytes32 node) public view returns (address)",
];
const resolverAbi = [
    "function webHandler(bytes32 node) external view returns (address)",
    "function text(bytes32 node, string calldata key) external view returns (string memory)"
];

const SHORT_NAME_GALILEO = "w3q-g";
const SHORT_NAME_ETHEREUM = "eth";
const SHORT_NAME_GOERLI = "gor";
const SHORT_NAME_SEPOLIA = "sep";
const SHORT_NAME_OPTIMISTIC = "oeth";
const SHORT_NAME_ARBITRUM = "arb1";
const SHORT_NAME_OPTIMISTIC_GOERLI = "ogor";
const SHORT_NAME_ARBITRUM_GOERLI = "arb-goerli";
const SHORT_NAME_EVMOS = "evmos";
const SHORT_NAME_EVMOS_TEST = "evmos-testnet";
const SHORT_NAME_ARBITRUM_NOVE = "arb-nova";
const SHORT_NAME_BINANCE = "bnb";
const SHORT_NAME_BINANCE_TEST = "bnbt";
const SHORT_NAME_AVALANCHE = "avax";
const SHORT_NAME_AVALANCHE_TEST = "fuji";
const SHORT_NAME_FANTOM = "ftm";
const SHORT_NAME_FANTOM_TEST = "tftm";
const SHORT_NAME_HARMONY = "hmy-s0";
const SHORT_NAME_HARMONY_TEST = "hmy-b-s0";
const SHORT_NAME_POLYGON = "matic";
const SHORT_NAME_POLYGON_MUMBAI = "maticmum";
const SHORT_NAME_POLYGON_ZKEVM_TEST = "zkevmtest";
const SHORT_NAME_QUARKCHAIN = "qkc-s0";
const SHORT_NAME_QUARKCHAIN_DEVNET = "qkc-d-s0";

const GALILEO_CHAIN_ID = 3334;
const ETHEREUM_CHAIN_ID = 1;
const GOERLI_CHAIN_ID = 5;
const SEPOLIA_CHAIN_ID = 11155111;
const OPTIMISTIC_CHAIN_ID = 10;
const ARBITRUM_CHAIN_ID = 42161;
const OPTIMISTIC_GOERLI_CHAIN_ID = 420;
const ARBITRUM_GOERLI_CHAIN_ID = 421613;
const EVMOS_CHAIN_ID = 9001;
const EVMOS_TEST_CHAIN_ID = 9000;
const ARBITRUM_NOVE_CHAIN_ID = 42170;
const BINANCE_CHAIN_ID = 56;
const BINANCE_TEST_CHAIN_ID = 97;
const AVALANCHE_CHAIN_ID = 43114;
const AVALANCHE_TEST_CHAIN_ID = 43113;
const FANTOM_CHAIN_ID = 250;
const FANTOM_TEST_CHAIN_ID = 4002;
const HARMONY_CHAIN_ID = 1666600000;
const HARMONY_TEST_CHAIN_ID = 1666700000;
const POLYGON_CHAIN_ID = 137;
const POLYGON_MUMBAI_CHAIN_ID = 80001;
const POLYGON_ZKEVM_TEST_CHAIN_ID = 1402;
const QUARKCHAIN_CHAIN_ID = 100001;
const QUARKCHAIN_DEVNET_CHAIN_ID = 110001;

const NETWORK_MAPPING = {
    [SHORT_NAME_GALILEO]: GALILEO_CHAIN_ID,
    [SHORT_NAME_ETHEREUM]: ETHEREUM_CHAIN_ID,
    [SHORT_NAME_GOERLI]: GOERLI_CHAIN_ID,
    [SHORT_NAME_SEPOLIA]: SEPOLIA_CHAIN_ID,
    [SHORT_NAME_OPTIMISTIC]: OPTIMISTIC_CHAIN_ID,
    [SHORT_NAME_ARBITRUM]: ARBITRUM_CHAIN_ID,
    [SHORT_NAME_OPTIMISTIC_GOERLI]: OPTIMISTIC_GOERLI_CHAIN_ID,
    [SHORT_NAME_ARBITRUM_GOERLI]: ARBITRUM_GOERLI_CHAIN_ID,
    [SHORT_NAME_EVMOS]: EVMOS_CHAIN_ID,
    [SHORT_NAME_EVMOS_TEST]: EVMOS_TEST_CHAIN_ID,
    [SHORT_NAME_ARBITRUM_NOVE]: ARBITRUM_NOVE_CHAIN_ID,
    [SHORT_NAME_BINANCE]: BINANCE_CHAIN_ID,
    [SHORT_NAME_BINANCE_TEST]: BINANCE_TEST_CHAIN_ID,
    [SHORT_NAME_AVALANCHE]: AVALANCHE_CHAIN_ID,
    [SHORT_NAME_AVALANCHE_TEST]: AVALANCHE_TEST_CHAIN_ID,
    [SHORT_NAME_FANTOM]: FANTOM_CHAIN_ID,
    [SHORT_NAME_FANTOM_TEST]: FANTOM_TEST_CHAIN_ID,
    [SHORT_NAME_HARMONY]: HARMONY_CHAIN_ID,
    [SHORT_NAME_HARMONY_TEST]: HARMONY_TEST_CHAIN_ID,
    [SHORT_NAME_POLYGON]: POLYGON_CHAIN_ID,
    [SHORT_NAME_POLYGON_MUMBAI]: POLYGON_MUMBAI_CHAIN_ID,
    [SHORT_NAME_POLYGON_ZKEVM_TEST]: POLYGON_ZKEVM_TEST_CHAIN_ID,
    [SHORT_NAME_QUARKCHAIN]: QUARKCHAIN_CHAIN_ID,
    [SHORT_NAME_QUARKCHAIN_DEVNET]: QUARKCHAIN_DEVNET_CHAIN_ID,
}

const PROVIDER_URLS = {
    [GALILEO_CHAIN_ID]: 'https://galileo.web3q.io:8545',
    [ETHEREUM_CHAIN_ID]: 'https://ethereum.publicnode.com',
    [GOERLI_CHAIN_ID]: 'https://rpc.ankr.com/eth_goerli',
    [SEPOLIA_CHAIN_ID]: 'http://88.99.30.186:8545/',
    [OPTIMISTIC_CHAIN_ID]: 'https://mainnet.optimism.io',
    [ARBITRUM_CHAIN_ID]: 'https://arb1.arbitrum.io/rpc',
    [OPTIMISTIC_GOERLI_CHAIN_ID]: 'https://goerli.optimism.io',
    [ARBITRUM_GOERLI_CHAIN_ID]: 'https://goerli-rollup.arbitrum.io/rpc',
    [EVMOS_CHAIN_ID]: 'https://evmos-evm.publicnode.com',
    [EVMOS_TEST_CHAIN_ID]: 'https://eth.bd.evmos.dev:8545',
    [ARBITRUM_NOVE_CHAIN_ID]: 'https://nova.arbitrum.io/rpc',
    [BINANCE_CHAIN_ID]: 'https://bsc-dataseed2.binance.org',
    [BINANCE_TEST_CHAIN_ID]: 'https://data-seed-prebsc-1-s1.binance.org:8545',
    [AVALANCHE_CHAIN_ID]: 'https://api.avax.network/ext/bc/C/rpc',
    [AVALANCHE_TEST_CHAIN_ID]: 'https://avalanchetestapi.terminet.io/ext/bc/C/rpc',
    [FANTOM_CHAIN_ID]: 'https://rpcapi.fantom.network',
    [FANTOM_TEST_CHAIN_ID]: 'https://rpc.testnet.fantom.network',
    [HARMONY_CHAIN_ID]: 'https://a.api.s0.t.hmny.io',
    [HARMONY_TEST_CHAIN_ID]: 'https://api.s0.b.hmny.io',
    [POLYGON_CHAIN_ID]: 'https://polygon-rpc.com',
    [POLYGON_MUMBAI_CHAIN_ID]: 'https://matic-mumbai.chainstacklabs.com',
    [POLYGON_ZKEVM_TEST_CHAIN_ID]: 'https://rpc.public.zkevm-test.net',
    [QUARKCHAIN_CHAIN_ID]: 'https://mainnet-s0-ethapi.quarkchain.io',
    [QUARKCHAIN_DEVNET_CHAIN_ID]: 'https://devnet-s0-ethapi.quarkchain.io',
}

const NS_ADDRESS = {
    [GALILEO_CHAIN_ID]: '0xD379B91ac6a93AF106802EB076d16A54E3519CED',
    [ETHEREUM_CHAIN_ID]: '0x00000000000c2e074ec69a0dfb2997ba6c7d2e1e',
    [GOERLI_CHAIN_ID]: '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e',
}

// eip-4844
const ETH_STORAGE_ADDRESS = {
    [SEPOLIA_CHAIN_ID]: '0x804C520d3c084C805E37A35E90057Ac32831F96f',
}
const ETH_STORAGE_RPC = {
    [SEPOLIA_CHAIN_ID]: 'http://65.108.236.27:9540',
}

const VERSION_CALL_DATA = '1';
const VERSION_BLOB = '2';

module.exports = {
    nsAbi,
    resolverAbi,
    NETWORK_MAPPING,
    PROVIDER_URLS,
    NS_ADDRESS,
    ETH_STORAGE_ADDRESS,
    ETH_STORAGE_RPC,

    GALILEO_CHAIN_ID,
    ARBITRUM_NOVE_CHAIN_ID,
    ETHEREUM_CHAIN_ID,

    VERSION_CALL_DATA,
    VERSION_BLOB
}
