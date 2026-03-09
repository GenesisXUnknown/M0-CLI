import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { log } from "../lib/logger.js";
import { readConfig, updateConfig, configExists, getRpcUrl } from "../lib/config.js";
import { getChain } from "../lib/chains.js";
import { checkForge, forgeBuild, forgeScript } from "../lib/forge.js";

export const deployCommand = new Command("deploy")
  .description("Deploy your M0 Extension contract")
  .option("-n, --network <network>", "Target network (overrides config)")
  .option("--dry-run", "Simulate without broadcasting")
  .option("--verify", "Verify source on block explorer")
  .action(async (opts) => {
    if (!configExists()) {
      log.error("No M0 project. Run 'm0 init' first.");
      process.exit(1);
    }

    const config = readConfig();
    if (!config.treasury) {
      log.error("Treasury address not set. Run 'm0 configure' first.");
      process.exit(1);
    }

    const network = (opts.network as string | undefined) ?? config.chain;
    const chainConfig = getChain(network);
    const rpcUrl = getRpcUrl(network);

    if (!rpcUrl) {
      log.error(
        `No RPC URL for ${network}. ` +
          `Set ${network.toUpperCase().replace(/-/g, "_")}_RPC_URL in your .env`
      );
      process.exit(1);
    }

    log.header(`Deploying ${config.name} to ${chainConfig.name}`);
    if (opts.dryRun) log.warn("Dry-run mode — no transactions will be sent.");

    // ── Step 1: Check Foundry ────────────────────────────────────────────────
    let spinner = ora("Checking Foundry...").start();
    try {
      checkForge();
      spinner.succeed("Foundry found");
    } catch (e: unknown) {
      spinner.fail("Foundry not installed");
      log.error(e instanceof Error ? e.message : String(e));
      process.exit(1);
    }

    // ── Step 2: Compile ──────────────────────────────────────────────────────
    spinner = ora("Compiling contracts...").start();
    try {
      forgeBuild();
      spinner.succeed("Contracts compiled");
    } catch (e: unknown) {
      spinner.fail("Compilation failed");
      log.error(e instanceof Error ? e.message : String(e));
      process.exit(1);
    }

    // ── Step 3: Deploy ───────────────────────────────────────────────────────
    const cap = config.name.charAt(0).toUpperCase() + config.name.slice(1);
    const scriptPath = `script/Deploy${cap}.s.sol`;
    const broadcast = !(opts.dryRun as boolean | undefined);

    spinner = ora(broadcast ? "Deploying..." : "Simulating...").start();
    try {
      const result = forgeScript({
        script: scriptPath,
        rpcUrl,
        broadcast,
        verify: opts.verify as boolean | undefined,
        etherscanKey:
          process.env.ETHERSCAN_API_KEY ?? process.env.BASESCAN_API_KEY,
      });

      if (result.proxyAddress) {
        spinner.succeed("Deployed!");
        updateConfig({
          deployed: true,
          contractAddress: result.proxyAddress,
          deployedAt: new Date().toISOString(),
        });

        console.log();
        log.box(
          [
            chalk.bold(`${config.name} (${config.symbol}) deployed`),
            "",
            `Proxy:          ${chalk.cyan(result.proxyAddress)}`,
            result.implementationAddress
              ? `Implementation: ${chalk.cyan(result.implementationAddress)}`
              : "",
            `Chain:          ${chainConfig.name}`,
            `Explorer:       ${chainConfig.explorer}/address/${result.proxyAddress}`,
            "",
            chalk.dim("Next steps:"),
            chalk.dim("  1. m0 governance apply-earner"),
            chalk.dim("  2. (wait for TTG approval)"),
            chalk.dim("  3. m0 yield enable"),
          ].filter(Boolean) as string[]
        );
      } else if (!broadcast) {
        spinner.succeed("Simulation complete (nothing broadcast)");
        log.raw(result.rawOutput);
      } else {
        spinner.warn("Deploy may have succeeded — check output below:");
        log.raw(result.rawOutput);
      }
    } catch (e: unknown) {
      spinner.fail("Deployment failed");
      log.error(e instanceof Error ? e.message : String(e));
      process.exit(1);
    }
  });
