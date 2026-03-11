/**
 * Chapter 6 - Channel Transport Abstraction
 *
 * Defines the interface that all channels must implement.
 * This is OpenClaw's key abstraction - any messaging platform
 * can be integrated by implementing this interface.
 */

import { EventEmitter } from "node:events";
import type { Router, RouteRequest } from "../routing/router.js";

export type HistoryEntry = { role: "user" | "assistant"; content: string };
export type SessionMap = Map<string, HistoryEntry[]>;

/**
 * An incoming message from a channel
 */
export interface IncomingMessage {
  channelId: string;
  sessionId: string;
  senderId: string;
  text: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

/**
 * An outgoing message to send to a channel
 */
export interface OutgoingMessage {
  channelId: string;
  sessionId: string;
  text: string;
  metadata?: Record<string, unknown>;
}

/**
 * Channel events
 */
export interface ChannelEvents {
  message: (msg: IncomingMessage) => void;
  connected: () => void;
  disconnected: (reason?: string) => void;
  error: (error: Error) => void;
}

/**
 * The Channel interface - every messaging platform implements this.
 *
 * In OpenClaw, channels include:
 * - Terminal (built-in)
 * - Telegram, Discord, Slack, WhatsApp, iMessage, etc.
 *
 * The channel abstraction is what makes OpenClaw truly multi-channel.
 */
export abstract class Channel extends EventEmitter {
  abstract readonly id: string;
  abstract readonly type: string;
  abstract readonly connected: boolean;

  protected sessions: SessionMap = new Map();

  /**
   * Start the channel (connect, authenticate, etc.)
   */
  abstract start(): Promise<void>;

  /**
   * Stop the channel
   */
  abstract stop(): Promise<void>;

  /**
   * Send a message to the channel
   */
  abstract send(message: OutgoingMessage): Promise<void>;

  /**
   * Common message routing: manages history, routes to agent, emits event.
   * Returns the agent response text.
   */
  protected async routeMessage(
    router: Router,
    chatId: string,
    senderId: string,
    text: string
  ): Promise<string> {
    const sessionId = `${this.id}:${chatId}`;

    if (!this.sessions.has(chatId)) {
      this.sessions.set(chatId, []);
    }
    const history = this.sessions.get(chatId)!;

    const request: RouteRequest = {
      channelId: this.id,
      sessionId,
      text,
      history: [...history],
    };

    history.push({ role: "user", content: text });
    const response = await router.route(request);
    history.push({ role: "assistant", content: response });

    this.emit("message", {
      channelId: this.id,
      sessionId,
      senderId,
      text,
      timestamp: Date.now(),
    });

    return response;
  }

  protected clearSession(chatId: string): void {
    this.sessions.delete(chatId);
  }
}
