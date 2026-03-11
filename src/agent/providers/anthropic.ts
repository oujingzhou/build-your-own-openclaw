/**
 * Chapter 5 - Anthropic Provider
 *
 * Connects to the Anthropic API (Claude models).
 * Supports tool use via Anthropic's native tool calling.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { LLMProvider, ChatRequest, ChatResponse, AgentTool, ToolCall } from "./types.js";

export function createAnthropicProvider(
  apiKey: string,
  model: string,
  maxTokens: number,
  temperature: number
): LLMProvider {
  const client = new Anthropic({ apiKey });

  return {
    name: "anthropic",
    model,

    async chat(request: ChatRequest): Promise<ChatResponse> {
      const messages = request.messages
        .filter((m) => m.role !== "system")
        .map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }));

      if (messages.length === 0 || messages[0].role !== "user") {
        throw new Error("Conversation must start with a user message");
      }

      const tools: Anthropic.Tool[] = (request.tools ?? []).map(t => ({
        name: t.name,
        description: t.description,
        input_schema: (Object.keys(t.parameters).length > 0
          ? t.parameters
          : { type: "object", properties: {} }) as Anthropic.Tool.InputSchema,
      }));

      const response = await client.messages.create({
        model,
        max_tokens: maxTokens,
        temperature,
        system: request.systemPrompt,
        messages,
        ...(tools.length > 0 ? { tools } : {}),
      });

      const textBlocks = response.content.filter((b) => b.type === "text");
      const toolBlocks = response.content.filter((b) => b.type === "tool_use");

      const toolCalls: ToolCall[] = toolBlocks.map((b) => ({
        id: (b as { id: string }).id,
        function: {
          name: (b as { name: string }).name,
          arguments: JSON.stringify((b as { input: unknown }).input),
        },
      }));

      return {
        content: textBlocks.map((b) => (b as { text: string }).text).join("\n") || null,
        toolCalls,
        finishReason: toolCalls.length > 0 ? "tool_calls"
          : response.stop_reason === "max_tokens" ? "length"
          : "stop",
      };
    },
  };
}
