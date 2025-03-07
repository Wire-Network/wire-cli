import * as childProcess from 'child_process';
import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import signale from "signale";
import inquirer from 'inquirer';
import { copyRecursiveSync, hiddenPrompt, isUrl, logUsage, runOrError, verifyRunningAsRoot } from './helpers/utilities.helper';



interface InstallOptions {
  genesis: boolean;
}

/**
 * Our main "install" function in TypeScript, mimicking your shell script.
 */
export async function install(options: InstallOptions) {
  const { genesis } = options;

  // 1) Check if running as root
  verifyRunningAsRoot();

  // 2) Define default URLs
  const DEFAULT_SYSIO_PACKAGE_URL =
    'https://github.com/Wire-Network/wire-sysio/releases/download/v3.1.7/wire-sysio_3.1.7.deb';
  const DEFAULT_CDT_URL =
    'https://bucket.gitgo.app/wire-cdt_3.1.0-1_amd64.deb';
  const DEFAULT_SYSTEM_CONTRACTS_URL =
    'https://github.com/Wire-Network/wire-system-contracts.git';

  // 3) Gather environment or fallback to defaults
  const SYSIO_PACKAGE_URL =
    process.env.SYSIO_PACKAGE_URL || DEFAULT_SYSIO_PACKAGE_URL;
  const CDT_URL = process.env.CDT_URL || DEFAULT_CDT_URL;
  const SYSTEM_CONTRACTS_URL =
    process.env.SYSTEM_CONTRACTS_URL || DEFAULT_SYSTEM_CONTRACTS_URL;

  // 4) Log usage vs. default
  logUsage('SYSIO_PACKAGE_URL', SYSIO_PACKAGE_URL, DEFAULT_SYSIO_PACKAGE_URL);
  logUsage('CDT_URL', CDT_URL, DEFAULT_CDT_URL);
  logUsage('SYSTEM_CONTRACTS_URL', SYSTEM_CONTRACTS_URL, DEFAULT_SYSTEM_CONTRACTS_URL);

  // 5) Install system packages
  signale.log(`[INSTALL]: Installing system packages...`);
  // Non-interactive environment for apt-get
  process.env.DEBIAN_FRONTEND = 'noninteractive';

  try {
    runOrError(
      'apt-get',
      ['update'],
      '[ERROR]: Failed to apt-get update'
    );
    runOrError(
      'apt-get',
      [
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
      ],
      '[ERROR]: Failed to install system packages.'
    );
  } catch (error) {
    signale.error(error);
    process.exit(1);
  }

  // 6) Download or copy .deb packages
  signale.log(`[INSTALL]: Preparing Wire System Core and CDT...`);

  // For convenience, define where we place them
  const WIRE_CORE_DEB = '/wire-core.deb';
  const WIRE_CDT_DEB = '/wire-cdt.deb';

  function handleDebPackage(source: string, destPath: string, label: string) {
    if (fs.existsSync(source)) {
      // Local file
      signale.warn(`[INFO]: Using local file for ${label}: ${source}`);
      fs.copyFileSync(source, destPath);
    } else if (isUrl(source)) {
      // Download
      signale.warn(`[INFO]: Downloading ${label} from: ${source}`);
      runOrError('wget', ['-O', destPath, source], `[ERROR]: Failed to download ${label}`);
    } else {
      throw new Error(`[ERROR]: Invalid ${label} package path or URL: ${source}`);
    }
  }

  try {
    handleDebPackage(SYSIO_PACKAGE_URL, WIRE_CORE_DEB, 'Wire System Core');
    handleDebPackage(CDT_URL, WIRE_CDT_DEB, 'Wire CDT');
  } catch (error) {
    signale.error(error);
    process.exit(1);
  }

  // 7) apt-get install wire-core
  signale.log(`[INSTALL]: Installing Wire System Core...`);

  try {
    runOrError(
      'apt-get',
      ['install', '-y', '--no-upgrade', WIRE_CORE_DEB],
      '[ERROR]: Failed to install Wire System Core'
    );
  } catch (error) {
    signale.error(error);
    process.exit(1);
  }

  // 8) If genesis, do additional steps
  if (genesis) {
    signale.log(`[INSTALL]: Starting Wire Network Genesis Setup...`);

    // 8a) apt-get install wire-cdt
    try {
      runOrError(
        'apt-get',
        ['install', '-y', '--no-upgrade', WIRE_CDT_DEB],
        '[ERROR]: Failed to install Wire CDT'
      );
    } catch (error) {
      signale.error(error);
      process.exit(1);
    }

    signale.log(`[INSTALL]: Handling System Contracts...`);

    const SYSTEM_CONTRACTS_PATH = '/opt/wire-system-contracts';

    // 8b) If local dir => copy. Else if URL => clone
    if (fs.existsSync(SYSTEM_CONTRACTS_URL)) {
      // It's a local directory
      signale.warn(
        `[INFO]: Using local system contracts directory: ${SYSTEM_CONTRACTS_URL}`
      );

      try {
        fs.mkdirSync(SYSTEM_CONTRACTS_PATH, { recursive: true });
        // Copy the contents recursively
        copyRecursiveSync(SYSTEM_CONTRACTS_URL, SYSTEM_CONTRACTS_PATH);
      } catch (err) {
        signale.error(`[ERROR]: Failed to copy local system contracts: ${err}`);
        process.exit(1);
      }
    } else if (isUrl(SYSTEM_CONTRACTS_URL)) {
      // It's a git URL => do a clone
      signale.warn(`[INFO]: Cloning system contracts from: ${SYSTEM_CONTRACTS_URL}`);

      try {
        runOrError(
          'git',
          ['clone', '--branch', 'testnet', '--single-branch', SYSTEM_CONTRACTS_URL, SYSTEM_CONTRACTS_PATH],
          '[ERROR]: Failed to clone system contracts repo'
        );
      } catch (err) {
        signale.error(err);
        process.exit(1);
      }
    } else {
      signale.error(`[ERROR]: Invalid System Contracts path or URL: ${SYSTEM_CONTRACTS_URL}`);
      process.exit(1);
    }

    // Compile the system contracts
    try {
      const buildPath = path.join(SYSTEM_CONTRACTS_PATH, 'build');

      if (fs.existsSync(buildPath)) {
        fs.rmSync(buildPath, { recursive: true, force: true });
      }

      fs.mkdirSync(buildPath);

      runOrError(
        'cmake',
        ['-DCMAKE_BUILD_TYPE=Release', '..'],
        '[ERROR]: Failed to configure system contracts'
      );

      runOrError('make', ['-j', '2'], '[ERROR]: Failed to compile system contracts');
      signale.log(`[INSTALL]: System contracts compiled successfully!`);
    } catch (err) {
      signale.error(err);
      process.exit(1);
    }

    // Create directories, set up wallet, etc.
    signale.log(`[INSTALL]: Managing Chain directories...`);
    const WORK_DIR = '/opt/wire-network';
    const SECRETS_DIR = path.join(WORK_DIR, 'secrets');
    const SYSIO_KEY_FILE = path.join(SECRETS_DIR, 'sysio_key.txt');

    try {
      fs.mkdirSync(SECRETS_DIR, { recursive: true });
    } catch (err) {
      signale.error(`[ERROR]: Failed to create secrets directory: ${err}`);
      process.exit(1);
    }

    // NOTE: The shell script references $PROJECT_DIR for blockproducer/chain-api
    // We'll assume we have them in the current working directory, or some known location:
    const PROJECT_DIR = process.cwd(); // or customize if needed

    // Copy blockproducer and chain-api (if they exist in PROJECT_DIR)
    copyRecursiveSync(path.join(PROJECT_DIR, 'blockproducer'), path.join(WORK_DIR, 'blockproducer'));
    copyRecursiveSync(path.join(PROJECT_DIR, 'chain-api'), path.join(WORK_DIR, 'chain-api'));

    // Create data directories
    fs.mkdirSync(path.join(WORK_DIR, 'blockproducer', 'data'), { recursive: true });
    fs.mkdirSync(path.join(WORK_DIR, 'chain-api', 'data'), { recursive: true });
    fs.mkdirSync(path.join(WORK_DIR, 'chain-api', 'data', 'traces'), { recursive: true });

    signale.log(`[Install]: Generating key pairs...`);

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
    } catch (err) {
      signale.error(err);
      process.exit(1);
    }

    // The script uses "awk 'FNR > 3 { print $1 }' | tr -d '\"'"
    // We’ll do something simpler—just look for the last line that’s not empty (approx.)
    const passLine = passOutput
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .pop()!;
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
      runOrError(
        'bash',
        [path.join(WORK_DIR, 'unlock_wallet.sh')],
        '[ERROR]: Failed to unlock wallet'
      );
    } catch (err) {
      signale.error(err);
      process.exit(1);
    }

    // Prompt user for private key or auto-generate
    signale.pending(
      `[Install]: Press Enter to generate a new key, OR type an existing private key (input hidden):`
    );

    let typedKey = await hiddenPrompt();

    if (!typedKey) {
      // Generate new key
      signale.log(`[Install]: Generating new key pair...`);

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
          } else if (line.startsWith('Public key:')) {
            sysioPublicKey = line.replace('Public key:', '').trim();
          }
        });
        // Import it
        runOrError(
          'clio',
          ['wallet', 'import', '--private-key', sysioPrivateKey],
          '[ERROR]: Failed to import newly generated private key'
        );
        signale.log(`[Install]: Key pair generated & imported!`);
      } catch (err) {
        signale.error(err);
        process.exit(1);
      }
    } else {
      // If user typed a key (hidden)
      signale.log(`[Install]: Using provided private key...`);

      try {
        runOrError(
          'clio',
          ['wallet', 'import', '--private-key', typedKey],
          '[ERROR]: Failed to import user-provided private key'
        );
      } catch (err) {
        signale.error(err);
        process.exit(1);
      }
    }

    signale.log(`[INSTALL]: Genesis setup complete!`);
  } else {
    // No genesis
    signale.log(`[INSTALL]: Genesis mode off not supported at this time.`);
  }
}

