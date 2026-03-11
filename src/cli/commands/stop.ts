/**
 * Stop Command
 *
 * Stops a running MyClaw gateway by reading its PID file and sending SIGTERM.
 */

import type { Command } from "commander";
import fs from "node:fs";
import chalk from "chalk";
import { getPidPath } from "./gateway.js";

export function registerStopCommand(program: Command): void {
  program
    .command("stop")
    .description("Stop the running MyClaw gateway")
    .action(async () => {
      const pidPath = getPidPath();

      if (!fs.existsSync(pidPath)) {
        console.log(chalk.yellow("No running gateway found."));
        return;
      }

      const pid = parseInt(fs.readFileSync(pidPath, "utf-8").trim(), 10);

      if (isNaN(pid)) {
        console.log(chalk.red("Invalid PID file. Removing it."));
        fs.unlinkSync(pidPath);
        return;
      }

      try {
        process.kill(pid, "SIGTERM");
        console.log(chalk.green(`Gateway (PID ${pid}) stopped.`));
      } catch (err: any) {
        if (err.code === "ESRCH") {
          console.log(
            chalk.yellow(
              `Gateway process (PID ${pid}) not found. Cleaning up stale PID file.`
            )
          );
          fs.unlinkSync(pidPath);
        } else {
          console.error(
            chalk.red(`Failed to stop gateway: ${err.message}`)
          );
        }
      }
    });
}
