import { Command } from "commander";
import { confirm } from "@inquirer/prompts";
import { log } from "../lib/logger.js";
import { readConfig, updateConfig, configExists } from "../lib/config.js";
import { getChain } from "../lib/chains.js";

export const governanceCommand = new Command("governance")
  .alias("gov")
  .description("Governance actions");

governanceCommand
  .command("apply-earner")
  .description("Submit earner approval application")
  .action(async () => {
    if (!configExists()) {
      log.error("No project.");
      process.exit(1);
    }
    const c = readConfig();
    if (!c.deployed) {
      log.error("Deploy first.");
      process.exit(1);
    }
    if (c.earnerStatus === "approved") {
      log.info("Already approved.");
      return;
    }
    if (c.earnerStatus === "pending") {
      log.info("Already pending.");
      return;
    }

    const chain = getChain(c.chain);
    log.header("Earner Approval Application");
    log.label("Extension", `${c.name} (${c.symbol})`);
    log.label("Contract", c.contractAddress!);
    log.label("Chain", chain.name);
    log.label("Treasury", c.treasury!);
    if (c.inviteCode) log.label("Invite Code", c.inviteCode);

    const ok = await confirm({ message: "Submit to M0 governance?", default: true });
    if (!ok) {
      log.dim("Cancelled.");
      return;
    }

    // TODO: Submit via M0 governance API / TTG
    updateConfig({ earnerStatus: "pending" });
    log.success("Application submitted!");
    if (c.inviteCode) log.info("Invite code detected — may be fast-tracked.");
  });

governanceCommand
  .command("status")
  .description("Check earner approval status")
  .action(async () => {
    if (!configExists()) {
      log.error("No project.");
      process.exit(1);
    }
    log.label("Earner Status", readConfig().earnerStatus);
  });
