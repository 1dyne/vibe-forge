import { randomUUID } from "node:crypto";
import { z } from "zod";
import { blockingChecks, blueprintJsonSchema, buildFromSubmission } from "../build-pipeline";
import { checkProductForm } from "../form-check";
import { mutateProject } from "../local-project-store";
import { checkMockup, mockupBrief, type MockupSpec } from "../mockup";
import type { ProductForm } from "../project-types";
import { RevisionError, createProposal, impactText, proposalSummary, revisionOf, type RevisionChanges } from "../revision";
import { ToolError, kit, projectIdSchema, type ToolDefinition } from "../tool-kit";
import { workflowFor } from "../workflow";

// 제작 후 수정의 달그락 쪽 도구. 달그락은 수정안을 "낼" 수만 있다.
// 적용은 사람이 작업대에서 승인할 때 일어난다(/api/projects/<id>/revision).

export const GUIDE_SECTION = `## 제작 후 수정 (propose_design_change · list_design_changes)
하드웨어는 뽑고 조립한 뒤에 반드시 고쳐진다. 구멍이 1mm 낮다, 부품이 품절이라 다른 걸 샀다, 선이 짧다. 승인된 설계도 고칠 수 있다.
- 승인된 설계를 바꿔야 할 때 "수정할 수 없어요", "설계를 처음부터 다시 논의해야 해요"라고 말하지 않는다. propose_design_change로 수정안을 낸다.
- reason에는 현실에서 실제로 일어난 일을 적는다(사용자가 말했거나 잰 것). 예: "출력해 보니 USB 구멍이 플러그보다 1mm 낮았어요". 일어나지 않은 일이나 재지 않은 치수를 지어내지 않는다.
- changes에는 바꾸는 항목만, 바뀐 뒤의 값을 통째로 넣는다. 회로는 submit_circuit과 같은 blueprint·review, 완성품 형태는 set_product_form과 같은 form, 정밀 목업은 set_precise_mockup과 같은 mockup이다. 안 바꾸는 항목은 넣지 않는다.
- 수정안은 저장만 되고 적용되지 않는다. 결과로 서버가 계산한 "바뀌는 것"과 "사람이 다시 할 일"이 돌아온다. 이것을 사용자에게 쉬운 말로 설명한다: 무엇이 바뀌는지, 이미 산 부품·이미 한 조립·이미 뽑은 하우징 가운데 무엇을 다시 해야 하는지, 비용이 얼마나 달라지는지(모르는 가격은 모른다고 말한다).
- 그다음 사용자에게 작업대의 '수정안'에서 승인해 달라고 한다. 승인은 사람만 한다. 네가 승인했다고 말하거나 승인된 것처럼 이어가지 않는다.
- 사용자가 승인하면 다시 할 일이 할 일 목록에 생긴다. 회로가 바뀌었으면 조립 가이드(set_assembly_guide)와 테스트 계획도 바뀐 회로에 맞게 다시 저장한다.
- 하우징 제작 계획(set_housing_plan)과 조립 가이드(set_assembly_guide)는 수정안 없이도 다시 저장할 수 있다. 다만 사람이 이미 뽑았거나 조립한 것이 있으면, 무엇을 다시 해야 하는지 먼저 말한다.
- 같은 항목의 수정안을 다시 내면 앞의 것은 자동으로 갈음된다. 진행 상황은 list_design_changes로 본다.`;

const N = z.number().min(-500).max(500);
const Vec3 = z.tuple([z.number().min(-400).max(400), z.number().min(-400).max(400), z.number().min(-50).max(400)]);
const Size3 = z.tuple([z.number().min(0.5).max(400), z.number().min(0.5).max(400), z.number().min(0.5).max(400)]);
// set_product_form이 받는 것과 같은 모양
const ProductFormSchema = z.object({
  summary: z.string().min(1).max(800),
  answers: z.array(z.object({ question: z.string().min(1).max(200), answer: z.string().min(1).max(400) }).strict()).min(1).max(12),
  shape: z.array(z.object({ name: z.string().min(1).max(60), primitive: z.enum(["box", "sphere", "cylinder", "cone"]), size: Size3, position: z.tuple([z.number().min(-400).max(400), z.number().min(-400).max(400), z.number().min(0).max(400)]), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional() }).strict()).min(1).max(16),
  features: z.array(z.object({ name: z.string().min(1).max(60), kind: z.enum(["screen", "camera", "button", "speaker", "mic", "port", "light", "other"]), facing: z.enum(["front", "back", "top", "bottom", "left", "right"]), position: Vec3, size: z.tuple([z.number().min(0.5).max(300), z.number().min(0.5).max(300)]), linkedRef: z.string().max(16).optional() }).strict()).max(16),
  internals: z.array(z.object({ ref: z.string().min(1).max(16), label: z.string().min(1).max(80), size: Size3, position: Vec3, catalogId: z.string().max(60).optional(), rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).optional(), sizeBasis: z.enum(["card", "datasheet", "measured", "assumed"]).optional(), stackedWith: z.array(z.string().max(16)).max(4).optional() }).strict()).max(16),
  material: z.string().min(1).max(200)
}).strict();

