#!/usr/bin/env node
import { program } from 'commander';
import { version } from '../package.json';
program.version(version);

import { createDirectory, refund, estimateAndUpload, remove, setDefault, download } from './index';

program
    .option('-p, --privateKey [privateKey]', 'private key')
    .option('-a, --address [address]', 'flat directory address')
    .option('-f, --file [file]', 'upload file path/name')
    .option('-c, --chainId [chainId]', 'chain id')
    .option('-r, --rpc [rpc]', 'provider url')
    .option('-t, --type [type]', 'uploader type')
    .option('-g, --gasIncPct [gasIncPct]', 'gas price increase percentage')
    .option('-s, --threadPoolSize [threadPoolSize]', 'thread pool size')
    .option('-e, --estimateGas [estimateGas]', 'estimate gas');

program
    .command('create')
    .description('deploy flat directory')
    .option('-p, --privateKey <privateKey>', 'private key')
    .option('-c, --chainId [chainId]', 'chain id')
    .option('-r, --rpc [rpc]', 'provider url')
    .action(() => {
        const opts = program.opts();
        createDirectory(opts.privateKey, opts.rpc, opts.chainId);
    });

program
    .command('refund')
    .description('refund cost')
    .option('-p, --privateKey <privateKey>', 'private key')
    .option('-a, --address <address>', 'flat directory address')
    .option('-c, --chainId [chainId]', 'chain id')
    .option('-r, --rpc [rpc]', 'provider url')
    .action(() => {
        const opts = program.opts();
        refund(opts.privateKey, opts.address, opts.rpc, opts.chainId);
    });

program
    .command('default')
    .description('set default file')
    .option('-p, --privateKey <privateKey>', 'private key')
    .option('-a, --address <address>', 'flat directory address')
    .option('-f, --file <file>', 'file name')
    .option('-c, --chainId [chainId]', 'chain id')
    .option('-r, --rpc [rpc]', 'provider url')
    .action(() => {
        const opts = program.opts();
        setDefault(opts.privateKey, opts.address, opts.file, opts.rpc, opts.chainId);
    });

program
    .command('remove')
    .description('remove file')
    .option('-p, --privateKey <privateKey>', 'private key')
    .option('-a, --address <address>', 'flat directory address')
    .option('-f, --file <file>', 'file name')
    .option('-c, --chainId [chainId]', 'chain id')
    .option('-r, --rpc [rpc]', 'provider url')
    .action(() => {
        const opts = program.opts();
        remove(opts.privateKey, opts.address, opts.file, opts.rpc, opts.chainId);
    });

program
    .command('download')
    .description('download file')
    .option('-a, --address <address>', 'flat directory address')
    .option('-f, --file <file>', 'file name')
    .option('-c, --chainId [chainId]', 'chain id')
    .option('-r, --rpc [rpc]', 'provider url')
    .action(() => {
        const opts = program.opts();
        download(opts.address, opts.file, opts.rpc, opts.chainId);
    });

program
    .command('upload')
    .description('deploy file|directory')
    .option('-p, --privateKey <privateKey>', 'private key')
    .option('-a, --address <address>', 'flat directory address')
    .option('-f, --file <file>', 'upload file|directory path')
    .option('-t, --type [type]', 'uploader type')
    .option('-c, --chainId [chainId]', 'chain id')
    .option('-r, --rpc [rpc]', 'provider url')
    .option('-g, --gasIncPct [gasIncPct]', 'gas price increase percentage')
    .option('-e, --estimateGas [estimateGas]', 'estimate gas')
    .option('-s, --threadPoolSize [threadPoolSize]', 'thread pool size')
    .action(() => {
        const opts = program.opts();
        estimateAndUpload(opts.privateKey, opts.address, opts.file, opts.type, opts.rpc, opts.chainId, opts.gasIncPct, opts.threadPoolSize, opts.estimateGas);
    });

program.parse(process.argv);
