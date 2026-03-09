import chalk from "chalk";

export const log = {
  info: (msg: string) => console.log(chalk.blue("ℹ"), msg),
  success: (msg: string) => console.log(chalk.green("✔"), msg),
  warn: (msg: string) => console.log(chalk.yellow("⚠"), msg),
  error: (msg: string) => console.log(chalk.red("✖"), msg),
  step: (n: number, msg: string) => console.log(chalk.cyan(`[${n}]`), msg),
  header: (msg: string) => {
    console.log();
    console.log(chalk.bold.white(msg));
    console.log(chalk.gray("─".repeat(msg.length)));
  },
  dim: (msg: string) => console.log(chalk.dim(msg)),
  label: (label: string, value: string) =>
    console.log(`  ${chalk.gray(label + ":")} ${value}`),
  box: (lines: string[]) => {
    const maxLen = Math.max(...lines.map((l) => l.length));
    const border = "─".repeat(maxLen + 4);
    console.log(chalk.gray(`┌${border}┐`));
    for (const line of lines) {
      console.log(
        chalk.gray("│") +
          `  ${line}${" ".repeat(maxLen - line.length)}  ` +
          chalk.gray("│")
      );
    }
    console.log(chalk.gray(`└${border}┘`));
  },
};
