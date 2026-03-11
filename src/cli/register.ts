/**
 * Chapter 2 - CLI Command Registration
 *
 * Registers all CLI commands onto the program.
 * Following OpenClaw's pattern, commands are registered lazily.
 */

import type { Command } from "commander";
import { registerGatewayCommand } from "./commands/gateway.js";
import { registerAgentCommand } from "./commands/agent.js";
import { registerOnboardCommand } from "./commands/onboard.js";
import { registerDoctorCommand } from "./commands/doctor.js";
import { registerMessageCommand } from "./commands/message.js";
import { registerStopCommand } from "./commands/stop.js";

export function registerAllCommands(program: Command): void {
  registerGatewayCommand(program);
  registerAgentCommand(program);
  registerOnboardCommand(program);
  registerDoctorCommand(program);
  registerMessageCommand(program);
  registerStopCommand(program);
}
