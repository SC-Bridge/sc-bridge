import { describe, it, expect, beforeAll } from "vitest";
import { SELF, env } from "cloudflare:test";
import { setupTestDatabase } from "./apply-migrations";
import { createTestUser, authHeaders } from "./helpers";
import { createChat, addChatMessage } from "../src/db/queries";

describe("Chat API — /api/llm/chat*", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
  });

  it("lists chats (empty for a new user)", async () => {
    const { sessionToken } = await createTestUser(env.DB);
    const res = await SELF.fetch("http://localhost/api/llm/chats", {
      headers: await authHeaders(sessionToken),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { chats: unknown[] };
    expect(body.chats).toEqual([]);
  });

  it("lists a seeded chat and returns its messages", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    const chatId = await createChat(env.DB, {
      userId,
      provider: "openai",
      model: "gpt-4o",
      title: "My chat",
    });
    await addChatMessage(env.DB, { chatId, role: "user", content: "hi" });

    const list = await SELF.fetch("http://localhost/api/llm/chats", {
      headers: await authHeaders(sessionToken),
    });
    const listBody = (await list.json()) as { chats: Array<{ id: number; title: string }> };
    expect(listBody.chats.some((c) => c.id === chatId && c.title === "My chat")).toBe(true);

    const detail = await SELF.fetch(`http://localhost/api/llm/chats/${chatId}`, {
      headers: await authHeaders(sessionToken),
    });
    expect(detail.status).toBe(200);
    const detailBody = (await detail.json()) as { messages: Array<{ content: string }> };
    expect(detailBody.messages[0].content).toBe("hi");
  });

  it("does not expose another user's chat (404)", async () => {
    const a = await createTestUser(env.DB);
    const b = await createTestUser(env.DB);
    const chatId = await createChat(env.DB, {
      userId: a.userId,
      provider: "openai",
      model: "gpt-4o",
      title: "secret",
    });
    const res = await SELF.fetch(`http://localhost/api/llm/chats/${chatId}`, {
      headers: await authHeaders(b.sessionToken),
    });
    expect(res.status).toBe(404);
  });

  it("deletes a chat (owner-scoped)", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    const chatId = await createChat(env.DB, {
      userId,
      provider: "openai",
      model: "gpt-4o",
      title: "T",
    });
    const del = await SELF.fetch(`http://localhost/api/llm/chats/${chatId}`, {
      method: "DELETE",
      headers: { ...(await authHeaders(sessionToken)), "Content-Length": "0" },
    });
    expect(del.status).toBe(200);
    const after = await SELF.fetch(`http://localhost/api/llm/chats/${chatId}`, {
      headers: await authHeaders(sessionToken),
    });
    expect(after.status).toBe(404);
  });

  it("rejects an over-long message (validation)", async () => {
    const { sessionToken } = await createTestUser(env.DB);
    const res = await SELF.fetch("http://localhost/api/llm/chat", {
      method: "POST",
      headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "openai", message: "x".repeat(2001) }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when no API key is configured", async () => {
    const { sessionToken } = await createTestUser(env.DB);
    const res = await SELF.fetch("http://localhost/api/llm/chat", {
      method: "POST",
      headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "openai", message: "should this ship haul cargo?" }),
    });
    expect(res.status).toBe(400);
  });

  it("renames a chat via PATCH (owner-scoped, validated)", async () => {
    const { userId, sessionToken } = await createTestUser(env.DB);
    const chatId = await createChat(env.DB, { userId, provider: "openai", model: "gpt-4o", title: "Old" });

    const ok = await SELF.fetch(`http://localhost/api/llm/chats/${chatId}`, {
      method: "PATCH",
      headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Renamed Chat" }),
    });
    expect(ok.status).toBe(200);
    const got = await SELF.fetch(`http://localhost/api/llm/chats/${chatId}`, { headers: await authHeaders(sessionToken) });
    expect(((await got.json()) as { chat: { title: string } }).chat.title).toBe("Renamed Chat");

    // empty title rejected
    const bad = await SELF.fetch(`http://localhost/api/llm/chats/${chatId}`, {
      method: "PATCH",
      headers: { ...(await authHeaders(sessionToken)), "Content-Type": "application/json" },
      body: JSON.stringify({ title: "" }),
    });
    expect(bad.status).toBe(400);
  });

  it("cannot rename another user's chat (404)", async () => {
    const a = await createTestUser(env.DB);
    const b = await createTestUser(env.DB);
    const chatId = await createChat(env.DB, { userId: a.userId, provider: "openai", model: "gpt-4o", title: "A's" });
    const res = await SELF.fetch(`http://localhost/api/llm/chats/${chatId}`, {
      method: "PATCH",
      headers: { ...(await authHeaders(b.sessionToken)), "Content-Type": "application/json" },
      body: JSON.stringify({ title: "stolen" }),
    });
    expect(res.status).toBe(404);
  });
});
