/**
 * Chapter 4 - Gateway Server
 *
 * The WebSocket gateway is OpenClaw's control plane.
 * It coordinates sessions, routes messages between channels and the agent,
 * and provides a management API.
 *
 * Architecture:
 *   Channels ←→ Gateway (WebSocket) ←→ Agent Runtime
 *                  ↑
 *            CLI / Web UI
 */

import { WebSocketServer, WebSocket } from "ws";
import http from "node:http";
import chalk from "chalk";
import type { OpenClawConfig } from "../config/index.js";
import { resolveSecret } from "../config/index.js";
import { SessionManager } from "./session.js";
import { createAgentRuntime } from "../agent/runtime.js";
import { createRouter } from "../routing/router.js";
import { createChannelManager } from "../channels/manager.js";
import type {
  GatewayMessage,
  GatewayResponse,
} from "./protocol.js";

export interface GatewayOptions {
  config: OpenClawConfig;
  host: string;
  port: number;
  verbose: boolean;
}

export async function startGatewayServer(opts: GatewayOptions): Promise<void> {
  const { config, host, port, verbose } = opts;
  const startTime = Date.now();

  // Initialize subsystems
  const sessions = new SessionManager(config.agent.maxHistoryMessages);
  const agent = createAgentRuntime(config);
  const router = createRouter(config, agent);

  // Create HTTP server for health checks
  const httpServer = http.createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", uptime: Date.now() - startTime }));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  // Create WebSocket server
  const wss = new WebSocketServer({ server: httpServer });

  // Gateway auth token
  const authToken = resolveSecret(config.gateway.token, config.gateway.tokenEnv);
  const authenticatedClients = new WeakSet<WebSocket>();

  // Track connected clients
  const clients = new Set<WebSocket>();

  wss.on("connection", (ws) => {
    clients.add(ws);
    const needsAuth = !!authToken;

    if (!needsAuth) {
      authenticatedClients.add(ws);
    }

    if (verbose) {
      console.log(chalk.dim(`[gateway] Client connected (total: ${clients.size})`));
    }

    ws.on("message", async (data) => {
      let msg: GatewayMessage;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        send(ws, { type: "error", code: "PARSE_ERROR", message: "Invalid JSON" });
        return;
      }

      // Handle auth
      if (msg.type === "auth") {
        if (msg.token === authToken) {
          authenticatedClients.add(ws);
          send(ws, { type: "auth.result", success: true });
        } else {
          send(ws, { type: "auth.result", success: false, error: "Invalid token" });
        }
        return;
      }

      // Check auth for all other messages
      if (needsAuth && !authenticatedClients.has(ws)) {
        send(ws, { type: "error", code: "UNAUTHORIZED", message: "Authenticate first" });
        return;
      }

      // Route message types
      switch (msg.type) {
        case "ping":
          send(ws, { type: "pong" });
          break;

        case "status": {
          const channelManager = createChannelManager(config);
          send(ws, {
            type: "status.response",
            channels: channelManager.getStatus(),
            sessions: sessions.size,
            uptime: Date.now() - startTime,
          });
          break;
        }

        case "chat": {
          const session = sessions.getOrCreate(msg.channelId, msg.sessionId);
          sessions.addMessage(session.id, "user", msg.text);

          try {
            const response = await router.route({
              channelId: msg.channelId,
              sessionId: session.id,
              text: msg.text,
              history: session.history.slice(0, -1), // exclude the just-added message
            });

            sessions.addMessage(session.id, "assistant", response);

            send(ws, {
              type: "chat.response",
              channelId: msg.channelId,
              sessionId: session.id,
              text: response,
              done: true,
            });
          } catch (err) {
            const error = err as Error;
            send(ws, {
              type: "error",
              code: "AGENT_ERROR",
              message: error.message,
            });
          }
          break;
        }

        case "channel.send": {
          // Forward to channel manager
          if (verbose) {
            console.log(
              chalk.dim(`[gateway] Send to channel '${msg.channelId}': ${msg.text}`)
            );
          }
          break;
        }

        default:
          send(ws, {
            type: "error",
            code: "UNKNOWN_TYPE",
            message: `Unknown message type: ${(msg as { type: string }).type}`,
          });
      }
    });

    ws.on("close", () => {
      clients.delete(ws);
      if (verbose) {
        console.log(chalk.dim(`[gateway] Client disconnected (total: ${clients.size})`));
      }
    });

    ws.on("error", (err) => {
      console.error(chalk.red(`[gateway] WebSocket error: ${err.message}`));
    });
  });

  // Start channel manager for configured channels
  const channelManager = createChannelManager(config);
  await channelManager.startAll(router);

  // Listen
  return new Promise((resolve) => {
    httpServer.listen(port, host, () => {
      console.log(chalk.bold.cyan(`\n🦀 MyClaw Gateway`));
      console.log(chalk.dim(`   WebSocket: ws://${host}:${port}`));
      console.log(chalk.dim(`   Health:    http://${host}:${port}/health`));
      console.log(chalk.dim(`   Auth:      ${authToken ? "enabled" : "disabled"}`));
      console.log(
        chalk.dim(`   Channels:  ${config.channels.filter((c) => c.enabled).length} active`)
      );
      console.log(chalk.dim(`   Provider:  ${config.defaultProvider}\n`));

      if (verbose) {
        console.log(chalk.dim("[gateway] Waiting for connections...\n"));
      }
    });
  });
}

function send(ws: WebSocket, msg: GatewayResponse): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}
