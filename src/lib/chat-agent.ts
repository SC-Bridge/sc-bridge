import { chatCompletion, mapProviderError, type FetchFn, type LLMMessage, type LLMProviderId } from "./llm";
import { GET_SHIP_LOADOUT_TOOL, executeChatTool } from "./chat-tools";

const MAX_TOOL_ROUNDS = 4;

export interface ChatTurnResult {
  ok: boolean;
  status: number;
  text: string;
  rounds: number;
  toolsUsed: string[];
  error?: string;
}

/**
 * Run one chat turn with on-demand tool calling: the model may call
 * get_ship_loadout up to MAX_TOOL_ROUNDS times; each call is executed
 * server-side (user-scoped) and fed back, then the model produces a final
 * answer. The final round drops the tools to force a text reply, so the loop
 * always terminates.
 */
export async function runChatTurn(opts: {
  provider: LLMProviderId;
  apiKey: string;
  model: string;
  system: string;
  messages: LLMMessage[];
  db: D1Database;
  userId: string;
  maxTokens?: number;
  fetchImpl?: FetchFn;
}): Promise<ChatTurnResult> {
  const { provider, apiKey, model, system, db, userId } = opts;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const messages: LLMMessage[] = [...opts.messages];
  const toolsUsed: string[] = [];
  let rounds = 0;

  for (;;) {
    const useTools = rounds < MAX_TOOL_ROUNDS;
    const comp = await chatCompletion(
      provider,
      apiKey,
      {
        model,
        max_tokens: opts.maxTokens ?? 1500,
        system,
        messages,
        ...(useTools ? { tools: [GET_SHIP_LOADOUT_TOOL] } : {}),
      },
      fetchImpl,
    );

    if (!comp.ok) {
      return { ok: false, status: comp.status, text: "", rounds, toolsUsed, error: mapProviderError(provider, comp.status, comp.body) };
    }

    if (useTools && comp.toolCalls?.length) {
      rounds++;
      messages.push({ role: "assistant", content: comp.text || "", toolCalls: comp.toolCalls });
      for (const call of comp.toolCalls) {
        const resultStr = await executeChatTool(db, userId, call);
        let label = call.name;
        try {
          const parsed = JSON.parse(resultStr) as { ship?: string };
          if (parsed.ship) label = parsed.ship;
        } catch {
          /* keep tool name */
        }
        toolsUsed.push(label);
        messages.push({ role: "tool", toolCallId: call.id, name: call.name, content: resultStr });
      }
      continue;
    }

    return { ok: true, status: comp.status, text: comp.text || "", rounds, toolsUsed };
  }
}
