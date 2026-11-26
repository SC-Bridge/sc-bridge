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
  setChatAccounts,
  deleteChat,
  renameChat,
  getEntitledLoaners,
  getCustomLoadoutFleetIds,
} from "../db/queries";
import { getDecryptedAPIKey } from "../lib/llm-keys";
import { buildChatFleetPayload } from "../lib/fleet-payload";
import { buildChatRequest } from "../lib/chat";
import { runChatTurn } from "../lib/chat-agent";
import { DEFAULT_MODELS, type FetchFn, type LLMProviderId } from "../lib/llm";
import {
  accountName,
  listRsiAccounts,
  AI_ACCOUNTS_BODY,
  resolveAiScope,
  scopeToJson,
  scopeFromJson,
  scopeNames,
} from "../lib/rsi-accounts";
import { logEvent } from "../lib/logger";

/**
 * /api/llm/chat* — saved "Chat about my fleet" conversations.
 * Provider calls reuse lib/llm.ts; conversation persistence reuses the chat
 * DB queries. All routes are user-scoped (getChat/deleteChat verify ownership).
 */
export function chatRoutes(deps: { fetchFn?: FetchFn } = {}) {
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
    const accounts = await listRsiAccounts(c.env.DB, userID);
    const names = new Map(accounts.map((a) => [a.id, accountName(a)] as const));
    const { account_ids_json, ...chat } = result.chat;
    const scope = chatScope(accounts, scopeFromJson(account_ids_json));
    return c.json({ chat: { ...chat, accounts: scopeNames(scope, names) }, messages: result.messages });
  });

  // DELETE /api/llm/chats/:id
  routes.delete("/llm/chats/:id", validate("param", IntIdParam), async (c) => {
    const { id } = c.req.valid("param");
    const userID = getAuthUser(c).id;
    await deleteChat(c.env.DB, userID, id);
    return c.json({ ok: true });
  });

  // PATCH /api/llm/chats/:id — rename a chat
  routes.patch(
    "/llm/chats/:id",
    validate("param", IntIdParam),
    validate("json", z.object({ title: z.string().min(1).max(80) })),
    async (c) => {
      const { id } = c.req.valid("param");
      const { title } = c.req.valid("json");
      const ok = await renameChat(c.env.DB, getAuthUser(c).id, id, title.trim());
      if (!ok) return c.json({ error: "Chat not found" }, 404);
      return c.json({ ok: true });
    },
  );

  // POST /api/llm/chat — send a message; creates the chat on the first turn
  routes.post(
    "/llm/chat",
    validate(
      "json",
      z.object({
        chat_id: z.number().int().positive().optional(),
        provider: LLMProvider.default("anthropic"),
        model: z.string().max(100).nullish(),
        message: z.string().min(1).max(2000),
        // 'all' or a non-empty id list. Absent keeps the chat's stored scope (a new chat: all).
        accounts: AI_ACCOUNTS_BODY.optional(),
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

      const accounts = await listRsiAccounts(db, userID);
      const allNames = new Map(accounts.map((a) => [a.id, accountName(a)] as const));
      // Account labels only help the model when there is more than one hangar.
      const accountNames = accounts.length >= 2 ? allNames : undefined;

      // Resolve an existing chat (must exist + be owned) or prepare a new one.
      // The scope is the chat's accounts: a provided value replaces the stored
      // one before this message is answered; absent keeps it (a new chat: all).
      let model: string;
      let history: { role: string; content: string }[] = [];
      let scope: number[] | null;
      if (body.chat_id) {
        const existing = await getChat(db, userID, body.chat_id);
        if (!existing) return c.json({ error: "Chat not found" }, 404);
        model = body.model || existing.chat.model;
        history = existing.messages.map((m) => ({ role: m.role, content: m.content }));
        if (body.accounts !== undefined) {
          scope = resolveAiScope(accounts, body.accounts);
          await setChatAccounts(db, userID, body.chat_id, scopeToJson(scope));
        } else {
          scope = chatScope(accounts, scopeFromJson(existing.chat.account_ids_json));
        }
      } else {
        model = body.model || DEFAULT_MODELS[provider] || "";
        scope = resolveAiScope(accounts, body.accounts);
      }

      // Full fleet payload (incl. custom names) + entitled loaners + a per-ship
      // has_custom_loadout flag live in the system message. Loadout details are
      // fetched on demand via the get_ship_loadout tool (added in the agent loop).
      const fleet = await getFleetForAnalysis(db, userID, scope);
      const [customIds, loaners] = await Promise.all([
        getCustomLoadoutFleetIds(db, userID),
        getEntitledLoaners(db, userID, scope),
      ]);
      const fleetPayload = buildChatFleetPayload(fleet, customIds, loaners, { accountNames });
      const { system, messages } = buildChatRequest({
        fleetPayload,
        history,
        userMessage: body.message,
      });

      // Agent loop: the model may call the Fleet Chat tools on demand (up to 8 rounds)
      // to look things up, then produces a final answer.
      const turn = await runChatTurn({
        provider,
        apiKey,
        model,
        system,
        messages,
        db,
        userId: userID,
        scopeIds: scope,
        fetchImpl: deps.fetchFn,
      });
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
        (await createChat(db, {
          userId: userID,
          provider,
          model,
          title: body.message.slice(0, 80),
          accountIdsJson: scopeToJson(scope),
        }));
      await addChatMessage(db, { chatId, role: "user", content: body.message });
      await addChatMessage(db, { chatId, role: "assistant", content: reply });

      logEvent("llm_chat", { provider, model, chat_id: chatId, tool_rounds: turn.rounds });
      return c.json({
        chat_id: chatId,
        reply,
        model,
        tools_used: turn.toolsUsed,
        accounts: scopeNames(scope, allNames),
      });
    },
  );

  return routes;
}

/**
 * The accounts a stored chat scope covers now: NULL stays all; stored ids are
 * re-checked against the user's accounts (some may be deleted since), falling
 * back to the primary account when none remain.
 */
function chatScope(accounts: Array<{ id: number; is_primary: number }>, stored: number[] | null): number[] | null {
  return stored ? resolveAiScope(accounts, stored) : null;
}
