import { Hono } from "hono";
import { z } from "zod";
import { getAuthUser, type HonoEnv } from "../lib/types";
import { validate, IntIdParam, LLMProvider } from "../lib/validation";
import {
  getFleetForAnalysis,
  createChat,
  addChatMessage,
  listChats,
  getChat,
  deleteChat,
  getEntitledLoaners,
  getCustomLoadoutFleetIds,
} from "../db/queries";
import { getDecryptedAPIKey } from "../lib/llm-keys";
import { buildChatFleetPayload } from "../lib/fleet-payload";
import { buildChatRequest } from "../lib/chat";
import { runChatTurn } from "../lib/chat-agent";
import { DEFAULT_MODELS, type LLMProviderId } from "../lib/llm";
import { logEvent } from "../lib/logger";

/**
 * /api/llm/chat* — saved "Chat about my fleet" conversations.
 * Provider calls reuse lib/llm.ts; conversation persistence reuses the chat
 * DB queries. All routes are user-scoped (getChat/deleteChat verify ownership).
 */
export function chatRoutes() {
  const routes = new Hono<HonoEnv>();

  // GET /api/llm/chats — list the user's chats (most recently active first)
  routes.get("/llm/chats", async (c) => {
    const userID = getAuthUser(c).id;
    const chats = await listChats(c.env.DB, userID);
    return c.json({ chats });
  });

  // GET /api/llm/chats/:id — one chat with its messages
  routes.get("/llm/chats/:id", validate("param", IntIdParam), async (c) => {
    const { id } = c.req.valid("param");
    const userID = getAuthUser(c).id;
    const result = await getChat(c.env.DB, userID, id);
    if (!result) return c.json({ error: "Chat not found" }, 404);
    return c.json(result);
  });

  // DELETE /api/llm/chats/:id
  routes.delete("/llm/chats/:id", validate("param", IntIdParam), async (c) => {
    const { id } = c.req.valid("param");
    const userID = getAuthUser(c).id;
    await deleteChat(c.env.DB, userID, id);
    return c.json({ ok: true });
  });

  // POST /api/llm/chat — send a message; creates the chat on the first turn
  routes.post(
    "/llm/chat",
    validate(
      "json",
      z.object({
        chat_id: z.number().int().positive().optional(),
        provider: LLMProvider.default("anthropic"),
        model: z.string().max(100).optional(),
        message: z.string().min(1).max(2000),
      }),
    ),
    async (c) => {
      const db = c.env.DB;
      const userID = getAuthUser(c).id;
      const body = c.req.valid("json");
      const provider = body.provider as LLMProviderId;

      const apiKey = await getDecryptedAPIKey(db, userID, c.env.ENCRYPTION_KEY, provider);
      if (!apiKey) {
        return c.json({ error: "No API key configured for this provider" }, 400);
      }

      // Resolve an existing chat (must exist + be owned) or prepare a new one.
      let model: string;
      let history: { role: string; content: string }[] = [];
      if (body.chat_id) {
        const existing = await getChat(db, userID, body.chat_id);
        if (!existing) return c.json({ error: "Chat not found" }, 404);
        model = body.model || existing.chat.model;
        history = existing.messages.map((m) => ({ role: m.role, content: m.content }));
      } else {
        model = body.model || DEFAULT_MODELS[provider] || "";
      }

      // Full fleet payload (incl. custom names) + entitled loaners + a per-ship
      // has_custom_loadout flag live in the system message. Loadout details are
      // fetched on demand via the get_ship_loadout tool (added in the agent loop).
      const fleet = await getFleetForAnalysis(db, userID);
      const [customIds, loaners] = await Promise.all([
        getCustomLoadoutFleetIds(db, userID),
        getEntitledLoaners(db, userID),
      ]);
      const fleetPayload = buildChatFleetPayload(fleet, customIds, loaners);
      const { system, messages } = buildChatRequest({
        fleetPayload,
        history,
        userMessage: body.message,
      });

      // Agent loop: the model may call get_ship_loadout on demand (up to 4 rounds)
      // to fetch a ship's full components, then produces a final answer.
      const turn = await runChatTurn({ provider, apiKey, model, system, messages, db, userId: userID });
      if (!turn.ok) {
        console.error(`[chat] provider error (${provider}, ${turn.status})`);
        return c.json({ error: turn.error }, 502);
      }
      const reply = turn.text;
      if (!reply) {
        return c.json({ error: "No response from the provider. Try again." }, 502);
      }

      // Only persist once we have a successful reply — a provider failure on the
      // first turn leaves no orphan empty chat in the user's history.
      const chatId =
        body.chat_id ??
        (await createChat(db, { userId: userID, provider, model, title: body.message.slice(0, 80) }));
      await addChatMessage(db, { chatId, role: "user", content: body.message });
      await addChatMessage(db, { chatId, role: "assistant", content: reply });

      logEvent("llm_chat", { provider, model, chat_id: chatId, tool_rounds: turn.rounds });
      return c.json({ chat_id: chatId, reply, model, tools_used: turn.toolsUsed });
    },
  );

  return routes;
}
