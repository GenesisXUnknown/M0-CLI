import { Command } from "commander";
import { log } from "../lib/logger.js";
import { readConfig, configExists } from "../lib/config.js";

export const bridgeCommand = new Command("bridge")
  .description("Bridge tokens cross-chain via M Portal")
  .option("--from <chain>", "Source chain")
  .option("--to <chain>", "Destination chain")
  .option("--amount <amount>", "Amount")
  .action(async (opts) => {
    if (!configExists()) {
      log.error("No project.");
      process.exit(1);
    }
    if (!opts.to) {
      log.error("Need --to <chain>");
      process.exit(1);
    }
    if (!opts.amount) {
      log.error("Need --amount");
      process.exit(1);
    }
    const c = readConfig();
    log.info(
      `Bridging ${opts.amount} ${c.symbol} from ${opts.from ?? c.chain} to ${opts.to}...`
    );
    // TODO: Integrate with M Portal (Wormhole NTT / Hyperlane)
    log.warn("TODO: Implement M Portal bridge");
  });
