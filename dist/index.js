#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const yargs_1 = __importDefault(require("yargs"));
const helpers_1 = require("yargs/helpers");
const figlet_1 = __importDefault(require("figlet"));
const chalk_1 = __importDefault(require("chalk"));
const signale_1 = __importDefault(require("signale"));
const install_1 = require("./install");
console.log(chalk_1.default.cyanBright(figlet_1.default.textSync("wire-cli", {
    horizontalLayout: "full"
})));
const argv = (0, yargs_1.default)((0, helpers_1.hideBin)(process.argv))
    .scriptName('wire-cli')
    .usage('$0 <cmd> [options]')
    // Define the "install" command
    .command('install [options]', 'Install Wire Network locally', (yargs) => yargs.option('g', {
    alias: 'genesis',
    describe: 'Run wire-install in genesis mode. It spins up 1 blockproducer node, 1 chain API node, and deploys all system contracts.',
    type: 'boolean',
    default: false,
}), async (argv) => {
    try {
        await (0, install_1.install)({ genesis: !!argv.g });
    }
    catch (err) {
        signale_1.default.error(`Fatal error: ${err.message}`);
        process.exit(1);
    }
})
    .recommendCommands()
    .strict()
    .fail((msg, err, yargs) => {
    if (err)
        throw err;
    signale_1.default.error(msg);
    signale_1.default.info("Use --help for more information.");
    yargs.showHelp();
    process.exit(1);
})
    .help().argv;
