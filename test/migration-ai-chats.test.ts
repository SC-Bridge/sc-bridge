import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";
import { createTestUser } from "./helpers";

/**
 * Migration 0258 — ai_chats + ai_chat_messages.
 * Backs the saved "Chat about my fleet" feature: one chat row per conversation,
 * many message rows, messages removed when the parent chat is deleted.
 * user_id is a cascade FK to the Better Auth user row (matches ai_analyses).
 */
describe("Migration 0258 — ai_chats + ai_chat_messages", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
  });

  it("stores a chat and its messages", async () => {
    const { userId } = await createTestUser(env.DB);
    const ins = await env.DB.prepare(
      "INSERT INTO ai_chats (user_id, provider, model, title) VALUES (?, ?, ?, ?)",
    )
      .bind(userId, "openai", "gpt-4o", "Hello")
      .run();
    const chatId = ins.meta.last_row_id;

    await env.DB.prepare(
      "INSERT INTO ai_chat_messages (chat_id, role, content) VALUES (?, ?, ?)",
    )
      .bind(chatId, "user", "hello there")
      .run();

    const msgs = await env.DB.prepare(
      "SELECT role, content FROM ai_chat_messages WHERE chat_id = ?",
    )
      .bind(chatId)
      .all();
    expect(msgs.results.length).toBe(1);
    expect((msgs.results[0] as { role: string }).role).toBe("user");
  });

  it("cascades message deletion when the chat is deleted", async () => {
    const { userId } = await createTestUser(env.DB);
    const ins = await env.DB.prepare(
      "INSERT INTO ai_chats (user_id, provider, model, title) VALUES (?, ?, ?, ?)",
    )
      .bind(userId, "anthropic", "claude-sonnet-4-6", "X")
      .run();
    const chatId = ins.meta.last_row_id;
    await env.DB.prepare(
      "INSERT INTO ai_chat_messages (chat_id, role, content) VALUES (?, ?, ?)",
    )
      .bind(chatId, "user", "a")
      .run();

    await env.DB.prepare("DELETE FROM ai_chats WHERE id = ?").bind(chatId).run();

    const msgs = await env.DB.prepare(
      "SELECT id FROM ai_chat_messages WHERE chat_id = ?",
    )
      .bind(chatId)
      .all();
    expect(msgs.results.length).toBe(0);
  });
});
