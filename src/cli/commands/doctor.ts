/**
 * Chapter 2 - Doctor Command
 *
 * Diagnostics command that checks the health of the OpenClaw installation.
 */

import type { Command } from "commander";
import fs from "node:fs";
import chalk from "chalk";
import { getContext } from "../program.js";
import { getConfigPath, getStateDir, resolveSecret } from "../../config/index.js";

export function registerDoctorCommand(program: Command): void {
  program
    .command("doctor")
    .description("Run diagnostics on your MyClaw installation")
    .action(async (_opts, cmd) => {
      const ctx = getContext(cmd);
      let allOk = true;

      console.log(chalk.bold("\n🩺 MyClaw Doctor\n"));

      // Check Node.js version
      const nodeVersion = process.versions.node;
      const major = parseInt(nodeVersion.split(".")[0], 10);
      if (major >= 20) {
        console.log(chalk.green(`  ✓ Node.js ${nodeVersion}`));
      } else {
        console.log(chalk.red(`  ✗ Node.js ${nodeVersion} (need >= 20)`));
        allOk = false;
      }

      // Check state directory
      if (fs.existsSync(getStateDir())) {
        console.log(chalk.green(`  ✓ State dir: ${getStateDir()}`));
      } else {
        console.log(chalk.yellow(`  ⚠ State dir missing: ${getStateDir()}`));
        console.log(chalk.dim(`    Run 'myclaw onboard' to create it`));
      }

      // Check config file
      if (fs.existsSync(getConfigPath())) {
        console.log(chalk.green(`  ✓ Config: ${getConfigPath()}`));
      } else {
        console.log(chalk.yellow(`  ⚠ Config missing: ${getConfigPath()}`));
        console.log(chalk.dim(`    Run 'myclaw onboard' to create it`));
      }

      // Check providers
      for (const provider of ctx.config.providers) {
        const key = resolveSecret(provider.apiKey, provider.apiKeyEnv);
        if (key) {
          console.log(
            chalk.green(
              `  ✓ Provider '${provider.id}': ${provider.type}/${provider.model}`
            )
          );
        } else {
          console.log(
            chalk.red(
              `  ✗ Provider '${provider.id}': No API key found`
            )
          );
          console.log(
            chalk.dim(
              `    Set ${provider.apiKeyEnv ?? "apiKey in config"}`
            )
          );
          allOk = false;
        }
      }

      // Check channels
      for (const channel of ctx.config.channels) {
        if (!channel.enabled) {
          console.log(chalk.dim(`  - Channel '${channel.id}': disabled`));
          continue;
        }
        if (channel.type === "terminal") {
          console.log(chalk.green(`  ✓ Channel '${channel.id}': terminal`));
        } else if (channel.type === "feishu") {
          const appId = resolveSecret(channel.appId, channel.appIdEnv);
          const appSecret = resolveSecret(channel.appSecret, channel.appSecretEnv);
          if (appId && appSecret) {
            console.log(chalk.green(`  ✓ Channel '${channel.id}': feishu`));
          } else {
            const missing = !appId ? "App ID" : "App Secret";
            console.log(chalk.red(`  ✗ Channel '${channel.id}': No ${missing}`));
            allOk = false;
          }
        } else if (channel.type === "telegram") {
          const botToken = resolveSecret(channel.botToken, channel.botTokenEnv);
          if (botToken) {
            console.log(chalk.green(`  ✓ Channel '${channel.id}': telegram`));
          } else {
            console.log(chalk.red(`  ✗ Channel '${channel.id}': No Bot Token`));
            allOk = false;
          }
        }
      }

      // Summary
      console.log();
      if (allOk) {
        console.log(chalk.green.bold("  All checks passed! ✓\n"));
      } else {
        console.log(chalk.yellow.bold("  Some checks failed. See above for details.\n"));
      }
    });
}
