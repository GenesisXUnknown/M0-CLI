#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
import { initCommand } from "../src/commands/init.js";
import { configureCommand } from "../src/commands/configure.js";
import { deployCommand } from "../src/commands/deploy.js";
import { statusCommand } from "../src/commands/status.js";
import { yieldCommand } from "../src/commands/yield.js";
import { governanceCommand } from "../src/commands/governance.js";
import { bridgeCommand } from "../src/commands/bridge.js";

const program = new Command();

program
  .name("m0")
  .description(
    chalk.bold("M0 CLI") +
      " — Developer toolkit for M0 Stablecoin Extensions + x402 Agent Payments"
  )
  .version("0.1.0");

program.addCommand(initCommand);
program.addCommand(configureCommand);
program.addCommand(deployCommand);
program.addCommand(statusCommand);
program.addCommand(yieldCommand);
program.addCommand(governanceCommand);
program.addCommand(bridgeCommand);

program.parse();
