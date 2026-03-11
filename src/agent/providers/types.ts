/**
 * Chapter 5 - LLM Provider Types
 *
 * Defines the interface that all LLM providers must implement.
 * Supports tool/function calling with a structured response type.
 */

export interface ChatMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolCall {
  id: string;
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export interface ChatResponse {
  content: string | null;
  toolCalls: ToolCall[];
  finishReason: "stop" | "tool_calls" | "length" | "error";
}

export interface ChatRequest {
  messages: ChatMessage[];
  systemPrompt?: string;
  tools?: AgentTool[];
}

export interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<string>;
}

export interface LLMProvider {
  /** Returns structured response with possible tool calls */
  chat(request: ChatRequest): Promise<ChatResponse>;
  readonly name: string;
  readonly model: string;
}
