import { describe, expect, it } from "vitest";
import { AUTO_DAILY_LIMIT, BoardError, answerCard, answerText, autoStatus, emptyBoard, markDispatched, moveCard, nextDispatch, postNotice, seeNotices, unseenNotices, upsertCards, viewBoard, type Board, type CardPrompt } from "../apps/web/lib/board";

const T = "2026-11-25T09:00:00.000Z";
const team = ["hw", "me"] as const;
const seeded = (): Board => ({ ...upsertCards(emptyBoard(), [
  { id: "circuit", title: "1단계 회로", detail: "HX711 값 읽기", owner: "hw" },
  { id: "lid", title: "하우징 뚜껑", detail: "저울판 치수", owner: "me" }
], [...team], "chief", T), auto: { on: true } });
const request: CardPrompt = { kind: "request", fields: [{ id: "width", label: "HX711 보드의 짧은 쪽 길이", kind: "number", unit: "mm", hint: "버니어 캘리퍼스로" }, { id: "arrived", label: "로드셀이 도착했나요", kind: "yes_no" }] };
const proposal: CardPrompt = { kind: "proposal", options: [{ id: "wait", label: "기다린다", effect: "일정 +4일, 비용 변화 없음" }, { id: "swap", label: "대체 부품으로 바꾼다", effect: "비용 +3,000원, 뚜껑 다시 출력" }], recommend: { id: "wait", why: "워크숍까지 여유가 있어요" } };

describe("요청 · 질문 · 제안", () => {
  it("요청은 칸에 맞게 답해야 받고, 답은 달그락에게 줄 한 줄 글이 된다", () => {
    const asked = moveCard(seeded(), "lid", { turn: "person", ask: "두 가지를 알려주세요", prompt: request }, "me", T);
    expect(() => answerCard(asked, "lid", { values: { width: "스물하나" as never, arrived: true } })).toThrowError(/숫자로/);
    expect(() => answerCard(asked, "lid", { values: { width: 21 } })).toThrowError(/도착했나요/);
    const answered = answerCard(asked, "lid", { values: { width: 21.2, arrived: false }, note: "내일 온대요" }, T);
    const card = answered.cards.find((c) => c.id === "lid")!;
    expect(card.turn).toBe("agent");
    expect(answerText(card)).toBe("HX711 보드의 짧은 쪽 길이: 21.2mm / 로드셀이 도착했나요: 아니요 / 내일 온대요");
    expect(viewBoard(answered).brief).toContain("사람의 답(하우징 뚜껑): HX711 보드의 짧은 쪽 길이: 21.2mm");
  });

  it("모르는 칸은 비워 둘 수 있지만 메모가 있어야 한다", () => {
    const asked = moveCard(seeded(), "lid", { turn: "person", ask: "알려주세요", prompt: request }, "me", T);
    const answered = answerCard(asked, "lid", { values: { arrived: true }, note: "폭은 캘리퍼스가 없어서 못 쟀어요" }, T);
    expect(answered.cards.find((c) => c.id === "lid")!.answer!.values).toEqual({ arrived: true });
  });

  it("제안은 보기마다 무엇이 달라지는지 적어야 하고, 사람은 보기 가운데서 고른다", () => {
    expect(() => moveCard(seeded(), "lid", { turn: "person", ask: "배송이 밀렸어요", prompt: { kind: "proposal", options: [{ id: "a", label: "기다린다" }, { id: "b", label: "바꾼다" }] } }, "me")).toThrowError(/무엇이 달라지는지/);
    const asked = moveCard(seeded(), "lid", { turn: "person", ask: "배송이 밀렸어요. 어떻게 할까요", prompt: proposal }, "me", T);
    expect(() => answerCard(asked, "lid", { note: "글쎄요" })).toThrowError(/하나를 골라/);
    expect(answerText(answerCard(asked, "lid", { choice: "swap" }, T).cards.find((c) => c.id === "lid")!)).toBe("대체 부품으로 바꾼다");
  });

  it("질문은 보기 밖의 생각을 적어도 된다", () => {
    const asked = moveCard(seeded(), "lid", { turn: "person", ask: "눈이 어디를 볼까요", prompt: { kind: "question", options: [{ id: "front", label: "앞" }, { id: "top", label: "위" }] } }, "me", T);
    expect(answerCard(asked, "lid", { note: "비스듬히 45도요" }, T).cards.find((c) => c.id === "lid")!.answer).toMatchObject({ note: "비스듬히 45도요" });
    expect(() => answerCard(asked, "lid", {})).toThrowError(BoardError);
  });
});

