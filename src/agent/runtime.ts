/**
 * Chapter 5 - Agent Runtime
 *
 * The agent runtime manages LLM interactions with a proper agent loop:
 * 1. Send messages to LLM
 * 2. If LLM returns tool_calls → execute tools → feed results back → goto 1
 * 3. If LLM returns text → done, return to user
 *
 * This is the brain of OpenClaw.
 */

import chalk from "chalk";
import type { OpenClawConfig, ProviderConfig } from "../config/index.js";
import { resolveSecret } from "../config/index.js";
import { createAnthropicProvider } from "./providers/anthropic.js";
import { createOpenAIProvider } from "./providers/openai.js";
import type { LLMProvider, ChatRequest, ChatMessage, AgentTool } from "./providers/types.js";
import { getBuiltinTools } from "./tools.js";

const MAX_TOOL_ROUNDS = 10; // prevent infinite loops

export interface AgentRuntime {
  chat(request: { providerId?: string; messages: ChatMessage[] }): Promise<string>;
  registerTool(tool: AgentTool): void;
}

export interface AgentRuntimeOptions {
  providerId?: string;
  modelOverride?: string;
}

/**
 * Create the agent runtime with configured providers and an agent loop
 */
export function createAgentRuntime(
  config: OpenClawConfig,
  options?: AgentRuntimeOptions
): AgentRuntime {
  const providers = new Map<string, LLMProvider>();
  const tools: AgentTool[] = [...getBuiltinTools()];
  const toolMap = new Map<string, AgentTool>();

  // Index tools by name
  function rebuildToolMap() {
    toolMap.clear();
    for (const tool of tools) {
      toolMap.set(tool.name, tool);
    }
  }
  rebuildToolMap();

  for (const providerConfig of config.providers) {
    const provider = createProvider(providerConfig, options?.modelOverride);
    if (provider) {
      providers.set(providerConfig.id, provider);
    }
  }

  return {
    async chat(request): Promise<string> {
      const providerId = request.providerId ?? options?.providerId ?? config.defaultProvider;
      const provider = providers.get(providerId);

      if (!provider) {
        throw new Error(
          `Provider '${providerId}' not available. ` +
          `Check your API key and config. Available: ${Array.from(providers.keys()).join(", ")}`
        );
      }

      const systemPrompt = buildSystemPrompt(config);

      // Agent loop: keep calling LLM until we get a text response
      const messages: ChatMessage[] = [...request.messages];
      let textParts: string[] = [];

      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const response = await provider.chat({
          messages,
          systemPrompt,
          tools: tools.length > 0 ? tools : undefined,
        });

        // Collect any text content
        if (response.content) {
          textParts.push(response.content);
        }

        // No tool calls → we're done
        if (response.toolCalls.length === 0 || response.finishReason !== "tool_calls") {
          break;
        }

        // Tool calls! Execute each one
        // First, add assistant message with tool_calls to history
        messages.push({
          role: "assistant",
          content: response.content ?? "",
          tool_calls: response.toolCalls,
        });

        // Reset text parts for next round (tool results will lead to a new response)
        textParts = [];

        for (const tc of response.toolCalls) {
          const result = await executeToolCall(tc, toolMap);
          messages.push({ role: "tool", content: result, tool_call_id: tc.id });
        }
      }

      return textParts.join("\n") || "(No response)";
    },

    registerTool(tool: AgentTool): void {
      tools.push(tool);
      rebuildToolMap();
    },
  };
}

function createProvider(
  config: ProviderConfig,
  modelOverride?: string
): LLMProvider | null {
  const apiKey = resolveSecret(config.apiKey, config.apiKeyEnv);
  if (!apiKey) {
    console.warn(`[agent] No API key for provider '${config.id}', skipping`);
    return null;
  }

  const model = modelOverride ?? config.model;

  switch (config.type) {
    case "anthropic":
      return createAnthropicProvider(apiKey, model, config.maxTokens, config.temperature);
    case "openai":
    case "openrouter":
      return createOpenAIProvider(
        apiKey, model, config.maxTokens, config.temperature,
        config.baseUrl ?? (config.type === "openrouter" ? "https://openrouter.ai/api/v1" : undefined)
      );
    default:
      console.warn(`[agent] Unknown provider type: ${config.type}`);
      return null;
  }
}

function buildSystemPrompt(config: OpenClawConfig): string {
  const parts = [
    `You are a personal assistant running inside MyClaw.`,
    ``,
    `## Tooling`,
    `Tool names are case-sensitive. Call tools exactly as listed.`,
    `- read: Read file contents (supports offset/limit for partial reads)`,
    `- write: Create or overwrite files (parent directories are created automatically)`,
    `- edit: Make precise edits to files (old_string → new_string, must be unique match)`,
    `- exec: Execute shell commands`,
    `- grep: Search file contents with regex patterns`,
    `- find: Find files by glob pattern`,
    `- ls: List directory contents`,
    ``,
    `## Guidelines`,
    `- Read files before editing them`,
    `- Prefer editing over writing when modifying existing files`,
    `- Always respond in the user's language`,
  ];

  const defaultProvider = config.providers.find((p) => p.id === config.defaultProvider);
  if (defaultProvider?.systemPrompt) {
    parts.push("", defaultProvider.systemPrompt);
  }

  return parts.join("\n");
}

async function executeToolCall(
  tc: { function: { name: string; arguments: string } },
  toolMap: Map<string, AgentTool>
): Promise<string> {
  const tool = toolMap.get(tc.function.name);
  if (!tool) {
    return `Error: Unknown tool '${tc.function.name}'`;
  }
  try {
    const args = JSON.parse(tc.function.arguments);
    console.log(chalk.dim(`  [tool] ${tc.function.name}(${tc.function.arguments})`));
    const result = await tool.execute(args);
    console.log(chalk.dim(`  [tool] → ${result.slice(0, 200)}${result.length > 200 ? "..." : ""}`));
    return result;
  } catch (err) {
    return `Error executing tool: ${(err as Error).message}`;
  }
}
