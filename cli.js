#!/usr/bin/env node
const { program } = require('commander');
program.version(require('./package.json').version);

const { create, refund, deploy, remove, setDefault, download } = require("./index");

program
    .option('-p, --privateKey [privateKey]', 'private key')
    .option('-a, --address [address]', 'flat directory address')
    .option('-r, --rpc [rpc]', 'provider url')
    .option('-f, --file [file]', 'upload file path/name')
    .option('-c, --chainId [chainId]', 'chain id')
    .option('-t, --type [type]', 'uploader type');

program
    .command('create')
    .description('deploy flat directory')
    .option('-p, --privateKey <privateKey>', 'private key')
    .option('-c, --chainId [chainId]', 'chain id')
    .option('-r, --rpc [rpc]', 'provider url')
    .action(() => {
        const opts = program.opts();
        create(opts.privateKey, opts.chainId, opts.rpc);
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
    .command('deploy')
    .description('deploy file|directory')
    .option('-p, --privateKey <privateKey>', 'private key')
    .option('-a, --address <address>', 'flat directory address')
    .option('-f, --file <file>', 'upload file|directory path')
    .option('-t, --type [type]', 'uploader type')
    .option('-c, --chainId [chainId]', 'chain id')
    .option('-r, --rpc [rpc]', 'provider url')
    .action(() => {
        const opts = program.opts();
        deploy(opts.privateKey, opts.address, opts.file, opts.type, opts.rpc,  opts.chainId);
    });

program.parse(process.argv);
