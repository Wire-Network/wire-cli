import * as childProcess from "child_process";
import * as fs from "fs";
import * as path from "path";
import signale from "signale";
import {
  copyRecursiveSync,
  hiddenPrompt,
  isUrl,
  logUsage,
  run,
  verifyRunningAsRoot,
  wait,
  replaceInFile,
  setContractUntilSuccess,
  parseKeyFile,
} from "./helpers/utilities.helper";

interface InstallOptions {
  genesis: boolean;
  enableRoa: boolean;
  disableAutoGenerateKey: boolean;
}

const SYMBOL = "SYS";
const SUPPLY = "75496.0000";
const BYTE_PER_UNIT = "104";

export async function install(options: InstallOptions) {
  const { genesis, enableRoa, disableAutoGenerateKey  } = options;

  verifyRunningAsRoot();

  const DEFAULT_SYSIO_PACKAGE_URL =
    "https://github.com/Wire-Network/wire-sysio/releases/download/v3.1.7/wire-sysio_3.1.7.deb";
  const DEFAULT_CDT_URL = "https://bucket.gitgo.app/wire-cdt_3.1.0-1_amd64.deb";
  const DEFAULT_SYSTEM_CONTRACTS_URL =
    "https://github.com/Wire-Network/wire-system-contracts.git";

  // 3) Gather environment or fallback
  const SYSIO_PACKAGE_URL =
    process.env.SYSIO_PACKAGE_URL || DEFAULT_SYSIO_PACKAGE_URL;
  const CDT_URL = process.env.CDT_URL || DEFAULT_CDT_URL;
  const SYSTEM_CONTRACTS_URL =
    process.env.SYSTEM_CONTRACTS_URL || DEFAULT_SYSTEM_CONTRACTS_URL;

  logUsage("SYSIO_PACKAGE_URL", SYSIO_PACKAGE_URL, DEFAULT_SYSIO_PACKAGE_URL);
  logUsage("CDT_URL", CDT_URL, DEFAULT_CDT_URL);
  logUsage(
    "SYSTEM_CONTRACTS_URL",
    SYSTEM_CONTRACTS_URL,
    DEFAULT_SYSTEM_CONTRACTS_URL
  );

  // Install system packages
  signale.log(`[INSTALL]: Installing system packages...`);
  process.env.DEBIAN_FRONTEND = "noninteractive";

  try {
    run("apt-get", ["update"], "[ERROR]: Failed to apt-get update");
    run(
      "apt-get",
      [
        "install",
        "-y",
        "--no-upgrade",
        "wget",
        "jq",
        "git",
        "curl",
        "build-essential",
        "cmake",
        "libcurl4-gnutls-dev",
        "libz3-dev",
      ],
      "[ERROR]: Failed to install system packages."
    );
  } catch (error) {
    signale.error(error);
    process.exit(1);
  }

  // Download or copy the .deb packages
  signale.log(`[INSTALL]: Preparing Wire System Core and CDT...`);
  const WIRE_CORE_DEB = "/wire-core.deb";
  const WIRE_CDT_DEB = "/wire-cdt.deb";

  function handleDebPackage(source: string, destPath: string, label: string) {
    if (fs.existsSync(source)) {
      signale.warn(`[INFO]: Using local file for ${label}: ${source}`);
      fs.copyFileSync(source, destPath);
    } else if (isUrl(source)) {
      signale.warn(`[INFO]: Downloading ${label} from: ${source}`);
      run(
        "wget",
        ["-O", destPath, source],
        `[ERROR]: Failed to download ${label}`
      );
    } else {
      throw new Error(
        `[ERROR]: Invalid ${label} package path or URL: ${source}`
      );
    }
  }

  try {
    handleDebPackage(SYSIO_PACKAGE_URL, WIRE_CORE_DEB, "Wire System Core");
    handleDebPackage(CDT_URL, WIRE_CDT_DEB, "Wire CDT");
  } catch (error) {
    signale.error(error);
    process.exit(1);
  }

  // apt-get install wire-core
  signale.log(`[INSTALL]: Installing Wire System Core...`);

  try {
    run(
      "apt-get",
      ["install", "-y", "--no-upgrade", WIRE_CORE_DEB],
      "[ERROR]: Failed to install Wire System Core"
    );
  } catch (error) {
    signale.error(error);
    process.exit(1);
  }

  // If genesis => do the rest
  if (!genesis) {
    signale.log(`[INSTALL]: Genesis mode off not supported at this time.`);
    return;
  }

  // Install CDT
  signale.log(`[INSTALL]: Starting Wire Network Genesis Setup...`);

  try {
    run(
      "apt-get",
      ["install", "-y", "--no-upgrade", WIRE_CDT_DEB],
      "[ERROR]: Failed to install Wire CDT"
    );
  } catch (error) {
    signale.error(error);
    process.exit(1);
  }

  signale.log(`[INSTALL]: Handling System Contracts...`);
  const SYSTEM_CONTRACTS_PATH = "/opt/wire-system-contracts";

  if (fs.existsSync(SYSTEM_CONTRACTS_URL)) {
    signale.warn(
      `[INFO]: Using local system contracts directory: ${SYSTEM_CONTRACTS_URL}`
    );

    try {
      fs.mkdirSync(SYSTEM_CONTRACTS_PATH, { recursive: true });
      copyRecursiveSync(SYSTEM_CONTRACTS_URL, SYSTEM_CONTRACTS_PATH);
    } catch (err) {
      signale.error(`[ERROR]: Failed to copy local system contracts: ${err}`);
      process.exit(1);
    }
  } else if (isUrl(SYSTEM_CONTRACTS_URL)) {
    signale.warn(
      `[INFO]: Cloning system contracts from: ${SYSTEM_CONTRACTS_URL}`
    );

    try {
      run(
        "git",
        [
          "clone",
          "--branch",
          "testnet",
          "--single-branch",
          SYSTEM_CONTRACTS_URL,
          SYSTEM_CONTRACTS_PATH,
        ],
        "[ERROR]: Failed to clone system contracts repo"
      );
    } catch (err) {
      signale.error(err);
      process.exit(1);
    }
  } else {
    signale.error(
      `[ERROR]: Invalid System Contracts path or URL: ${SYSTEM_CONTRACTS_URL}`
    );
    process.exit(1);
  }

  try {
    const buildPath = path.join(SYSTEM_CONTRACTS_PATH, "build");

    if (fs.existsSync(buildPath)) {
      fs.rmSync(buildPath, { recursive: true, force: true });
    }

    fs.mkdirSync(buildPath);

    run(
      "cmake",
      ["-DCMAKE_BUILD_TYPE=Release", ".."],
      "[ERROR]: Failed to configure system contracts",
      buildPath
    );
    run(
      "make",
      ["-j", "2"],
      "[ERROR]: Failed to compile system contracts",
      buildPath
    );
    signale.log(`[INSTALL]: System contracts compiled successfully!`);
  } catch (err) {
    signale.error(err);
    process.exit(1);
  }

  // Manage chain directories, create wallet, etc.
  signale.log(`[INSTALL]: Managing Chain directories...`);
  const WORK_DIR = "/opt/wire-network";
  const SECRETS_DIR = path.join(WORK_DIR, "secrets");
  const SYSIO_KEY_FILE = path.join(SECRETS_DIR, "sysio_key.txt");

  // create secrets dir
  fs.mkdirSync(SECRETS_DIR, { recursive: true });

  // Copy blockproducer & chain-api from local project
  const PROJECT_DIR = process.cwd();
  copyRecursiveSync(
    path.join(PROJECT_DIR, "blockproducer"),
    path.join(WORK_DIR, "blockproducer")
  );
  copyRecursiveSync(
    path.join(PROJECT_DIR, "chain-api"),
    path.join(WORK_DIR, "chain-api")
  );

  // Create data directories
  fs.mkdirSync(path.join(WORK_DIR, "blockproducer", "data"), {
    recursive: true,
  });
  fs.mkdirSync(path.join(WORK_DIR, "chain-api", "data"), { recursive: true });
  fs.mkdirSync(path.join(WORK_DIR, "chain-api", "data", "traces"), {
    recursive: true,
  });

  signale.log(`[Install]: Generating key pairs...`);
  let passOutput = "";

  // 1) Create new wallet & parse the password
  try {
    const result = childProcess.spawnSync(
      "clio",
      ["wallet", "create", "--to-console"],
      {
        encoding: "utf8",
      }
    );

    if (result.status !== 0) {
      throw new Error(`[ERROR]: Failed to create wallet: ${result.stderr}`);
    }

    passOutput = result.stdout;
  } catch (err) {
    signale.error(err);
    process.exit(1);
  }

  // Grab last non-empty line => wallet password
  const passLine = passOutput
    .split("\n")
    .map(l => l.trim())
    .filter(l => l.length > 0)
    .pop()!;
  const walletPassword = passLine.replace(/"/g, "");

  fs.writeFileSync(
    path.join(SECRETS_DIR, "wallet_password.txt"),
    walletPassword,
    { encoding: "utf8" }
  );

  // Create an unlock script
  const unlockScript = `#!/bin/bash
clio wallet unlock --password ${walletPassword} || echo "Wallet already unlocked..."
`;
  fs.writeFileSync(path.join(WORK_DIR, "unlock_wallet.sh"), unlockScript, {
    mode: 0o755,
  });

  // Unlock it
  try {
    run(
      "bash",
      [path.join(WORK_DIR, "unlock_wallet.sh")],
      "[ERROR]: Failed to unlock wallet"
    );
  } catch (err) {
    signale.error(err);
    process.exit(1);
  }

  const autoGenerateKey = !disableAutoGenerateKey;

  // 2) Prompt user for private key or generate new
  if (autoGenerateKey) {
    signale.log(`[Install]: Auto-generating key pair without user prompt...`);
  } else {
    signale.pending(
      `[Install]: Press Enter to generate a new key, OR type an existing private key (input hidden):`
    );
  }
  
  const typedKey = autoGenerateKey ? "" : await hiddenPrompt();

  if (!typedKey) {
    signale.log(`[Install]: Generating new key pair...`);

    try {
      const result = childProcess.spawnSync(
        "clio",
        ["create", "key", "--file", SYSIO_KEY_FILE],
        { encoding: "utf8" }
      );

      if (result.status !== 0) {
        throw new Error(
          `[ERROR]: Failed to generate key pair: ${result.stderr}`
        );
      }

      // import into wallet
      const { privateKey: pvt, publicKey: pub } = parseKeyFile(SYSIO_KEY_FILE);
      run(
        "clio",
        ["wallet", "import", "--private-key", pvt],
        "[ERROR]: Failed to import newly generated private key"
      );
      signale.log(`[Install]: Key pair generated & imported!`);
    } catch (err) {
      signale.error(err);
      process.exit(1);
    }
  } else {
    signale.log(`[Install]: Using provided private key...`);

    try {
      run(
        "clio",
        ["wallet", "import", "--private-key", typedKey],
        "[ERROR]: Failed to import user-provided private key"
      );
    } catch (err) {
      signale.error(err);
      process.exit(1);
    }
  }

  // Final check: ensure sysio_key.txt isn't empty
  if (
    !fs.existsSync(SYSIO_KEY_FILE) ||
    fs.statSync(SYSIO_KEY_FILE).size === 0
  ) {
    throw new Error(`No key data in ${SYSIO_KEY_FILE}. Aborting.`);
  }

  console.log(
    "[Install]: sysio_key.txt is ready with both private & public keys."
  );
  console.log(
    "[Install]: Keys have been added to the wallet. Continuing setup..."
  );

  // Parse them again
  const { privateKey: sysioPrivateKey, publicKey: sysioPublicKey } =
    parseKeyFile(SYSIO_KEY_FILE);
  console.log(`DEBUG: [${sysioPrivateKey}]`);
  console.log(`DEBUG: [${sysioPublicKey}]`);

  // 3) Get server IP
  const ipResult = childProcess.spawnSync("hostname", ["-I"], {
    encoding: "utf8",
  });

  if (ipResult.status !== 0) {
    throw new Error("Unable to retrieve server IP via `hostname -I`");
  }

  const SERVER_IP = ipResult.stdout.trim().split(" ")[0];
  console.log(`[Install]: Detected server IP: ${SERVER_IP}`);

  console.log("[Install]: Updating configs and genesis.json...");

  // Replace placeholders in config.ini and start.sh
  replaceInFile(path.join(WORK_DIR, "blockproducer", "config", "config.ini"), [
    [/<PRODUCER_NAME>/g, "sysio"],
    [/<SERVER_IP>/g, SERVER_IP],
  ]);
  replaceInFile(path.join(WORK_DIR, "chain-api", "config", "config.ini"), [
    [/<PRODUCER_NAME>/g, "sysio"],
    [/<SERVER_IP>/g, SERVER_IP],
  ]);
  replaceInFile(path.join(WORK_DIR, "blockproducer", "start.sh"), [
    [/<SIGNING_PRIV_KEY>/g, sysioPrivateKey],
    [/<SIGNING_PUB_KEY>/g, sysioPublicKey],
  ]);

  const genesisPath = path.join(
    WORK_DIR,
    "blockproducer",
    "config",
    "genesis.json"
  );

  if (fs.existsSync(genesisPath)) {
    let genesisData = fs.readFileSync(genesisPath, "utf8");
    const init_time = new Date().toISOString().replace(/\.\d{3}Z$/, ".000");

    // chain ID from "wire-$init_time"
    const crypto = await import("crypto");
    const CHAIN_ID = crypto
      .createHash("sha256")
      .update(`wire-${init_time}`)
      .digest("hex");

    genesisData = genesisData.replace(
      /"initial_timestamp": ".*"/,
      `"initial_timestamp": "${init_time}"`
    );
    genesisData = genesisData.replace(
      /"initial_key": ".*"/,
      `"initial_key": "${sysioPublicKey}"`
    );
    genesisData = genesisData.replace(
      /"initial_chain_id": ".*"/,
      `"initial_chain_id": "${CHAIN_ID}"`
    );

    fs.writeFileSync(genesisPath, genesisData, { encoding: "utf8" });
  }

  // 5) Start blockproducer
  signale.log("[Install]: Starting blockproducer nodeop instance...");

  // Check if blockproducer config directory exists
  const blockproducerConfigDir = path.join(WORK_DIR, "blockproducer", "config");

  signale.info(`DEBUG: Listing files in ${blockproducerConfigDir} ...`);
    const lsResult = childProcess.spawnSync(
      "ls",
      ["-la", blockproducerConfigDir],
      {
        encoding: "utf8",
      }
    );
    signale.info(lsResult.stdout);
  const bpLog = fs.openSync(
    path.join(WORK_DIR, "blockproducer", "data", "nodeop.log"),
    "a"
  );
  const bpProc = childProcess.spawn(
    "nodeop",
    [
      "-p",
      "sysio",
      "--config-dir",
      `${WORK_DIR}/blockproducer/config`,
      "--contracts-console",
      "--data-dir",
      `${WORK_DIR}/blockproducer/data`,
      "--genesis-json",
      `${WORK_DIR}/blockproducer/config/genesis.json`,
      "--s-chain-contract",
      "settle.wns",
      "--s-chain-actions",
      "batchw",
      "--plugin",
      "sysio::sub_chain_plugin",
      "--signature-provider",
      `${sysioPublicKey}=KEY:${sysioPrivateKey}`,
    ],
    {
      detached: true,
      stdio: ["ignore", "ignore", bpLog],
    }
  );
  fs.writeFileSync(
    path.join(WORK_DIR, "blockproducer", "config", "nodeop.pid"),
    String(bpProc.pid),
    { encoding: "utf8" }
  );
  bpProc.unref();

  // Start chain-api
  console.log("[Install]: Starting chain-api nodeop instance...");
  await wait(5000);

  const apiLog = fs.openSync(
    path.join(WORK_DIR, "chain-api", "data", "nodeop.log"),
    "a"
  );
  const apiProc = childProcess.spawn(
    "nodeop",
    [
      "--config-dir",
      `${WORK_DIR}/chain-api/config`,
      "--contracts-console",
      "--data-dir",
      `${WORK_DIR}/chain-api/data`,
      "--trace-dir",
      `${WORK_DIR}/chain-api/data/traces`,
      "--genesis-json",
      `${WORK_DIR}/blockproducer/config/genesis.json`,
      "--disable-replay-opts",
    ],
    {
      detached: true,
      stdio: ["ignore", "ignore", apiLog],
    }
  );
  fs.writeFileSync(
    path.join(WORK_DIR, "chain-api", "config", "nodeop.pid"),
    String(apiProc.pid),
    { encoding: "utf8" }
  );
  apiProc.unref();

  await wait(10000);

  // Setup genesis chain (accounts, tokens, etc.)
  console.log("[Install]: Starting genesis chain setup...");

  const systemAccounts = [
    "sysio.msig",
    "sysio.token",
    "sysio.ram",
    "sysio.ramfee",
    "sysio.stake",
    "sysio.bpay",
    "sysio.vpay",
    "sysio.names",
    "sysio.saving",
    "sysio.rex",
    "sysio.roa",
  ];

  for (const account of systemAccounts) {
    console.log(`[Install]: Creating keys and account: ${account}...`);
    createSystemAccount(account, SECRETS_DIR);
  }

  console.log("[Install]: Deploying sysio.token contract...");
  run(
    "clio",
    [
      "set",
      "contract",
      "sysio.token",
      `${SYSTEM_CONTRACTS_PATH}/build/contracts/sysio.token/`,
    ],
    "Failed to deploy sysio.token"
  );
  await wait(2000);

  console.log("[Install]: Deploying sysio.msig contract...");
  run(
    "clio",
    [
      "set",
      "contract",
      "sysio.msig",
      `${SYSTEM_CONTRACTS_PATH}/build/contracts/sysio.msig/`,
    ],
    "Failed to deploy sysio.msig"
  );
  await wait(2000);

  console.log(`[Install]: Token symbol set to ${SYMBOL}`);

  run(
    "clio",
    [
      "push",
      "action",
      "sysio.token",
      "create",
      `[ "sysio", "${SUPPLY} ${SYMBOL}"]`,
      "-p",
      "sysio.token@active",
    ],
    "Failed to create system token"
  );
  await wait(2000);

  console.log("[Install]: Core Token created. Issuing supply...");
  run(
    "clio",
    [
      "push",
      "action",
      "sysio.token",
      "issue",
      `[ "sysio", "${SUPPLY} ${SYMBOL}", "initial issuance" ]`,
      "-p",
      "sysio@active",
    ],
    "Failed to issue system token"
  );
  await wait(2000);

  console.log("[Install]: Activating PREACTIVATE_FEATURE...");
  run(
    "curl",
    [
      "--request",
      "POST",
      "--url",
      "http://127.0.0.1:8887/v1/producer/schedule_protocol_feature_activations",
      "-d",
      '{"protocol_features_to_activate": ["0ec7e080177b2c02b278d5088611686b49d739925a92d9bfcacd7fc6b74053bd"]}',
    ],
    "Failed to schedule protocol feature activations"
  );
  await wait(5000);

  // set sysio.boot contract in a loop
  await setContractUntilSuccess(
    `${SYSTEM_CONTRACTS_PATH}/build/contracts/sysio.boot/`,
    "sysio.boot"
  );
  await wait(2000);

  console.log("[Install]: Activating Protocol Features...");
  const featureHashes = [
    "c3a6138c5061cf291310887c0b5c71fcaffeab90d5deb50d3b9e687cead45071",
    "d528b9f6e9693f45ed277af93474fd473ce7d831dae2180cca35d907bd10cb40",
    "5443fcf88330c586bc0e5f3dee10e7f63c76c00249c87fe4fbf7f38c082006b4",
    "f0af56d2c5a48d60a4a5b5c903edfb7db3a736a94ed589d0b797df33ff9d3e1d",
    "2652f5f96006294109b3dd0bbde63693f55324af452b799ee137a81a905eed25",
    "8ba52fe7a3956c5cd3a656a3174b931d3bb2abb45578befc59f283ecd816a405",
    "ad9e3d8f650687709fd68f4b90b41f7d825a365b02c23a636cef88ac2ac00c43",
    "68dcaa34c0517d19666e6b33add67351d8c5f69e999ca1e37931bc410a297428",
    "e0fb64b1085cc5538970158d05a009c24e276fb94e1a0bf6a528b48fbc4ff526",
    "ef43112c6543b88db2283a2e077278c315ae2c84719a8b25f25cc88565fbea99",
    "4a90c00d55454dc5b059055ca213579c6ea856967712a56017487886a4d4cc0f",
    "1a99a59d87e06e09ec5b028a9cbb7749b4a5ad8819004365d02dc4379a8b7241",
    "4e7bf348da00a945489b2a681749eb56f5de00b900014e137ddae39f48f69d67",
    "4fca8bd82bbd181e714e283f83e1b45d95ca5af40fb89ad3977b653c448f78c2",
    "299dcb6af692324b899b39f16d5a530a33062804e41f09dc97e9f156b4476707",
    "35c2186cc36f7bb4aeaf4487b36e57039ccf45a9136aa856a5d569ecca55ef2b",
    "5d47703100b35be53772d7caa1ef73e92397e0a876cc4c0af24a5f0353f199c9",
  ];

  for (const feat of featureHashes) {
    run(
      "clio",
      ["push", "action", "sysio", "activate", `["${feat}"]`, "-p", "sysio"],
      `Failed to activate feature: ${feat}`
    );
  }

  await wait(4000);

  // set sysio.system
  await setContractUntilSuccess(
    `${SYSTEM_CONTRACTS_PATH}/build/contracts/sysio.system/`,
    "sysio.system"
  );
  await wait(2000);

  console.log("[Install]: Setting Msig to privileged...");
  run(
    "clio",
    [
      "push",
      "action",
      "sysio",
      "setpriv",
      '["sysio.msig", 1]',
      "-p",
      "sysio@active",
    ],
    "Failed to setpriv sysio.msig"
  );
  await wait(3000);

  console.log("[Install]: Setting ROA to privileged...");
  run(
    "clio",
    [
      "push",
      "action",
      "sysio",
      "setpriv",
      '["sysio.roa", 1]',
      "-p",
      "sysio@active",
    ],
    "Failed to setpriv sysio.roa"
  );
  await wait(3000);

  console.log("[Install]: Deploying sysio.roa contract...");
  run(
    "clio",
    [
      "set",
      "contract",
      "sysio.roa",
      `${SYSTEM_CONTRACTS_PATH}/build/contracts/sysio.roa/`,
    ],
    "Failed to deploy sysio.roa"
  );
  await wait(2000);

  console.log("[Install]: Initializing system contract...");
  run(
    "clio",
    [
      "push",
      "action",
      "sysio",
      "init",
      `["0", "4,${SYMBOL}"]`,
      "-p",
      "sysio@active",
    ],
    "Failed to init sysio system contract"
  );
  await wait(2000);

  console.log("[Install]: Initializing ROA contract...");
  run(
    "clio",
    [
      "push",
      "action",
      "sysio.roa",
      "activateroa",
      `["${SUPPLY} ${SYMBOL}", "${BYTE_PER_UNIT}"]`,
      "-p",
      "sysio.roa@active",
    ],
    "Failed to activateroa"
  );

  if (enableRoa) {
    signale.log(
      "[INSTALL]: Detected --enable-roa flag. Beginning ROA setup..."
    );

    try {
      // add a function call or inline code for the ROA actions
      await doRoaSetup();
    } catch (err) {
      signale.error("[INSTALL]: ROA setup failed:", err);
      process.exit(1);
    }
  }

  signale.info("[Install]: Genesis chain setup complete!");
}

/**
 * Helper: Create a system account using 'clio'.
 * - Creates a key
 * - Imports private key into wallet
 * - Creates account with public key
 */
function createSystemAccount(account: string, secretsDir: string) {
  const keyFile = path.join(secretsDir, `${account}_key.txt`);

  run(
    "clio",
    ["create", "key", "--file", keyFile],
    `Failed to create key for ${account}`
  );

  const { privateKey, publicKey } = parseKeyFile(keyFile);

  run(
    "clio",
    ["wallet", "import", "--private-key", privateKey],
    `Failed to import private key for ${account}`
  );

  run(
    "clio",
    ["create", "account", "sysio", account, publicKey],
    `Failed to create account ${account}`
  );

  console.log(`[Install]: ${account} created successfully...`);
}

async function doRoaSetup() {
  signale.log("[ROA]: Activating ROA...");

  const account = "nodedaddy";

  const pubDevKey = "SYS6MRyAjQq8ud7hVNYcfnVPJqcVpscN5So8BhtHuGYqET5GDW5CV";
  const privateDevKey = "5KQwrPbwdL6PhXujxW37FSSQZ1JiwsST4cqQzDeyXtP79zkvFD3";

  run(
    "clio",
    ["create", "account", "sysio", `${account}`, pubDevKey],
    `Failed to create account ${account}`
  );

  run(
    "clio",
    ["wallet", "import", "--private-key", privateDevKey],
    "[ERROR]: Failed to import nodedaddy privateKey"
  );
  // regnodeowner
  run(
    "clio",
    [
      "push",
      "action",
      "sysio.roa",
      "regnodeowner",
      '{"owner": "nodedaddy", "tier": 1}',
      "-p",
      "sysio.roa@active",
    ],
    "Failed to register node owner"
  );

  signale.log("[ROA]: All ROA steps completed successfully!");
}
