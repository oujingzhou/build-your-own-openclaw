/**
 * Chapter 7 - Message Router
 *
 * Routes incoming messages to the appropriate agent based on routing rules.
 * Follows OpenClaw's hierarchical matching pattern:
 * 1. Exact channel match
 * 2. Wildcard (*) match
 * 3. Default provider
 *
 * Also intercepts /skill-name commands and routes them to skill handlers.
 */

import type { OpenClawConfig } from "../config/index.js";
import type { AgentRuntime } from "../agent/runtime.js";
import type { SkillEntry } from "../skills/workspace.js";
import { resolveSkillCommand, getSkillPrompt } from "../skills/workspace.js";

export interface RouteRequest {
  channelId: string;
  sessionId: string;
  text: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
}

export interface Router {
  route(request: RouteRequest): Promise<string>;
}

export interface RouterOptions {
  skills?: SkillEntry[];
}

/**
 * Create the message router
 */
export function createRouter(
  config: OpenClawConfig,
  agent: AgentRuntime,
  options?: RouterOptions
): Router {
  // Build routing table from config
  const rules = config.routing;
  const skills = options?.skills ?? [];

  return {
    async route(request: RouteRequest): Promise<string> {
      // Check for /skill-name commands
      if (request.text.startsWith("/")) {
        const resolved = resolveSkillCommand(request.text, skills);
        if (resolved) {
          const userText = resolved.args || request.text;
          const skillPrompt = getSkillPrompt(resolved.entry.skill);

          // Find provider for this channel
          const rule =
            rules.find((r) => r.channel === request.channelId) ??
            rules.find((r) => r.channel === "*");

          const providerId = rule
            ? (rule.agent === "default" ? config.defaultProvider : rule.agent)
            : config.defaultProvider;

          return agent.chatWithSkill({
            providerId,
            skillPrompt,
            messages: [
              ...request.history,
              { role: "user", content: userText },
            ],
          });
        }
      }

      // Find matching rule - exact match first, then wildcard
      const rule =
        rules.find((r) => r.channel === request.channelId) ??
        rules.find((r) => r.channel === "*");

      if (!rule) {
        throw new Error(
          `No routing rule found for channel '${request.channelId}'`
        );
      }

      // Find the provider for this route
      const providerId = rule.agent === "default"
        ? config.defaultProvider
        : rule.agent;

      const provider = config.providers.find((p) => p.id === providerId);
      if (!provider) {
        throw new Error(`Provider '${providerId}' not found in config`);
      }

      // Invoke the agent
      return agent.chat({
        providerId: provider.id,
        messages: [
          ...request.history,
          { role: "user", content: request.text },
        ],
      });
    },
  };
}
