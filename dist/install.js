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
exports.install = install;
const childProcess = __importStar(require("child_process"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const signale_1 = __importDefault(require("signale"));
const utilities_helper_1 = require("./helpers/utilities.helper");
/**
 * Our main "install" function in TypeScript, mimicking your shell script.
 */
async function install(options) {
    const { genesis } = options;
    // 1) Check if running as root
    (0, utilities_helper_1.verifyRunningAsRoot)();
    // 2) Define default URLs
    const DEFAULT_SYSIO_PACKAGE_URL = 'https://github.com/Wire-Network/wire-sysio/releases/download/v3.1.7/wire-sysio_3.1.7.deb';
    const DEFAULT_CDT_URL = 'https://bucket.gitgo.app/wire-cdt_3.1.0-1_amd64.deb';
    const DEFAULT_SYSTEM_CONTRACTS_URL = 'https://github.com/Wire-Network/wire-system-contracts.git';
    // 3) Gather environment or fallback to defaults
    const SYSIO_PACKAGE_URL = process.env.SYSIO_PACKAGE_URL || DEFAULT_SYSIO_PACKAGE_URL;
    const CDT_URL = process.env.CDT_URL || DEFAULT_CDT_URL;
    const SYSTEM_CONTRACTS_URL = process.env.SYSTEM_CONTRACTS_URL || DEFAULT_SYSTEM_CONTRACTS_URL;
    // 4) Log usage vs. default
    (0, utilities_helper_1.logUsage)('SYSIO_PACKAGE_URL', SYSIO_PACKAGE_URL, DEFAULT_SYSIO_PACKAGE_URL);
    (0, utilities_helper_1.logUsage)('CDT_URL', CDT_URL, DEFAULT_CDT_URL);
    (0, utilities_helper_1.logUsage)('SYSTEM_CONTRACTS_URL', SYSTEM_CONTRACTS_URL, DEFAULT_SYSTEM_CONTRACTS_URL);
    // 5) Install system packages
    signale_1.default.log(`[INSTALL]: Installing system packages...`);
    // Non-interactive environment for apt-get
    process.env.DEBIAN_FRONTEND = 'noninteractive';
    try {
        (0, utilities_helper_1.runOrError)('apt-get', ['update'], '[ERROR]: Failed to apt-get update');
        (0, utilities_helper_1.runOrError)('apt-get', [
            'install',
            '-y',
            '--no-upgrade',
            'wget',
            'jq',
            'git',
            'curl',
            'build-essential',
            'cmake',
            'libcurl4-gnutls-dev',
            'libz3-dev',
        ], '[ERROR]: Failed to install system packages.');
    }
    catch (error) {
        signale_1.default.error(error);
        process.exit(1);
    }
    // 6) Download or copy .deb packages
    signale_1.default.log(`[INSTALL]: Preparing Wire System Core and CDT...`);
    // For convenience, define where we place them
    const WIRE_CORE_DEB = '/wire-core.deb';
    const WIRE_CDT_DEB = '/wire-cdt.deb';
    function handleDebPackage(source, destPath, label) {
        if (fs.existsSync(source)) {
            // Local file
            signale_1.default.warn(`[INFO]: Using local file for ${label}: ${source}`);
            fs.copyFileSync(source, destPath);
        }
        else if ((0, utilities_helper_1.isUrl)(source)) {
            // Download
            signale_1.default.warn(`[INFO]: Downloading ${label} from: ${source}`);
            (0, utilities_helper_1.runOrError)('wget', ['-O', destPath, source], `[ERROR]: Failed to download ${label}`);
        }
        else {
            throw new Error(`[ERROR]: Invalid ${label} package path or URL: ${source}`);
        }
    }
    try {
        handleDebPackage(SYSIO_PACKAGE_URL, WIRE_CORE_DEB, 'Wire System Core');
        handleDebPackage(CDT_URL, WIRE_CDT_DEB, 'Wire CDT');
    }
    catch (error) {
        signale_1.default.error(error);
        process.exit(1);
    }
    // 7) apt-get install wire-core
    signale_1.default.log(`[INSTALL]: Installing Wire System Core...`);
    try {
        (0, utilities_helper_1.runOrError)('apt-get', ['install', '-y', '--no-upgrade', WIRE_CORE_DEB], '[ERROR]: Failed to install Wire System Core');
    }
    catch (error) {
        signale_1.default.error(error);
        process.exit(1);
    }
    // 8) If genesis, do additional steps
    if (genesis) {
        signale_1.default.log(`[INSTALL]: Starting Wire Network Genesis Setup...`);
        // 8a) apt-get install wire-cdt
        try {
            (0, utilities_helper_1.runOrError)('apt-get', ['install', '-y', '--no-upgrade', WIRE_CDT_DEB], '[ERROR]: Failed to install Wire CDT');
        }
        catch (error) {
            signale_1.default.error(error);
            process.exit(1);
        }
        signale_1.default.log(`[INSTALL]: Handling System Contracts...`);
        const SYSTEM_CONTRACTS_PATH = '/opt/wire-system-contracts';
        // 8b) If local dir => copy. Else if URL => clone
        if (fs.existsSync(SYSTEM_CONTRACTS_URL)) {
            // It's a local directory
            signale_1.default.warn(`[INFO]: Using local system contracts directory: ${SYSTEM_CONTRACTS_URL}`);
            try {
                fs.mkdirSync(SYSTEM_CONTRACTS_PATH, { recursive: true });
                // Copy the contents recursively
                (0, utilities_helper_1.copyRecursiveSync)(SYSTEM_CONTRACTS_URL, SYSTEM_CONTRACTS_PATH);
            }
            catch (err) {
                signale_1.default.error(`[ERROR]: Failed to copy local system contracts: ${err}`);
                process.exit(1);
            }
        }
        else if ((0, utilities_helper_1.isUrl)(SYSTEM_CONTRACTS_URL)) {
            // It's a git URL => do a clone
            signale_1.default.warn(`[INFO]: Cloning system contracts from: ${SYSTEM_CONTRACTS_URL}`);
            try {
                (0, utilities_helper_1.runOrError)('git', ['clone', '--branch', 'testnet', '--single-branch', SYSTEM_CONTRACTS_URL, SYSTEM_CONTRACTS_PATH], '[ERROR]: Failed to clone system contracts repo');
            }
            catch (err) {
                signale_1.default.error(err);
                process.exit(1);
            }
        }
        else {
            signale_1.default.error(`[ERROR]: Invalid System Contracts path or URL: ${SYSTEM_CONTRACTS_URL}`);
            process.exit(1);
        }
        // Compile the system contracts
        try {
            const buildPath = path.join(SYSTEM_CONTRACTS_PATH, 'build');
            if (fs.existsSync(buildPath)) {
                fs.rmSync(buildPath, { recursive: true, force: true });
            }
            fs.mkdirSync(buildPath);
            (0, utilities_helper_1.runOrError)('cmake', ['-DCMAKE_BUILD_TYPE=Release', '..'], '[ERROR]: Failed to configure system contracts');
            (0, utilities_helper_1.runOrError)('make', ['-j', '2'], '[ERROR]: Failed to compile system contracts');
            signale_1.default.log(`[INSTALL]: System contracts compiled successfully!`);
        }
        catch (err) {
            signale_1.default.error(err);
            process.exit(1);
        }
        // Create directories, set up wallet, etc.
        signale_1.default.log(`[INSTALL]: Managing Chain directories...`);
        const WORK_DIR = '/opt/wire-network';
        const SECRETS_DIR = path.join(WORK_DIR, 'secrets');
        const SYSIO_KEY_FILE = path.join(SECRETS_DIR, 'sysio_key.txt');
        try {
            fs.mkdirSync(SECRETS_DIR, { recursive: true });
        }
        catch (err) {
            signale_1.default.error(`[ERROR]: Failed to create secrets directory: ${err}`);
            process.exit(1);
        }
        // NOTE: The shell script references $PROJECT_DIR for blockproducer/chain-api
        // We'll assume we have them in the current working directory, or some known location:
        const PROJECT_DIR = process.cwd(); // or customize if needed
        // Copy blockproducer and chain-api (if they exist in PROJECT_DIR)
        (0, utilities_helper_1.copyRecursiveSync)(path.join(PROJECT_DIR, 'blockproducer'), path.join(WORK_DIR, 'blockproducer'));
        (0, utilities_helper_1.copyRecursiveSync)(path.join(PROJECT_DIR, 'chain-api'), path.join(WORK_DIR, 'chain-api'));
        // Create data directories
        fs.mkdirSync(path.join(WORK_DIR, 'blockproducer', 'data'), { recursive: true });
        fs.mkdirSync(path.join(WORK_DIR, 'chain-api', 'data'), { recursive: true });
        fs.mkdirSync(path.join(WORK_DIR, 'chain-api', 'data', 'traces'), { recursive: true });
        signale_1.default.log(`[Install]: Generating key pairs...`);
        // Create a new wallet: parse the password from "clio wallet create --to-signale"
        let passOutput = '';
        try {
            // We capture the output so we can parse the password
            const result = childProcess.spawnSync('clio', ['wallet', 'create', '--to-console'], {
                encoding: 'utf8',
            });
            if (result.status !== 0) {
                throw new Error(`[ERROR]: Failed to create wallet: ${result.stderr}`);
            }
            passOutput = result.stdout;
        }
        catch (err) {
            signale_1.default.error(err);
            process.exit(1);
        }
        // The script uses "awk 'FNR > 3 { print $1 }' | tr -d '\"'"
        // We’ll do something simpler—just look for the last line that’s not empty (approx.)
        const passLine = passOutput
            .split('\n')
            .map((l) => l.trim())
            .filter((l) => l.length > 0)
            .pop();
        // Typically it might be in quotes, e.g. "PW5K..."
        const walletPassword = passLine.replace(/"/g, '');
        // Save password to secrets
        fs.writeFileSync(path.join(SECRETS_DIR, 'wallet_password.txt'), walletPassword, { encoding: 'utf8' });
        // Create an "unlock_wallet.sh" equivalent. 
        // (In TS, you might just do spawn calls directly, but let's replicate the script.)
        const unlockScript = `#!/bin/bash
clio wallet unlock --password ${walletPassword} || echo "Wallet already unlocked..."
`;
        fs.writeFileSync(path.join(WORK_DIR, 'unlock_wallet.sh'), unlockScript, { mode: 0o755 });
        // Now run the unlock script
        try {
            (0, utilities_helper_1.runOrError)('bash', [path.join(WORK_DIR, 'unlock_wallet.sh')], '[ERROR]: Failed to unlock wallet');
        }
        catch (err) {
            signale_1.default.error(err);
            process.exit(1);
        }
        // Prompt user for private key or auto-generate
        signale_1.default.pending(`[Install]: Press Enter to generate a new key, OR type an existing private key (input hidden):`);
        let typedKey = await (0, utilities_helper_1.hiddenPrompt)();
        if (!typedKey) {
            // Generate new key
            signale_1.default.log(`[Install]: Generating new key pair...`);
            try {
                const result = childProcess.spawnSync('clio', ['create', 'key', '--file', SYSIO_KEY_FILE], {
                    encoding: 'utf8',
                });
                if (result.status !== 0) {
                    throw new Error(`[ERROR]: Failed to generate key pair: ${result.stderr}`);
                }
                // Parse the sysio_key.txt
                const fileContent = fs.readFileSync(SYSIO_KEY_FILE, 'utf8');
                const lines = fileContent.split('\n');
                let sysioPrivateKey = '';
                let sysioPublicKey = '';
                lines.forEach((line) => {
                    if (line.startsWith('Private key:')) {
                        sysioPrivateKey = line.replace('Private key:', '').trim();
                    }
                    else if (line.startsWith('Public key:')) {
                        sysioPublicKey = line.replace('Public key:', '').trim();
                    }
                });
                // Import it
                (0, utilities_helper_1.runOrError)('clio', ['wallet', 'import', '--private-key', sysioPrivateKey], '[ERROR]: Failed to import newly generated private key');
                signale_1.default.log(`[Install]: Key pair generated & imported!`);
            }
            catch (err) {
                signale_1.default.error(err);
                process.exit(1);
            }
        }
        else {
            // If user typed a key (hidden)
            signale_1.default.log(`[Install]: Using provided private key...`);
            try {
                (0, utilities_helper_1.runOrError)('clio', ['wallet', 'import', '--private-key', typedKey], '[ERROR]: Failed to import user-provided private key');
            }
            catch (err) {
                signale_1.default.error(err);
                process.exit(1);
            }
        }
        signale_1.default.log(`[INSTALL]: Genesis setup complete!`);
    }
    else {
        // No genesis
        signale_1.default.log(`[INSTALL]: Genesis mode off not supported at this time.`);
    }
}
