import { describe, it, expect } from "vitest";
import { chatCompletion, type ToolSpec, type FetchFn } from "../src/lib/llm";

function res(status: number, body: unknown): Response {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return {
    status,
    ok: status >= 200 && status < 300,
    async text() { return text; },
  } as unknown as Response;
}

const SPEC: ToolSpec = {
  name: "get_ship_loadout",
  description: "Get the effective loadout of one of the user's ships.",
  parameters: { type: "object", properties: { ship: { type: "string" } } },
};

describe("chatCompletion tool calling — OpenAI", () => {
  it("parses tool_calls from the response into normalized toolCalls", async () => {
    const f = (async () =>
      res(200, {
        choices: [
          {
            message: {
              tool_calls: [
                { id: "c1", type: "function", function: { name: "get_ship_loadout", arguments: '{"ship":"Carrack"}' } },
              ],
            },
          },
        ],
      })) as unknown as FetchFn;

    const r = await chatCompletion(
      "openai",
      "k",
      { model: "gpt-4o", max_tokens: 100, tools: [SPEC], messages: [{ role: "user", content: "x" }] },
      f,
    );
    expect(r.toolCalls).toEqual([{ id: "c1", name: "get_ship_loadout", arguments: { ship: "Carrack" } }]);
  });

  it("sends tools + assistant tool-call turn + tool-result message in the request body", async () => {
    let captured: Record<string, unknown> = {};
    const f = (async (_url: string, init: RequestInit) => {
      captured = JSON.parse(init.body as string);
      return res(200, { choices: [{ message: { content: "done" } }] });
    }) as unknown as FetchFn;

    await chatCompletion(
      "openai",
      "k",
      {
        model: "gpt-4o",
        max_tokens: 100,
        tools: [SPEC],
        messages: [
          { role: "user", content: "x" },
          { role: "assistant", content: "", toolCalls: [{ id: "c1", name: "get_ship_loadout", arguments: { ship: "Carrack" } }] },
          { role: "tool", toolCallId: "c1", name: "get_ship_loadout", content: '{"ports":[]}' },
        ],
      },
      f,
    );

    const msgs = captured.messages as Array<Record<string, unknown>>;
    const tools = captured.tools as Array<Record<string, unknown>>;
    expect((tools[0].function as Record<string, unknown>).name).toBe("get_ship_loadout");

    const toolMsg = msgs.find((m) => m.role === "tool")!;
    expect(toolMsg.tool_call_id).toBe("c1");
    expect(toolMsg.content).toBe('{"ports":[]}');

    const asst = msgs.find((m) => m.role === "assistant" && m.tool_calls)!;
    const tc = (asst.tool_calls as Array<Record<string, unknown>>)[0];
    expect(tc.id).toBe("c1");
    expect(JSON.parse((tc.function as Record<string, string>).arguments)).toEqual({ ship: "Carrack" });
  });
});
