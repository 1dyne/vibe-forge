import { describe, expect, it } from "vitest";
import { LEARN_NOTES, STAGE_WHY, circuitReadingGuide, noteFor, splitLearnText } from "../apps/web/lib/learn";
import type { BuildBlueprint } from "../apps/web/lib/project-types";

const blueprint = {
  title: "버튼 램프", board: "Arduino UNO R3", supplyVoltage: 5,
  components: [{ ref: "A1", type: "board", valueOrModel: "Arduino UNO R3", reason: "" }, { ref: "S1", type: "button", valueOrModel: "택트 스위치", reason: "" }, { ref: "D1", type: "led", valueOrModel: "LED 5mm", reason: "" }, { ref: "R1", type: "resistor", valueOrModel: "220Ω", reason: "" }],
  // 일부러 신호 → GND → 전원 순서로 적는다
  nets: [{ name: "BUTTON_IN", kind: "signal", members: ["A1.D2", "S1.1"] }, { name: "GND", kind: "ground", members: ["A1.GND", "S1.2", "D1.K"] }, { name: "LED_OUT", kind: "signal", members: ["A1.D9", "R1.1"] }, { name: "5V", kind: "power", members: ["A1.5V"] }],
  enclosure: { widthMm: 60, depthMm: 40, heightMm: 20, wallMm: 2 },
  firmware: { platform: "arduino", behavior: "", pinAssignments: [{ symbol: "BUTTON_IN", pin: 2, role: "digital_input" }, { symbol: "LED_OUT", pin: 9, role: "pwm_output" }], loopSteps: [] },
  assumptions: [], humanChecks: []
} as unknown as BuildBlueprint;

describe("학습 모드의 설명", () => {
  it("약속한 낱말마다 뜻·이유·다음에 정하는 법이 해요체로 있다", () => {
    for (const term of ["보드", "마이크로컨트롤러", "펌웨어", "전압", "전류", "GND", "극성", "저항", "풀업", "디지털 핀", "아날로그 핀", "PWM", "I2C", "I2C 주소", "시리얼 모니터", "브레드보드", "납땜", "점퍼선", "레귤레이터", "배터리 보호회로", "DC 전압 모드", "통전", "저항 모드", "공차", "출력 방향", "서포트", "슬라이서", "STL", "BOM", "부품목록", "net", "데이터시트"]) {
      const note = noteFor(term);
      expect(note, term).not.toBeNull();
      for (const text of [note!.oneLine, note!.why, note!.decide]) { expect(text.length, term).toBeGreaterThan(10); expect(text, term).toMatch(/요\.$/); }
    }
    expect(noteFor("펌웨어")!.oneLine).toBe("보드 안에서 도는 프로그램이에요.");
    expect(noteFor("없는 낱말")).toBeNull();
    expect(Object.keys(LEARN_NOTES).length).toBeGreaterThanOrEqual(27);
  });

  it("단계마다 왜 있는지와 무엇을 배우는지가 있다", () => {
    expect(Object.keys(STAGE_WHY)).toEqual(["checklist", "form", "plan", "circuit", "mockup", "assembly", "verify", "housing"]);
    for (const s of Object.values(STAGE_WHY)) { expect(s.why).toMatch(/요\.$/); expect(s.learn).toMatch(/요\.$/); }
  });

  it("글 속 낱말은 처음 나온 자리에만 설명을 붙이고, 긴 낱말을 먼저 잡는다", () => {
    const parts = splitLearnText("펌웨어를 올리면 펌웨어가 I2C 주소를 읽어요.");
    expect(parts.map((p) => p.text).join("")).toBe("펌웨어를 올리면 펌웨어가 I2C 주소를 읽어요.");
    const noted = parts.filter((p) => p.note);
    expect(noted.map((p) => p.text)).toEqual(["펌웨어", "I2C 주소"]);
    expect(noted[1].note!.term).toBe("I2C 주소");
  });

  it("영문 낱말은 다른 낱말의 일부일 때 잡지 않는다", () => {
    expect(splitLearnText("internet과 PWMX는 그대로예요.").some((p) => p.note)).toBe(false);
    expect(splitLearnText("PWM으로 밝기를 바꿔요.").filter((p) => p.note).map((p) => p.text)).toEqual(["PWM"]);
  });

  it("회로는 전원 → GND → 신호 순서로 읽고, 신호는 적힌 순서를 지킨다", () => {
    const steps = circuitReadingGuide(blueprint);
    expect(steps.map((s) => s.kind)).toEqual(["power", "ground", "signal", "signal"]);
    expect(steps.map((s) => s.net)).toEqual(["5V", "GND", "BUTTON_IN", "LED_OUT"]);
    expect(steps.map((s) => s.order)).toEqual([1, 2, 3, 4]);
    expect(steps[0].body).toContain("5V 기준");
    expect(steps[1].pins).toEqual(["A1.GND", "S1.2", "D1.K"]);
    expect(steps[2].body).toContain("켜짐/꺼짐을 보드가 읽는 선");
    expect(steps[2].body).toContain("Arduino UNO R3의 D2 핀");
    expect(steps[3].body).toContain("세기를 조절하는 선");
  });
});
