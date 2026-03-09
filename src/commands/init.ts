import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import { input, select } from "@inquirer/prompts";
import { log } from "../lib/logger.js";
import { createDefaultConfig, writeConfig } from "../lib/config.js";
import { getChain, MAINNET_CHAINS, TESTNET_CHAINS } from "../lib/chains.js";
import type { ExtensionModel } from "../types/index.js";

const MODEL_DESC: Record<ExtensionModel, string> = {
  "yield-to-one":
    "Treasury Model — All yield streams to a single wallet. Best for x402/agent use cases.",
  "yield-fee":
    "User Yield Model — Yield distributed to all holders minus a fee. Best for DeFi.",
  "earner-manager":
    "Institutional Model — Whitelist-based yield distribution. Best for permissioned use.",
};

export const initCommand = new Command("init")
  .description("Scaffold a new M0 Extension project")
  .argument("<name>", "Project name (e.g., myUSD)")
  .option("-m, --model <model>", "Extension model", "yield-to-one")
  .option("-c, --chain <chain>", "Target chain", "base")
  .option("--invite <code>", "BD pre-approval invite code")
  .option("-y, --yes", "Skip prompts, use defaults")
  .action(async (name: string, opts) => {
    log.header(`Initializing M0 Extension: ${name}`);

    const projectDir = path.resolve(process.cwd(), name);
    if (fs.existsSync(projectDir)) {
      log.error(`Directory '${name}' already exists.`);
      process.exit(1);
    }

    let model: ExtensionModel = opts.model;
    let chain: string = opts.chain;
    let symbol: string = name.toUpperCase();

    if (!opts.yes) {
      model = (await select({
        message: "Select Extension model:",
        choices: (Object.entries(MODEL_DESC) as [ExtensionModel, string][]).map(
          ([value, desc]) => ({ name: `${value} — ${desc}`, value })
        ),
        default: model,
      })) as ExtensionModel;

      chain = await select({
        message: "Target chain:",
        choices: [
          ...MAINNET_CHAINS.map((c) => ({
            name: `${getChain(c).name} (mainnet)`,
            value: c,
          })),
          ...TESTNET_CHAINS.map((c) => ({
            name: `${getChain(c).name} (testnet)`,
            value: c,
          })),
        ],
        default: chain,
      });

      symbol = await input({
        message: "Token symbol:",
        default: symbol,
        validate: (v) => (v.length > 0 && v.length <= 10 ? true : "1-10 chars"),
      });
    }

    const chainConfig = getChain(chain);
    const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

    log.step(1, "Creating project directory...");
    for (const d of ["src", "script", "test", "lib", ".m0"]) {
      fs.mkdirSync(path.join(projectDir, d), { recursive: true });
    }

    log.step(2, "Writing config...");
    writeConfig(
      createDefaultConfig(name, symbol, {
        model,
        chain,
        chainId: chainConfig.chainId,
        inviteCode: opts.invite ?? null,
      }),
      projectDir
    );

    log.step(3, "Generating Extension contract...");
    const solName = cap(name);
    let sol: string;

    if (model === "yield-to-one") {
      sol = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { MYieldToOne } from "m0-extensions/MYieldToOne.sol";

/// @title ${solName}
/// @notice M0 Extension (Treasury Model) — All yield streams to a single treasury wallet.
contract ${solName} is MYieldToOne {
    function initialize(
        string memory name_,
        string memory symbol_,
        address admin_,
        address yieldRecipient_,
        address blacklistAdmin_
    ) external initializer {
        __MYieldToOne_init(name_, symbol_, admin_, yieldRecipient_, blacklistAdmin_);
    }
}
`;
    } else if (model === "yield-fee") {
      sol = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { MYieldFee } from "m0-extensions/MYieldFee.sol";

/// @title ${solName}
/// @notice M0 Extension (User Yield Model) — Yield distributed to holders minus fee.
contract ${solName} is MYieldFee {
    function initialize(
        string memory name_,
        string memory symbol_,
        address admin_,
        uint16 feeRate_
    ) external initializer {
        __MYieldFee_init(name_, symbol_, admin_, feeRate_);
    }
}
`;
    } else {
      sol = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { MEarnerManager } from "m0-extensions/MEarnerManager.sol";

/// @title ${solName}
/// @notice M0 Extension (Institutional Model) — Whitelist-based yield distribution.
contract ${solName} is MEarnerManager {
    function initialize(
        string memory name_,
        string memory symbol_,
        address admin_
    ) external initializer {
        __MEarnerManager_init(name_, symbol_, admin_);
    }
}
`;
    }
    fs.writeFileSync(path.join(projectDir, "src", `${solName}.sol`), sol);

    log.step(4, "Generating deploy script...");
    fs.writeFileSync(
      path.join(projectDir, "script", `Deploy${solName}.s.sol`),
      `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Script.sol";
import { ${solName} } from "../src/${solName}.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

contract Deploy${solName} is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address admin = vm.envAddress("ADMIN_ADDRESS");
        address treasury = vm.envAddress("TREASURY_ADDRESS");
        address blacklistAdmin = vm.envOr("BLACKLIST_ADMIN", admin);

        vm.startBroadcast(deployerPrivateKey);

        ${solName} implementation = new ${solName}();
        bytes memory initData = abi.encodeWithSelector(
            ${solName}.initialize.selector, "${name}", "${symbol}", admin, treasury, blacklistAdmin
        );
        ERC1967Proxy proxy = new ERC1967Proxy(address(implementation), initData);

        vm.stopBroadcast();

        console.log("Implementation:", address(implementation));
        console.log("Proxy:", address(proxy));
    }
}
`
    );

    fs.writeFileSync(
      path.join(projectDir, "foundry.toml"),
      `[profile.default]
src = "src"
out = "out"
libs = ["lib"]
solc = "0.8.26"
optimizer = true
optimizer_runs = 200
`
    );

    fs.writeFileSync(
      path.join(projectDir, ".env.example"),
      `PRIVATE_KEY=0x
ADMIN_ADDRESS=0x
TREASURY_ADDRESS=0x
MAINNET_RPC_URL=
BASE_RPC_URL=https://mainnet.base.org
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
ETHERSCAN_API_KEY=
BASESCAN_API_KEY=
`
    );

    fs.writeFileSync(
      path.join(projectDir, ".gitignore"),
      `.env\nout/\ncache/\nbroadcast/\nnode_modules/\n.m0/config.json\n`
    );

    fs.writeFileSync(
      path.join(projectDir, "README.md"),
      `# ${name} (${symbol})\n\nM0 Extension stablecoin. Model: ${model}. Chain: ${chain}.\n\n## Quick Start\n\n\`\`\`bash\nforge install\ncp .env.example .env\nm0 configure\nm0 deploy --network base-sepolia\nm0 status\n\`\`\`\n`
    );

    console.log();
    log.success(`Project ${chalk.bold(name)} created!`);
    log.box([
      `${chalk.bold(name)} (${symbol})`,
      `Model: ${model}`,
      `Chain: ${chainConfig.name}`,
      ``,
      `Next steps:`,
      `  cd ${name}`,
      `  cp .env.example .env`,
      `  m0 configure`,
      `  m0 deploy --network ${chainConfig.isTestnet ? chain : "base-sepolia"}`,
    ]);
  });
