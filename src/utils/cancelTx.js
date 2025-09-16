const { BLOB_SIZE } = require("ethstorage-sdk");
const { ethers } = require("ethers");
const { FIXED_COMMITMENT, FIXED_PROOF, FIXED_VERSION_HASH } = require("../params");
const { Logger } = require("./log");

const zeroBlob = new Uint8Array(BLOB_SIZE).fill(0);
const ethersBlobs = [{
	data: zeroBlob,
	commitment: FIXED_COMMITMENT,
	proof: FIXED_PROOF
}];

async function checkPendingTxs(rpc, privateKey) {
	const provider = new ethers.JsonRpcProvider(rpc);
	const wallet = new ethers.Wallet(privateKey, provider);

	const pendingNonce = await provider.getTransactionCount(wallet.address, "pending");
	const confirmedNonce = await provider.getTransactionCount(wallet.address, "latest");

	return {
		pendingCount: pendingNonce - confirmedNonce,
		address: wallet.address
	};
}

async function sendReplacementTx(wallet, baseTx, type, options = {}, attempt = 1, maxAttempts = 5) {
	const multiplier = BigInt(attempt);
	try {
		let tx;
		if (type === 3) {
			tx = {
				...baseTx,
				type: 3,
				maxFeePerGas: baseTx.maxFeePerGas * multiplier,
				maxPriorityFeePerGas: baseTx.maxPriorityFeePerGas * multiplier,

				maxFeePerBlobGas: options.maxFeePerBlobGas * multiplier,
				blobs: options.blobs,
				blobVersionedHashes: options.blobVersionedHashes
			};
		} else { // type 2
			tx = {
				...baseTx,
				type: 2,
				maxFeePerGas: baseTx.maxFeePerGas * multiplier,
				maxPriorityFeePerGas: baseTx.maxPriorityFeePerGas * multiplier,
			};
		}

		const response = await wallet.sendTransaction(tx);
		Logger.log(`📤 Replacement tx sent (attempt ${attempt}) nonce=${tx.nonce} hash=${response.hash}`);
		await response.wait();
		Logger.log(`✅ Replacement confirmed for nonce ${tx.nonce}`);
	} catch (err) {
		const msg = err.message || JSON.stringify(err);

		// case 1
		if (msg.includes("nonce has already been used")) {
			Logger.log(`Nonce ${baseTx.nonce} already confirmed, skipping replacement.`);
			return null;
		}

		// case 2: Gas too low, retry gradually
		if (msg.includes("replacement transaction underpriced")) {
			if (attempt < maxAttempts) {
				return sendReplacementTx(wallet, baseTx, type, options, attempt + 1, maxAttempts);
			}
		}

		// case 3
		if (msg.includes("address already reserved")) {
			Logger.error(`Type conflict for nonce ${baseTx.nonce}, retrying with tx type=2`);
			return sendReplacementTx(wallet, baseTx, 2, {}, attempt + 1, maxAttempts);
		}

		throw new Error(`❌ Replacement failed after ${attempt} attempts for nonce ${baseTx.nonce}: ${msg}`);
	}
}

async function cancelPendingTx(rpc, privateKey, interval = 5000) {
	const provider = new ethers.JsonRpcProvider(rpc);
	const wallet = new ethers.Wallet(privateKey, provider);

	while (true) {
		const confirmedNonce = await provider.getTransactionCount(wallet.address, "latest");
		const pendingNonce = await provider.getTransactionCount(wallet.address, "pending");
		const pendingCount = pendingNonce - confirmedNonce;
		if (pendingCount <= 0) {
			Logger.success('No pending transactions. Exiting loop.\n');
			break;
		}

		const feeData = await provider.getFeeData();
		const blobGas = await provider.send("eth_blobBaseFee", []);
		const tx = {
			nonce: confirmedNonce,
			to: wallet.address,
			value: 0,
			gasLimit: 200000n,
			maxFeePerGas: feeData.maxFeePerGas,
			maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
		};
		await sendReplacementTx(wallet, tx, 3, {
			maxFeePerBlobGas: BigInt(blobGas),
			blobs: ethersBlobs,
			blobVersionedHashes: [FIXED_VERSION_HASH]
		});
		Logger.log(`Cancel tx confirmed for nonce ${confirmedNonce}`);

		if (pendingCount > 1) {
			await new Promise((res) => setTimeout(res, interval));
		}
	}
}


module.exports = {
	checkPendingTxs,
	cancelPendingTx
}