// set_precise_mockup이 받는 것과 같은 모양
const P = z.number().min(0.05).max(500);
const V3 = z.tuple([N, N, N]);
const Solid = z.discriminatedUnion("shape", [
  z.object({ shape: z.literal("box"), size: z.tuple([P, P, P]), at: V3, rotate: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).optional() }).strict(),
  z.object({ shape: z.literal("hollowBox"), size: z.tuple([P, P, P]), at: V3, wall: P, floor: P, openings: z.array(z.object({ wall: z.enum(["front", "back", "left", "right"]), offset: N, bottom: z.number().min(0).max(500), width: P, height: P }).strict()).max(8).optional() }).strict(),
  z.object({ shape: z.literal("cylinder"), diameter: P, length: P, at: V3, axis: z.enum(["x", "y", "z"]).optional() }).strict()
]);
const Rule = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("gap"), title: z.string().min(1).max(80), a: z.string().max(24), b: z.string().max(24), axis: z.enum(["x", "y", "z"]), min: z.number().min(0).max(200), max: z.number().min(0).max(200).optional() }).strict(),
  z.object({ kind: z.literal("inside"), title: z.string().min(1).max(80), a: z.string().max(24), b: z.string().max(24), margin: z.number().min(0).max(50).optional() }).strict(),
  z.object({ kind: z.literal("touch"), title: z.string().min(1).max(80), a: z.string().max(24), b: z.string().max(24), tolerance: z.number().min(0).max(5).optional() }).strict()
]);
const MockupSchema = z.object({
  title: z.string().min(1).max(80), summary: z.string().min(1).max(800),
  parts: z.array(z.object({ id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,23}$/), name: z.string().min(1).max(40), group: z.enum(["housing", "measured", "keepout"]), basis: z.enum(["measured", "datasheet", "assumed", "design"]), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(), note: z.string().max(200).optional(), explode: V3.optional(), solids: z.array(Solid).min(1).max(12), cuts: z.array(z.discriminatedUnion("shape", [z.object({ shape: z.literal("box"), size: z.tuple([P, P, P]), at: V3, rotate: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).optional() }).strict(), z.object({ shape: z.literal("cylinder"), diameter: P, length: P, at: V3, axis: z.enum(["x", "y", "z"]).optional() }).strict()])).max(24).optional() }).strict()).min(1).max(40),
  mates: z.array(z.tuple([z.string().max(24), z.string().max(24)])).max(40).optional(),
  rules: z.array(Rule).max(40).optional()
}).strict();

const Input = z.object({
  projectId: z.string().uuid(),
  by: z.enum(["chief", "hw", "sw", "me", "id"]),
  title: z.string().trim().min(1).max(80),
  reason: z.string().trim().min(5).max(600),
  changes: z.object({
    circuit: z.object({ blueprint: z.unknown(), review: z.unknown() }).strict().optional(),
    productForm: ProductFormSchema.optional(),
    preciseMockup: MockupSchema.optional()
  }).strict()
}).strict();

