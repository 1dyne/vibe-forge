import { describe, expect, it } from "vitest";
import { BoardError, emptyBoard, moveCard, recordReal, upsertCards, viewBoard, type Board } from "../apps/web/lib/board";

const T0 = "2026-11-25T09:00:00.000Z";
const at = (iso: string) => new Date(iso).getTime();
const team = ["hw", "me"] as const;
function seeded(): Board {
  return upsertCards(emptyBoard(), [
    { id: "circuit-1", title: "1단계 회로", detail: "HX711 값 읽기", owner: "hw" },
    { id: "housing-lid", title: "하우징 뚜껑", detail: "저울판 뚜껑", owner: "me", dependsOn: ["circuit-1"] },
    { id: "order", title: "부품 주문", detail: "로드셀·HX711", owner: "chief", turn: "person", ask: "부품목록의 두 부품을 주문해 주세요" }
  ], [...team], "chief", T0);
}

describe("현황판", () => {
  it("사람이 지금 할 일은 하나만, 방마다 알림 수와 함께 나온다", () => {
    const view = viewBoard(seeded(), at(T0));
    expect(view.nextForPerson).toMatchObject({ cardId: "order", room: "chief", ask: "부품목록의 두 부품을 주문해 주세요" });
    expect(view.rooms.find((r) => r.room === "chief")).toMatchObject({ myTurn: 1, total: 1 });
    expect(view.rooms.find((r) => r.room === "hw")).toMatchObject({ myTurn: 0, working: 1 });
    expect(view.progress).toEqual({ done: 0, total: 3 });
  });

  it("앞 카드가 안 끝난 카드는 사람 차례여도 알리지 않는다", () => {
    let board = moveCard(seeded(), "order", { turn: "agent", note: "주문했어요" }, "person", T0);
    board = moveCard(board, "housing-lid", { turn: "person", ask: "뚜껑 안쪽 폭을 재 주세요" }, "me", T0);
    const held = viewBoard(board, at(T0));
    expect(held.cards.find((c) => c.id === "housing-lid")).toMatchObject({ heldBy: ["circuit-1"], active: false });
    expect(held.nextForPerson).toBeNull();
    board = moveCard(board, "circuit-1", { turn: "done" }, "hw", T0);
    expect(viewBoard(board, at(T0)).nextForPerson).toMatchObject({ cardId: "housing-lid", room: "me" });
  });

  it("사람에게 넘기려면 무엇을 해 달라는지 적어야 한다", () => {
    expect(() => moveCard(seeded(), "circuit-1", { turn: "person" }, "hw")).toThrowError(/ask/);
    expect(() => moveCard(seeded(), "circuit-1", { turn: "waiting" }, "hw")).toThrowError(/기다리는지/);
    expect(() => moveCard(seeded(), "circuit-1", { turn: "blocked" }, "hw")).toThrowError(/무엇 때문/);
  });

  it("사람의 확인을 기다리는 카드를 달그락이 혼자 끝낼 수 없다", () => {
    expect(() => moveCard(seeded(), "order", { turn: "done" }, "chief")).toThrowError(/사람의 확인/);
    expect(viewBoard(moveCard(seeded(), "order", { turn: "done" }, "person", T0)).progress.done).toBe(1);
  });

  it("앞 카드가 남았으면 완료로 바꿀 수 없다", () => {
    expect(() => moveCard(seeded(), "housing-lid", { turn: "done" }, "me")).toThrowError(/먼저 끝나야/);
  });

  it("팀에 없는 달그락, 없는 카드, 서로 기다리는 고리는 받지 않는다", () => {
    expect(() => upsertCards(emptyBoard(), [{ id: "a", title: "앱", detail: "d", owner: "sw" }], ["hw"], "chief")).toThrowError(/팀에 없어요/);
    expect(() => upsertCards(emptyBoard(), [{ id: "a", title: "A", detail: "d", owner: "hw", dependsOn: ["zzz"] }], ["hw"], "chief")).toThrowError(BoardError);
    expect(() => upsertCards(emptyBoard(), [{ id: "a", title: "A", detail: "d", owner: "hw", dependsOn: ["b"] }, { id: "b", title: "B", detail: "d", owner: "hw", dependsOn: ["a"] }], ["hw"], "chief")).toThrowError(/서로를 기다리고/);
  });

  it("카드를 다시 보내면 내용만 고치고 진행 상태와 기록은 지킨다", () => {
    const moved = moveCard(seeded(), "circuit-1", { turn: "waiting", waiting: { what: "로드셀 배송", kind: "delivery", expectedAt: "2026-11-28" } }, "hw", T0);
    const again = upsertCards(moved, [{ id: "circuit-1", title: "1단계 회로(값 읽기)", detail: "바뀐 설명", owner: "hw" }], [...team], "chief", T0);
    const card = again.cards.find((c) => c.id === "circuit-1")!;
    expect(card).toMatchObject({ title: "1단계 회로(값 읽기)", turn: "waiting", waiting: { expectedAt: "2026-11-28" } });
    expect(card.history).toHaveLength(2);
    expect(again.cards).toHaveLength(3);
  });

  it("현실 대기는 예정일이 지나면 먼저 물어볼 것으로 올라오고, 그동안 할 수 있는 일을 알려준다", () => {
    const board = moveCard(seeded(), "circuit-1", { turn: "waiting", waiting: { what: "로드셀 배송", kind: "delivery", expectedAt: "2026-11-28" } }, "hw", T0);
    const before = viewBoard(board, at("2026-11-27T12:00:00Z"));
    expect(before.overdue).toEqual([]);
    expect(before.canDoMeanwhile.map((c) => c.cardId)).toEqual(["order"]);
    const after = viewBoard(board, at("2026-11-30T12:00:00Z"));
    expect(after.overdue[0]).toMatchObject({ kind: "card", expectedAt: "2026-11-28" });
    expect(after.overdue[0].daysLate).toBeGreaterThanOrEqual(1);
    expect(after.brief).toContain("도착했는지");
  });

  it("배송이 밀리면 사건으로 남고, 도착하면 지난 예정일 경고가 사라진다", () => {
    let board = recordReal(emptyBoard(), { delivery: { label: "5kg 로드셀", status: "ordered", expectedAt: "2026-11-27" } }, T0);
    board = recordReal(board, { delivery: { label: "5kg 로드셀", status: "delayed", expectedAt: "2026-12-01", note: "판매자 출고 지연" } }, "2026-11-26T09:00:00.000Z");
    expect(board.real.deliveries).toHaveLength(1);
    expect(board.real.deliveries[0]).toMatchObject({ status: "delayed", expectedAt: "2026-12-01", orderedAt: T0 });
    expect(board.real.events.at(-1)!.text).toBe("5kg 로드셀 도착 예정이 2026-11-27 → 2026-12-01로 바뀌었어요");
    expect(viewBoard(board, at("2026-12-03T00:00:00Z")).overdue).toHaveLength(1);
    board = recordReal(board, { delivery: { label: "5kg 로드셀", status: "arrived" } }, "2026-12-03T10:00:00.000Z");
    expect(viewBoard(board, at("2026-12-04T00:00:00Z")).overdue).toEqual([]);
    expect(board.real.events.at(-1)!.text).toBe("5kg 로드셀 도착");
  });

  it("사람이 지금 하는 일과 여건이 달그락에게 가는 요약에 실린다", () => {
    const board = recordReal(recordReal(seeded(), { now: "납땜 3단계 하는 중" }, T0), { availability: "이번 주는 수요일 저녁만 가능" }, T0);
    const brief = viewBoard(board, at(T0)).brief;
    expect(brief).toContain("사람이 지금 하는 일: 납땜 3단계 하는 중");
    expect(brief).toContain("이번 주는 수요일 저녁만 가능");
    expect(viewBoard(recordReal(board, { now: null }, T0)).real.now).toBeNull();
  });
});

describe("하드웨어 달그락", () => {
  it("전자회로나 기구설계가 팀에 있으면 따로 고르지 않아도 함께한다", async () => {
    const { withHardwareLead, AGENTS, AGENT_TEAM } = await import("../apps/web/lib/workflow");
    expect(withHardwareLead(["hw", "sw"])).toEqual(["hwlead", "hw", "sw"]);
    expect(withHardwareLead(["sw", "id"])).toEqual(["sw", "id"]);
    expect(withHardwareLead(["hwlead", "me"])).toEqual(["hwlead", "me"]);
    expect(AGENTS.hwlead.name).toBe("하드웨어 달그락");
    expect([AGENT_TEAM.hwlead, AGENT_TEAM.hw, AGENT_TEAM.me]).toEqual(["하드웨어", "하드웨어", "하드웨어"]);
  });
});
