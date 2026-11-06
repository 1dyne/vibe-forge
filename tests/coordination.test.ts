import { describe, expect, it } from "vitest";
import { TASK_LEASE_MS, answerTaskQuestion, askAboutTask, buildForm, submitTaskForm, boardSummary, claimExpired, closeConflict, finalizeBlockers, raiseConflict, recordPurchase, resolveConflictByPerson, setTaskStatus, upsertTask } from "../apps/web/lib/coordination";
import type { LocalProject } from "../apps/web/lib/project-types";

function handoffProject(): LocalProject {
  return {
    id: "p1", ownerId: "u1", name: "재고 측정기", idea: "저울", oneLiner: "저울", stage: "spec", designRevision: 1, slots: [], tasks: [], messages: [], createdAt: "2026-11-06", updatedAt: "2026-11-06", lastAgentMode: "mock",
    build: { status: "ready", createdAt: "2026-11-06", blueprint: { title: "저울", board: "ATOMS3 Lite", supplyVoltage: 5, components: [{ ref: "U1", type: "board", valueOrModel: "ATOMS3 Lite", reason: "제어" }, { ref: "SC1", type: "sensor", valueOrModel: "Mini Scales", reason: "무게" }], nets: [], enclosure: { widthMm: 150, depthMm: 110, heightMm: 32, wallMm: 2.4 }, firmware: { platform: "arduino", behavior: "무게", pinAssignments: [], loopSteps: [] }, assumptions: [], humanChecks: [] }, checks: [], evaluator: { summary: "", hw: { verdict: "unknown", findings: [], requiredMeasurements: [] }, sw: { verdict: "unknown", findings: [], requiredRuns: [] } }, artifacts: [] },
    workflow: { phase: "handoff", profile: { tools: [], toolsConfirmed: true, coreBehavior: "무게", firmwareExperience: "independent" }, activeAgents: ["hw", "sw"], circuitApprovedAt: "2026-11-05", mockupApprovedAt: "2026-11-05", sharedUpdates: [], purchases: {}, evidence: [] }
  };
}
const link = (kind: string, id: string) => `https://forge.example/?p=p1&open=${kind}:${id}`;
const options = [
  { label: "HX711 키트로 바꾸기", detail: "납땜 필요", costDeltaKRW: -4000, changes: ["SC1 → HX711"], affects: ["회로", "조립 가이드"] },
  { label: "입고 기다리기", detail: "1주 지연", costDeltaKRW: 0, changes: [], affects: ["일정"] }
];

describe("shared task board", () => {
  it("keeps one task per request, separates the person's work from the agents' and links each item", () => {
    const p = handoffProject();
    const a = upsertTask(p, { assignee: "human", kind: "provide_info", title: "재고 확인", plain: "디바이스마트에서 U177 재고 수량을 확인해주세요." }, "chief");
    const again = upsertTask(p, { assignee: "human", kind: "provide_info", title: "재고 확인", plain: "디바이스마트에서 U177 재고 수량을 확인해주세요." }, "sw");
    expect(again.created).toBe(false);
    expect(again.task.id).toBe(a.task.id);
    upsertTask(p, { assignee: "sw", kind: "code", title: "서버 배포 시험", plain: "Workers + D1을 카드 없이 배포" }, "chief");
    const board = boardSummary(p, link);
    expect(board.humanTasks).toHaveLength(1);
    expect(board.agentTasks[0].assignee).toBe("sw");
    expect(board.humanTasks[0].openUrl).toBe(`https://forge.example/?p=p1&open=task:${a.task.id}`);
  });

  it("lets only the person finish their own tasks and asks for a reason when they are stuck", () => {
    const p = handoffProject();
    const { task } = upsertTask(p, { assignee: "human", kind: "measure", title: "5V 확인", plain: "포트 전압을 재주세요." }, "hw");
    expect(() => setTaskStatus(p, task.id, "completed", "hw")).toThrow("사람이 대시보드");
    expect(() => setTaskStatus(p, task.id, "cannot", "human")).toThrow("이유");
    setTaskStatus(p, task.id, "cannot", "human", { note: "필요한 도구가 없어요" });
    expect(p.tasks[0]).toMatchObject({ status: "cannot", note: "필요한 도구가 없어요" });
    // The agent that asked may withdraw the request and ask differently.
    setTaskStatus(p, task.id, "cancelled", "hw");
    expect(boardSummary(p, link).humanTasks).toHaveLength(0);
  });

  it("holds an agent task for one session at a time until the claim lapses", () => {
    const p = handoffProject();
    const { task } = upsertTask(p, { assignee: "sw", kind: "code", title: "웹앱", plain: "측정 화면" }, "chief");
    setTaskStatus(p, task.id, "in_progress", "sw", { session: "https://claude.ai/code/session_a" });
    expect(() => setTaskStatus(p, task.id, "in_progress", "sw", { session: "https://claude.ai/code/session_b" })).toThrow("다른 세션");
    expect(() => setTaskStatus(p, task.id, "completed", "human")).toThrow("에이전트가 맡은");
    p.tasks[0].claimedAt = new Date(Date.now() - TASK_LEASE_MS - 1000).toISOString();
    expect(claimExpired(p.tasks[0])).toBe(true);
    expect(boardSummary(p, link).agentTasks[0].status).toBe("ready");
    setTaskStatus(p, task.id, "in_progress", "sw", { session: "https://claude.ai/code/session_b" });
    expect(p.tasks[0].claimedBy).toBe("https://claude.ai/code/session_b");
  });
});

