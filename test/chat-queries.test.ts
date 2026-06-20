import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";
import { createTestUser } from "./helpers";
import {
  createChat,
  addChatMessage,
  listChats,
  getChat,
  deleteChat,
  renameChat,
} from "../src/db/queries";

describe("Chat DB queries", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
  });

  it("creates, lists, and gets a chat with its messages in order", async () => {
    const { userId } = await createTestUser(env.DB);
    const chatId = await createChat(env.DB, {
      userId,
      provider: "openai",
      model: "gpt-4o",
      title: "Cargo question",
    });
    expect(chatId).toBeGreaterThan(0);

    await addChatMessage(env.DB, { chatId, role: "user", content: "hi" });
    await addChatMessage(env.DB, { chatId, role: "assistant", content: "hello" });

    const list = await listChats(env.DB, userId);
    expect(list.some((c) => c.id === chatId && c.title === "Cargo question")).toBe(true);

    const got = await getChat(env.DB, userId, chatId);
    expect(got).not.toBeNull();
    expect(got!.messages.length).toBe(2);
    expect(got!.messages[0].role).toBe("user");
    expect(got!.messages[0].content).toBe("hi");
    expect(got!.messages[1].content).toBe("hello");
  });

  it("getChat returns null for another user's chat", async () => {
    const a = await createTestUser(env.DB);
    const b = await createTestUser(env.DB);
    const chatId = await createChat(env.DB, {
      userId: a.userId,
      provider: "openai",
      model: "gpt-4o",
      title: "T",
    });
    expect(await getChat(env.DB, b.userId, chatId)).toBeNull();
  });

  it("deleteChat is owner-scoped and cascades messages", async () => {
    const a = await createTestUser(env.DB);
    const b = await createTestUser(env.DB);
    const chatId = await createChat(env.DB, {
      userId: a.userId,
      provider: "openai",
      model: "gpt-4o",
      title: "T",
    });
    await addChatMessage(env.DB, { chatId, role: "user", content: "x" });

    // b cannot delete a's chat
    await deleteChat(env.DB, b.userId, chatId);
    expect(await getChat(env.DB, a.userId, chatId)).not.toBeNull();

    // a deletes it
    await deleteChat(env.DB, a.userId, chatId);
    expect(await getChat(env.DB, a.userId, chatId)).toBeNull();

    const msgs = await env.DB.prepare(
      "SELECT id FROM ai_chat_messages WHERE chat_id = ?",
    )
      .bind(chatId)
      .all();
    expect(msgs.results.length).toBe(0);
  });

  it("renameChat updates the title, owner-scoped", async () => {
    const a = await createTestUser(env.DB);
    const b = await createTestUser(env.DB);
    const chatId = await createChat(env.DB, { userId: a.userId, provider: "openai", model: "gpt-4o", title: "Old" });

    expect(await renameChat(env.DB, a.userId, chatId, "New Title")).toBe(true);
    expect((await getChat(env.DB, a.userId, chatId))!.chat.title).toBe("New Title");

    // another user cannot rename it
    expect(await renameChat(env.DB, b.userId, chatId, "Hacked")).toBe(false);
    expect((await getChat(env.DB, a.userId, chatId))!.chat.title).toBe("New Title");
  });
});
