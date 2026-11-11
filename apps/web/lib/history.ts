import { randomUUID } from "node:crypto";
import type { DesignSnapshot, LocalProject } from "./project-types";

// 설계 기록 (명세서 2차 v0.1 §10). 덮어쓰기 전 값을 남긴다. 프로젝트당 최근 30개.
const KEEP = 30;
export function snapshot(p: LocalProject, field: DesignSnapshot["field"], tool: string, summary: string) {
  const value = p[field];
  if (value == null) return;
  p.history = [...(p.history ?? []), { id: randomUUID(), at: new Date().toISOString(), tool, summary, field, snapshot: JSON.stringify(value) }].slice(-KEEP);
}
/** 사람이 되돌릴 수 있는 항목. 형태·회로는 승인과 엮여 있어 '단계 다시'로만 바꾼다. */
export const RESTORABLE: DesignSnapshot["field"][] = ["buildPlan", "assembly", "housing", "power", "testPlan", "safety", "dataContract"];
export const FIELD_LABEL: Record<DesignSnapshot["field"], string> = { productForm: "완성품 형태", buildPlan: "설계도", build: "회로", assembly: "조립 가이드", housing: "하우징", power: "전원", testPlan: "테스트 계획", safety: "안전 검토", dataContract: "데이터 약속" };
