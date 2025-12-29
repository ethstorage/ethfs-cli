const { exec, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { UploadType } = require("ethstorage-sdk");

const dotenv = require("dotenv")
dotenv.config({ path: path.resolve(__dirname, "../.env") });
const privateKey = process.env.pk;

const testCommandExec = (command, callback) => {
    console.log(`Running command: ${command}`);
    exec(command, (error, stdout, stderr) => {
        if (error) {
            console.error(`exec error: ${error}`);
            callback(null);
            return;
        }
        if (stderr) {
            console.error(`stderr: ${stderr}`);
            callback(null);
            return;
        }
        console.log(stdout);
        callback(stdout);
    });
}

const testCommandSpawn = (command, args) => {
    return new Promise((resolve, reject) => {
        console.log(` \nRunning command: ${command} ${args.join(' ')}`);
        const process = spawn(command, args, { shell: true });
        process.stdout.on('data', (data) => {
            console.log(data.toString().replace(/\n$/, ''));
        });
        process.stderr.on('data', (data) => {
            console.error(`stderr: ${data.toString()}`);
        });
        process.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(`Process exited with code ${code}`));
                return;
            }
            resolve(true);
        });
    });
};

const createLargeFile = (sizeInMB, filePath) => {
    const sizeInBytes = sizeInMB * 1024 * 1024;
    const buffer = Buffer.alloc(sizeInBytes, 'A');
    fs.writeFileSync(filePath, buffer);
};

const createFiles = (numFiles, folderPath) => {
    try {
        if (!fs.existsSync(folderPath)) {
            fs.mkdirSync(folderPath, { recursive: true });
        }

        for (let i = 1; i <= numFiles; i++) {
            const filePath = path.join(folderPath, `file_${i}.txt`);
            const fileSize = Math.floor(Math.random() * (256 * 1024 - 2 * 1024) + 2 * 1024); // 2KB - 256KB
            const content = i.toString().repeat(fileSize);
            fs.writeFileSync(filePath, content);
        }
    } catch (err) {
        console.error('Error creating files:', err);
    }
};

const deleteFile = (filePath) => {
    fs.unlinkSync(filePath);
};

const deleteFolder = (folderPath) => {
    const files = fs.readdirSync(folderPath);
    files.forEach(file => {
        const currentPath = path.join(folderPath, file);
        if (fs.statSync(currentPath).isDirectory()) {
            deleteFolder(currentPath);
        } else {
            deleteFile(currentPath);
        }
    });
    fs.rmdirSync(folderPath);
};

const getFileHash = (filePath) => {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(filePath);
        stream.on('data', (data) => {
            hash.update(data);
        });
        stream.on('end', () => {
            resolve(hash.digest('hex'));
        });
        stream.on('error', (err) => {
            reject(err);
        });
    });
};

// api
const createContract = (chainId) => {
    return new Promise((resolve, reject) => {
        const command = `node ../cli.js create -p ${privateKey} -c ${chainId}`;
        testCommandExec(command, (output) => {
            const match = output.match(/FlatDirectory: Contract deployed successfully. Address: (\b0x[a-fA-F0-9]{40}\b)/);
            const contractAddress = match ? match[1] : null;
            if (contractAddress) {
                resolve(contractAddress);
            } else {
                reject(new Error('Contract address extraction failed.'));
            }
        });
    });
};

const setDefaultFile = async (address, chainId) => {
    const args = ['../cli.js', 'default', '-p', privateKey, '-a', address, '-c', chainId];
    return await testCommandSpawn('node', args);
};

const uploadFile = async (address, chainId, tempFilePath, uploadType) => {
    const args = ['../cli.js', 'upload', '-p', privateKey, '-a', address, '-f', tempFilePath, '-c', chainId, '-t', uploadType];
    return await testCommandSpawn('node', args);
};

const downloadFile = async (address, chainId, largeFile) => {
    const args = ['../cli.js', 'download', '-a', address, '-f', largeFile, '-c', chainId];
    return await testCommandSpawn('node', args);
};

const runTests = async () => {
    // Prepare
    const largeFileName = "tempLargeFile.txt";
    const largeFile = path.resolve(__dirname, largeFileName);
    createLargeFile(5, largeFile); // 5MB
    const folderPath = path.resolve(__dirname, 'randomFiles');
    createFiles(13, folderPath); // 13 files

    const qkcChainId = 11155111;

    // blob
    console.log("Running tests for Blob...");
    let address = await createContract(qkcChainId);
    await setDefaultFile(address, qkcChainId);

    await uploadFile(address, qkcChainId, largeFile, UploadType.Blob); // upload large file
    await uploadFile(address, qkcChainId, largeFile, UploadType.Blob); // upload again

    await uploadFile(address, qkcChainId, folderPath, UploadType.Blob); // upload files
    await uploadFile(address, qkcChainId, folderPath, UploadType.Blob); // upload files again

    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    await sleep(60000);

    // download and check
    let largeFileHash = await getFileHash(largeFile);
    deleteFile(largeFile);
    await downloadFile(address, qkcChainId, largeFileName);
    let downloadFileHash = await getFileHash(largeFile);
    console.log(`\n Blob File integrity check: `, largeFileHash === downloadFileHash);

    // clear
    deleteFile(largeFile);
    deleteFolder(folderPath);


    // calldata
    console.log("\n\n\nRunning tests for Calldata...");
    createLargeFile(0.5, largeFile); // 2.5MB
    createFiles(5, folderPath); // 5 files

    address = await createContract(qkcChainId);

    await uploadFile(address, qkcChainId, largeFile, UploadType.Calldata); // upload large file
    await uploadFile(address, qkcChainId, largeFile, UploadType.Calldata); // upload again

    await uploadFile(address, qkcChainId, folderPath, UploadType.Calldata);
    await uploadFile(address, qkcChainId, folderPath, UploadType.Calldata);

    largeFileHash = await getFileHash(largeFile);
    deleteFile(largeFile);
    await downloadFile(address, qkcChainId, largeFileName);
    downloadFileHash = await getFileHash(largeFile);
    console.log(`\n Calldata File integrity check: `, largeFileHash === downloadFileHash);

    // clear
    deleteFile(largeFile);
    deleteFolder(folderPath);
};
runTests();
