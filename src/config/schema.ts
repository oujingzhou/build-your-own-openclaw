/**
 * Chapter 3 - Configuration Schema
 *
 * Defines the shape of OpenClaw's configuration using Zod.
 * The config file (~/.myclaw/myclaw.yaml) controls all behavior:
 * which channels are active, which LLM to use, routing rules, etc.
 */

import { z } from "zod";

// --- LLM Provider Configuration ---

export const ProviderConfigSchema = z.object({
  id: z.string().describe("Unique provider identifier"),
  type: z.enum(["anthropic", "openai", "openrouter"]).describe("LLM provider type"),
  apiKey: z.string().optional().describe("API key (or use env var)"),
  apiKeyEnv: z.string().optional().describe("Environment variable name for API key"),
  baseUrl: z.string().optional().describe("Custom API base URL (for OpenRouter, etc.)"),
  model: z.string().describe("Model name to use"),
  maxTokens: z.number().default(4096).describe("Max tokens per response"),
  temperature: z.number().default(0.7).describe("Sampling temperature"),
  systemPrompt: z.string().optional().describe("System prompt for the agent"),
});

export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

// --- Channel Configuration ---

export const ChannelConfigSchema = z.object({
  id: z.string().describe("Unique channel identifier"),
  type: z.enum(["terminal", "feishu", "telegram"]).describe("Channel type"),
  enabled: z.boolean().default(true).describe("Whether the channel is active"),
  // Feishu-specific
  appId: z.string().optional().describe("Feishu App ID"),
  appIdEnv: z.string().optional().describe("Env var for Feishu App ID"),
  appSecret: z.string().optional().describe("Feishu App Secret"),
  appSecretEnv: z.string().optional().describe("Env var for Feishu App Secret"),
  // Telegram-specific
  botToken: z.string().optional().describe("Telegram Bot Token"),
  botTokenEnv: z.string().optional().describe("Env var for Telegram Bot Token"),
  allowedChatIds: z.array(z.number()).optional().describe("Allowed Telegram chat IDs (whitelist)"),
  // Common
  greeting: z.string().optional().describe("Greeting message on connect"),
});

export type ChannelConfig = z.infer<typeof ChannelConfigSchema>;

// --- Routing Rule ---

export const RouteRuleSchema = z.object({
  channel: z.string().describe("Channel ID pattern (* for all)"),
  agent: z.string().default("default").describe("Agent/provider ID to route to"),
});

export type RouteRule = z.infer<typeof RouteRuleSchema>;

// --- Plugin Configuration ---

export const PluginConfigSchema = z.object({
  id: z.string().describe("Plugin identifier"),
  enabled: z.boolean().default(true),
  config: z.record(z.unknown()).optional().describe("Plugin-specific config"),
});

export type PluginConfig = z.infer<typeof PluginConfigSchema>;

// --- Top-Level Configuration ---

export const OpenClawConfigSchema = z.object({
  // Gateway settings
  gateway: z
    .object({
      host: z.string().default("127.0.0.1"),
      port: z.number().default(18789),
      token: z.string().optional().describe("Gateway auth token"),
      tokenEnv: z.string().optional().describe("Env var for gateway token"),
    })
    .default({}),

  // LLM providers
  providers: z.array(ProviderConfigSchema).min(1).describe("At least one LLM provider"),

  // Default provider
  defaultProvider: z.string().describe("ID of the default provider"),

  // Channels
  channels: z.array(ChannelConfigSchema).default([]).describe("Messaging channels"),

  // Routing rules
  routing: z.array(RouteRuleSchema).default([{ channel: "*", agent: "default" }]),

  // Plugins
  plugins: z.array(PluginConfigSchema).default([]),

  // Agent settings
  agent: z
    .object({
      name: z.string().default("MyClaw"),
      maxHistoryMessages: z.number().default(50),
      toolApproval: z.boolean().default(true).describe("Require approval for tool execution"),
    })
    .default({}),
});

export type OpenClawConfig = z.infer<typeof OpenClawConfigSchema>;

// --- Default Configuration ---

export function createDefaultConfig(): OpenClawConfig {
  return {
    gateway: {
      host: "127.0.0.1",
      port: 18789,
    },
    providers: [
      {
        id: "default",
        type: "openrouter",
        apiKeyEnv: "OPENROUTER_API_KEY",
        model: "stepfun/step-3.5-flash:free",
        maxTokens: 4096,
        temperature: 0.7,
      },
    ],
    defaultProvider: "default",
    channels: [
      {
        id: "terminal",
        type: "terminal",
        enabled: true,
        greeting: "Hello! I'm MyClaw, your AI assistant. Type /help for commands.",
      },
    ],
    routing: [{ channel: "*", agent: "default" }],
    plugins: [],
    agent: {
      name: "MyClaw",
      maxHistoryMessages: 50,
      toolApproval: true,
    },
  };
}
