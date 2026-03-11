/**
 * Chapter 4 - Session Manager
 *
 * Manages chat sessions. Each channel+user combination gets a session
 * that tracks conversation history.
 */

import type { Session } from "./protocol.js";

export class SessionManager {
  private sessions = new Map<string, Session>();
  private maxHistory: number;

  constructor(maxHistory: number = 50) {
    this.maxHistory = maxHistory;
  }

  /**
   * Get or create a session for a given channel and optional session ID
   */
  getOrCreate(channelId: string, sessionId?: string): Session {
    const id = sessionId ?? `${channelId}:default`;

    let session = this.sessions.get(id);
    if (!session) {
      session = {
        id,
        channelId,
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
        history: [],
      };
      this.sessions.set(id, session);
    }

    session.lastActiveAt = Date.now();
    return session;
  }

  /**
   * Add a message to a session's history
   */
  addMessage(
    sessionId: string,
    role: "user" | "assistant",
    content: string
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.history.push({ role, content });

    // Trim history if it exceeds the max
    if (session.history.length > this.maxHistory) {
      session.history = session.history.slice(-this.maxHistory);
    }
  }

  /**
   * Get all active sessions
   */
  getAll(): Session[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Get session count
   */
  get size(): number {
    return this.sessions.size;
  }

  /**
   * Clear a specific session's history
   */
  clearHistory(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.history = [];
    }
  }

  /**
   * Delete a session
   */
  delete(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
}
