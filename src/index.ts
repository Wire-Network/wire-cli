#!/usr/bin/env node
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import figlet from "figlet";
import chalk from "chalk";
import signale from "signale";
import { install } from "./install";
import { uninstall } from "./uninstall";

console.log(
  chalk.cyanBright(
    figlet.textSync("wire-cli", {
      horizontalLayout: "full",
    })
  )
);
const argv = yargs(hideBin(process.argv))
  .scriptName("wire-cli")
  .usage("$0 <cmd> [options]")
  // Define the "install" command
  .command(
    "install [options]",
    "Install Wire Network locally",
    yargs =>
      yargs
        .option("g", {
          alias: "genesis",
          describe:
            "Run wire-install in genesis mode. It spins up 1 blockproducer node, 1 chain API node, and deploys all system contracts.",
          type: "boolean",
          default: undefined,
        })
        .option("enable-roa", {
          alias: "r",
          type: "boolean",
          describe:
            "Enable additional ROA activation and setup after starting up genesis node.",
          default: false,
        })
        .option("--no-generate-key", {
          type: "boolean",
          describe:
            "Disable automatic generation of sysio.key (enabled by default) and instead take user input.",
          default: false,
        }),
    async argv => {
      try {
        if (argv.g === undefined) {
          signale.error(
            "Error: At least one option must be provided for the install command."
          );
          signale.info("Use --help for more information.");
          process.exit(1);
        }

        await install({
          genesis: !!argv.g,
          enableRoa: !!argv.enableRoa,
          disableAutoGenerateKey: !!argv.NoGenerateKey,
        });
      } catch (err) {
        signale.error(`Fatal error: ${(err as Error).message}`);
        process.exit(1);
      }
    }
  )
  .command(
    "uninstall [options]",
    "Uninstall Wire Network core and CDT",
    yargs => {
      return yargs.option("yes", {
        alias: "y",
        type: "boolean",
        describe: "Automatic yes to prompts",
        default: false,
      });
    },
    async argv => {
      try {
        // call your uninstall function
        await uninstall({ autoYes: !!argv.yes });
      } catch (err) {
        console.error("Uninstall failed:", err);
        process.exit(1);
      }
    }
  )
  .recommendCommands()
  .strict()
  .fail((msg, err, yargs) => {
    if (err) throw err;
    signale.error(msg);
    signale.info("Use --help for more information.");
    yargs.showHelp();
    process.exit(1);
  })
  .help().argv;
