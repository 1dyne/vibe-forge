import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const sdk = vi.hoisted(() => ({ countTokens: vi.fn(), create: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => ({ default: class { messages = sdk; } }));
import { AnthropicModelAdapter, type ModelCall } from "../packages/agents/src/index";

const request: ModelCall = { role: "me", instructions: "Create a draft", input: {}, schemaName: "draft", schema: { type: "object" }, maxOutputTokens: 2400, costLimit: { usd: 0.05, inputPerMillion: 2, outputPerMillion: 10 } };
const schema = z.object({ filename: z.string(), content: z.string() }).strict();
const response = (input: unknown, stop_reason = "tool_use") => ({ id: "test", content: [{ type: "tool_use", name: "draft", input }], stop_reason, usage: { input_tokens: 1000, output_tokens: 200 } });
beforeEach(() => { vi.clearAllMocks(); sdk.countTokens.mockResolvedValue({ input_tokens: 1000 }); });

describe("structured file response and budget preflight", () => {
  it("keeps complete file content and the full requested output allowance", async () => {
    const file = { filename: "button.scad", content: "difference(){cube([20,20,2]);translate([10,10,-1])cylinder(d=8,h=4);}" };
    sdk.create.mockResolvedValue(response(file));
    const result = await new AnthropicModelAdapter("test-sonnet", "test-key").call(request, schema);
    expect(result.parsed).toEqual(file);
    expect(sdk.create.mock.calls[0][0].max_tokens).toBe(2400);
  });
  it("rejects insufficient output budget before paid generation instead of truncating files", async () => {
    sdk.countTokens.mockResolvedValue({ input_tokens: 20000 });
    await expect(new AnthropicModelAdapter("test-sonnet", "test-key").call(request, schema)).rejects.toThrow("LIVE_CONTEXT_BUDGET_BLOCKED");
    expect(sdk.create).not.toHaveBeenCalled();
  });
  it("distinguishes a malformed model result from invalid user input", async () => {
    sdk.create.mockResolvedValue(response({ filename: "button.scad" }));
    await expect(new AnthropicModelAdapter("test-sonnet", "test-key").call(request, schema)).rejects.toThrow("MODEL_OUTPUT_INVALID");
    sdk.create.mockResolvedValue(response({ filename: "button.scad" }, "max_tokens"));
    await expect(new AnthropicModelAdapter("test-sonnet", "test-key").call(request, schema)).rejects.toThrow("max_tokens");
  });
});
