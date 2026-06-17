import { CHAT_PROMPT } from "./chat-prompt";

export interface ChatTurn {
  role: string;
  content: string;
}

/**
 * Assemble the provider request for one chat turn.
 *
 * The fleet data lives in the system message (rebuilt each call), so it is
 * present exactly once and never persisted into the stored conversation. The
 * `messages` array is the real conversation: prior history + the new user
 * message. Shape matches `chatCompletion`'s `{ system, messages }`.
 */
export function buildChatRequest(opts: {
  fleetPayload: unknown;
  history: ChatTurn[];
  userMessage: string;
}): { system: string; messages: ChatTurn[] } {
  const system = `${CHAT_PROMPT}\n\nThe user's fleet (JSON):\n${JSON.stringify(opts.fleetPayload)}`;
  return {
    system,
    messages: [
      ...opts.history.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: opts.userMessage },
    ],
  };
}
