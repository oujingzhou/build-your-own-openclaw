/**
 * Chapter 6 - Terminal Channel
 *
 * The simplest channel - reads from stdin, writes to stdout.
 * This is how you chat with OpenClaw directly from the terminal.
 */

import readline from "node:readline";
import chalk from "chalk";
import type { OpenClawConfig, ChannelConfig } from "../config/index.js";
import type { Router } from "../routing/router.js";
import { Channel, type OutgoingMessage } from "./transport.js";

export class TerminalChannel extends Channel {
  readonly id: string;
  readonly type = "terminal";
  private rl: readline.Interface | null = null;
  private _connected = false;
  private router: Router;
  private config: ChannelConfig;
  private agentName: string;
  private chatId: string;

  constructor(config: ChannelConfig, router: Router, agentName: string) {
    super();
    this.id = config.id;
    this.config = config;
    this.router = router;
    this.agentName = agentName;
    this.chatId = "terminal";
  }

  get connected(): boolean {
    return this._connected;
  }

  async start(): Promise<void> {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    this._connected = true;
    this.emit("connected");

    // Print greeting
    if (this.config.greeting) {
      console.log(chalk.cyan(`\n${this.agentName}: ${this.config.greeting}\n`));
    }

    // Main input loop
    const prompt = () => {
      this.rl?.question(chalk.green("You: "), async (input) => {
        const text = input.trim();
        if (!text) {
          prompt();
          return;
        }

        // Handle special commands
        if (text.startsWith("/")) {
          await this.handleCommand(text);
          prompt();
          return;
        }

        // Route to agent
        try {
          process.stdout.write(chalk.cyan(`\n${this.agentName}: `));
          const response = await this.routeMessage(this.router, this.chatId, "terminal", text);
          console.log(response + "\n");
        } catch (err) {
          console.error(chalk.red(`\nError: ${(err as Error).message}\n`));
        }

        prompt();
      });
    };

    prompt();

    // Handle Ctrl+C gracefully
    this.rl.on("close", () => {
      console.log(chalk.dim("\nGoodbye! 👋\n"));
      this._connected = false;
      this.emit("disconnected", "user closed");
      process.exit(0);
    });
  }

  async stop(): Promise<void> {
    this.rl?.close();
    this._connected = false;
    this.emit("disconnected", "stopped");
  }

  async send(message: OutgoingMessage): Promise<void> {
    console.log(chalk.cyan(`${this.agentName}: ${message.text}`));
  }

  private async handleCommand(input: string): Promise<void> {
    const [cmd, ...args] = input.split(" ");

    switch (cmd) {
      case "/help":
        console.log(chalk.dim("\nAvailable commands:"));
        console.log(chalk.dim("  /help    - Show this help"));
        console.log(chalk.dim("  /clear   - Clear conversation history"));
        console.log(chalk.dim("  /history - Show conversation history"));
        console.log(chalk.dim("  /status  - Show status"));
        console.log(chalk.dim("  /quit    - Exit\n"));
        break;

      case "/clear":
        this.clearSession(this.chatId);
        console.log(chalk.dim("\nConversation history cleared.\n"));
        break;

      case "/history": {
        const history = this.sessions.get(this.chatId) ?? [];
        if (history.length === 0) {
          console.log(chalk.dim("\nNo history yet.\n"));
        } else {
          console.log(chalk.dim("\nConversation history:"));
          for (const msg of history) {
            const prefix = msg.role === "user" ? "You" : this.agentName;
            const color = msg.role === "user" ? chalk.green : chalk.cyan;
            const truncated =
              msg.content.length > 100
                ? msg.content.slice(0, 100) + "..."
                : msg.content;
            console.log(color(`  ${prefix}: ${truncated}`));
          }
          console.log();
        }
        break;
      }

      case "/status":
        console.log(chalk.dim(`\n  Channel: ${this.id} (${this.type})`));
        console.log(chalk.dim(`  Session: ${this.id}:${this.chatId}`));
        console.log(chalk.dim(`  History: ${(this.sessions.get(this.chatId) ?? []).length} messages\n`));
        break;

      case "/quit":
      case "/exit":
        await this.stop();
        process.exit(0);
        break;

      default:
        console.log(chalk.yellow(`\nUnknown command: ${cmd}. Type /help for available commands.\n`));
    }
  }
}

/**
 * Factory function to create a terminal channel
 */
export function createTerminalChannel(
  config: OpenClawConfig,
  router: Router
): TerminalChannel {
  const channelConfig = config.channels.find(
    (c) => c.type === "terminal" && c.enabled
  ) ?? {
    id: "terminal",
    type: "terminal" as const,
    enabled: true,
    greeting: `Hello! I'm ${config.agent.name}. How can I help you?`,
  };

  return new TerminalChannel(channelConfig, router, config.agent.name);
}
