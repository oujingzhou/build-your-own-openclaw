/**
 * Chapter 4 - Gateway Command
 *
 * Starts the WebSocket gateway server - the control plane for OpenClaw.
 */

import type { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { getContext } from "../program.js";
import { startGatewayServer } from "../../gateway/server.js";
import { getStateDir } from "../../config/index.js";
import { loadWorkspaceSkills, buildSkillsPrompt } from "../../skills/workspace.js";

function getPidPath(): string {
  return path.join(getStateDir(), "gateway.pid");
}

function writePid(): void {
  fs.writeFileSync(getPidPath(), String(process.pid), "utf-8");
}

function removePid(): void {
  try {
    fs.unlinkSync(getPidPath());
  } catch {}
}

export function registerGatewayCommand(program: Command): void {
  program
    .command("gateway")
    .description("Start the MyClaw gateway server")
    .option("-p, --port <port>", "Port to listen on")
    .option("-H, --host <host>", "Host to bind to")
    .action(async (opts, cmd) => {
      const ctx = getContext(cmd);
      const port = opts.port ? parseInt(opts.port, 10) : ctx.config.gateway.port;
      const host = opts.host ?? ctx.config.gateway.host;

      if (ctx.verbose) {
        console.log(`Starting gateway on ${host}:${port}...`);
      }

      writePid();
      process.on("exit", removePid);
      process.on("SIGINT", () => process.exit(0));
      process.on("SIGTERM", () => process.exit(0));

      // Load skills
      const skillDirs = [
        path.join(process.cwd(), "skills"),
        path.join(os.homedir(), ".myclaw", "skills"),
      ];
      const skills = loadWorkspaceSkills(skillDirs);
      const skillsPrompt = buildSkillsPrompt(skills);

      if (skills.length > 0 && ctx.verbose) {
        console.log(`[skills] Loaded ${skills.length} skill(s): ${skills.map((s) => s.skill.name).join(", ")}`);
      }

      await startGatewayServer({
        config: ctx.config,
        host,
        port,
        verbose: ctx.verbose,
        skills,
        skillsPrompt,
      });
    });
}

export { getPidPath };
