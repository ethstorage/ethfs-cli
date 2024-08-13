# ethfs-cli

## Installation
### Globally:
```bash
npm install -g ethfs-cli
```

Once installed, you can upload file or directory using:
```
ethfs-cli upload -f <directory|file> -a <address> -p <private-key> -c [chain-id] -t [upload-type]
```

### Locally:
```bash
npm install ethfs-cli
```

After installation, use npx to run the command:
```
npx ethfs-cli upload -f <directory|file> -a <address> -p <private-key> -c [chain-id] -t [upload-type]
```
<br/>


## Command
| Short Name | Full Name        | description                                                                |   
|------------|------------------|----------------------------------------------------------------------------|
| -p         | --privateKey     | private key                                                                |
| -a         | --address        | contract address / domain name                                             |
| -f         | --file           | upload file path / name                                                    |
| -c         | --chainId        | chain id                                                                   |
| -r         | --rpc            | provider url                                                               |
| -t         | --type           | file upload type:<br/>calldata: `1` or `calldata` <br/>blob: `2` or `blob` |
| -g         | --gasIncPct      | gas price increase percentage                                              |
| -s         | --threadPoolSize | number of threads for concurrent file uploads                              |
 <br/>


## Supported networks
| Chain Name                 | Chain Short Name and Chain Id |
|----------------------------|-------------------------------|
| Ethereum Mainnet           | eth / 1                       | 
| Goerli Testnet             | gor / 5                       | 
| Sepolia Testnet            | sep / 11155111                | 
| Optimism                   | oeth / 10                     | 
| Optimism Testnet           | ogor / 420                    | 
| Arbitrum One               | arb1 / 42161                  | 
| Arbitrum Nova              | arb-nova / 42170              | 
| Arbitrum Testnet           | arb-goerli / 421613           | 
| Web3Q Galileo Testnet      | w3q-g / 3334                  | 
| BNB Smart Chain            | bnb / 56                      | 
| BNB Smart Chain Testnet    | bnbt / 97                     | 
| Avalanche C-Chain          | avax / 43114                  | 
| Avalanche Fuji Testnet     | fuji / 43113                  | 
| Fantom Opera               | ftm / 250                     | 
| Fantom Testnet             | tftm / 4002                   | 
| Polygon Mainnet            | matic / 137                   | 
| Polygon Mumbai             | maticmum / 80001              | 
| Polygon zkEVM Testnet      | zkevmtest / 1402              | 
| QuarkChain Mainnet Shard 0 | qkc-s0 / 100001               |
| QuarkChain Devnet Shard 0  | qkc-d-s0 / 110001             |
| Harmony Mainnet Shard 0    | hmy-s0 / 1666600000           |
| Harmony Testnet Shard 0    | hmy-b-s0 / 1666700000         |
| Evmos                      | evmos / 9001                  | 
| Evmos Testnet              | evmos-testnet / 9000          |
| QuarkChain L2 Testnet      | esl2-t / 43069                |
 

## Usage
### Support EIP-3770 Address
```
Ethereum
    eth:<name|address>
Sepolia
    sep:<name|address>
...    
```
##### Example
```
Ethereum
    eth:ens.eth
Sepolia
    sep:0x1825...2388
...
```
<br/>


### Create FlatDirectory Command
Ethereum is the default network if it's not specified, otherwise, you should use "--chainId" to set it. RPC should also be specified if the network is an unlisted network.
```
ethfs-cli create -p <private-key> -c [chain-id] -r [rpc]

// output: contract address 
```
##### Example
```
ethfs-cli create -p 0x32...
ethfs-cli create -p 0x32... -c 11155111
ethfs-cli create -p 0x32... -r https://rpc.ankr.com/eth
```
<br/>


### Upload Command
Upload files, you need to specify the upload type. The default type is blob:2.<br/>
If you want to use name instead of FlatDirectory address, the name should be pointed to the FlatDirectory 
address in advance. Click [here](https://docs.web3url.io/tutorials-on-ethstorage-early-testnet/bind-domain-names-to-your-flatdirectory) for details.
```
ethfs-cli upload -f <address|domain> -a <address> -p <private-key> -t [upload-type] -c [chain-id] -r [rpc] -g [gas-price-increase-percentage] -s [thread-pool-size]
```
##### Example
```
FlatDirectory address
  ethfs-cli upload -f index.html -a gor:0x1825...2388 -p 0x32... -t 1
  ethfs-cli upload -f index.html -a 0x1825...2388 -p 0x32... -c 11155111 -t 1
  ethfs-cli upload -f index.html -a 0x1825...2388 -p 0x32... -r https://rpc.xxx -t calldata -g 20
  ethfs-cli upload -f index.html -a 0x1825...2388 -p 0x32... -r https://rpc.xxx -t calldata -s 12
ens
  ethfs-cli upload -f dist -a eth:ens.eth -p 0x32... -r https://rpc.ankr.com/eth -t 2
  ethfs-cli upload -f dist -a eth:ens.eth -p 0x32... -r https://rpc.ankr.com/eth -t blob
```
<br/>


### Set FlatDirectory Default Entrance
```
ethfs-cli default -a <address|domain> -f <file-name> -p <private-key> -c [chain-id] -r [rpc]
```
##### Example
```
FlatDirectory address
  ethfs-cli default -a sep:0x1825...2388 -f index.html -p 0x32...
  ethfs-cli default -a 0x1825...2388 -f index.html -p 0x32... -c 11155111
  ethfs-cli default -a 0x1825...2388 -f index.html -p 0x32... -r https://rpc.xxx
ens
  ethfs-cli default -a eth:ens.eth -f index.html -p 0x32... -r https://rpc.ankr.com/eth
```
<br/>


### Download File
```
ethfs-cli download -a <address|domain> -f <fileName> -c [chain-id] -r [rpc]
```
##### Example
```
FlatDirectory address
  ethfs-cli download -a sep:0x1825...2388 -f index.html
  ethfs-cli download -a 0x1825...2388 -f index.html -c 11155111
  ethfs-cli download -a 0x1825...2388 -f index.html -r https://rpc.xxx
ens
  ethfs-cli download -a eth:ens.eth -f home.vue
```
<br/>


### Remove File
```
ethfs-cli remove -a <address|domain> -f <file-name> -p <private-key> -r [rpc] -c [chain-id]
```
##### Example
```
FlatDirectory address
  ethfs-cli remove -a sep:0x1825...2388 -f index.html -p 0x32...
  ethfs-cli remove -a 0x1825...2388 -f index.html -p 0x32... -c 11155111
  ethfs-cli remove -a 0x1825...2388 -f index.html -p 0x32... -r https://rpc.xxx
ens
  ethfs-cli remove -a eth:ens.eth -f home.vue -p 0x32...
```
<br/>

### Repo
[Github Repo](https://github.com/ethstorage/ethfs-cli/)
