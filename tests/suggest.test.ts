import { describe, expect, it } from "vitest";
import { suggestNext } from "../apps/web/lib/suggest";
import type { LocalProject } from "../apps/web/lib/project-types";

const base = (over: Record<string, unknown> = {}, workflow: Record<string, unknown> = {}) => ({ id: "p", name: "n", idea: "버튼을 누르면 불이 켜지는 책상 램프를 아두이노로 만들고 싶어", tasks: [], messages: [], workflow: { phase: "brainstorm", profile: { tools: [], toolsConfirmed: false, firmwareExperience: "unanswered", coreBehavior: "" }, ...workflow }, ...over }) as unknown as LocalProject;
const ready = { tools: ["자"], toolsConfirmed: true, firmwareExperience: "none", coreBehavior: "누르면 켜져요" };

describe("입력창의 다음 할 말", () => {
  it("프로젝트가 없으면 띄우지 않는다", () => expect(suggestNext(null)).toBeNull());
  it("아이디어 단계에서는 빠진 것부터 순서대로 권한다", () => {
    expect(suggestNext(base())).toBe("체크리스트부터 같이 채워줘");
    expect(suggestNext(base({}, { profile: ready }))).toBe("완성품이 어떤 모양일지 같이 정하자");
    expect(suggestNext(base({ productForm: {} }, { profile: ready }))).toBe("전체 설계도를 만들어줘");
    expect(suggestNext(base({ productForm: {}, buildPlan: {} }, { profile: ready }))).toBe("1단계 회로를 제안해줘");
  });
  it("화면 안에서 도는 것에는 하드웨어 순서를 권하지 않는다", () => {
    expect(suggestNext(base({ idea: "모바일 게임을 만들고 싶어" }))).toBe("어떤 화면부터 만들지 같이 정하자");
  });
  it("대장간에서는 할 일이 남았는지에 따라 달라진다", () => {
    expect(suggestNext(base({ tasks: [{ status: "ready" }] }, { phase: "workshop" }))).toBe("지금 내가 할 일을 하나씩 알려줘");
    expect(suggestNext(base({}, { phase: "workshop" }))).toBe("다음 단계로 넘어가자");
  });
});
