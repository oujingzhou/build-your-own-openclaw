/**
 * Chapter 9 - Plugin System
 *
 * OpenClaw's plugin system allows extending functionality.
 * Plugins can register tools, channels, commands, and HTTP handlers.
 */

import type { Channel } from "../channels/transport.js";

/**
 * Tool definition for plugins to register.
 */
export interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<string>;
}

/**
 * Plugin interface - what every plugin must implement
 */
export interface Plugin {
  /** Unique plugin identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Plugin version */
  version: string;
  /** Called when the plugin is loaded */
  onLoad(ctx: PluginContext): Promise<void>;
  /** Called when the plugin is unloaded */
  onUnload?(): Promise<void>;
}

/**
 * Plugin context - provides access to OpenClaw's subsystems
 */
export interface PluginContext {
  /** Register a tool for the agent to use */
  registerTool(tool: AgentTool): void;
  /** Register a channel */
  registerChannel(channel: Channel): void;
  /** Get plugin-specific config */
  getConfig(): Record<string, unknown>;
  /** Log with plugin context */
  log(message: string): void;
}

/**
 * Plugin Registry - manages plugin lifecycle
 */
export class PluginRegistry {
  private plugins = new Map<string, Plugin>();
  private tools: AgentTool[] = [];
  private channels: Channel[] = [];

  /**
   * Register a plugin
   */
  async register(plugin: Plugin, config?: Record<string, unknown>): Promise<void> {
    if (this.plugins.has(plugin.id)) {
      throw new Error(`Plugin '${plugin.id}' is already registered`);
    }

    const ctx: PluginContext = {
      registerTool: (tool) => {
        this.tools.push(tool);
      },
      registerChannel: (channel) => {
        this.channels.push(channel);
      },
      getConfig: () => config ?? {},
      log: (message) => {
        console.log(`[plugin:${plugin.id}] ${message}`);
      },
    };

    await plugin.onLoad(ctx);
    this.plugins.set(plugin.id, plugin);
  }

  /**
   * Unregister a plugin
   */
  async unregister(id: string): Promise<void> {
    const plugin = this.plugins.get(id);
    if (plugin?.onUnload) {
      await plugin.onUnload();
    }
    this.plugins.delete(id);
  }

  /**
   * Get all registered tools from plugins
   */
  getTools(): AgentTool[] {
    return this.tools;
  }

  /**
   * Get all registered channels from plugins
   */
  getChannels(): Channel[] {
    return this.channels;
  }

  /**
   * Get all registered plugins
   */
  getAll(): Plugin[] {
    return Array.from(this.plugins.values());
  }
}

// --- Example Plugin: Web Search ---

/**
 * Example plugin that adds a web search tool.
 * In the full OpenClaw, this would use a real search API.
 */
export const webSearchPlugin: Plugin = {
  id: "web-search",
  name: "Web Search",
  version: "1.0.0",

  async onLoad(ctx: PluginContext): Promise<void> {
    ctx.registerTool({
      name: "web_search",
      description: "Search the web for information (demo - returns mock results)",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
        },
        required: ["query"],
      },
      execute: async (args) => {
        const query = args.query as string;
        // In a real implementation, this would call a search API
        return JSON.stringify({
          query,
          results: [
            {
              title: `Search result for: ${query}`,
              snippet: "This is a demo search result. In a full MyClaw setup, this would use a real search API.",
              url: "https://example.com",
            },
          ],
        });
      },
    });

    ctx.log("Web search tool registered");
  },
};
