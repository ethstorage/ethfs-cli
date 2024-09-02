// Short names
export const SHORT_NAME_GALILEO = "w3q-g";
export const SHORT_NAME_ETHEREUM = "eth";
export const SHORT_NAME_GOERLI = "gor";
export const SHORT_NAME_SEPOLIA = "sep";
export const SHORT_NAME_OPTIMISTIC = "oeth";
export const SHORT_NAME_ARBITRUM = "arb1";
export const SHORT_NAME_OPTIMISTIC_GOERLI = "ogor";
export const SHORT_NAME_ARBITRUM_GOERLI = "arb-goerli";
export const SHORT_NAME_EVMOS = "evmos";
export const SHORT_NAME_EVMOS_TEST = "evmos-testnet";
export const SHORT_NAME_ARBITRUM_NOVE = "arb-nova";
export const SHORT_NAME_BINANCE = "bnb";
export const SHORT_NAME_BINANCE_TEST = "bnbt";
export const SHORT_NAME_AVALANCHE = "avax";
export const SHORT_NAME_AVALANCHE_TEST = "fuji";
export const SHORT_NAME_FANTOM = "ftm";
export const SHORT_NAME_FANTOM_TEST = "tftm";
export const SHORT_NAME_HARMONY = "hmy-s0";
export const SHORT_NAME_HARMONY_TEST = "hmy-b-s0";
export const SHORT_NAME_POLYGON = "matic";
export const SHORT_NAME_POLYGON_MUMBAI = "maticmum";
export const SHORT_NAME_POLYGON_ZKEVM_TEST = "zkevmtest";
export const SHORT_NAME_QUARKCHAIN = "qkc-s0";
export const SHORT_NAME_QUARKCHAIN_DEVNET = "qkc-d-s0";


// Chain IDs
export const GALILEO_CHAIN_ID = 3334;
export const ETHEREUM_CHAIN_ID = 1;
export const GOERLI_CHAIN_ID = 5;
export const SEPOLIA_CHAIN_ID = 11155111;
export const OPTIMISTIC_CHAIN_ID = 10;
export const ARBITRUM_CHAIN_ID = 42161;
export const OPTIMISTIC_GOERLI_CHAIN_ID = 420;
export const ARBITRUM_GOERLI_CHAIN_ID = 421613;
export const EVMOS_CHAIN_ID = 9001;
export const EVMOS_TEST_CHAIN_ID = 9000;
export const ARBITRUM_NOVE_CHAIN_ID = 42170;
export const BINANCE_CHAIN_ID = 56;
export const BINANCE_TEST_CHAIN_ID = 97;
export const AVALANCHE_CHAIN_ID = 43114;
export const AVALANCHE_TEST_CHAIN_ID = 43113;
export const FANTOM_CHAIN_ID = 250;
export const FANTOM_TEST_CHAIN_ID = 4002;
export const HARMONY_CHAIN_ID = 1666600000;
export const HARMONY_TEST_CHAIN_ID = 1666700000;
export const POLYGON_CHAIN_ID = 137;
export const POLYGON_MUMBAI_CHAIN_ID = 80001;
export const POLYGON_ZKEVM_TEST_CHAIN_ID = 1402;
export const QUARKCHAIN_CHAIN_ID = 100001;
export const QUARKCHAIN_DEVNET_CHAIN_ID = 110001;
export const QUARKCHAIN_L2_DEVNET_CHAIN_ID = 42069;
export const QUARKCHAIN_L2_TESTNET_CHAIN_ID = 43069;

export const NETWORK_MAPPING: { [key: string]: number } = {
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
};

export const PROVIDER_URLS: { [key: number]: string } = {
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
    [QUARKCHAIN_L2_DEVNET_CHAIN_ID]: 'http://142.132.154.16:8545',
    [QUARKCHAIN_L2_TESTNET_CHAIN_ID]: 'https://rpc.testnet.l2.quarkchain.io:8545',
};

export const NS_ADDRESS: { [key: number]: string } = {
    [GALILEO_CHAIN_ID]: '0xD379B91ac6a93AF106802EB076d16A54E3519CED',
    [ETHEREUM_CHAIN_ID]: '0x00000000000c2e074ec69a0dfb2997ba6c7d2e1e',
    [GOERLI_CHAIN_ID]: '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e',
};

// EIP-4844 related constants
export const ETH_STORAGE_RPC: { [key: number]: string } = {
    [SEPOLIA_CHAIN_ID]: 'http://65.108.236.27:9540',
    [QUARKCHAIN_L2_DEVNET_CHAIN_ID]: 'http://65.108.230.142:9545',
    [QUARKCHAIN_L2_TESTNET_CHAIN_ID]: 'http://65.109.115.36:9540',
}

export enum UploadTypeStr {
    CALLDATA = 'calldata',
    BLOB = 'blob'
}

export const DEFAULT_THREAD_POOL_SIZE_LOW = 6;
export const DEFAULT_THREAD_POOL_SIZE_HIGH = 15;
