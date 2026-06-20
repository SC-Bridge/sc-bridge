import { describe, it, expect } from "vitest";
import { buildChatRequest } from "../src/lib/chat";

const fleet = [{ vehicle_name: "RSI Hermes", cargo: 288 }];

describe("buildChatRequest", () => {
  it("puts the chat prompt + fleet data in the system message", () => {
    const { system } = buildChatRequest({ fleetPayload: fleet, history: [], userMessage: "hi" });
    expect(system).toContain("RSI Hermes");
    expect(system.toLowerCase()).toContain("only"); // CHAT_PROMPT scope rule
  });

  it("appends the new user message after prior history, in order", () => {
    const history = [
      { role: "user", content: "a" },
      { role: "assistant", content: "b" },
    ];
    const { messages } = buildChatRequest({ fleetPayload: fleet, history, userMessage: "c" });
    expect(messages.map((m) => m.content)).toEqual(["a", "b", "c"]);
    expect(messages[2].role).toBe("user");
  });

  it("keeps fleet data out of the message turns (system only — never duplicated)", () => {
    const { messages } = buildChatRequest({ fleetPayload: fleet, history: [], userMessage: "hi" });
    expect(JSON.stringify(messages)).not.toContain("RSI Hermes");
  });
});
