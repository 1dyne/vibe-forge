import { describe, expect, it } from "vitest";
import { TROUBLE_CARDS } from "../apps/web/lib/parts/trouble-cards";
import { buildLadder, emptyVerify, judge, ladderBrief, recordRung, viewLadder, VerifyError, type Ladder, type VerifyState } from "../apps/web/lib/verify-ladder";
import type { CircuitComponent, LocalProject } from "../apps/web/lib/project-types";

const c = (ref: string, catalogId: string | undefined, valueOrModel: string): CircuitComponent => ({ ref, type: "part", valueOrModel, reason: "", catalogId });
const project = (components: CircuitComponent[], tools: string[] = ["멀티미터"]) => ({
  build: components.length ? { blueprint: { components, nets: [] } } : undefined,
  workflow: { profile: { tools, toolsConfirmed: true, firmwareExperience: "none", coreBehavior: "" } }
}) as unknown as LocalProject;
const UNO = c("U1", "arduino-uno-r3", "Arduino UNO R3");
const lamp = [UNO, c("OLED1", "ssd1306-oled-128x64", "SSD1306"), c("S1", "hc-sr04", "HC-SR04"), c("R1", "resistor", "220Ω"), c("LED1", "led-5mm", "LED")];
/** 앞 단계를 전부 "예"로 지나간다(값이 필요한 칸은 범위 안의 값으로). */
function passStage(ladder: Ladder, state: VerifyState, stage: string): VerifyState {
  for (const rung of ladder.rungs.filter((r) => r.stage === stage)) {
    const input = rung.expectedRange?.kind === "number" ? { value: ((rung.expectedRange.min ?? rung.expectedRange.max ?? 0) + (rung.expectedRange.max ?? rung.expectedRange.min ?? 0)) / 2 } : { yes: true };
    state = recordRung(ladder, state, rung.id, input, "person").state;
  }
  return state;
}

