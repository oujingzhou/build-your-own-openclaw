/**
 * Chapter 3 - Onboard Command
 *
 * Interactive setup wizard that creates the initial configuration.
 */

import type { Command } from "commander";
import readline from "node:readline";
import chalk from "chalk";
import {
  createDefaultConfig,
  writeConfig,
  getConfigPath,
  ensureStateDir,
} from "../../config/index.js";

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

export function registerOnboardCommand(program: Command): void {
  program
    .command("onboard")
    .description("Interactive setup wizard for MyClaw")
    .action(async () => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      console.log(chalk.bold.cyan("\n🦀 Welcome to MyClaw Setup!\n"));
      console.log("Let's configure your personal AI assistant.\n");

      const config = createDefaultConfig();

      // Step 1: Choose provider
      const providerType = await ask(
        rl,
        `LLM Provider ${chalk.dim("(openrouter/anthropic/openai)")} [openrouter]: `
      );
      if (providerType === "anthropic") {
        config.providers[0].type = "anthropic";
        config.providers[0].apiKeyEnv = "ANTHROPIC_API_KEY";
        config.providers[0].model = "claude-sonnet-4-6";
      } else if (providerType === "openai") {
        config.providers[0].type = "openai";
        config.providers[0].apiKeyEnv = "OPENAI_API_KEY";
        config.providers[0].model = "gpt-4o";
      }

      // Step 2: API Key
      const apiKeyEnvName = config.providers[0].apiKeyEnv!;
      const existingKey = process.env[apiKeyEnvName];
      if (existingKey) {
        console.log(
          chalk.green(`✓ Found ${apiKeyEnvName} in environment`)
        );
      } else {
        const apiKey = await ask(
          rl,
          `Enter your API key ${chalk.dim(`(or set ${apiKeyEnvName} env var)`)}: `
        );
        if (apiKey) {
          config.providers[0].apiKey = apiKey;
          config.providers[0].apiKeyEnv = undefined;
        }
      }

      // Step 3: Model
      const model = await ask(
        rl,
        `Model ${chalk.dim(`[${config.providers[0].model}]`)}: `
      );
      if (model) {
        config.providers[0].model = model;
      }

      // Step 4: Gateway port
      const port = await ask(
        rl,
        `Gateway port ${chalk.dim("[18789]")}: `
      );
      if (port) {
        config.gateway.port = parseInt(port, 10);
      }

      // Step 5: Bot name
      const name = await ask(
        rl,
        `Bot name ${chalk.dim("[MyClaw]")}: `
      );
      if (name) {
        config.agent.name = name;
      }

      // Step 6: Feishu (optional)
      const useFeishu = await ask(
        rl,
        `\nEnable Feishu channel? ${chalk.dim("(y/N)")}: `
      );
      if (useFeishu.toLowerCase() === "y") {
        const appId = await ask(rl, `Feishu App ID: `);
        const appSecret = await ask(rl, `Feishu App Secret: `);
        config.channels.push({
          id: "feishu",
          type: "feishu",
          enabled: true,
          appId: appId || undefined,
          appIdEnv: appId ? undefined : "FEISHU_APP_ID",
          appSecret: appSecret || undefined,
          appSecretEnv: appSecret ? undefined : "FEISHU_APP_SECRET",
        });
      }

      // Step 7: Telegram (optional)
      const useTelegram = await ask(
        rl,
        `\nEnable Telegram channel? ${chalk.dim("(y/N)")}: `
      );
      if (useTelegram.toLowerCase() === "y") {
        const botToken = await ask(rl, `Telegram Bot Token: `);
        config.channels.push({
          id: "telegram",
          type: "telegram",
          enabled: true,
          botToken: botToken || undefined,
          botTokenEnv: botToken ? undefined : "TELEGRAM_BOT_TOKEN",
        });
      }

      // Write config
      ensureStateDir();
      writeConfig(config);

      console.log(chalk.green(`\n✓ Configuration saved to ${getConfigPath()}`));
      console.log(`\nNext steps:`);
      console.log(`  ${chalk.cyan("npx myclaw agent")}    - Start chatting`);
      console.log(`  ${chalk.cyan("npx myclaw gateway")}  - Start the gateway server`);
      console.log(`  ${chalk.cyan("npx myclaw doctor")}   - Run diagnostics\n`);

      rl.close();
    });
}
