import { describe, it, expect } from "vitest";
import { ANALYSIS_PROMPT } from "../src/lib/analysis-prompt";
import { CHAT_PROMPT } from "../src/lib/chat-prompt";

/**
 * Prompt guarantees. The cargo rule fixes the observed bug where the model
 * called a cargo-capable ship (RSI Hermes, cargo 288, focus "Transporter")
 * "cargo unrated". The chat-scope rule fixes "gives more than I asked for".
 */
describe("LLM prompts", () => {
  it("ANALYSIS_PROMPT treats cargo as authoritative", () => {
    expect(ANALYSIS_PROMPT.toLowerCase()).toContain("cargo");
    expect(ANALYSIS_PROMPT.toLowerCase()).toContain("authoritative");
  });

  it("CHAT_PROMPT treats cargo as authoritative", () => {
    expect(CHAT_PROMPT.toLowerCase()).toContain("cargo");
    expect(CHAT_PROMPT.toLowerCase()).toContain("authoritative");
  });

  it("CHAT_PROMPT instructs answering only what is asked (no full report)", () => {
    const p = CHAT_PROMPT.toLowerCase();
    expect(p).toContain("only");
    expect(p).toMatch(/ask|question/);
  });
});
