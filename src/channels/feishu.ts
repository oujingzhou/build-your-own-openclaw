/**
 * Chapter 8 - Feishu Channel
 *
 * Integrates with Feishu (Lark) via WebSocket mode using the official SDK.
 * This channel receives messages from Feishu and replies via the messaging API.
 */

import * as lark from "@larksuiteoapi/node-sdk";
import chalk from "chalk";
import type { ChannelConfig } from "../config/index.js";
import type { Router } from "../routing/router.js";
import { Channel, type OutgoingMessage } from "./transport.js";

export class FeishuChannel extends Channel {
  readonly id: string;
  readonly type = "feishu";
  private client: lark.Client;
  private wsClient: lark.WSClient | null = null;
  private _connected = false;
  private router: Router | null = null;
  private config: ChannelConfig;
  private appId: string;
  private appSecret: string;
  private processedMsgIds = new Set<string>();

  constructor(config: ChannelConfig, appId: string, appSecret: string) {
    super();
    this.id = config.id;
    this.config = config;
    this.appId = appId;
    this.appSecret = appSecret;
    this.client = new lark.Client({
      appId,
      appSecret,
      appType: lark.AppType.SelfBuild,
    });
  }

  get connected(): boolean {
    return this._connected;
  }

  setRouter(router: Router): void {
    this.router = router;
  }

  async start(): Promise<void> {
    if (!this.router) {
      throw new Error("Router must be set before starting Feishu channel");
    }

    const router = this.router;

    const eventDispatcher = new lark.EventDispatcher({}).register({
      "im.message.receive_v1": async (data: any) => {
        try {
          await this.handleMessage(data, router);
        } catch (err) {
          console.error(
            chalk.red(
              `[feishu] Error processing message: ${(err as Error).message}`
            )
          );
        }
      },
    });

    console.log(chalk.dim(`[feishu] Starting WebSocket client...`));

    this.wsClient = new lark.WSClient({
      appId: this.appId,
      appSecret: this.appSecret,
      loggerLevel: lark.LoggerLevel.warn,
    });

    await this.wsClient.start({ eventDispatcher });

    this._connected = true;
    this.emit("connected");
    console.log(chalk.green(`[feishu] WebSocket connected and listening`));
  }

  async stop(): Promise<void> {
    this._connected = false;
    this.emit("disconnected", "stopped");
  }

  async send(message: OutgoingMessage): Promise<void> {
    // Extract chat_id from session ID (format: channelId:chatId)
    const chatId = message.sessionId.split(":")[1];
    if (!chatId) {
      console.error(`[feishu] Invalid session ID: ${message.sessionId}`);
      return;
    }

    await this.client.im.message.create({
      params: { receive_id_type: "chat_id" },
      data: {
        receive_id: chatId,
        msg_type: "text",
        content: JSON.stringify({ text: message.text }),
      },
    });
  }

  private async handleMessage(data: any, router: Router): Promise<void> {
    const message = data.message;
    if (!message) return;

    // Deduplicate: Feishu WebSocket may deliver the same event more than once
    const messageId = message.message_id as string;
    console.log(chalk.dim(`[feishu] Received message_id=${messageId}, keys=${Object.keys(message).join(",")}`));
    if (messageId) {
      if (this.processedMsgIds.has(messageId)) return;
      this.processedMsgIds.add(messageId);
      // Prevent memory leak: cap at 1000 entries
      if (this.processedMsgIds.size > 1000) {
        const first = this.processedMsgIds.values().next().value;
        if (first) this.processedMsgIds.delete(first);
      }
    }

    // Only handle text messages
    const msgType = message.message_type;
    if (msgType !== "text") return;

    const chatId = message.chat_id as string;
    const senderId = (data.sender?.sender_id?.open_id as string) ?? "unknown";

    // Parse message content
    let text: string;
    try {
      const content = JSON.parse(message.content);
      text = content.text;
    } catch {
      return;
    }

    if (!text) return;

    // Handle /clear command
    if (text.trim() === "/clear") {
      this.clearSession(chatId);
      await this.client.im.message.create({
        params: { receive_id_type: "chat_id" },
        data: {
          receive_id: chatId,
          msg_type: "text",
          content: JSON.stringify({ text: "Conversation history cleared." }),
        },
      });
      return;
    }

    try {
      const response = await this.routeMessage(router, chatId, senderId, text);

      await this.client.im.message.create({
        params: { receive_id_type: "chat_id" },
        data: {
          receive_id: chatId,
          msg_type: "text",
          content: JSON.stringify({ text: response }),
        },
      });
    } catch (err) {
      console.error(
        chalk.red(
          `[feishu] Error processing message: ${(err as Error).message}`
        )
      );
      await this.client.im.message.create({
        params: { receive_id_type: "chat_id" },
        data: {
          receive_id: chatId,
          msg_type: "text",
          content: JSON.stringify({
            text: "Sorry, I encountered an error. Please try again.",
          }),
        },
      });
    }
  }
}
