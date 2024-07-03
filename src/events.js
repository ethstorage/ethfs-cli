const {confirm} = require('@inquirer/prompts');
const {ethers} = require("ethers");
const ora = require('ora');
const {
    isPrivateKey,
    getWebHandler,
} = require('./utils/utils');
const {Uploader} = require("./utils/Uploader");
const {
    VERSION_CALL_DATA,
    VERSION_BLOB,
} = require('./params/constants');

const {upload} = require("../index");

const color = require('colors-cli/safe')
const error = color.red.bold;

const uploadEvent = async (key, domain, path, type, rpc, chainId, gasPriceIncreasePercentage) => {
    if (!isPrivateKey(key)) {
        console.error(error(`ERROR: invalid private key!`));
        return;
    }
    if (!domain) {
        console.error(error(`ERROR: invalid address!`));
        return;
    }
    if (!path) {
        console.error(error(`ERROR: invalid file!`));
        return;
    }
    if (type && type !== VERSION_BLOB && type !== VERSION_CALL_DATA) {
        console.error(error(`ERROR: invalid upload type!`));
        return;
    }

    const handler = await getWebHandler(domain, rpc, chainId);
    if (!handler.providerUrl || parseInt(handler.address) <= 0) {
        console.log(error(`ERROR: ${domain} domain doesn't exist`));
        return;
    }

    // query total cost
    const uploader = new Uploader(key, handler.providerUrl, chainId, handler.address);
    const check = await uploader.init(type);
    if (!check) {
        console.log(`ERROR: The current network does not support this upload type, please switch to another type.  Type=${type}`);
        return;
    }

    const spinner = ora('Start estimating cost').start();
    try {
        const costInfo = await uploader.estimateCost(path);
        const totalCost = costInfo.totalCost + costInfo.totalGasCost + costInfo.totalBlobGasCost;
        console.log(`Info: The number of files is ${error(costInfo.totalFileCount)}.`);
        console.log(`Info: Expected to send ${error(costInfo.totalTxCount)} transaction.`);
        console.log(`Info: Expected storage of files will cost ${error(ethers.formatEther(costInfo.totalCost))} ETH."`);
        console.log(`Info: Expected gas fee is ${error(ethers.formatEther(costInfo.totalGasCost))} ETH.`);
        console.log(`Info: Expected gas fee for blob is ${error(ethers.formatEther(costInfo.totalBlobGasCost))} ETH.`);
        console.log(`Info: "The total cost is ${error(ethers.formatEther(totalCost))} ETH."`);
    } catch (e) {
        const length = e.message.length;
        console.log(length > 400 ? (e.message.substring(0, 200) + " ... " + e.message.substring(length - 190, length)) : e.message);
        console.log(error("Estimate is fail"));
    }
    const answer = await confirm({message: `Continue?`});
    if (answer) {
        await upload(handler, key, domain, path, type, rpc, chainId);
    }
}

module.exports = {
    uploadEvent
}
