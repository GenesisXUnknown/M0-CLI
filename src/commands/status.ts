import { Command } from "commander";
import chalk from "chalk";
import { log } from "../lib/logger.js";
import { readConfig, configExists } from "../lib/config.js";
import { getChain } from "../lib/chains.js";

export const statusCommand = new Command("status")
  .description("Check your M0 Extension status")
  .action(async () => {
    if (!configExists()) {
      log.error("No M0 project found.");
      process.exit(1);
    }

    const config = readConfig();
    const chain = getChain(config.chain);

    const earner =
      config.earnerStatus === "approved"
        ? chalk.green("✅ APPROVED")
        : config.earnerStatus === "pending"
        ? chalk.yellow("⏳ PENDING")
        : config.earnerStatus === "rejected"
        ? chalk.red("❌ REJECTED")
        : chalk.gray("NOT SUBMITTED");

    log.box(
      [
        chalk.bold(`${config.name} (${config.symbol})`),
        `Chain: ${chain.name}`,
        `Model: ${config.model}`,
        config.deployed
          ? `Contract: ${config.contractAddress}`
          : `Contract: ${chalk.gray("Not deployed")}`,
        config.deployed
          ? `Explorer: ${chain.explorer}/address/${config.contractAddress}`
          : "",
        ``,
        `Earner Status: ${earner}`,
        `Treasury: ${config.treasury ?? chalk.gray("Not configured")}`,
      ].filter(Boolean) as string[]
    );

    // TODO: Query on-chain for yield accrued, total supply, holders, TVL
  });
