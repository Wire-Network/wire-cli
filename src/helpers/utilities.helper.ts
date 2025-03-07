import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import signale from "signale";
import inquirer from 'inquirer';



/**
 * Spawns a command synchronously. Throws an error if the command fails.
 * @param cmd Full command to run (e.g., "apt-get")
 * @param args Array of args (e.g., ["install", "-y", "wget"])
 * @param errorMsg Error message to throw if something goes wrong
 */
export function runOrError(cmd: string, args: string[], errorMsg: string) {
  signale.log(`[RUN]: ${cmd} ${args.join(' ')}`);
  const result = childProcess.spawnSync(cmd, args, {
    stdio: 'inherit', // pipe output directly to signale
    shell: false,
  });

  if (result.status !== 0) {
    throw new Error(errorMsg);
  }
}


/**
 * Checks if the process is running as root user. On Linux/Unix, process.getuid() works.
 */
export function verifyRunningAsRoot() {
  if (os.platform() === 'win32') {
    signale.warn(
      `[WARN] Skipping root check on Windows. Please ensure you have Administrator privileges.`
    );
  } else if (os.platform() !== 'linux') {
    signale.error(
      `[ERROR] This installer only supports Linux (Ubuntu recommended). You appear to be on: ${os.platform()}`
    );
    process.exit(1);
  } else {
    if (process.getuid && process.getuid() !== 0) {
      signale.error('Please run as root (sudo). Exiting...');
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
    signale.pending(`}Overriding ${varName}: ${value}`);
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
    return new Promise((resolve) => {
    inquirer
        .prompt([
        {
            type: 'password',
            name: 'hiddenInput',
            message: 'Enter your input:',
            mask: '*', 
        },
        ])
        .then((response: Record<string, string>) => {
        resolve(response.hiddenInput.trim());
        });
    });
}