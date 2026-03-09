import { execSync, spawnSync } from "node:child_process";

// ─── Forge checks ─────────────────────────────────────────────────────────────

export function checkForge(): void {
  try {
    execSync("forge --version", { stdio: "pipe" });
  } catch {
    throw new Error(
      "Foundry (forge) is not installed.\n" +
        "Install it: curl -L https://foundry.paradigm.xyz | bash && foundryup"
    );
  }
}

// ─── Build ────────────────────────────────────────────────────────────────────

export function forgeBuild(cwd: string = process.cwd()): void {
  const result = spawnSync("forge", ["build"], {
    cwd,
    stdio: "inherit",
    encoding: "utf-8",
  });
  if (result.status !== 0) {
    throw new Error("forge build failed — check Solidity errors above.");
  }
}

// ─── Deploy ───────────────────────────────────────────────────────────────────

export interface ForgeDeployResult {
  /** Proxy/main contract address parsed from console.log */
  proxyAddress?: string;
  /** Implementation address (UUPS proxy pattern) */
  implementationAddress?: string;
  /** Raw combined stdout + stderr */
  rawOutput: string;
}

export interface ForgeScriptParams {
  /** Path to the Forge script, e.g. 'script/DeployMyUSD.s.sol' */
  script: string;
  /** Resolved RPC URL (not an env var name) */
  rpcUrl: string;
  /** Broadcast transactions on-chain (omit for dry-run) */
  broadcast?: boolean;
  /** Verify source code on block explorer */
  verify?: boolean;
  /** API key for verification */
  etherscanKey?: string;
  cwd?: string;
}

export function forgeScript(params: ForgeScriptParams): ForgeDeployResult {
  const args = [
    "script",
    params.script,
    "--rpc-url",
    params.rpcUrl,
    "--slow", // avoids nonce collisions on public RPCs
  ];

  if (params.broadcast) args.push("--broadcast");
  if (params.verify && params.etherscanKey) {
    args.push("--verify", "--etherscan-api-key", params.etherscanKey);
  }

  const result = spawnSync("forge", args, {
    cwd: params.cwd ?? process.cwd(),
    stdio: "pipe",
    encoding: "utf-8",
    env: process.env,
  });

  const output = (result.stdout ?? "") + (result.stderr ?? "");

  if (result.status !== 0) {
    throw new Error(`forge script failed:\n${output}`);
  }

  const proxyMatch = output.match(/Proxy:\s+(0x[a-fA-F0-9]{40})/i);
  const implMatch = output.match(/Implementation:\s+(0x[a-fA-F0-9]{40})/i);

  return {
    proxyAddress: proxyMatch?.[1],
    implementationAddress: implMatch?.[1],
    rawOutput: output,
  };
}
