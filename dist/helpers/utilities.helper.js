"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runOrError = runOrError;
exports.verifyRunningAsRoot = verifyRunningAsRoot;
exports.isUrl = isUrl;
exports.logUsage = logUsage;
exports.copyRecursiveSync = copyRecursiveSync;
exports.hiddenPrompt = hiddenPrompt;
const childProcess = __importStar(require("child_process"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const signale_1 = __importDefault(require("signale"));
const inquirer_1 = __importDefault(require("inquirer"));
/**
 * Spawns a command synchronously. Throws an error if the command fails.
 * @param cmd Full command to run (e.g., "apt-get")
 * @param args Array of args (e.g., ["install", "-y", "wget"])
 * @param errorMsg Error message to throw if something goes wrong
 */
function runOrError(cmd, args, errorMsg) {
    signale_1.default.log(`[RUN]: ${cmd} ${args.join(' ')}`);
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
function verifyRunningAsRoot() {
    if (os.platform() === 'win32') {
        signale_1.default.warn(`[WARN] Skipping root check on Windows. Please ensure you have Administrator privileges.`);
    }
    else if (os.platform() !== 'linux') {
        signale_1.default.error(`[ERROR] This installer only supports Linux (Ubuntu recommended). You appear to be on: ${os.platform()}`);
        process.exit(1);
    }
    else {
        if (process.getuid && process.getuid() !== 0) {
            signale_1.default.error('Please run as root (sudo). Exiting...');
            process.exit(1);
        }
    }
}
/**
 * Check if a string looks like an http(s):// URL
 */
function isUrl(str) {
    return /^https?:\/\//i.test(str);
}
/**
 * Print out whether environment overrides are in use or not
 */
function logUsage(varName, value, defaultVal) {
    if (value === defaultVal) {
        signale_1.default.success(`Using default ${varName}: ${value}`);
    }
    else {
        signale_1.default.pending(`}Overriding ${varName}: ${value}`);
    }
}
/**
 * Recursively copy a directory (like cp -r).
 * Simple approach for demonstration—doesn't handle symlinks, etc.
 */
function copyRecursiveSync(src, dest) {
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
    }
    else {
        fs.copyFileSync(src, dest);
    }
}
/**
 * Hidden prompt to simulate "read -s typed_key" from bash.
 * Press ENTER => returns empty string
 */
function hiddenPrompt() {
    return new Promise((resolve) => {
        inquirer_1.default
            .prompt([
            {
                type: 'password',
                name: 'hiddenInput',
                message: 'Enter your input:',
                mask: '*',
            },
        ])
            .then((response) => {
            resolve(response.hiddenInput.trim());
        });
    });
}
