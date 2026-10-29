import { describe, expect, it } from "vitest";
import { z } from "zod";
import { logicalCallKey, MockModelAdapter, RecordedModelAdapter } from "@dalgeurak/agents";

describe("model adapters and replay keys", () => {
  it("validates mock output with the same contract used for live models", async () => {
    const adapter = new MockModelAdapter({ answer: "ok" });
    const result = await adapter.call({ role: "reply", instructions: "", input: {}, schemaName: "Reply", schema: {} }, z.object({ answer: z.string() }).strict());
    expect(result.parsed.answer).toBe("ok");
  });

  it("matches recorded calls independently of completion order", async () => {
    const first = { stepKey: "domains", roleOrTool: "domain_hw", subjectRef: "slot:a", ordinal: 0, inputHash: "hash-a" };
    const second = { stepKey: "domains", roleOrTool: "domain_hw", subjectRef: "slot:b", ordinal: 0, inputHash: "hash-b" };
    const adapter = new RecordedModelAdapter([{ key: second, value: { id: "b" } }, { key: first, value: { id: "a" } }]);
    const schema = z.object({ id: z.string() }).strict();
    expect(logicalCallKey(first)).not.toBe(logicalCallKey(second));
    await expect(adapter.replay(first, schema)).resolves.toMatchObject({ parsed: { id: "a" } });
  });
});
