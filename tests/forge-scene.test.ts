import { describe, expect, it } from "vitest";
import { roomLine, roomState, sceneRooms } from "../apps/web/app/forge-scene";
import { emptyBoard, moveCard, upsertCards, viewBoard, type Board } from "../apps/web/lib/board";

const T0 = "2026-11-25T09:00:00.000Z";
const at = (iso: string) => new Date(iso).getTime();
function seeded(): Board {
  return upsertCards(emptyBoard(), [
    { id: "circuit", title: "1단계 회로 · 값 읽기", detail: "d", owner: "hw" },
    { id: "lid", title: "하우징 저울판", detail: "d", owner: "me" },
    { id: "body", title: "하우징 몸통", detail: "d", owner: "me", dependsOn: ["lid"] },
    { id: "web", title: "폰 웹", detail: "d", owner: "sw", dependsOn: ["circuit"] }
  ], ["hw", "me", "sw"], "chief", T0);
}
const view = (board: Board, now = T0) => viewBoard(board, at(now));

describe("대장간 그림의 상태", () => {
  it("대장은 카드가 없어도 늘 있고, 나머지는 카드가 있는 달그락만 나온다", () => {
    expect(sceneRooms(view(emptyBoard()))).toEqual(["chief"]);
    expect(sceneRooms(view(seeded()))).toEqual(["chief", "hw", "sw", "me"]);
    expect(roomState(view(emptyBoard()), "chief")).toBe("idle");
    expect(roomLine(view(emptyBoard()), "chief")).toBe("이야기를 기다려요");
    expect(roomLine(view(emptyBoard()), "hw")).toBe("");
  });

  it("달그락이 일하는 중이면 작업 중이고, 지금 손댈 수 있는 카드의 이름을 보여준다", () => {
    const v = view(seeded());
    expect(roomState(v, "hw")).toBe("working");
    expect(roomLine(v, "hw")).toBe("1단계 회로 · 값 읽기");
    expect(roomLine(v, "me")).toBe("하우징 저울판");
  });

  it("사람에게 넘기면 내 차례가 되고, 해 달라는 말을 줄여서 보여준다", () => {
    const ask = "HX711 보드의 짧은 쪽 폭을 버니어 캘리퍼스로 재서 mm 단위로 알려주세요";
    const v = view(moveCard(seeded(), "lid", { turn: "person", ask }, "me", T0));
    expect(roomState(v, "me")).toBe("my_turn");
    expect(roomLine(v, "me").endsWith("…")).toBe(true);
    expect(roomLine(v, "me").length).toBeLessThanOrEqual(34);
    expect(ask.startsWith(roomLine(v, "me").slice(0, -1))).toBe(true);
  });

  it("앞 카드를 기다리는 사람 차례는 아직 알리지 않는다", () => {
    let board = moveCard(seeded(), "web", { turn: "person", ask: "폰으로 열어봐 주세요" }, "sw", T0);
    expect(roomState(view(board), "sw")).toBe("waiting");
    expect(roomLine(view(board), "sw")).toBe("앞 일을 기다려요");
    board = moveCard(board, "circuit", { turn: "done" }, "hw", T0);
    expect(roomState(view(board), "sw")).toBe("my_turn");
    expect(roomLine(view(board), "sw")).toBe("폰으로 열어봐 주세요");
  });

  it("내 차례가 막힘보다, 막힘이 작업 중보다 먼저다", () => {
    let board = moveCard(seeded(), "lid", { turn: "blocked", note: "로드셀 도면이 없어요" }, "me", T0);
    expect(roomState(view(board), "me")).toBe("blocked");
    expect(roomLine(view(board), "me")).toBe("로드셀 도면이 없어요");
    // 같은 대장간에 작업 중인 카드(body는 앞 카드 대기지만 turn은 agent)가 있어도 막힘이 먼저
    board = upsertCards(board, [{ id: "post", title: "받침대", detail: "d", owner: "me", turn: "person", ask: "받침 높이를 재 주세요" }], ["hw", "me", "sw"], "chief", T0);
    expect(roomState(view(board), "me")).toBe("my_turn");
  });

  it("현실을 기다리면 무엇을 언제까지인지, 예정일이 지났는지 보여준다", () => {
    const board = moveCard(seeded(), "circuit", { turn: "waiting", waiting: { what: "로드셀 배송", kind: "delivery", expectedAt: "2026-11-28" } }, "hw", T0);
    expect(roomState(view(board), "hw")).toBe("waiting");
    expect(roomLine(view(board), "hw")).toBe("로드셀 배송 · 11/28");
    expect(roomLine(view(board, "2026-11-30T12:00:00.000Z"), "hw")).toBe("로드셀 배송 · 11/28 · 예정일 지남");
    const unknown = moveCard(seeded(), "circuit", { turn: "waiting", waiting: { what: "출력 예약", kind: "booking", expectedAt: null } }, "hw", T0);
    expect(roomLine(view(unknown), "hw")).toBe("출력 예약");
  });

  it("그 달그락의 카드가 모두 끝나야 끝남이다", () => {
    let board = moveCard(seeded(), "lid", { turn: "done" }, "me", T0);
    expect(roomState(view(board), "me")).toBe("working");
    board = moveCard(board, "body", { turn: "done" }, "me", T0);
    expect(roomState(view(board), "me")).toBe("done");
    expect(roomLine(view(board), "me")).toBe("끝났어요");
  });
});
