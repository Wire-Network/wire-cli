import * as childProcess from "child_process";
import * as fs from "fs";
import * as path from "path";
import signale from "signale";
import {
  confirmAction,
  run,
  verifyRunningAsRoot,
} from "./helpers/utilities.helper";

interface UninstallOptions {
  autoYes: boolean;
}
const WORK_DIR = process.env.WIRE_CLI_WORK_DIR || "/opt/wire-network";

export async function uninstall(options: UninstallOptions) {
  const { autoYes } = options;

  verifyRunningAsRoot();

  signale.log("[Uninstall]: Starting uninstall procedure...");

  // 1) Confirm user wants to uninstall
  let yn: boolean;

  if (autoYes) {
    yn = true;
    signale.info(
      "[Uninstall]: Auto-yes enabled. Proceeding without prompts..."
    );
  } else {
    yn = await confirmAction(
      "Are you sure you want to uninstall Wire Network? (y/n): "
    );
  }

  if (!yn) {
    signale.log("[Uninstall]: Uninstall canceled.");
    process.exit(0);
  }

  signale.log("[Uninstall]: Proceeding with uninstall...");

  // 2) Stop all processes
  signale.log("[Uninstall]: Stopping all nodeop processes...");

  try {
    // For example, we can "source blockproducer/stop.sh" but in TS you might just do:
    run(
      "bash",
      [`${WORK_DIR}/blockproducer/stop.sh`],
      "Failed to stop blockproducer"
    );
    run("bash", [`${WORK_DIR}/chain-api/stop.sh`], "Failed to stop chain-api");
  } catch (err) {
    signale.warn("One or more stop scripts failed, continuing anyway...");
  }

  // 3) Remove wire-core, wire-cdt packages

  try {
    signale.log("[Uninstall]: Uninstalling wire-core and wire-cdt...");
    // e.g. "sudo apt remove wire-sysio cdt -y"
    run(
      "sudo",
      ["apt", "remove", "wire-sysio", "cdt", "-y"],
      "Failed to remove wire packages"
    );

    safeRemove("/wire-cdt.deb");
    safeRemove("/wire-core.deb");
  } catch (err) {
    signale.warn("Failed to ");
  }

  // Remove executables
  safeRemove("/usr/local/bin/clio");
  safeRemove("/usr/local/bin/kiod");
  safeRemove("/usr/local/bin/nodeop");
  safeRemove("/usr/local/bin/sysio-blocklog");
  safeRemove("/usr/local/bin/trace_api_util");

  // Remove system contracts
  signale.log("[Uninstall]: Removing compiled system contracts...");
  safeRemove("/opt/wire-system-contracts");

  // 5) Ask about removing data dirs
  let removeData: boolean;

  if (autoYes) {
    removeData = true;
  } else {
    removeData = await confirmAction(
      "Do you wish to delete all Data Directories (blockproducer & chain-api)? (y/n): "
    );
  }

  if (removeData) {
    signale.log(
      "[Uninstall]: Removing all wire-network files and directories..."
    );
    safeRemove(WORK_DIR);
  } else {
    signale.log("[Uninstall]: Skipping removal of data-dirs...");
  }

  // 6) Ask about removing the wallet
  let removeWallet: boolean;

  if (autoYes) {
    removeWallet = true;
  } else {
    removeWallet = await confirmAction(
      "Do you wish to delete your wallet? (y/n): "
    );
  }

  if (removeWallet) {
    signale.log("[Uninstall]: Removing sysio-wallet...");
    safeRemove("/root/sysio-wallet");
  } else {
    signale.log("[Uninstall]: Skipping removal of sysio-wallet...");
  }

  signale.log("[Uninstall]: Uninstall process completed successfully!");
}

function safeRemove(path: string): void {
  if (fs.existsSync(path)) {
    try {
      const stats = fs.statSync(path);

      if (stats.isDirectory()) {
        fs.rmdirSync(path, { recursive: true });
      } else {
        fs.unlinkSync(path);
      }

      console.log(`Removed: ${path}`);
    } catch (err) {
      console.error(`Error removing ${path}:`, err);
    }
  } else {
    console.log(`Skipping: ${path} (not found)`);
  }
}
