/**
 * Chapter 5 - OpenAI Provider
 *
 * Connects to OpenAI-compatible APIs (OpenAI, OpenRouter, etc).
 * Supports function calling / tool use.
 */

import OpenAI from "openai";
import type { LLMProvider, ChatRequest, ChatResponse, AgentTool, ChatMessage, ToolCall } from "./types.js";

export function createOpenAIProvider(
  apiKey: string,
  model: string,
  maxTokens: number,
  temperature: number,
  baseURL?: string
): LLMProvider {
  const isOpenRouter = baseURL?.includes("openrouter");

  // For standard OpenAI, use the SDK
  if (!isOpenRouter) {
    const client = new OpenAI({
      apiKey, baseURL, timeout: 60_000, maxRetries: 2,
    });

    return {
      name: "openai",
      model,
      async chat(request: ChatRequest): Promise<ChatResponse> {
        const messages = toMessages(request);
        const tools = toOpenAITools(request.tools);
        try {
          const response = await client.chat.completions.create({
            model, max_tokens: maxTokens, temperature,
            messages: messages as OpenAI.ChatCompletionMessageParam[],
            ...(tools.length > 0 ? { tools } : {}),
          });
          return parseOpenAIResponse(response);
        } catch (err: unknown) {
          throw formatError(err);
        }
      },
    };
  }

  // For OpenRouter, use native fetch
  return {
    name: "openrouter",
    model,
    async chat(request: ChatRequest): Promise<ChatResponse> {
      const messages = toMessages(request);
      const tools = toOpenAITools(request.tools);
      const url = `${baseURL}/chat/completions`;

      let lastError: Error | null = null;

      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const body: Record<string, unknown> = {
            model, max_tokens: maxTokens, temperature, messages,
          };
          if (tools.length > 0) {
            body.tools = tools;
          }

          const response = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${apiKey}`,
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(60_000),
          });

          if (!response.ok) {
            const text = await response.text();
            throw new Error(`HTTP ${response.status}: ${text}`);
          }

          const data = await response.json() as OpenRouterResponse;
          return parseOpenRouterResponse(data);

        } catch (err) {
          lastError = err as Error;
          if (attempt < 2) {
            await new Promise(r => setTimeout(r, (attempt + 1) * 1000));
            continue;
          }
        }
      }

      throw new Error(`LLM API error: ${lastError?.message ?? "Unknown error"}`);
    },
  };
}

// --- OpenAI message format helpers ---

function toMessages(request: ChatRequest): unknown[] {
  const messages: unknown[] = [];
  if (request.systemPrompt) {
    messages.push({ role: "system", content: request.systemPrompt });
  }
  for (const msg of request.messages) {
    if (msg.role === "system") continue;
    if (msg.role === "tool" && msg.tool_call_id) {
      messages.push({ role: "tool", content: msg.content, tool_call_id: msg.tool_call_id });
    } else if (msg.role === "assistant" && msg.tool_calls?.length) {
      messages.push({
        role: "assistant",
        content: msg.content || null,
        tool_calls: msg.tool_calls.map(tc => ({
          id: tc.id,
          type: "function",
          function: { name: tc.function.name, arguments: tc.function.arguments },
        })),
      });
    } else {
      messages.push({ role: msg.role, content: msg.content });
    }
  }
  return messages;
}

function toOpenAITools(tools?: AgentTool[]): OpenAI.ChatCompletionTool[] {
  if (!tools || tools.length === 0) return [];
  return tools.map(tool => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: Object.keys(tool.parameters).length > 0
        ? tool.parameters
        : { type: "object", properties: {} },
    },
  }));
}

function parseOpenAIResponse(response: OpenAI.ChatCompletion): ChatResponse {
  const choice = response.choices[0];
  const msg = choice?.message;
  const toolCalls: ToolCall[] = (msg?.tool_calls ?? []).map(tc => ({
    id: tc.id,
    function: { name: tc.function.name, arguments: tc.function.arguments },
  }));

  return {
    content: msg?.content ?? null,
    toolCalls,
    finishReason: toolCalls.length > 0 ? "tool_calls"
      : choice?.finish_reason === "length" ? "length"
      : "stop",
  };
}

// --- OpenRouter response parsing ---

interface OpenRouterResponse {
  choices?: Array<{
    finish_reason?: string;
    message?: {
      content?: string | null;
      reasoning?: string;
      tool_calls?: Array<{
        id: string;
        type: string;
        function: { name: string; arguments: string };
      }>;
    };
  }>;
}

function parseOpenRouterResponse(data: OpenRouterResponse): ChatResponse {
  const choice = data.choices?.[0];
  const msg = choice?.message;

  const toolCalls: ToolCall[] = (msg?.tool_calls ?? []).map(tc => ({
    id: tc.id,
    function: { name: tc.function.name, arguments: tc.function.arguments },
  }));

  const content = msg?.content ?? msg?.reasoning ?? null;

  return {
    content,
    toolCalls,
    finishReason: toolCalls.length > 0 ? "tool_calls"
      : choice?.finish_reason === "length" ? "length"
      : "stop",
  };
}

function formatError(err: unknown): Error {
  const error = err as Error & { status?: number; error?: { message?: string } };
  const detail = error.error?.message ?? error.message ?? "Unknown error";
  const status = error.status ? ` (HTTP ${error.status})` : "";
  return new Error(`LLM API error${status}: ${detail}`);
}