describe("decisions and finalising the design", () => {
  it("turns a stock problem into a decision card and holds finalising until every part is orderable and decided", () => {
    const p = handoffProject();
    expect(finalizeBlockers(p).join(" ")).toContain("U1, SC1");
    recordPurchase(p, "U1", "available", "");
    recordPurchase(p, "SC1", "problem", "디바이스마트 품절");
    const stock = p.conflicts![0];
    expect(stock).toMatchObject({ source: "stock", raisedBy: "server", status: "open", refs: ["SC1"] });
    expect(finalizeBlockers(p).join(" ")).toContain("정리하지 않은 충돌 1건");

    // The chief fills the card; the person writes a third way, the chief revises, the person picks.
    raiseConflict(p, { title: stock.title, detail: "U177 품절", source: "stock", refs: ["SC1"], options }, "chief", stock.id);
    resolveConflictByPerson(p, stock.id, { proposal: "공식몰에서 사면 어때요?" });
    expect(p.conflicts![0].status).toBe("reviewing");
    expect(() => closeConflict(p, stock.id, "resolved", "x")).not.toThrow();
    expect(p.conflicts![0].status).toBe("resolved");

    recordPurchase(p, "SC1", "ordered", "공식몰");
    expect(finalizeBlockers(p)).toEqual([]);
  });

  it("does not let an agent settle a decision the person has not made", () => {
    const p = handoffProject();
    const c = raiseConflict(p, { title: "무선 방식", detail: "AP 직접 vs 서버 중계", source: "interface", refs: ["U1"], options }, "chief");
    expect(() => closeConflict(p, c.id, "resolved", "AP로 결정")).toThrow("사람이 아직");
    resolveConflictByPerson(p, c.id, { optionId: "o2" });
    expect(p.conflicts![0].resolution?.optionId).toBe("o2");
    expect(() => resolveConflictByPerson(p, c.id, { optionId: "o1" })).toThrow("이미 정리된");
  });

  it("marks decisions raised after finalising as change proposals and blocks finalising on a failed review", () => {
    const p = handoffProject();
    p.build!.evaluator.hw.verdict = "fail";
    for (const ref of ["U1", "SC1"]) recordPurchase(p, ref, "received", "");
    expect(finalizeBlockers(p).join(" ")).toContain("교차 검토");
    p.workflow!.finalizedAt = "2026-11-07";
    const change = raiseConflict(p, { title: "저울 교체", detail: "더 큰 용량", source: "change", refs: ["SC1"], options }, "hw");
    expect(change.afterFinal).toBe(true);
  });
});

describe("information requests", () => {
  it("builds a form from a ready-made format plus extra fields and judges readings against the expected range", () => {
    const p = handoffProject();
    const form = buildForm("measurement", [{ key: "photo_note", label: "보드 LED 색", type: "text", required: false }], "USB 포트 전압이에요.", { value: { min: 4.75, max: 5.25 } });
    expect(form!.fields.map((f) => f.key)).toEqual(["value", "power", "where", "firmware", "photo_note"]);
    expect(form!.help).toContain("USB 포트 전압");
    expect(() => buildForm("nope", undefined, undefined)).toThrow("없는 포맷");
    const { task } = upsertTask(p, { assignee: "human", kind: "measure", title: "5V 확인", plain: "포트 전압", form, howTo: ["멀티미터를 DC 20V로", "빨간 리드 5V, 검은 리드 GND"] }, "hw");
    expect(() => submitTaskForm(p, task.id, { value: "약 5" , power: "켜진 상태" })).toThrow("숫자");
    expect(() => submitTaskForm(p, task.id, { value: "4.1" })).toThrow("전원 상태");
    const { summary } = submitTaskForm(p, task.id, { value: "4.1", power: "켜진 상태" }, "케이블이 길어요");
    expect(p.tasks[0]).toMatchObject({ status: "completed", response: { values: { value: 4.1 }, judgements: { value: "abnormal" } } });
    expect(summary).toContain("범위 밖");
    expect(boardSummary(p, link).recentlyDone[0].response!.values.value).toBe(4.1);
  });

  it("checks stock-check links and routes a question to the agent that asked", () => {
    const p = handoffProject();
    const { task } = upsertTask(p, { assignee: "human", kind: "confirm_availability", title: "재고", plain: "U177", form: buildForm("stock_check", undefined, undefined) }, "chief");
    expect(() => submitTaskForm(p, task.id, { url: "디바이스마트", model: "U177", stock: 3 })).toThrow("http");
    const q = askAboutTask(p, task.id, "재고 표시가 없으면 어떻게 해요?");
    expect(boardSummary(p, link).openQuestions[0]).toMatchObject({ for: "chief", questionId: q.id });
    answerTaskQuestion(p, task.id, q.id, "장바구니에 2개를 담아 보세요.", "chief");
    expect(boardSummary(p, link).openQuestions).toHaveLength(0);
    submitTaskForm(p, task.id, { url: "https://www.devicemart.co.kr/goods/view?no=1", model: "U177", stock: "2", price: "13,530" });
    expect(p.tasks[0].response!.values.price).toBe(13530);
  });
});
