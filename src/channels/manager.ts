/**
 * Chapter 6 - Channel Manager
 *
 * Manages all configured channels. Creates, starts, and monitors
 * channel instances based on the configuration.
 */

import chalk from "chalk";
import type { OpenClawConfig } from "../config/index.js";
import { resolveSecret } from "../config/index.js";
import type { Router } from "../routing/router.js";
import type { Channel } from "./transport.js";
import { FeishuChannel } from "./feishu.js";
import { TelegramChannel } from "./telegram.js";

export interface ChannelManager {
  startAll(router: Router): Promise<void>;
  stopAll(): Promise<void>;
  getChannel(id: string): Channel | undefined;
  getStatus(): Array<{ id: string; type: string; connected: boolean }>;
}

export function createChannelManager(config: OpenClawConfig): ChannelManager {
  const channels = new Map<string, Channel>();

  return {
    async startAll(router: Router): Promise<void> {
      for (const channelConfig of config.channels) {
        if (!channelConfig.enabled) continue;
        if (channelConfig.type === "terminal") continue; // Terminal is handled separately

        try {
          switch (channelConfig.type) {
            case "feishu": {
              const appId = resolveSecret(
                channelConfig.appId,
                channelConfig.appIdEnv
              );
              const appSecret = resolveSecret(
                channelConfig.appSecret,
                channelConfig.appSecretEnv
              );
              if (!appId || !appSecret) {
                console.warn(
                  chalk.yellow(
                    `[channels] Skipping '${channelConfig.id}': missing App ID or App Secret`
                  )
                );
                continue;
              }
              const feishu = new FeishuChannel(channelConfig, appId, appSecret);
              feishu.setRouter(router);
              channels.set(channelConfig.id, feishu);
              await feishu.start();
              break;
            }
            case "telegram": {
              const botToken = resolveSecret(
                channelConfig.botToken,
                channelConfig.botTokenEnv
              );
              if (!botToken) {
                console.warn(
                  chalk.yellow(
                    `[channels] Skipping '${channelConfig.id}': missing Bot Token`
                  )
                );
                continue;
              }
              const telegram = new TelegramChannel(channelConfig, botToken);
              telegram.setRouter(router);
              channels.set(channelConfig.id, telegram);
              await telegram.start();
              break;
            }
            default:
              console.warn(
                chalk.yellow(
                  `[channels] Unknown channel type: ${channelConfig.type}`
                )
              );
          }
        } catch (err) {
          console.error(
            chalk.red(
              `[channels] Failed to start '${channelConfig.id}': ${(err as Error).message}`
            )
          );
        }
      }
    },

    async stopAll(): Promise<void> {
      for (const [id, channel] of channels) {
        try {
          await channel.stop();
        } catch (err) {
          console.error(
            chalk.red(`[channels] Error stopping '${id}': ${(err as Error).message}`)
          );
        }
      }
      channels.clear();
    },

    getChannel(id: string): Channel | undefined {
      return channels.get(id);
    },

    getStatus(): Array<{ id: string; type: string; connected: boolean }> {
      return Array.from(channels.values()).map((ch) => ({
        id: ch.id,
        type: ch.type,
        connected: ch.connected,
      }));
    },
  };
}
