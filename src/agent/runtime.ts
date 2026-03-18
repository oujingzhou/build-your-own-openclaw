/**
 * Chapter 5 - Agent Runtime
 *
 * Thin wrapper around pi-coding-agent's createAgentSession.
 * The agent loop, tool execution, and LLM streaming are all handled
 * by pi-mono — MyClaw only needs to:
 * 1. Resolve the model from config
 * 2. Create a session
 * 3. Expose a chat() interface for router/channels
 *
 * Key insight: the pi-agent-core Agent maintains its own conversation state
 * internally. We simply call prompt() with each new user message and let
 * the agent accumulate history naturally. We do NOT inject MyClaw's
 * channel-level history — the agent IS the source of truth.
 */

import chalk from "chalk";
import {
  createAgentSession,
  SessionManager,
  type Skill,
} from "@mariozechner/pi-coding-agent";
import type { OpenClawConfig, ProviderConfig } from "../config/index.js";
import { createAuthStorage, createModelRegistry, resolveModel } from "./model.js";

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface AgentRuntime {
  chat(request: { providerId?: string; messages: ChatMessage[] }): Promise<string>;
  chatWithSkill(request: {
    providerId?: string;
    messages: ChatMessage[];
    skillPrompt: string;
  }): Promise<string>;
}

export interface AgentRuntimeOptions {
  providerId?: string;
  modelOverride?: string;
  skills?: Skill[];
  skillsPrompt?: string;
}

/**
 * Create the agent runtime backed by pi-coding-agent.
 */
export async function createAgentRuntime(
  config: OpenClawConfig,
  options?: AgentRuntimeOptions,
): Promise<AgentRuntime> {
  // 1. Set up auth & model registry from MyClaw config
  const authStorage = createAuthStorage(config.providers);
  const modelRegistry = createModelRegistry(authStorage);

  // 2. Resolve the primary model
  const providerId = options?.providerId ?? config.defaultProvider;
  const providerConfig = config.providers.find((p) => p.id === providerId);
  if (!providerConfig) {
    throw new Error(
      `Provider '${providerId}' not found in config. ` +
        `Available: ${config.providers.map((p) => p.id).join(", ")}`,
    );
  }

  const model = resolveModel(providerConfig, modelRegistry, options?.modelOverride);
  console.log(chalk.dim(`[agent] Using model: ${model.provider}/${model.id}`));

  // 3. Create the pi-coding-agent session
  const sessionManager = SessionManager.inMemory(process.cwd());

  const { session } = await createAgentSession({
    cwd: process.cwd(),
    authStorage,
    modelRegistry,
    model,
    sessionManager,
  });

  // 4. Build the base system prompt
  const baseSystemPrompt = buildSystemPrompt(config, providerConfig, options?.skillsPrompt);
  session.agent.setSystemPrompt(baseSystemPrompt);

  return {
    async chat(request): Promise<string> {
      // Extract only the latest user message text
      const lastMsg = request.messages[request.messages.length - 1];
      if (!lastMsg || lastMsg.role !== "user") {
        return "(No user message)";
      }

      return promptAndExtract(session.agent, lastMsg.content);
    },

    async chatWithSkill(request): Promise<string> {
      const lastMsg = request.messages[request.messages.length - 1];
      if (!lastMsg || lastMsg.role !== "user") {
        return "(No user message)";
      }

      // Temporarily override system prompt with skill prompt
      session.agent.setSystemPrompt(request.skillPrompt);
      try {
        return await promptAndExtract(session.agent, lastMsg.content);
      } finally {
        session.agent.setSystemPrompt(baseSystemPrompt);
      }
    },
  };
}

/**
 * Send a user message to the agent and extract the assistant's text response.
 *
 * The agent maintains its own conversation state. We just prompt with the
 * new user text — the agent appends it, runs the LLM + tool loop, and
 * we extract the text from the latest assistant response.
 *
 * pi-agent-core stores message content as block arrays:
 *   [{ type: "text", text: "..." }, { type: "thinking", ... }, ...]
 */
async function promptAndExtract(agent: any, userText: string): Promise<string> {
  const beforeCount = agent.state.messages.length;

  await agent.prompt(userText);
  await agent.waitForIdle();

  // Extract text from NEW messages only (skip the user message prompt() added)
  const allMessages = agent.state.messages;
  const newMessages = allMessages.slice(beforeCount);
  const textParts: string[] = [];

  for (const msg of newMessages) {
    if (msg.role !== "assistant") continue;
    extractText(msg.content, textParts);
  }

  return textParts.join("\n") || "(No response)";
}

/**
 * Extract text from pi-agent-core message content.
 * Content can be: string, or array of blocks [{type:"text", text:"..."}, ...]
 */
function extractText(content: unknown, out: string[]): void {
  if (typeof content === "string") {
    if (content.trim()) out.push(content);
    return;
  }
  if (!Array.isArray(content)) return;

  for (const block of content) {
    if (typeof block === "string") {
      if (block.trim()) out.push(block);
    } else if (block && typeof block === "object") {
      // Extract only "text" blocks, skip "thinking", "tool_use", etc.
      const b = block as { type?: string; text?: string };
      if (b.type === "text" && typeof b.text === "string" && b.text.trim()) {
        out.push(b.text);
      }
    }
  }
}

/**
 * Build the default system prompt.
 *
 * Partially aligned with OpenClaw's system prompt architecture:
 * - Identity + Tool Call Style + Safety + Skills
 * - Omits: Tooling list (pi-coding-agent manages), Memory, Messaging, Heartbeats, Runtime details
 */
export function buildSystemPrompt(
  config: OpenClawConfig,
  providerConfig: ProviderConfig,
  skillsPrompt?: string,
): string {
  const botName = config.agent?.name ?? "MyClaw";

  const lines = [
    `You are a personal assistant running inside ${botName}.`,
    "",
    "## Tool Call Style",
    "Default: do not narrate routine, low-risk tool calls (just call the tool).",
    "Narrate only when it helps: multi-step work, complex/challenging problems, sensitive actions (e.g., deletions), or when the user explicitly asks.",
    "Keep narration brief and value-dense; avoid repeating obvious steps.",
    "Use plain human language for narration unless in a technical context.",
    "",
    "## Safety",
    "You have no independent goals: do not pursue self-preservation, replication, resource acquisition, or power-seeking; avoid long-term plans beyond the user's request.",
    "Prioritize safety and human oversight over completion; if instructions conflict, pause and ask; comply with stop/pause/audit requests and never bypass safeguards.",
    "Do not manipulate or persuade anyone to expand access or disable safeguards. Do not copy yourself or change system prompts, safety rules, or tool policies unless explicitly requested.",
    "",
    "## Guidelines",
    "- Respond in the user's language",
    "- Be helpful, accurate, and concise",
    "- Ask for clarification when the request is ambiguous",
  ];

  // Skills section (aligned with OpenClaw's buildSkillsSection)
  const trimmedSkills = skillsPrompt?.trim();
  if (trimmedSkills) {
    lines.push(
      "",
      "## Skills",
      "Before replying: scan available skills and their descriptions.",
      "- If exactly one skill clearly applies: follow its instructions.",
      "- If multiple could apply: choose the most specific one.",
      "- If none clearly apply: proceed with normal assistance.",
      "",
      trimmedSkills
    );
  }

  if (providerConfig.systemPrompt?.trim()) {
    lines.push("", "## Custom Instructions", providerConfig.systemPrompt.trim());
  }

  return lines.join("\n");
}
