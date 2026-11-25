import { describe, expect, it } from "vitest";
import { projectKind, stageCardFor } from "../apps/web/lib/project-kind";
import type { LocalProject } from "../apps/web/lib/project-types";

const p = (idea: string, track?: "software" | "hardware" | "both") => ({ idea, buildPlan: track ? { track } : undefined }) as unknown as LocalProject;

describe("프로젝트 종류", () => {
  it("설계도가 있으면 설계도를 따른다", () => {
    expect(projectKind(p("나 모바일 게임을 만들고 싶어.", "hardware"))).toBe("hardware");
    expect(projectKind(p("화분 센서", "software"))).toBe("software");
  });

  it("설계도가 없으면 아이디어에서 조심스럽게 짐작한다", () => {
    expect(projectKind(p("나 모바일 게임을 만들고 싶어."))).toBe("software");
    expect(projectKind(p("할 일 관리 웹사이트"))).toBe("software");
    expect(projectKind(p("버튼을 누르면 불이 켜지는 책상 램프"))).toBe("hardware");
    expect(projectKind(p("무게로 재고를 세는 저울 셈"))).toBe("hardware");
    expect(projectKind(p("식물 상태를 센서로 재서 앱으로 보여주기"))).toBe("both");
    expect(projectKind(p("뭔가 재미있는 것"))).toBe("unknown");
    expect(projectKind(null)).toBe("unknown");
  });

  it("소프트웨어만 만드는 프로젝트에는 도구·보드 경험·회로를 묻지 않는다", () => {
    const card = stageCardFor(p("나 모바일 게임을 만들고 싶어."));
    expect(card.checklist.map((c) => c.label)).toEqual(["무엇을 만드는지", "어디서 쓰는지 (휴대폰·컴퓨터)", "코딩 경험"]);
    expect(card.nextSentence).toBe("어떤 화면부터 만들지 같이 정하자");
    expect(JSON.stringify(card)).not.toMatch(/회로|펌웨어|보유 도구/);
  });

  it("하드웨어 프로젝트의 카드는 낯선 말을 풀어 쓴다", () => {
    const card = stageCardFor(p("버튼을 누르면 불이 켜지는 책상 램프"));
    expect(card.checklist.map((c) => c.key)).toEqual(["coreBehavior", "tools", "firmwareExperience"]);
    expect(JSON.stringify(card)).not.toContain("펌웨어");
    expect(stageCardFor(p("뭔가 재미있는 것")).kind).toBe("unknown");
  });
});