export const tools: ToolDefinition[] = [
  {
    name: "propose_design_change", title: "승인된 설계에 수정안 내기",
    description: "승인된 설계(회로, 완성품 형태, 정밀 목업)를 고쳐야 할 때 수정안을 낸다. 수정안은 적용되지 않고 따로 저장되며, 서버가 지금 설계와 견줘 바뀌는 것과 사람이 다시 할 일(안 쓰게 된 부품, 다시 이을 선, 다시 올릴 코드, 다시 뽑을 하우징 부위, 다시 할 테스트, 비용 차이)을 계산해 돌려준다. 사람이 작업대에서 승인해야 적용된다. reason에는 현실에서 실제로 일어난 일을 적는다. changes에는 바꾸는 항목만 바뀐 뒤의 값을 통째로 넣는다.",
    inputSchema: { type: "object", additionalProperties: false, required: ["projectId", "by", "title", "reason", "changes"], properties: {
      projectId: projectIdSchema,
      by: { type: "string", enum: ["chief", "hw", "sw", "me", "id"], description: "수정안을 내는 달그락" },
      title: { type: "string", description: "사람이 알아볼 이름 (예: USB 구멍 1mm 올리기)" },
      reason: { type: "string", description: "현실에서 일어난 일. 사용자가 말했거나 잰 것만 (예: 출력해 보니 USB 구멍이 플러그보다 1mm 낮았어요)" },
      changes: { type: "object", additionalProperties: false, description: "바꾸는 항목만 넣는다", properties: {
        circuit: { type: "object", additionalProperties: false, required: ["blueprint", "review"], description: "회로를 바꿀 때. submit_circuit과 같은 형식", properties: { blueprint: blueprintJsonSchema, review: { type: "object", description: "submit_circuit의 review와 같은 형식의 검토" } } },
        productForm: { type: "object", description: "완성품 형태를 바꿀 때. set_product_form의 form과 같은 형식 (summary, answers, shape, features, internals, material)" },
        preciseMockup: { type: "object", description: "정밀 목업을 바꿀 때. set_precise_mockup의 mockup과 같은 형식 (title, summary, parts, mates, rules). 검사를 전부 통과해야 받는다" }
      } }
    } },
    run: async (input, context) => {
      const parsed = Input.parse(input);
      const project = await kit.ownedProject(parsed.projectId, context);
      const changes: RevisionChanges = {};
      if (parsed.changes.circuit) {
        if (!project.build) throw new ToolError("아직 회로가 없어요. 첫 회로는 submit_circuit으로 제출해주세요.");
        const build = buildFromSubmission(parsed.changes.circuit.blueprint, parsed.changes.circuit.review, workflowFor(project).profile);
        const blocked = blockingChecks(build);
        if (blocked.length) throw new ToolError(`바꾼 회로에 꼭 고쳐야 할 문제가 있어 수정안으로 받지 않았어요: ${blocked.map((c) => c.message).join(" / ")} 회로를 고쳐 다시 내주세요.`);
        changes.build = build;
      }
      if (parsed.changes.productForm) {
        const form = { ...parsed.changes.productForm, updatedAt: new Date().toISOString() } as ProductForm;
        const blocked = checkProductForm(form).filter((f) => f.severity === "blocked");
        if (blocked.length) throw new ToolError(`바꾼 형태에 꼭 고쳐야 할 배치 문제가 있어요: ${blocked.map((f) => f.message).join(" / ")} 고쳐서 다시 내주세요.`);
        changes.productForm = form;
      }
      if (parsed.changes.preciseMockup) {
        const spec = parsed.changes.preciseMockup as MockupSpec;
        const ids = spec.parts.map((p) => p.id);
        if (new Set(ids).size !== ids.length) throw new ToolError("정밀 목업의 부품 id가 겹쳐요. 부품마다 다른 id를 써주세요.");
        const unknown = [...(spec.mates ?? []).flat(), ...(spec.rules ?? []).flatMap((r) => [r.a, r.b])].filter((id) => !ids.includes(id));
        if (unknown.length) throw new ToolError(`mates·rules에 없는 부품 id가 있어요: ${[...new Set(unknown)].join(", ")}`);
        const report = checkMockup(spec);
        if (report.failed.length) throw new ToolError(`바꾼 정밀 목업이 검사를 통과하지 못했어요. 고쳐서 다시 내주세요.\n${mockupBrief(spec, report)}`);
        changes.preciseMockup = spec;
      }
      let text = "";
      try {
        const updated = await mutateProject(parsed.projectId, (p) => {
          const now = new Date().toISOString();
          const { state, proposal } = createProposal(p, { title: parsed.title, reason: parsed.reason, by: parsed.by, changes }, randomUUID(), now);
          p.revision = state;
          text = impactText(proposal.impact);
          const w = workflowFor(p);
          w.sharedUpdates.push({ id: randomUUID(), agent: parsed.by, text: `수정안 「${proposal.title}」: ${proposal.reason} (승인 전 · 바뀌는 항목 ${proposal.impact.fields.join(", ")})`, createdAt: now });
          p.workflow = w;
        });
        const result = kit.stored(updated, context, `수정안을 올렸어요. 아직 적용되지 않았어요.\n\n${text}\n\n이 내용을 사용자에게 쉬운 말로 설명하고, 작업대의 '수정안'에서 승인해 달라고 하세요. 승인은 사람만 할 수 있어요.`);
        return { ...result, data: { ...(result.data as Record<string, unknown>), designChanges: revisionOf(updated).proposals.map(proposalSummary) } };
      } catch (error) {
        if (error instanceof RevisionError) throw new ToolError(error.message);
        throw error;
      }
    }
  },
  {
    name: "list_design_changes", title: "수정안 목록 보기",
    description: "이 프로젝트의 수정안과 상태(승인 대기·승인·거절·갈음됨), 서버가 계산한 영향과 사람이 다시 할 일을 본다. 사용자가 승인했는지 확인할 때 쓴다.",
    inputSchema: { type: "object", additionalProperties: false, required: ["projectId"], properties: { projectId: projectIdSchema } },
    annotations: { readOnlyHint: true },
    run: async (input, context) => {
      const { projectId } = z.object({ projectId: z.string().uuid() }).strict().parse(input);
      const project = await kit.ownedProject(projectId, context);
      const proposals = revisionOf(project).proposals;
      const label = { proposed: "승인 대기", approved: "승인됨", rejected: "거절됨", superseded: "새 수정안으로 갈음됨" } as const;
      const text = proposals.length
        ? proposals.slice().reverse().map((p) => `■ ${p.title} — ${label[p.status]}\n이유: ${p.reason}\n${impactText(p.impact)}`).join("\n\n")
        : "아직 수정안이 없어요.";
      return { text, data: { designChanges: proposals.map(proposalSummary) } };
    }
  }
];
