import * as childProcess from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import signale from "signale";
import inquirer from "inquirer";

/**
 * Spawns a command synchronously. Throws an error if the command fails.
 * @param cmd Full command to run (e.g., "apt-get")
 * @param args Array of args (e.g., ["install", "-y", "wget"])
 * @param errorMsg Error message to throw if something goes wrong
 * @param cwd - The working directory in which to run the command. Defaults to the current directory (`process.cwd()`).
 */
export function run(
  cmd: string,
  args: string[],
  errorMsg: string,
  cwd = process.cwd()
) {
  signale.log(`in cwd - ${cwd} [RUN]: ${cmd} ${args.join(" ")}`);
  const result = childProcess.spawnSync(cmd, args, {
    stdio: "inherit", // Direct output to terminal
    shell: false, // Prevent shell interpretation of commands
    cwd, // Set the working directory
  });

  if (result.error) {
    signale.error(`Command execution failed: ${result.error.message}`);
    throw new Error(`${errorMsg}\n${result.error.message}`);
  }

  if (result.status !== 0) {
    signale.error(`Command failed with exit code ${result.status}`);
    throw new Error(`${errorMsg} (exit code: ${result.status})`);
  }

  signale.success(`[SUCCESS]: ${cmd} executed successfully.`);
}

/**
 * Checks if the process is running as root user. On Linux/Unix, process.getuid() works.
 */
export function verifyRunningAsRoot() {
  if (os.platform() === "win32") {
    signale.warn(
      `[WARN] Skipping root check on Windows. Please ensure you have Administrator privileges.`
    );
  } else if (os.platform() !== "linux") {
    signale.error(
      `[ERROR] This installer only supports Linux (Ubuntu recommended). You appear to be on: ${os.platform()}`
    );
    process.exit(1);
  } else {
    if (process.getuid && process.getuid() !== 0) {
      signale.error("Please run as root (sudo). Exiting...");
      process.exit(1);
    }
  }
}

/**
 * Check if a string looks like an http(s):// URL
 */
export function isUrl(str: string) {
  return /^https?:\/\//i.test(str);
}

/**
 * Print out whether environment overrides are in use or not
 */
export function logUsage(varName: string, value: string, defaultVal: string) {
  if (value === defaultVal) {
    signale.success(`Using default ${varName}: ${value}`);
  } else {
    signale.pending(`Overriding ${varName}: ${value}`);
  }
}

/**
 * Recursively copy a directory (like cp -r).
 * Simple approach for demonstration—doesn't handle symlinks, etc.
 */
export function copyRecursiveSync(src: string, dest: string) {
  if (!fs.existsSync(src)) {
    return;
  }

  const stats = fs.statSync(src);

  if (stats.isDirectory()) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest);
    }

    const entries = fs.readdirSync(src);

    for (const entry of entries) {
      const srcPath = path.join(src, entry);
      const destPath = path.join(dest, entry);
      copyRecursiveSync(srcPath, destPath);
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

/**
 * Hidden prompt to simulate "read -s typed_key" from bash.
 * Press ENTER => returns empty string
 */
export function hiddenPrompt(): Promise<string> {
  return new Promise(resolve => {
    inquirer
      .prompt([
        {
          type: "password",
          name: "hiddenInput",
          message: "Enter your input:",
          mask: "*",
        },
      ])
      .then((response: Record<string, string>) => {
        resolve(response.hiddenInput.trim());
      });
  });
}

export function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function activateFeatures(featureHashes: string[]) {
  for (const feat of featureHashes) {
    // This blocks until the command finishes:
    run(
      "clio",
      ["push", "action", "sysio", "activate", `["${feat}"]`, "-p", "sysio"],
      `Failed to activate feature: ${feat}`
    );

    // Now actually pause:
    await wait(2000);
  }
}

/**
 * Helper: Parse a key file that has lines like:
 */
export function parseKeyFile(filePath: string) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Key file does not exist: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split("\n");

  let privateKey = "";
  let publicKey = "";

  for (const line of lines) {
    if (line.startsWith("Private key:")) {
      privateKey = line.replace("Private key:", "").trim();
    } else if (line.startsWith("Public key:")) {
      publicKey = line.replace("Public key:", "").trim();
    }
  }

  return { privateKey, publicKey };
}

/**
 * Helper: Replace placeholders in a file, similar to `sed -i`.
 * Each entry in `replacements` is [REGEX_TO_FIND, REPLACEMENT_STRING].
 */
export function replaceInFile(
  filePath: string,
  replacements: [RegExp, string][]
) {
  if (!fs.existsSync(filePath)) return;

  let data = fs.readFileSync(filePath, "utf8");

  for (const [pattern, replacement] of replacements) {
    data = data.replace(pattern, replacement);
  }

  fs.writeFileSync(filePath, data, { encoding: "utf8" });
}

/**
 * Helper: Loop until a "clio set contract" call succeeds,
 * replicating your shell "while !success ... do".
 */
export async function setContractUntilSuccess(
  contractDir: string,
  contractName: string
) {
  let success = false;

  while (!success) {
    console.log(`[Install]: Setting ${contractName} contract...`);
    const r = childProcess.spawnSync("clio", [
      "set",
      "contract",
      "sysio",
      contractDir,
      "-p",
      "sysio",
      "-x",
      "1000",
    ]);

    if (r.status === 0) {
      success = true;
    } else {
      console.log("[Install]: Failed, trying again...");
      await wait(2000);
    }
  }
}

export async function confirmAction(message: string) {
  const answers = await inquirer.prompt([
    {
      type: "confirm",
      name: "confirm",
      message,
      default: false,
    },
  ]);
  return answers.confirm;
}
