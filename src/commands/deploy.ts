import { Command } from "commander";
import { execSync } from "node:child_process";
import { log } from "../lib/logger.js";
import { readConfig, updateConfig, configExists } from "../lib/config.js";
import { getChain } from "../lib/chains.js";

export const deployCommand = new Command("deploy")
  .description("Deploy your M0 Extension contract")
  .option("-n, --network <network>", "Target network")
  .option("--dry-run", "Simulate only")
  .option("--verify", "Verify on explorer")
  .action(async (opts) => {
    if (!configExists()) {
      log.error("No M0 project. Run 'm0 init' first.");
      process.exit(1);
    }

    const config = readConfig();
    if (!config.treasury) {
      log.error("Treasury not set. Run 'm0 configure'.");
      process.exit(1);
    }

    const network = opts.network ?? config.chain;
    const chainConfig = getChain(network);

    log.header(`Deploying ${config.name} to ${chainConfig.name}`);

    log.step(1, "Compiling...");
    try {
      execSync("forge build", { stdio: "inherit" });
    } catch {
      log.error("Compilation failed.");
      process.exit(1);
    }

    log.step(2, "Deploying...");
    const cap = config.name.charAt(0).toUpperCase() + config.name.slice(1);
    const rpcVar = network.toUpperCase().replace(/-/g, "_") + "_RPC_URL";
    const args = [
      `forge script script/Deploy${cap}.s.sol`,
      `--rpc-url $${rpcVar}`,
    ];
    if (!opts.dryRun) args.push("--broadcast");
    if (opts.verify) args.push("--verify");

    try {
      const output = execSync(args.join(" "), {
        stdio: "pipe",
        encoding: "utf-8",
      });
      const match = output.match(/Proxy:\s+(0x[a-fA-F0-9]{40})/);
      if (match) {
        updateConfig({
          deployed: true,
          contractAddress: match[1],
          deployedAt: new Date().toISOString(),
        });
        log.success("Deployed!");
        log.label("Contract", match[1]);
        log.label("Explorer", `${chainConfig.explorer}/address/${match[1]}`);
        log.dim("Next: m0 governance apply-earner");
      } else {
        console.log(output);
        log.warn("May have succeeded — check forge output.");
      }
    } catch (e: unknown) {
      log.error("Deployment failed.");
      if (e && typeof e === "object" && "stdout" in e) console.log(e.stdout);
      process.exit(1);
    }
  });
