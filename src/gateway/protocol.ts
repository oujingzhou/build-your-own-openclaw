/**
 * Chapter 4 - Gateway Protocol
 *
 * Defines the WebSocket message protocol for the gateway.
 * All communication between clients, channels, and the agent
 * flows through these message types.
 */

// --- Inbound Messages (Client → Gateway) ---

export interface AuthMessage {
  type: "auth";
  token: string;
}

export interface ChatMessage {
  type: "chat";
  channelId: string;
  sessionId?: string;
  text: string;
  metadata?: Record<string, unknown>;
}

export interface ChannelSendMessage {
  type: "channel.send";
  channelId: string;
  text: string;
}

export interface PingMessage {
  type: "ping";
}

export interface StatusRequest {
  type: "status";
}

export interface ToolResultMessage {
  type: "tool.result";
  toolCallId: string;
  result: string;
  approved: boolean;
}

// --- Outbound Messages (Gateway → Client) ---

export interface AuthResultMessage {
  type: "auth.result";
  success: boolean;
  error?: string;
}

export interface ChatResponseMessage {
  type: "chat.response";
  channelId: string;
  sessionId: string;
  text: string;
  done: boolean;
}

export interface ChatStreamMessage {
  type: "chat.stream";
  channelId: string;
  sessionId: string;
  delta: string;
}

export interface PongMessage {
  type: "pong";
}

export interface StatusResponse {
  type: "status.response";
  channels: Array<{
    id: string;
    type: string;
    connected: boolean;
  }>;
  sessions: number;
  uptime: number;
}

export interface ErrorMessage {
  type: "error";
  code: string;
  message: string;
}

export interface ToolCallMessage {
  type: "tool.call";
  toolCallId: string;
  name: string;
  args: Record<string, unknown>;
  requiresApproval: boolean;
}

// --- Union Types ---

export type GatewayMessage =
  | AuthMessage
  | ChatMessage
  | ChannelSendMessage
  | PingMessage
  | StatusRequest
  | ToolResultMessage;

export type GatewayResponse =
  | AuthResultMessage
  | ChatResponseMessage
  | ChatStreamMessage
  | PongMessage
  | StatusResponse
  | ErrorMessage
  | ToolCallMessage;

// --- Session ---

export interface Session {
  id: string;
  channelId: string;
  createdAt: number;
  lastActiveAt: number;
  history: Array<{ role: "user" | "assistant"; content: string }>;
}