describe("변경 알림", () => {
  it("영향받는 달그락에게만 가고, 본 뒤에는 다시 오지 않는다", () => {
    const board = postNotice(seeded(), { from: "hw", text: "로드셀을 130mm형으로 바꿨어요", affects: ["me", "hw", "chief"] }, "n1", T);
    expect(unseenNotices(board, "me")).toHaveLength(1);
    expect(unseenNotices(board, "hw")).toHaveLength(0); // 알린 쪽 자신에게는 가지 않는다
    expect(viewBoard(board).brief).toContain("바뀐 것(확인 안 한 달그락: ME·CHIEF): 로드셀을 130mm형으로 바꿨어요");
    expect(unseenNotices(seeNotices(board, "me"), "me")).toHaveLength(0);
  });
});

describe("대장의 자동 진행", () => {
  it("꺼져 있으면 아무것도 넘기지 않는다", () => {
    expect(nextDispatch({ ...seeded(), auto: { on: false } }, [...team], T)).toBeNull();
    expect(autoStatus({ ...seeded(), auto: { on: false } }, [...team], T).state).toBe("off");
  });

  it("달그락 차례인 카드를 순서대로 하나씩 넘긴다", () => {
    const first = nextDispatch(seeded(), [...team], T)!;
    expect(first).toMatchObject({ room: "hw", reason: "card", cardId: "circuit" });
    expect(first.text).toContain("[대장의 작업 지시] 「1단계 회로」");
    expect(first.text).toContain("update_work_card");
    expect(autoStatus(seeded(), [...team], T).state).toBe("running");
  });

  it("사람의 답이 가장 먼저, 변경 알림이 그다음, 새 일이 마지막이다", () => {
    let board = moveCard(seeded(), "lid", { turn: "person", ask: "알려주세요", prompt: request }, "me", T);
    board = postNotice(board, { from: "person", text: "배송이 밀렸어요", affects: ["chief", "hw", "me"] }, "n1", T);
    board = answerCard(board, "lid", { values: { width: 21, arrived: true } }, T);
    const a = nextDispatch(board, [...team], T)!;
    expect(a).toMatchObject({ room: "me", reason: "answer", cardId: "lid" });
    expect(a.text).toContain("사람이 답했어요: HX711 보드의 짧은 쪽 길이: 21mm");
    board = markDispatched(board, a, T);
    const b = nextDispatch(board, [...team], T)!;
    expect(b).toMatchObject({ room: "chief", reason: "notice" });
    board = markDispatched(board, b, T);
    board = markDispatched(board, nextDispatch(board, [...team], T)!, T); // hw 알림
    board = markDispatched(board, nextDispatch(board, [...team], T)!, T); // me 알림
    expect(nextDispatch(board, [...team], T)).toMatchObject({ reason: "card", cardId: "circuit" });
  });

  it("차례를 넘기지 않는 달그락에게는 두 번까지만 넘기고 멈춘다", () => {
    let board = moveCard(seeded(), "lid", { turn: "done" }, "me", T);
    for (let i = 0; i < 2; i++) board = markDispatched(board, nextDispatch(board, [...team], T)!, T);
    expect(nextDispatch(board, [...team], T)).toBeNull();
    expect(autoStatus(board, [...team], T).state).toBe("stalled");
    // 달그락이 차례를 바꾸면 다시 센다
    board = moveCard(board, "circuit", { turn: "waiting", waiting: { what: "로드셀 배송", kind: "delivery", expectedAt: "2026-11-28" } }, "hw", T);
    expect(autoStatus(board, [...team], T).state).toBe("waiting_world");
    board = moveCard(board, "circuit", { turn: "agent" }, "hw", T);
    expect(nextDispatch(board, [...team], T)).toMatchObject({ cardId: "circuit" });
  });

  it("사람을 기다리는 동안에는 넘기지 않고, 그렇게 말한다", () => {
    let board = moveCard(seeded(), "circuit", { turn: "done" }, "hw", T);
    board = moveCard(board, "lid", { turn: "person", ask: "알려주세요", prompt: request }, "me", T);
    expect(nextDispatch(board, [...team], T)).toBeNull();
    expect(autoStatus(board, [...team], T)).toMatchObject({ state: "waiting_person", text: "내 답을 기다리고 있어요" });
  });

  it("하루 한도를 넘으면 멈춘다", () => {
    const board = { ...seeded(), auto: { on: true, day: T.slice(0, 10), count: AUTO_DAILY_LIMIT } };
    expect(nextDispatch(board, [...team], T)).toBeNull();
    expect(autoStatus(board, [...team], T).state).toBe("limit");
    expect(nextDispatch(board, [...team], "2026-11-26T09:00:00.000Z")).not.toBeNull();
  });
});
