/**
 * Chapter 7 - Message Router
 *
 * Routes incoming messages to the appropriate agent based on routing rules.
 * Follows OpenClaw's hierarchical matching pattern:
 * 1. Exact channel match
 * 2. Wildcard (*) match
 * 3. Default provider
 */

import type { OpenClawConfig } from "../config/index.js";
import type { AgentRuntime } from "../agent/runtime.js";

export interface RouteRequest {
  channelId: string;
  sessionId: string;
  text: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
}

export interface Router {
  route(request: RouteRequest): Promise<string>;
}

/**
 * Create the message router
 */
export function createRouter(
  config: OpenClawConfig,
  agent: AgentRuntime
): Router {
  // Build routing table from config
  const rules = config.routing;

  return {
    async route(request: RouteRequest): Promise<string> {
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
