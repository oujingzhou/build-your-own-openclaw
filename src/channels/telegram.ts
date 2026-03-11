/**
 * Chapter 8 - Telegram Channel
 *
 * Integrates with Telegram via the grammy library.
 * This channel receives messages from Telegram and replies via the Bot API.
 */

import { Bot } from "grammy";
import chalk from "chalk";
import type { ChannelConfig } from "../config/index.js";
import type { Router } from "../routing/router.js";
import { Channel, type OutgoingMessage } from "./transport.js";

const MAX_MESSAGE_LENGTH = 4096;

export class TelegramChannel extends Channel {
  readonly id: string;
  readonly type = "telegram";
  private bot: Bot;
  private _connected = false;
  private router: Router | null = null;
  private config: ChannelConfig;
  private allowedChatIds: Set<number> | null;

  constructor(config: ChannelConfig, botToken: string) {
    super();
    this.id = config.id;
    this.config = config;
    this.allowedChatIds = config.allowedChatIds
      ? new Set(config.allowedChatIds)
      : null;
    this.bot = new Bot(botToken);
  }

  get connected(): boolean {
    return this._connected;
  }

  setRouter(router: Router): void {
    this.router = router;
  }

  async start(): Promise<void> {
    if (!this.router) {
      throw new Error("Router must be set before starting Telegram channel");
    }

    const router = this.router;

    // /start command
    this.bot.command("start", async (ctx) => {
      const chatId = ctx.chat.id;
      if (!this.isChatAllowed(chatId)) return;
      const greeting =
        this.config.greeting ?? "Hello! I'm MyClaw, your AI assistant.";
      await ctx.reply(greeting);
    });

    // /clear command
    this.bot.command("clear", async (ctx) => {
      const chatId = ctx.chat.id;
      if (!this.isChatAllowed(chatId)) return;
      this.clearSession(String(chatId));
      await ctx.reply("Conversation history cleared.");
    });

    // Handle text messages
    this.bot.on("message:text", async (ctx) => {
      const chatId = ctx.chat.id;
      if (!this.isChatAllowed(chatId)) return;

      // Skip commands (already handled above)
      if (ctx.message.text.startsWith("/")) return;

      try {
        await this.handleMessage(
          String(chatId),
          ctx.from?.id ? String(ctx.from.id) : "unknown",
          ctx.message.text,
          router,
          async (text: string) => {
            await ctx.reply(text);
          }
        );
      } catch (err) {
        console.error(
          chalk.red(
            `[telegram] Error processing message: ${(err as Error).message}`
          )
        );
        await ctx.reply("Sorry, I encountered an error. Please try again.");
      }
    });

    console.log(chalk.dim(`[telegram] Starting bot...`));

    // Start polling (non-blocking)
    this.bot.start({
      onStart: () => {
        this._connected = true;
        this.emit("connected");
        console.log(chalk.green(`[telegram] Bot started and listening`));
      },
    });
  }

  async stop(): Promise<void> {
    this.bot.stop();
    this._connected = false;
    this.emit("disconnected", "stopped");
  }

  async send(message: OutgoingMessage): Promise<void> {
    const chatId = message.sessionId.split(":")[1];
    if (!chatId) {
      console.error(`[telegram] Invalid session ID: ${message.sessionId}`);
      return;
    }

    const chunks = splitMessage(message.text, MAX_MESSAGE_LENGTH);
    for (const chunk of chunks) {
      await this.bot.api.sendMessage(Number(chatId), chunk);
    }
  }

  private isChatAllowed(chatId: number): boolean {
    if (!this.allowedChatIds) return true;
    return this.allowedChatIds.has(chatId);
  }

  private async handleMessage(
    chatId: string,
    senderId: string,
    text: string,
    router: Router,
    reply: (text: string) => Promise<void>
  ): Promise<void> {
    const response = await this.routeMessage(router, chatId, senderId, text);

    const chunks = splitMessage(response, MAX_MESSAGE_LENGTH);
    for (const chunk of chunks) {
      await reply(chunk);
    }
  }
}

function splitMessage(text: string, maxLength: number): string[] {
  if (text.length <= maxLength) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    chunks.push(remaining.slice(0, maxLength));
    remaining = remaining.slice(maxLength);
  }
  return chunks;
}
