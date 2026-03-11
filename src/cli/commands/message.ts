/**
 * Chapter 7 - Message Command
 *
 * Send messages to channels via the gateway.
 */

import type { Command } from "commander";
import WebSocket from "ws";
import chalk from "chalk";
import { getContext } from "../program.js";
import { resolveSecret } from "../../config/index.js";
import type { GatewayMessage } from "../../gateway/protocol.js";

export function registerMessageCommand(program: Command): void {
  const msg = program
    .command("message")
    .description("Send and manage messages");

  msg
    .command("send")
    .description("Send a message to a channel")
    .argument("<channel>", "Channel ID to send to")
    .argument("<text>", "Message text")
    .action(async (channel: string, text: string, _opts, cmd) => {
      const ctx = getContext(cmd);
      const { host, port } = ctx.config.gateway;
      const token = resolveSecret(
        ctx.config.gateway.token,
        ctx.config.gateway.tokenEnv
      );

      const wsUrl = `ws://${host}:${port}`;
      const ws = new WebSocket(wsUrl);

      ws.on("open", () => {
        // Authenticate if token is set
        if (token) {
          const authMsg: GatewayMessage = {
            type: "auth",
            token,
          };
          ws.send(JSON.stringify(authMsg));
        }

        // Send the message
        const sendMsg: GatewayMessage = {
          type: "channel.send",
          channelId: channel,
          text,
        };
        ws.send(JSON.stringify(sendMsg));

        console.log(chalk.green(`✓ Message sent to '${channel}'`));
        ws.close();
      });

      ws.on("error", (err) => {
        console.error(
          chalk.red(`Failed to connect to gateway at ${wsUrl}: ${err.message}`)
        );
        console.error(chalk.dim("Is the gateway running? Try: myclaw gateway"));
        process.exit(1);
      });
    });
}
