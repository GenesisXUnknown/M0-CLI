import fs from "node:fs";
import path from "node:path";
import type { M0ProjectConfig } from "../types/index.js";
import { CHAINS } from "./chains.js";

const CONFIG_DIR = ".m0";
const CONFIG_FILE = "config.json";

export function getConfigPath(projectDir: string = process.cwd()): string {
  return path.join(projectDir, CONFIG_DIR, CONFIG_FILE);
}

export function configExists(projectDir: string = process.cwd()): boolean {
  return fs.existsSync(getConfigPath(projectDir));
}

export function readConfig(projectDir: string = process.cwd()): M0ProjectConfig {
  const configPath = getConfigPath(projectDir);
  if (!fs.existsSync(configPath)) {
    throw new Error("No M0 project found. Run 'm0 init <name>' to create one.");
  }
  return JSON.parse(fs.readFileSync(configPath, "utf-8")) as M0ProjectConfig;
}

export function writeConfig(
  config: M0ProjectConfig,
  projectDir: string = process.cwd()
): void {
  const configDir = path.join(projectDir, CONFIG_DIR);
  if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(
    path.join(configDir, CONFIG_FILE),
    JSON.stringify(config, null, 2) + "\n"
  );
}

export function createDefaultConfig(
  name: string,
  symbol: string,
  options: {
    model?: M0ProjectConfig["model"];
    chain?: string;
    chainId?: number;
    inviteCode?: string | null;
  } = {}
): M0ProjectConfig {
  return {
    name,
    symbol,
    model: options.model ?? "yield-to-one",
    chain: options.chain ?? "base",
    chainId: options.chainId ?? 8453,
    treasury: null,
    admin: null,
    blacklistAdmin: null,
    deployed: false,
    contractAddress: null,
    earnerStatus: "not-submitted",
    inviteCode: options.inviteCode ?? null,
    deployedAt: null,
    deployTxHash: null,
  };
}

export function updateConfig(
  updates: Partial<M0ProjectConfig>,
  projectDir: string = process.cwd()
): M0ProjectConfig {
  const config = readConfig(projectDir);
  const updated = { ...config, ...updates };
  writeConfig(updated, projectDir);
  return updated;
}

// ─── Environment helpers ──────────────────────────────────────────────────────

/**
 * Reads the deployer private key from the environment.
 * The key is NEVER stored in config — only in the .env file.
 */
export function getDeployerKey(): `0x${string}` {
  const key = process.env.PRIVATE_KEY;
  if (!key) {
    throw new Error(
      'PRIVATE_KEY environment variable is not set.\n' +
        'Add it to your .env file: PRIVATE_KEY=0x...'
    );
  }
  return (key.startsWith("0x") ? key : `0x${key}`) as `0x${string}`;
}

/**
 * Resolves the RPC URL for a given chain name.
 * Looks for `<CHAIN>_RPC_URL` in the environment first,
 * then falls back to `RPC_URL`, then the public default.
 */
export function getRpcUrl(chainName: string): string {
  const envKey = `${chainName.toUpperCase().replace(/-/g, "_")}_RPC_URL`;
  return (
    process.env[envKey] ??
    process.env.RPC_URL ??
    CHAINS[chainName]?.rpcUrl ??
    ""
  );
}