describe("회로 검증 사다리", () => {
  it("회로가 없으면 빈 사다리와 안내를 준다", () => {
    const ladder = buildLadder(project([]));
    expect(ladder.rungs).toEqual([]);
    expect(ladder.notes[0]).toContain("회로를 제출하면");
    expect(ladderBrief(ladder, emptyVerify())).toContain("회로를 제출하면");
  });

  it("단계 순서는 전원 넣기 전 → 전원 → 업로드 → 부품 하나씩 → 함께로 고정이다", () => {
    const ladder = buildLadder(project(lamp));
    const stages = ladder.rungs.map((r) => r.stage);
    expect([...new Set(stages)]).toEqual(["prepower", "power", "upload", "parts", "together"]);
    expect(ladder.rungs[0].id).toBe("prepower-short");
    // 전압을 재기 전에 표시등부터
    expect(ladder.rungs.find((r) => r.stage === "power")!.id).toBe("board-power-led");
    // 부품 칸은 회로에 적힌 부품 순서를 따르고, 어느 부품의 칸인지 붙는다
    const groups = [...new Set(ladder.rungs.filter((r) => r.stage === "parts").map((r) => r.partRef))];
    expect(groups).toEqual(["OLED1", "S1", "R1", "LED1"]);
    expect(ladder.rungs.find((r) => r.id === "hcsr04-supply:S1")!.group).toBe("S1 · HC-SR04 초음파 거리 센서");
  });

  it("앞 단계가 끝나기 전에는 다음 단계가 잠겨 있고, 잠긴 칸에는 적을 수 없다", () => {
    const ladder = buildLadder(project(lamp));
    let state = emptyVerify();
    const first = viewLadder(ladder, state);
    expect(first.current!.id).toBe("prepower-short");
    expect(first.stages.map((s) => s.locked)).toEqual([false, true, true, true, true]);
    expect(() => recordRung(ladder, state, "board-power-led", { yes: true }, "person")).toThrowError(VerifyError);
    state = passStage(ladder, state, "prepower");
    const next = viewLadder(ladder, state);
    expect(next.stages.map((s) => s.locked)).toEqual([false, false, true, true, true]);
    expect(next.current!.id).toBe("board-power-led");
  });

  it("범위 밖이 나오면 그 단계에 머물고, 요약이 다음에 볼 것을 말한다", () => {
    const ladder = buildLadder(project(lamp));
    let state = passStage(ladder, emptyVerify(), "prepower");
    state = recordRung(ladder, state, "board-power-led", { yes: true }, "person").state;
    const low = recordRung(ladder, state, "usb-5v-rail", { value: 4.41 }, "agent");
    expect(low.result).toMatchObject({ verdict: "fail", value: 4.41, by: "agent" });
    const view = viewLadder(ladder, low.state);
    expect(view.stages.find((s) => s.id === "upload")!.locked).toBe(true);
    expect(view.counts.fail).toBe(1);
    const brief = ladderBrief(ladder, low.state);
    expect(brief).toContain("범위 밖: USB를 꽂아도 보드 전원 LED가 안 켜져요 — 받은 값 4.41V");
    expect(brief).toContain("USB 허브를 빼고");
    // 고친 뒤 다시 재면 통과로 바뀐다
    expect(recordRung(ladder, low.state, "usb-5v-rail", { value: 5.02 }, "person").result.verdict).toBe("pass");
  });

  it("출처 있는 범위로만 숫자를 판정하고, 범위는 출처와 함께 나온다", () => {
    const ladder = buildLadder(project(lamp));
    const usb = ladder.rungs.find((r) => r.id === "usb-5v-rail")!;
    expect(usb.expectedRange).toMatchObject({ kind: "number", min: 4.75, max: 5.25, unit: "V" });
    expect(usb.input).toEqual({ kind: "number", unit: "V" });
    expect(judge(usb, { value: 5 })).toBe("pass");
    expect(judge(usb, { value: 4.5 })).toBe("fail");
    // 부품 카드의 공급 전압에서 온 범위: 카드의 출처를 달고 있다
    const sr04 = ladder.rungs.find((r) => r.id === "hcsr04-supply:S1")!;
    expect(sr04.expectedRange).toMatchObject({ kind: "number", min: 4.5, max: 5.5, unit: "V", sourceNote: "부품 카드(HC-SR04 초음파 거리 센서)의 공급 전압 범위" });
    expect((sr04.expectedRange as { sourceUrl: string }).sourceUrl).toMatch(/^https:\/\//);
    // 회로에 적힌 저항값에서 온 범위
    expect(ladder.rungs.find((r) => r.id === "resistor-value:R1")!.expectedRange).toMatchObject({ kind: "number", min: 209, max: 231, unit: "Ω" });
  });

  it("출처 있는 기준이 없으면 숫자를 받아도 모름으로 두고, 사람의 판단(예/아니오)으로만 바뀐다", () => {
    const ladder = buildLadder(project([c("U1", "esp32-devkit-v1", "ESP32"), c("R1", "resistor", "저항")]));
    const rail = ladder.rungs.find((r) => r.id === "board-3v3-rail")!;
    expect(rail.expectedRange).toBeNull();
    expect(judge(rail, { value: 3.28 })).toBe("unknown");
    expect(judge(rail, { value: 3.28, yes: true })).toBe("pass");
    // 값이 적히지 않은 저항은 범위를 지어내지 않는다
    expect(ladder.rungs.find((r) => r.id === "resistor-value:R1")!.expectedRange).toBeNull();
    // 모름은 통과가 아니라서 다음 단계가 열리지 않는다
    let state = passStage(ladder, emptyVerify(), "prepower");
    for (const rung of ladder.rungs.filter((r) => r.stage === "power")) state = recordRung(ladder, state, rung.id, rung.id === "board-3v3-rail" ? { value: 3.28 } : { yes: true }, "person").state;
    const view = viewLadder(ladder, state);
    expect(view.counts.unknown).toBe(1);
    expect(view.stages.find((s) => s.id === "upload")!.locked).toBe(true);
    expect(view.current!.id).toBe("board-3v3-rail");
    expect(ladderBrief(ladder, state)).toContain("모름(판단 필요)");
  });

  it("I2C 부품이 있으면 주소 스캔 칸이 생기고, 부품 카드의 주소로 판정한다", () => {
    const ladder = buildLadder(project(lamp));
    const scan = ladder.rungs.find((r) => r.id === "i2c-scan:OLED1")!;
    expect(scan.input).toEqual({ kind: "serial_line" });
    expect(scan.expectedRange).toMatchObject({ kind: "contains", anyOf: ["0x3C", "0x3D"] });
    expect(judge(scan, { text: "I2C device found at address 0x3c !" })).toBe("pass");
    expect(judge(scan, { text: "I2C device found at address 0x27" })).toBe("fail");
    expect(judge(scan, { text: "No I2C devices found" })).toBe("fail");
    expect(judge(scan, { text: "글자가 깨져서 나와요" })).toBe("unknown");
    // I2C 부품이 없는 회로에는 없다
    expect(buildLadder(project([UNO, c("LED1", "led-5mm", "LED")])).rungs.some((r) => r.id.startsWith("i2c-scan"))).toBe(false);
  });

  it("멀티미터가 없으면 눈으로 하는 확인으로 바뀌고, 할 수 없는 칸은 숨기지 않는다", () => {
    const ladder = buildLadder(project(lamp, ["자"]));
    expect(ladder.hasMultimeter).toBe(false);
    const short = ladder.rungs.find((r) => r.id === "prepower-short")!;
    expect(short).toMatchObject({ usingAlternative: true, unavailable: false, meterMode: null });
    expect(short.input.kind).toBe("observe");
    expect(short.expectedRange).toEqual({ kind: "answer", expect: "전원선과 GND선이 만나는 곳이 없어요" });
    const usb = ladder.rungs.find((r) => r.id === "usb-5v-rail")!;
    expect(usb.unavailable).toBe(true);
    expect(ladder.cannotVerify).toContain(usb.title);
    expect(ladder.notes.join(" ")).toContain("멀티미터 없이는 확인할 수 없어요");
    // 할 수 없는 칸은 통과로 세지 않지만, 길을 막지도 않는다
    let state = passStage({ ...ladder, rungs: ladder.rungs.filter((r) => !r.unavailable) }, emptyVerify(), "prepower");
    state = recordRung(ladder, state, "board-power-led", { yes: true }, "person").state;
    const view = viewLadder(ladder, state);
    expect(view.counts.unavailable).toBeGreaterThan(0);
    expect(view.stages.find((s) => s.id === "upload")!.locked).toBe(false);
    expect(view.stages.flatMap((s) => s.rungs).find((r) => r.id === "usb-5v-rail")!.status).toBe("unavailable");
    expect(ladderBrief(ladder, state)).toContain("멀티미터 없이는 확인할 수 없는 것");
  });

  it("값 없이는 적을 수 없고, 건너뛴 칸은 통과로 세지 않는다", () => {
    const ladder = buildLadder(project(lamp));
    expect(() => recordRung(ladder, emptyVerify(), "prepower-short", {}, "agent")).toThrowError(/적을 값이 없어요/);
    expect(() => recordRung(ladder, emptyVerify(), "no-such-rung", { yes: true }, "agent")).toThrowError(/찾을 수 없어요/);
    const skipped = recordRung(ladder, emptyVerify(), "prepower-short", { skip: "멀티미터를 빌리는 날 다시" }, "person");
    expect(skipped.result).toMatchObject({ verdict: "unknown", skipped: "멀티미터를 빌리는 날 다시" });
    const view = viewLadder(ladder, skipped.state);
    expect(view.counts).toMatchObject({ pass: 0, skipped: 1 });
    expect(view.stages[0].rungs[0].status).toBe("skipped");
    expect(ladderBrief(ladder, skipped.state)).toContain("건너뜀: 전원을 넣기 전에 합선이 없는지 확인해요 — 멀티미터를 빌리는 날 다시");
  });

  it("요약은 다음 칸의 방법·모드·리드 위치·단위·기준을 그대로 준다", () => {
    const ladder = buildLadder(project(lamp));
    const brief = ladderBrief(ladder, emptyVerify());
    expect(brief).toContain("다음에 받을 칸 (id: prepower-short)");
    expect(brief).toContain("멀티미터 모드: 통전(삐 소리)");
    expect(brief).toContain("리드를 댈 곳: 전원(+) 선 ↔ GND 선");
    expect(brief).toContain("사람이 돌려줄 것: 예/아니오");
  });

  it("부품 카드가 없는 부품은 전용 칸을 지어내지 않고 그렇다고 알린다", () => {
    const ladder = buildLadder(project([UNO, c("X1", undefined, "HX711 모듈")]));
    expect(ladder.rungs.some((r) => r.partRef === "X1")).toBe(false);
    expect(ladder.notes.join(" ")).toContain("X1(HX711 모듈)");
  });

  it("3.3V 보드에 5V 신호를 내는 부품이 있을 때만 신호 전압 칸이 생긴다", () => {
    const esp = buildLadder(project([c("U1", "esp32-devkit-v1", "ESP32"), c("S1", "hc-sr04", "HC-SR04")]));
    expect(esp.rungs.find((r) => r.id === "signal-over-3v3:S1")).toMatchObject({ stage: "parts", partRef: "S1" });
    expect(buildLadder(project(lamp)).rungs.some((r) => r.id.startsWith("signal-over-3v3"))).toBe(false);
  });
});

describe("문제 카드 묶음", () => {
  it("숫자 범위가 있는 카드는 모두 출처가 있다", () => {
    const numeric = TROUBLE_CARDS.filter((card) => card.expectedRange?.kind === "number");
    expect(numeric.length).toBeGreaterThanOrEqual(8);
    for (const card of numeric) expect(card.sourceUrl, card.id).toMatch(/^https:\/\//);
  });
  it("id가 겹치지 않고, 사다리용 조건만 가진 카드는 조립 단계에 붙지 않는 모양이다", () => {
    expect(new Set(TROUBLE_CARDS.map((card) => card.id)).size).toBe(TROUBLE_CARDS.length);
    for (const card of TROUBLE_CARDS.filter((x) => x.appliesWhen.always || x.appliesWhen.interface || x.appliesWhen.needsAny)) {
      expect(card.appliesWhen.catalogIds ?? card.appliesWhen.partTypes ?? card.appliesWhen.boardHasPin ?? card.appliesWhen.boardLogic, card.id).toBeUndefined();
    }
  });
});

describe("검증 도구 묶음", () => {
  it("도구 두 개와 사용 규칙을 내보낸다", async () => {
    const pack = await import("../apps/web/lib/tools/verify-tools");
    expect(pack.tools.map((t) => t.name)).toEqual(["get_verification_ladder", "record_verification"]);
    expect(pack.GUIDE_SECTION.startsWith("## ")).toBe(true);
    for (const tool of pack.tools) expect(tool.inputSchema).toMatchObject({ type: "object", additionalProperties: false });
  });
});
