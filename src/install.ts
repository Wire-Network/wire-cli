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
  setKeyName,
} from "./helpers/utilities.helper";

interface InstallOptions {
  genesis: boolean;
  disableAutoGenerateKey: boolean;
}

const SYMBOL = "SYS";
const SUPPLY = "75496.0000";
const BYTE_PER_UNIT = "104";

export async function install(options: InstallOptions) {
  const { genesis, disableAutoGenerateKey } = options;

  verifyRunningAsRoot();

  const DEFAULT_SYSIO_PACKAGE_URL =
    "https://wire-public-assets.s3.us-east-1.amazonaws.com/wire-sysio_1.0.0-dev-ubuntu_amd64.deb";
  const DEFAULT_CDT_URL =
    "https://wire-public-assets.s3.us-east-1.amazonaws.com/cdt_4.1.1-1_amd64.deb";

  const SYSIO_PACKAGE_URL =
    process.env.SYSIO_PACKAGE_URL || DEFAULT_SYSIO_PACKAGE_URL;
  const CDT_URL = process.env.CDT_URL || DEFAULT_CDT_URL;

  logUsage("SYSIO_PACKAGE_URL", SYSIO_PACKAGE_URL, DEFAULT_SYSIO_PACKAGE_URL);
  logUsage("CDT_URL", CDT_URL, DEFAULT_CDT_URL);

  // Set resource limits
  signale.log(`[INSTALL]: Setting resource limits...`);

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
  run(
    "apt-get",
    ["install", "-y", "--no-upgrade", WIRE_CORE_DEB],
    "[ERROR]: Failed to install Wire System Core"
  );

  if (!genesis) {
    signale.log(`[INSTALL]: Genesis mode off not supported at this time.`);
    return;
  }

  signale.log(`[INSTALL]: Installing Wire CDT...`);
  run(
    "apt-get",
    ["install", "-y", "--no-upgrade", WIRE_CDT_DEB],
    "[ERROR]: Failed to install Wire CDT"
  );

  // Use bundled contracts from package
  const PKG_ROOT = path.resolve(__dirname, "..");
  const CONTRACTS_PATH = path.join(PKG_ROOT, "contracts");

  if (!fs.existsSync(CONTRACTS_PATH)) {
    throw new Error(`[ERROR]: Bundled contracts not found at ${CONTRACTS_PATH}`);
  }
  signale.log(`[INSTALL]: Using bundled contracts from ${CONTRACTS_PATH}`);

  const WORK_DIR = process.env.WIRE_CLI_WORK_DIR || "/opt/wire-network";
  fs.mkdirSync(WORK_DIR, { recursive: true });

  const SECRETS_DIR = path.join(WORK_DIR, "secrets");
  fs.mkdirSync(SECRETS_DIR, { recursive: true });

  const SYSIO_KEY_FILE = path.join(SECRETS_DIR, "sysio_key.txt");
  const SYSIO_BLS_KEY_FILE = path.join(SECRETS_DIR, "sysio_bls_key.txt");

  const TEMPLATE_BP = path.join(PKG_ROOT, "blockproducer");
  const TEMPLATE_API = path.join(PKG_ROOT, "chain-api");
  const TEMPLATE_BP_RELAY = path.join(PKG_ROOT, "bp-relay");

  // Copy blockproducer
  const dstBp = path.join(WORK_DIR, "blockproducer");
  signale.debug(`[DEBUG]: copying blockproducer from ${TEMPLATE_BP} to ${dstBp}`);
  copyRecursiveSync(TEMPLATE_BP, dstBp);

  // Copy chain-api
  const dstApi = path.join(WORK_DIR, "chain-api");
  signale.debug(`[DEBUG]: copying chain-api from ${TEMPLATE_API} to ${dstApi}`);
  copyRecursiveSync(TEMPLATE_API, dstApi);

  // Copy bp-relay
  const dstBpRelay = path.join(WORK_DIR, "bp-relay");
  if (fs.existsSync(TEMPLATE_BP_RELAY)) {
    signale.debug(`[DEBUG]: copying bp-relay from ${TEMPLATE_BP_RELAY} to ${dstBpRelay}`);
    copyRecursiveSync(TEMPLATE_BP_RELAY, dstBpRelay);
    fs.mkdirSync(path.join(dstBpRelay, "data"), { recursive: true });
  }

  // Ensure data directories
  fs.mkdirSync(path.join(dstBp, "data"), { recursive: true });
  fs.mkdirSync(path.join(dstApi, "data"), { recursive: true });

  signale.log(`[Install]: Starting kiod and creating wallet...`);
  
  // Clean up existing wallet data
  try {
    fs.rmSync("/root/sysio-wallet", { recursive: true, force: true });
    fs.rmSync("/root/.config/wire", { recursive: true, force: true });
  } catch {}

  // Start kiod
  const kiodProc = childProcess.spawn("kiod", [], {
    detached: true,
    stdio: "ignore",
    env: { ...process.env, HOME: "/root" },
  });
  kiodProc.unref();

  signale.log(`[Install]: Waiting for kiod...`);
  for (let i = 0; i < 20; i++) {
    const check = childProcess.spawnSync("clio", ["wallet", "list"], { encoding: "utf8" });
    if (check.status === 0) break;
    await wait(500);
  }

  // Create wallet
  const walletResult = childProcess.spawnSync("clio", ["wallet", "create", "--to-console"], {
    encoding: "utf8",
  });
  if (walletResult.status !== 0)
    throw new Error(`[ERROR]: Failed to create wallet: ${walletResult.stderr}`);

  const walletPassword = walletResult.stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .pop()!
    .replace(/"/g, "");
  fs.writeFileSync(path.join(SECRETS_DIR, "wallet_password.txt"), walletPassword);

  const unlockScript = `#!/bin/bash\nclio wallet unlock --password ${walletPassword} || echo "Wallet already unlocked..."`;
  fs.writeFileSync(path.join(WORK_DIR, "unlock_wallet.sh"), unlockScript, { mode: 0o755 });
  run("bash", [path.join(WORK_DIR, "unlock_wallet.sh")], "[ERROR]: Failed to unlock wallet");

  const autoGenerateKey = !disableAutoGenerateKey;
  let sysioPrivateKey: string;
  let sysioPublicKey: string;
  let sysioBLSPrivateKey: string;
  let sysioBLSPublicKey: string;
  let sysioBLSPoP: string;

  if (autoGenerateKey) {
    signale.log(`[Install]: Auto-generating key pairs...`);

    // Generate signing key
    run("clio", ["create", "key", "--file", SYSIO_KEY_FILE], "[ERROR]: Failed to generate key pair");
    const keys = parseKeyFile(SYSIO_KEY_FILE);
    sysioPrivateKey = keys.privateKey;
    sysioPublicKey = keys.publicKey;
    run("clio", ["wallet", "import", "--private-key", sysioPrivateKey], "[ERROR]: Failed to import private key");
    setKeyName(sysioPublicKey, "sysio-signing", walletPassword);

    // Generate BLS finalizer key
    run("sys-util", ["bls", "create", "key", "--file", SYSIO_BLS_KEY_FILE], "[ERROR]: Failed to generate BLS key pair");
    const blsKeys = parseBLSKeyFile(SYSIO_BLS_KEY_FILE);
    sysioBLSPrivateKey = blsKeys.privateKey;
    sysioBLSPublicKey = blsKeys.publicKey;
    sysioBLSPoP = blsKeys.pop;
  } else {
    signale.log(`[Install]: Custom key mode - please provide your keys...`);
    
    // Prompt for signing key
    console.log("Enter your signing private key:");
    const typedKey = await hiddenPrompt();
    if (!typedKey) {
      throw new Error("You must supply a signing private key.");
    }
    run("clio", ["wallet", "import", "--private-key", typedKey], "[ERROR]: Failed to import user-provided private key");

    // Get public key from wallet
    const keysRaw = childProcess.spawnSync(
      "clio",
      ["wallet", "private_keys", "--name=default", `--password=${walletPassword}`],
      { encoding: "utf8" }
    );
    const match = keysRaw.stdout.match(/"SYS[^"]+/g);
    sysioPublicKey = match ? match[match.length - 1].replace(/"/g, "") : "";
    sysioPrivateKey = typedKey;

    fs.writeFileSync(SYSIO_KEY_FILE, `Private key: ${sysioPrivateKey}\nPublic key: ${sysioPublicKey}`);
    setKeyName(sysioPublicKey, "sysio-signing", walletPassword);

    // Prompt for BLS keys
    console.log("Enter your BLS private key (PVT_BLS_...):");
    const typedBLSPrivKey = await hiddenPrompt();
    if (!typedBLSPrivKey) {
      throw new Error("You must supply a BLS private key.");
    }
    
    console.log("Enter your BLS public key (PUB_BLS_...):");
    const typedBLSPubKey = await hiddenPrompt();
    if (!typedBLSPubKey) {
      throw new Error("You must supply a BLS public key.");
    }
    
    console.log("Enter your BLS proof of possession (SIG_BLS_...):");
    const typedBLSPoP = await hiddenPrompt();
    if (!typedBLSPoP) {
      throw new Error("You must supply a BLS proof of possession.");
    }

    sysioBLSPrivateKey = typedBLSPrivKey;
    sysioBLSPublicKey = typedBLSPubKey;
    sysioBLSPoP = typedBLSPoP;

    fs.writeFileSync(SYSIO_BLS_KEY_FILE, `Private key: ${sysioBLSPrivateKey}\nPublic key: ${sysioBLSPublicKey}\nProof of Possession: ${sysioBLSPoP}`);
  }

  signale.log(`[Install]: Keys generated successfully.`);
  console.log(`DEBUG: Signing Key [${sysioPublicKey}]`);
  console.log(`DEBUG: BLS Key [${sysioBLSPublicKey}]`);

  // Get server IP
  const ipResult = childProcess.spawnSync("hostname", ["-I"], { encoding: "utf8" });
  if (ipResult.status !== 0) {
    throw new Error("Unable to retrieve server IP via `hostname -I`");
  }
  const SERVER_IP = ipResult.stdout.trim().split(" ")[0];
  console.log(`[Install]: Detected server IP: ${SERVER_IP}`);

  console.log("[Install]: Updating configs and genesis.json...");

  // Update blockproducer config
  replaceInFile(path.join(WORK_DIR, "blockproducer", "config", "config.ini"), [
    [/<PRODUCER_NAME>/g, "sysio"],
    [/<SERVER_IP>/g, SERVER_IP],
    [/<SIGNING_PRIV_KEY>/g, sysioPrivateKey],
    [/<SIGNING_PUB_KEY>/g, sysioPublicKey],
    [/<FINALIZER_PRIV_KEY>/g, sysioBLSPrivateKey],
    [/<FINALIZER_PUB_KEY>/g, sysioBLSPublicKey],
  ]);

  // Update chain-api config
  replaceInFile(path.join(WORK_DIR, "chain-api", "config", "config.ini"), [
    [/<PRODUCER_NAME>/g, "sysio"],
    [/<SERVER_IP>/g, SERVER_IP],
  ]);

  // Update bp-relay config if exists
  if (fs.existsSync(path.join(WORK_DIR, "bp-relay", "config", "config.ini"))) {
    replaceInFile(path.join(WORK_DIR, "bp-relay", "config", "config.ini"), [
      [/<PRODUCER_NAME>/g, "sysio"],
      [/<SERVER_IP>/g, SERVER_IP],
    ]);
  }

  // Update genesis.json
  const genesisPath = path.join(WORK_DIR, "blockproducer", "config", "genesis.json");
  if (fs.existsSync(genesisPath)) {
    let genesisData = fs.readFileSync(genesisPath, "utf8");
    const init_time = new Date().toISOString().replace(/\.\d{3}Z$/, ".000");
    const crypto = await import("crypto");
    const CHAIN_ID = crypto.createHash("sha256").update(`wire-${init_time}`).digest("hex");

    genesisData = genesisData
      .replace(/"initial_timestamp": ".*"/, `"initial_timestamp": "${init_time}"`)
      .replace(/"initial_key": ".*"/, `"initial_key": "${sysioPublicKey}"`)
      .replace(/"initial_finalizer_key": ".*"/, `"initial_finalizer_key": "${sysioBLSPublicKey}"`)
      .replace(/"initial_chain_id": ".*"/, `"initial_chain_id": "${CHAIN_ID}"`);

    // Set enable-stale-production to true for genesis
    replaceInFile(path.join(WORK_DIR, "blockproducer", "config", "config.ini"), [
      [/enable-stale-production = false/g, "enable-stale-production = true"],
    ]);

    signale.info("[Install]: Updated genesis.json");
    fs.writeFileSync(genesisPath, genesisData, { encoding: "utf8" });
  }

  // Start blockproducer
  console.log("[Install]: Starting Blockproducer nodeop instance...");
  const bpLog = fs.openSync(path.join(WORK_DIR, "blockproducer", "data", "nodeop.log"), "a");
  const bpProc = childProcess.spawn(
    "nodeop",
    [
      "-p", "sysio",
      "--config-dir", `${WORK_DIR}/blockproducer/config`,
      "--data-dir", `${WORK_DIR}/blockproducer/data`,
      "--genesis-json", `${WORK_DIR}/blockproducer/config/genesis.json`,
    ],
    { detached: true, stdio: ["ignore", "ignore", bpLog] }
  );
  fs.writeFileSync(path.join(WORK_DIR, "blockproducer", "config", "nodeop.pid"), String(bpProc.pid));
  bpProc.unref();

  await wait(10000);

  // Start bp-relay if exists
  if (fs.existsSync(dstBpRelay)) {
    console.log("[Install]: Starting BP-Relay nodeop instance...");
    const bpRelayLog = fs.openSync(path.join(WORK_DIR, "bp-relay", "data", "nodeop.log"), "a");
    const bpRelayProc = childProcess.spawn(
      "nodeop",
      [
        "--config-dir", `${WORK_DIR}/bp-relay/config`,
        "--data-dir", `${WORK_DIR}/bp-relay/data`,
        "--genesis-json", `${WORK_DIR}/blockproducer/config/genesis.json`,
      ],
      { detached: true, stdio: ["ignore", "ignore", bpRelayLog] }
    );
    fs.writeFileSync(path.join(WORK_DIR, "bp-relay", "config", "nodeop.pid"), String(bpRelayProc.pid));
    bpRelayProc.unref();
    await wait(10000);
  }

  // Start chain-api
  console.log("[Install]: Starting Chain-Api nodeop instance...");
  const apiLog = fs.openSync(path.join(WORK_DIR, "chain-api", "data", "nodeop.log"), "a");
  const apiProc = childProcess.spawn(
    "nodeop",
    [
      "--config-dir", `${WORK_DIR}/chain-api/config`,
      "--data-dir", `${WORK_DIR}/chain-api/data`,
      "--contracts-console",
      "--genesis-json", `${WORK_DIR}/blockproducer/config/genesis.json`,
    ],
    { detached: true, stdio: ["ignore", "ignore", apiLog] }
  );
  fs.writeFileSync(path.join(WORK_DIR, "chain-api", "config", "nodeop.pid"), String(apiProc.pid));
  apiProc.unref();

  await wait(10000);

  // Setup genesis chain
  console.log("[Install]: Starting genesis chain setup...");
  console.log("[Install]: Creating system accounts and key pairs...");

  const systemAccounts = [
    "sysio.msig",
    "sysio.wrap",
    "sysio.token",
    "sysio.bpay",
    "sysio.names",
    "sysio.saving",
    "sysio.acct",
    "sysio.roa",
  ];

  for (const account of systemAccounts) {
    console.log(`[Install]: Creating keys and account: ${account}...`);
    createSystemAccount(account, SECRETS_DIR, walletPassword);
  }

  // Deploy sysio.system FIRST (required for RAM management)
  console.log("[Install]: Deploying sysio.system contract FIRST (required for RAM management)...");
  console.log("DEBUG: Deploying from path:", `${CONTRACTS_PATH}/sysio.system/`); await setContractUntilSuccess(`${CONTRACTS_PATH}/sysio.system/`, "sysio.system");
  await wait(2000);

  // Initialize system contract BEFORE deploying other contracts
  console.log("[Install]: Initializing system contract...");
  run(
    "clio",
    ["push", "action", "sysio", "init", `["0", "4,${SYMBOL}"]`, "-p", "sysio@active"],
    "Failed to init sysio system contract"
  );
  await wait(2000);

  // Now deploy token and msig contracts
  console.log("[Install]: Deploying sysio.token contract...");
  run("clio", ["set", "contract", "sysio.token", `${CONTRACTS_PATH}/sysio.token/`], "Failed to deploy sysio.token");
  await wait(2000);

  console.log("[Install]: Deploying sysio.msig contract...");
  run("clio", ["set", "contract", "sysio.msig", `${CONTRACTS_PATH}/sysio.msig/`], "Failed to deploy sysio.msig");
  await wait(2000);

  // Set privileged accounts
  console.log("[Install]: Setting Token to privileged...");
  run("clio", ["push", "action", "sysio", "setpriv", '["sysio.token", 1]', "-p", "sysio@active"], "Failed to setpriv sysio.token");
  await wait(3000);

  console.log("[Install]: Setting Msig to privileged...");
  run("clio", ["push", "action", "sysio", "setpriv", '["sysio.msig", 1]', "-p", "sysio@active"], "Failed to setpriv sysio.msig");
  await wait(3000);

  console.log("[Install]: Deploying sysio.roa contract...");
  run("clio", ["set", "contract", "sysio.roa", `${CONTRACTS_PATH}/sysio.roa/`], "Failed to deploy sysio.roa");
  await wait(2000);

  console.log("[Install]: Setting ROA to privileged...");
  run("clio", ["push", "action", "sysio", "setpriv", '["sysio.roa", 1]', "-p", "sysio@active"], "Failed to setpriv sysio.roa");
  await wait(3000);

  console.log(`[Install]: Token symbol set to ${SYMBOL}`);
  console.log("[Install]: Creating system token...");
  run(
    "clio",
    ["push", "action", "sysio.token", "create", `[ "sysio", "${SUPPLY} ${SYMBOL}"]`, "-p", "sysio.token@active"],
    "Failed to create system token"
  );
  await wait(2000);

  console.log("[Install]: Core Token created. Issuing supply...");
  run(
    "clio",
    ["push", "action", "sysio.token", "issue", `[ "sysio", "${SUPPLY} ${SYMBOL}", "initial issuance" ]`, "-p", "sysio@active"],
    "Failed to issue system token"
  );
  await wait(2000);

  console.log("[Install]: Initializing ROA contract...");
  run(
    "clio",
    ["push", "action", "sysio.roa", "activateroa", `["${SUPPLY} ${SYMBOL}", ${BYTE_PER_UNIT}]`, "-p", "sysio.roa@active"],
    "Failed to activateroa"
  );
  await wait(2000);


  // Create node owner account for ROA policies
  console.log("[Install]: Creating node owner account...");
  const nodeowneraKeyResult = childProcess.spawnSync("clio", ["create", "key", "--to-console"], { encoding: "utf8" });
  const nodeowneraPriv = nodeowneraKeyResult.stdout.match(/Private key: (\S+)/)?.[1] || "";
  const nodeowneraPub = nodeowneraKeyResult.stdout.match(/Public key: (\S+)/)?.[1] || "";

  run("clio", ["wallet", "import", "--private-key", nodeowneraPriv], "[ERROR]: Failed to import nodeownera key");
  setKeyName(nodeowneraPub, "nodeownera", walletPassword);
  run("clio", ["create", "account", "sysio", "nodeownera", nodeowneraPub], "Failed to create nodeownera account");

  fs.writeFileSync(
    path.join(SECRETS_DIR, "nodeownera_key.txt"),
    `Private key: ${nodeowneraPriv}\nPublic key: ${nodeowneraPub}`
  );
  await wait(1000);

  console.log("[Install]: Registering nodeownera as tier 1 node owner...");
  run(
    "clio",
    ["push", "action", "sysio.roa", "forcereg", JSON.stringify({owner: "nodeownera", tier: 1}), "-p", "sysio.roa@active"],
    "Failed to register nodeownera"
  );
  await wait(2000);

  // Cleanup
  console.log("[INSTALL]: Performing cleanup...");
  try {
    fs.rmSync("/wire-core.deb", { force: true });
    fs.rmSync("/wire-cdt.deb", { force: true });
  } catch {}

  signale.info("[Install]: Genesis chain setup complete!");
}

/**
 * Parse a BLS key file
 */
function parseBLSKeyFile(filePath: string) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`BLS Key file does not exist: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split("\n");

  let privateKey = "";
  let publicKey = "";
  let pop = "";

  for (const line of lines) {
    if (line.startsWith("Private key:")) {
      privateKey = line.replace("Private key:", "").trim();
    } else if (line.startsWith("Public key:")) {
      publicKey = line.replace("Public key:", "").trim();
    } else if (line.startsWith("Proof of Possession:")) {
      pop = line.replace("Proof of Possession:", "").trim();
    }
  }

  return { privateKey, publicKey, pop };
}

/**
 * Helper: Create a system account using clio.
 */
function createSystemAccount(account: string, secretsDir: string, walletPassword: string) {
  const keyFile = path.join(secretsDir, `${account}_key.txt`);

  run("clio", ["create", "key", "--file", keyFile], `Failed to create key for ${account}`);
  const { privateKey, publicKey } = parseKeyFile(keyFile);
  run("clio", ["wallet", "import", "--private-key", privateKey], `Failed to import private key for ${account}`);
  setKeyName(publicKey, account, walletPassword);
  run("clio", ["create", "account", "sysio", account, publicKey], `Failed to create account ${account}`);

  console.log(`[Install]: ${account} created successfully...`);
}
