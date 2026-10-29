import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

export type ModelProvider = "openai" | "anthropic" | "mock";
export type ModelCall = { role: string; instructions: string; input: unknown; schemaName: string; schema: Record<string, unknown>; maxOutputTokens?: number; effort?: "low" | "medium" | "high"; images?: Array<{ mediaType: "image/png" | "image/jpeg" | "image/webp"; data: string }>; costLimit?: { usd: number; inputPerMillion: number; outputPerMillion: number } };
export type ModelResult<T> = { parsed: T; provider: ModelProvider; model: string; requestId: string | null; usage: { inputTokens: number; outputTokens: number }; rawText: string };

export interface ModelAdapter {
  call<T>(request: ModelCall, validator: z.ZodType<T>): Promise<ModelResult<T>>;
}

export class MockModelAdapter implements ModelAdapter {
  constructor(private readonly fixture: unknown) {}
  async call<T>(_request: ModelCall, validator: z.ZodType<T>): Promise<ModelResult<T>> {
    const parsed = validator.parse(structuredClone(this.fixture));
    return { parsed, provider: "mock", model: "fixture", requestId: null, usage: { inputTokens: 0, outputTokens: 0 }, rawText: JSON.stringify(this.fixture) };
  }
}

export class OpenAIModelAdapter implements ModelAdapter {
  private readonly client: OpenAI;
  constructor(private readonly model: string, apiKey = process.env.OPENAI_API_KEY) {
    if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");
    if (!model) throw new Error("OpenAI model ID is not configured");
    this.client = new OpenAI({ apiKey, maxRetries: 0 });
  }
  async call<T>(request: ModelCall, validator: z.ZodType<T>): Promise<ModelResult<T>> {
    const response = await this.client.responses.create({
      model: this.model,
      instructions: request.instructions,
      input: JSON.stringify(request.input),
      max_output_tokens: request.maxOutputTokens ?? 1800,
      text: { format: { type: "json_schema", name: request.schemaName, strict: true, schema: request.schema } }
    });
    const parsed = validator.parse(JSON.parse(response.output_text));
    return { parsed, provider: "openai", model: this.model, requestId: response.id, usage: { inputTokens: response.usage?.input_tokens ?? 0, outputTokens: response.usage?.output_tokens ?? 0 }, rawText: response.output_text };
  }
}

export class AnthropicModelAdapter implements ModelAdapter {
  private readonly client: Anthropic;
  constructor(private readonly model: string, apiKey = process.env.ANTHROPIC_API_KEY) {
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");
    if (!model) throw new Error("Anthropic model ID is not configured");
    this.client = new Anthropic({ apiKey, maxRetries: 0 });
  }
  async call<T>(request: ModelCall, validator: z.ZodType<T>): Promise<ModelResult<T>> {
    const body = {
      model: this.model,
      max_tokens: request.maxOutputTokens ?? 1800,
      thinking: { type: "disabled" },
      output_config: request.effort ? { effort: request.effort } : undefined,
      system: request.instructions,
      messages: [{ role: "user", content: [...(request.images ?? []).map((image) => ({ type: "image", source: { type: "base64", media_type: image.mediaType, data: image.data } })), { type: "text", text: JSON.stringify(request.input) }] }],
      tools: [{ name: request.schemaName, description: "Return the requested structured result.", input_schema: request.schema as Anthropic.Tool.InputSchema }],
      tool_choice: { type: "tool", name: request.schemaName }
    } as unknown as Anthropic.MessageCreateParamsNonStreaming;
    if (request.costLimit) {
      const count = await this.client.messages.countTokens({ model: body.model, system: body.system, messages: body.messages, tools: body.tools, tool_choice: body.tool_choice });
      const inputUsd = (count.input_tokens + 200) * request.costLimit.inputPerMillion / 1_000_000;
      const affordableOutput = Math.floor((request.costLimit.usd - inputUsd) * 1_000_000 / request.costLimit.outputPerMillion);
      // A forced tool response must finish its entire JSON object. Silently reducing
      // output space can charge the user for an unusable, truncated file.
      if (affordableOutput < body.max_tokens) throw new Error("LIVE_CONTEXT_BUDGET_BLOCKED");
    }
    const response = await this.client.messages.create(body);
    const tool = response.content.find((content): content is Anthropic.ToolUseBlock => content.type === "tool_use");
    if (!tool) throw new Error("Anthropic response did not contain the required tool output");
    if (response.stop_reason === "max_tokens") {
      const keys = tool.input && typeof tool.input === "object" ? Object.keys(tool.input as Record<string, unknown>).join(",") : "none";
      throw new Error(`Anthropic structured response reached max_tokens before completion (output=${response.usage.output_tokens}, keys=${keys})`);
    }
    let structuredInput: unknown = tool.input;
    if (structuredInput && typeof structuredInput === "object") {
      const entries = Object.entries(structuredInput as Record<string, unknown>);
      if (entries.length === 1 && entries[0][0] === request.schemaName && entries[0][1] && typeof entries[0][1] === "object") structuredInput = entries[0][1];
      else if (entries.some(([key]) => key === request.schemaName)) structuredInput = Object.fromEntries(entries.filter(([key]) => key !== request.schemaName));
    }
    const validation = validator.safeParse(structuredInput);
    if (!validation.success) {
      const details = validation.error.issues.map((issue) => ({ path: issue.path.join("."), code: issue.code, message: issue.message }));
      throw new Error("MODEL_OUTPUT_INVALID: " + JSON.stringify(details));
    }
    const parsed = validation.data;
    return { parsed, provider: "anthropic", model: this.model, requestId: response.id, usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens }, rawText: JSON.stringify(structuredInput) };
  }
}

export type LogicalCallKey = { stepKey: string; roleOrTool: string; subjectRef: string; ordinal: number; inputHash: string };
export function logicalCallKey(key: LogicalCallKey): string {
  return [key.stepKey, key.roleOrTool, key.subjectRef, key.ordinal, key.inputHash].join("::");
}

export class RecordedModelAdapter implements ModelAdapter {
  private readonly results = new Map<string, unknown>();
  constructor(entries: { key: LogicalCallKey; value: unknown }[]) {
    for (const entry of entries) this.results.set(logicalCallKey(entry.key), entry.value);
  }
  async replay<T>(key: LogicalCallKey, validator: z.ZodType<T>): Promise<ModelResult<T>> {
    const value = this.results.get(logicalCallKey(key));
    if (value === undefined) throw new Error(`No recorded result for ${logicalCallKey(key)}`);
    const parsed = validator.parse(structuredClone(value));
    return { parsed, provider: "mock", model: "recorded", requestId: null, usage: { inputTokens: 0, outputTokens: 0 }, rawText: JSON.stringify(value) };
  }
  call<T>(_request: ModelCall, _validator: z.ZodType<T>): Promise<ModelResult<T>> {
    throw new Error("RecordedModelAdapter requires a logical call key; use replay()");
  }
}
