import { describe, expect, it } from "vitest";
import { CHECKLIST, EXTRA_QUESTIONS, checklistMissing, checklistText, cleanExtras, extraAnswerText, extraQuestionsFor, extrasMissing, extrasText, type ProfileWithProjectExtras } from "../apps/web/lib/checklist";
import { emptyProfile, personPart } from "../apps/web/lib/workflow";
import { PersonProfileSchema } from "../apps/web/lib/profile-schema";

const profile = (over: Partial<ProfileWithProjectExtras> = {}): ProfileWithProjectExtras => ({ ...emptyProfile(), ...over });

describe("체크리스트 추가 질문", () => {
  it("전부 선택형이고, 물을 때와 놓일 자리가 정해져 있다", () => {
    const ids = EXTRA_QUESTIONS.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const q of EXTRA_QUESTIONS) {
      expect(q.options.length, q.id).toBeGreaterThanOrEqual(2);
      expect(q.hint, q.id).toMatch(/요\.$/);
      expect(q.scope === "project", q.id).toBe(q.tab === "project");
    }
    for (const id of ["measureTools", "computer", "installRights", "usbPort", "modeling3d", "programsUsed", "electricBasics", "sessionTime", "solderSpace", "ageGuardian", "overseasOrder", "deliveryWait", "helper", "stuckBefore", "whereUsed", "exposure", "finishLevel", "howMany"]) expect(ids, id).toContain(id);
    expect(extraQuestionsFor("gear").map((q) => q.id)).toEqual(["measureTools"]);
    expect(extraQuestionsFor("project").every((q) => q.scope === "project")).toBe(true);
  });

  it("그 단계 직전에 아직 답이 없는 것만 알려준다", () => {
    expect(extrasMissing(profile(), "before_first_measure").map((q) => q.id)).toEqual(["measureTools"]);
    expect(extrasMissing(profile({ extras: { measureTools: ["ruler"] } }), "before_first_measure")).toEqual([]);
    // 빈 배열은 답하지 않은 것이다
    expect(extrasMissing(profile({ extras: { measureTools: [] } }), "before_first_measure")).toHaveLength(1);
    // 프로젝트 것은 projectExtras에서 찾는다
    expect(extrasMissing(profile({ extras: { whereUsed: "indoor" } }), "before_form").map((q) => q.id)).toContain("whereUsed");
    expect(extrasMissing(profile({ projectExtras: { whereUsed: "indoor", exposure: ["none"], finishLevel: "works" } }), "before_form")).toEqual([]);
  });

  it("모델이 그대로 물을 수 있는 번호 붙은 선택지를 만든다", () => {
    const text = extrasText("before_first_measure");
    expect(text).toContain("1. 치수나 값을 잴 수 있는 도구가 있나요? [measureTools · 여러 개 선택 · 처음 무언가를 재 달라고 하기 전에]");
    expect(text).toContain("② 버니어 캘리퍼스 (caliper)");
    expect(extrasText().split("\n").filter((line) => /^\d+\. /.test(line))).toHaveLength(EXTRA_QUESTIONS.length);
    expect(extraAnswerText(EXTRA_QUESTIONS.find((q) => q.id === "measureTools")!, ["ruler", "caliper"])).toBe("자 (mm 눈금), 버니어 캘리퍼스");
  });

  it("모르는 질문과 선택지에 없는 값은 저장 전에 버린다", () => {
    expect(cleanExtras({ measureTools: ["ruler", "laser", "ruler"], computer: "amiga", installRights: "no", whereUsed: "indoor", nope: "x" }, "person")).toEqual({ measureTools: ["ruler"], installRights: "no" });
    expect(cleanExtras({ whereUsed: "indoor", measureTools: ["ruler"] }, "project")).toEqual({ whereUsed: "indoor" });
    expect(cleanExtras(null, "person")).toEqual({});
  });

  it("추가 답과 학습 모드는 계정에 실려 다니고, 저장 형식에도 맞는다", () => {
    const p = profile({ extras: { measureTools: ["caliper"], computer: "windows" }, learningMode: true });
    const person = personPart(p);
    expect(person.extras).toEqual({ measureTools: ["caliper"], computer: "windows" });
    expect(person.learningMode).toBe(true);
    expect(PersonProfileSchema.safeParse(person).success).toBe(true);
  });

  it("기존 체크리스트는 그대로다", () => {
    expect(CHECKLIST).toHaveLength(10);
    expect(checklistMissing(emptyProfile()).required.length).toBeGreaterThan(0);
    expect(checklistText()).toContain("1. 완성되면 무엇을 감지하고");
  });
});
