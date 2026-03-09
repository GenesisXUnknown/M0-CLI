import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { log } from "../lib/logger.js";
import { readConfig, configExists, getDeployerKey, getRpcUrl } from "../lib/config.js";
import { getChain } from "../lib/chains.js";
import {
  createClient,
  createSigningClient,
  fetchYieldInfo,
  txEnableEarning,
  txDisableEarning,
  txClaimYield,
  formatM,
  formatEarnerRate,
} from "../lib/contracts.js";
import type { Address } from "viem";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function requireDeployed() {
  const c = readConfig();
  if (!c.deployed || !c.contractAddress) {
    log.error("Extension not deployed. Run 'm0 deploy' first.");
    process.exit(1);
  }
  return c;
}

// ─── Commands ─────────────────────────────────────────────────────────────────

export const yieldCommand = new Command("yield").description(
  "Manage Extension yield (enable, disable, claim, info)"
);

// ── yield enable ──────────────────────────────────────────────────────────────
yieldCommand
  .command("enable")
  .description("Enable earning on your Extension (requires TTG earner approval)")
  .action(async () => {
    if (!configExists()) { log.error("No project."); process.exit(1); }
    const c = requireDeployed();

    if (c.earnerStatus !== "approved") {
      log.error(
        "Extension is not approved as an earner yet.\n" +
          "  Run: m0 governance apply-earner"
      );
      process.exit(1);
    }

    const chain = getChain(c.chain);
    const rpcUrl = getRpcUrl(c.chain);
    const spinner = ora("Sending enableEarning() transaction...").start();

    try {
      const privateKey = getDeployerKey();
      const publicClient = createClient(rpcUrl, c.chain);
      const walletClient = createSigningClient(rpcUrl, c.chain, privateKey);

      const txHash = await txEnableEarning(
        c.contractAddress as Address,
        walletClient,
        publicClient
      );

      spinner.succeed("Earning enabled!");
      log.label("Tx Hash", chalk.cyan(txHash));
      log.label("Explorer", `${chain.explorer}/tx/${txHash}`);
      log.dim("Run 'm0 yield info' to see accruing yield.");
    } catch (e: unknown) {
      spinner.fail("Failed to enable earning");
      log.error(e instanceof Error ? e.message : String(e));
      process.exit(1);
    }
  });

// ── yield disable ─────────────────────────────────────────────────────────────
yieldCommand
  .command("disable")
  .description("Disable earning on your Extension")
  .action(async () => {
    if (!configExists()) { log.error("No project."); process.exit(1); }
    const c = requireDeployed();

    const chain = getChain(c.chain);
    const rpcUrl = getRpcUrl(c.chain);
    const spinner = ora("Sending disableEarning() transaction...").start();

    try {
      const privateKey = getDeployerKey();
      const publicClient = createClient(rpcUrl, c.chain);
      const walletClient = createSigningClient(rpcUrl, c.chain, privateKey);

      const txHash = await txDisableEarning(
        c.contractAddress as Address,
        walletClient,
        publicClient
      );

      spinner.succeed("Earning disabled.");
      log.label("Tx Hash", chalk.cyan(txHash));
      log.label("Explorer", `${chain.explorer}/tx/${txHash}`);
    } catch (e: unknown) {
      spinner.fail("Failed to disable earning");
      log.error(e instanceof Error ? e.message : String(e));
      process.exit(1);
    }
  });

// ── yield claim ───────────────────────────────────────────────────────────────
yieldCommand
  .command("claim")
  .description("Claim accrued yield to the treasury address")
  .action(async () => {
    if (!configExists()) { log.error("No project."); process.exit(1); }
    const c = requireDeployed();

    const chain = getChain(c.chain);
    const rpcUrl = getRpcUrl(c.chain);

    // Show pending yield before claiming
    if (chain.mToken) {
      const checkSpinner = ora("Checking accrued yield...").start();
      try {
        const publicClient = createClient(rpcUrl, c.chain);
        const info = await fetchYieldInfo(
          c.contractAddress as Address,
          chain.mToken as Address,
          publicClient
        );
        checkSpinner.stop();
        log.label("Accrued yield", `${formatM(info.accruedYield)} $M`);
        log.label("Will send to", info.yieldRecipient);
        console.log();

        if (info.accruedYield === 0n) {
          log.warn("No yield to claim yet.");
          return;
        }
      } catch {
        checkSpinner.stop();
      }
    }

    const spinner = ora("Sending claimYield() transaction...").start();
    try {
      const privateKey = getDeployerKey();
      const publicClient = createClient(rpcUrl, c.chain);
      const walletClient = createSigningClient(rpcUrl, c.chain, privateKey);

      const txHash = await txClaimYield(
        c.contractAddress as Address,
        walletClient,
        publicClient
      );

      spinner.succeed("Yield claimed!");
      log.label("Tx Hash", chalk.cyan(txHash));
      log.label("Explorer", `${chain.explorer}/tx/${txHash}`);
    } catch (e: unknown) {
      spinner.fail("Failed to claim yield");
      log.error(e instanceof Error ? e.message : String(e));
      process.exit(1);
    }
  });

// ── yield info ────────────────────────────────────────────────────────────────
yieldCommand
  .command("info")
  .description("Show current yield rate and accrued amounts (live on-chain)")
  .action(async () => {
    if (!configExists()) { log.error("No project."); process.exit(1); }
    const c = requireDeployed();

    const chain = getChain(c.chain);
    const rpcUrl = getRpcUrl(c.chain);

    if (!chain.mToken) {
      log.warn(`M token address not configured for chain: ${c.chain}`);
      log.label("Model", c.model);
      log.label("Treasury", c.treasury ?? "Not configured");
      log.label("Earner Status", c.earnerStatus);
      return;
    }

    const spinner = ora("Fetching on-chain yield data...").start();
    try {
      const publicClient = createClient(rpcUrl, c.chain);
      const info = await fetchYieldInfo(
        c.contractAddress as Address,
        chain.mToken as Address,
        publicClient
      );
      spinner.stop();

      console.log();
      log.header(`Yield Info — ${c.name} (${c.symbol})`);
      log.label(
        "Earning",
        info.isEarning ? chalk.green("ENABLED") : chalk.yellow("DISABLED")
      );
      log.label("Earner Rate", formatEarnerRate(info.earnerRate));
      log.label("Accrued Yield", `${formatM(info.accruedYield)} $M`);
      log.label("M Balance (TVL)", `${formatM(info.mBalance)} $M`);
      log.label("Total Supply", `${formatM(info.totalSupply)} ${c.symbol}`);
      log.label("Treasury", info.yieldRecipient);
    } catch (e: unknown) {
      spinner.fail("Failed to fetch on-chain data");
      log.error(e instanceof Error ? e.message : String(e));
      log.dim("Check that your RPC URL is correct and the node is reachable.");
    }
  });
