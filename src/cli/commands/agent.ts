/**
 * Chapter 5 - Agent Command
 *
 * Starts an interactive agent session in the terminal.
 * Uses pi-coding-agent's InteractiveMode for a full TUI experience:
 * multi-line editor, markdown rendering, streaming output, tool display.
 */

import type { Command } from "commander";
import { getContext } from "../program.js";
import {
  InteractiveMode,
  createAgentSession,
  SessionManager,
} from "@mariozechner/pi-coding-agent";
import { createAuthStorage, createModelRegistry, resolveModel } from "../../agent/model.js";
import { buildSystemPrompt } from "../../agent/runtime.js";

export function registerAgentCommand(program: Command): void {
  program
    .command("agent")
    .description("Start an interactive agent chat session")
    .option("-m, --model <model>", "Override the model to use")
    .option("-p, --provider <id>", "Provider ID to use")
    .action(async (opts, cmd) => {
      const ctx = getContext(cmd);
      const config = ctx.config;

      // 1. Resolve provider config
      const providerId = opts.provider ?? config.defaultProvider;
      const providerConfig = config.providers.find((p) => p.id === providerId);
      if (!providerConfig) {
        throw new Error(
          `Provider '${providerId}' not found in config. ` +
            `Available: ${config.providers.map((p: any) => p.id).join(", ")}`,
        );
      }

      // 2. Set up auth & model from MyClaw config
      const authStorage = createAuthStorage(config.providers);
      const modelRegistry = createModelRegistry(authStorage);
      const model = resolveModel(providerConfig, modelRegistry, opts.model);

      // 3. Create AgentSession (pi-coding-agent handles skills, tools, etc.)
      const sessionManager = SessionManager.inMemory(process.cwd());
      const { session, modelFallbackMessage } = await createAgentSession({
        cwd: process.cwd(),
        authStorage,
        modelRegistry,
        model,
        sessionManager,
      });

      // 4. Set MyClaw system prompt
      session.agent.setSystemPrompt(buildSystemPrompt(config, providerConfig));

      // 5. Launch InteractiveMode TUI
      const mode = new InteractiveMode(session, { modelFallbackMessage });
      await mode.run();
    });
}
