/**
 * Chapter 2 - CLI Program Builder
 *
 * Uses Commander.js to build the CLI interface, following OpenClaw's
 * pattern of lazy command registration and dependency injection
 * via a program context object.
 */

import { Command } from "commander";
import { loadConfig, type OpenClawConfig } from "../config/index.js";

/**
 * Program context - shared state passed to all commands.
 * This is OpenClaw's dependency injection mechanism.
 */
export interface ProgramContext {
  config: OpenClawConfig;
  verbose: boolean;
}

/**
 * Build and return the CLI program
 */
export function buildProgram(): Command {
  const program = new Command();

  program
    .name("myclaw")
    .description("MyClaw - Your personal AI assistant gateway")
    .version("1.0.0")
    .option("-v, --verbose", "Enable verbose logging", false);

  // Pre-action hook: load config and create context before any command runs
  program.hook("preAction", (thisCommand) => {
    const opts = thisCommand.opts();
    const config = loadConfig();
    // Attach context to the command for subcommands to access
    thisCommand.setOptionValue("_ctx", {
      config,
      verbose: opts.verbose ?? false,
    } satisfies ProgramContext);
  });

  return program;
}

/**
 * Helper to extract ProgramContext from a command
 */
export function getContext(cmd: Command): ProgramContext {
  const root = cmd.parent ?? cmd;
  return root.opts()._ctx as ProgramContext;
}
