/**
 * Chapter 5 - Agent Command
 *
 * Starts an interactive agent session in the terminal.
 * This is the simplest way to chat with OpenClaw.
 */

import type { Command } from "commander";
import { getContext } from "../program.js";
import { createTerminalChannel } from "../../channels/terminal.js";
import { createAgentRuntime } from "../../agent/runtime.js";
import { createRouter } from "../../routing/router.js";

export function registerAgentCommand(program: Command): void {
  program
    .command("agent")
    .description("Start an interactive agent chat session")
    .option("-m, --model <model>", "Override the model to use")
    .option("-p, --provider <id>", "Provider ID to use")
    .action(async (opts, cmd) => {
      const ctx = getContext(cmd);

      // Create the agent runtime
      const agent = createAgentRuntime(ctx.config, {
        providerId: opts.provider,
        modelOverride: opts.model,
      });

      // Create the message router
      const router = createRouter(ctx.config, agent);

      // Create and start the terminal channel
      const terminal = createTerminalChannel(ctx.config, router);
      await terminal.start();
    });
}
