import { Command } from "commander";
import { input } from "@inquirer/prompts";
import { isAddress, getAddress } from "viem";
import { log } from "../lib/logger.js";
import { readConfig, updateConfig, configExists } from "../lib/config.js";

export const configureCommand = new Command("configure")
  .alias("config")
  .description("Interactive configuration wizard")
  .action(async () => {
    if (!configExists()) {
      log.error("No M0 project found. Run 'm0 init <name>' first.");
      process.exit(1);
    }

    const config = readConfig();
    log.header(`Configuring ${config.name} (${config.symbol})`);

    const treasury = await input({
      message: "Treasury wallet (yield recipient — YOUR REVENUE ADDRESS):",
      default: config.treasury ?? undefined,
      validate: (v) =>
        !v
          ? "Required"
          : !isAddress(v)
          ? "Invalid address"
          : v === "0x0000000000000000000000000000000000000000"
          ? "Cannot use zero address"
          : true,
    });

    const admin = await input({
      message: "Admin address (contract owner):",
      default: config.admin ?? treasury,
      validate: (v) => (isAddress(v) ? true : "Invalid address"),
    });

    const blacklistAdmin = await input({
      message: "Blacklist admin (defaults to admin):",
      default: config.blacklistAdmin ?? admin,
      validate: (v) => (isAddress(v) ? true : "Invalid address"),
    });

    updateConfig({
      treasury: getAddress(treasury),
      admin: getAddress(admin),
      blacklistAdmin: getAddress(blacklistAdmin),
    });

    console.log();
    log.success("Configuration saved!");
    log.label("Treasury", getAddress(treasury));
    log.label("Admin", getAddress(admin));
    log.dim("Next: m0 deploy --network base-sepolia");
  });
