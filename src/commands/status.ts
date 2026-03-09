import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { log } from "../lib/logger.js";
import { readConfig, configExists, getRpcUrl } from "../lib/config.js";
import { getChain } from "../lib/chains.js";
import {
  createClient,
  fetchYieldInfo,
  isRegisteredEarner,
  formatM,
  formatEarnerRate,
} from "../lib/contracts.js";
import { fetchExtensionStats } from "../lib/graphql.js";
import type { Address } from "viem";

export const statusCommand = new Command("status")
  .description("Check your M0 Extension status (live on-chain data)")
  .action(async () => {
    if (!configExists()) {
      log.error("No M0 project found.");
      process.exit(1);
    }

    const config = readConfig();
    const chain = getChain(config.chain);
    const rpcUrl = getRpcUrl(config.chain);

    const earnerLabel =
      config.earnerStatus === "approved"
        ? chalk.green("✅ APPROVED")
        : config.earnerStatus === "pending"
        ? chalk.yellow("⏳ PENDING")
        : config.earnerStatus === "rejected"
        ? chalk.red("❌ REJECTED")
        : chalk.gray("NOT SUBMITTED");

    // ── Static lines (always available) ──────────────────────────────────────
    const lines: string[] = [
      chalk.bold(`${config.name} (${config.symbol})`),
      `Chain:         ${chain.name}`,
      `Model:         ${config.model}`,
      config.deployed
        ? `Contract:      ${config.contractAddress}`
        : `Contract:      ${chalk.gray("Not deployed — run m0 deploy")}`,
      config.deployed
        ? `Explorer:      ${chain.explorer}/address/${config.contractAddress}`
        : "",
      "",
      `Earner Status: ${earnerLabel}`,
      `Treasury:      ${config.treasury ?? chalk.gray("Not configured")}`,
    ].filter(Boolean) as string[];

    // ── Early exit if not deployed ────────────────────────────────────────────
    if (!config.deployed || !config.contractAddress) {
      log.box(lines);
      return;
    }

    // ── Live on-chain reads ───────────────────────────────────────────────────
    const spinner = ora("Fetching on-chain data...").start();
    try {
      const publicClient = createClient(rpcUrl, config.chain);

      const [yieldInfo, ttgApproved, gqlStats] = await Promise.all([
        // Yield + balance info from M token + Extension
        chain.mToken
          ? fetchYieldInfo(
              config.contractAddress as Address,
              chain.mToken as Address,
              publicClient
            ).catch(() => null)
          : Promise.resolve(null),

        // TTG earner registry check (ground truth for on-chain approval)
        chain.mToken
          ? isRegisteredEarner(
              config.contractAddress as Address,
              // TTGRegistrar address is not in our chain config yet — use M token as proxy
              // TODO: add ttgRegistrar to chains.ts
              chain.mToken as Address,
              publicClient
            ).catch(() => null)
          : Promise.resolve(null),

        // Off-chain API stats (holders, TVL) — degrades gracefully
        fetchExtensionStats(config.contractAddress, config.chainId).catch(
          () => null
        ),
      ]);

      spinner.stop();

      if (yieldInfo) {
        lines.push(
          "",
          `Earning:       ${yieldInfo.isEarning ? chalk.green("ENABLED") : chalk.yellow("DISABLED")}`,
          `Earner Rate:   ${formatEarnerRate(yieldInfo.earnerRate)}`,
          `Accrued Yield: ${formatM(yieldInfo.accruedYield)} $M`,
          `TVL (M bal):   ${formatM(yieldInfo.mBalance)} $M`,
          `Total Supply:  ${formatM(yieldInfo.totalSupply)} ${config.symbol}`
        );
      }

      if (ttgApproved !== null) {
        lines.push(
          `TTG Approved:  ${ttgApproved ? chalk.green("YES") : chalk.red("NO")}`
        );
      }

      if (gqlStats) {
        lines.push(
          `Holders:       ${gqlStats.holders.toLocaleString()}`,
          `TVL (USD):     $${gqlStats.tvlUsd}`
        );
      }
    } catch (e: unknown) {
      spinner.fail("On-chain fetch failed — showing config data only");
      log.dim(e instanceof Error ? e.message : String(e));
    }

    log.box(lines);
  });
