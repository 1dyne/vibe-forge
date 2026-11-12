import { randomUUID } from "node:crypto";
import type { DesignSnapshot, LocalProject } from "./project-types";

// 설계 기록 (명세서 2차 v0.1 §10). 덮어쓰기 전 값을 남긴다. 프로젝트당 최근 20개.
// 모든 프로젝트가 한 JSON 파일에 저장되므로 무거운 내용(회로 산출물 원문)은 줄이고, 한 기록은 40KB까지만 남긴다.
const KEEP = 20;
const MAX_CHARS = 40_000;
export function snapshot(p: LocalProject, field: DesignSnapshot["field"], tool: string, summary: string) {
  let value: unknown = p[field];
  if (value == null) return;
  if (field === "build" && p.build) value = { ...p.build, artifacts: p.build.artifacts.map((a) => ({ ...a, content: a.content.length > 1500 ? `${a.content.slice(0, 1500)}\n… (기록에서는 앞부분만 보관)` : a.content })) };
  let text = JSON.stringify(value);
  if (text.length > MAX_CHARS) text = JSON.stringify({ omitted: true, note: "너무 커서 기록에 남기지 않았어요", bytes: text.length });
  p.history = [...(p.history ?? []), { id: randomUUID(), at: new Date().toISOString(), tool, summary, field, snapshot: text }].slice(-KEEP);
}
/** 사람이 되돌릴 수 있는 항목. 형태·회로는 승인과 엮여 있어 '단계 다시'로만 바꾼다. */
export const RESTORABLE: DesignSnapshot["field"][] = ["buildPlan", "assembly", "housing", "power", "testPlan", "safety", "dataContract"];
export const FIELD_LABEL: Record<DesignSnapshot["field"], string> = { productForm: "완성품 형태", buildPlan: "설계도", build: "회로", assembly: "조립 가이드", housing: "하우징", power: "전원", testPlan: "테스트 계획", safety: "안전 검토", dataContract: "데이터 약속" };
