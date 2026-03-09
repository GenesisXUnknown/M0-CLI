import { Command } from "commander";
import { log } from "../lib/logger.js";
import { readConfig, configExists } from "../lib/config.js";

export const yieldCommand = new Command("yield").description("Manage yield");

yieldCommand
  .command("enable")
  .description("Enable earning (requires earner approval)")
  .action(async () => {
    if (!configExists()) {
      log.error("No project.");
      process.exit(1);
    }
    const c = readConfig();
    if (!c.deployed) {
      log.error("Not deployed.");
      process.exit(1);
    }
    if (c.earnerStatus !== "approved") {
      log.error("Not approved. Run 'm0 governance apply-earner'.");
      process.exit(1);
    }
    log.info("Calling enableEarning()...");
    // TODO: viem writeContract call to enableEarning()
    log.warn("TODO: Implement on-chain enableEarning() call");
  });

yieldCommand
  .command("disable")
  .description("Disable earning")
  .action(async () => {
    log.warn("TODO: Implement disableEarning()");
  });

yieldCommand
  .command("claim")
  .description("Claim yield to treasury")
  .option("--to <address>", "Override destination")
  .action(async (opts) => {
    if (!configExists()) {
      log.error("No project.");
      process.exit(1);
    }
    const c = readConfig();
    log.info(`Claiming yield to ${opts.to ?? c.treasury}...`);
    // TODO: viem writeContract call to claimYield()
    log.warn("TODO: Implement on-chain claimYield() call");
  });

yieldCommand
  .command("info")
  .description("Show yield info")
  .action(async () => {
    if (!configExists()) {
      log.error("No project.");
      process.exit(1);
    }
    const c = readConfig();
    log.label("Model", c.model);
    log.label("Treasury", c.treasury ?? "Not configured");
    log.label("Earner Status", c.earnerStatus);
    // TODO: Query on-chain yield rate, accrued, last claim
  });
