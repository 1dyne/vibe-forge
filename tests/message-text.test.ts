import { describe, expect, it } from "vitest";
import { toBlocks } from "../apps/web/app/message-text";

describe("대화를 문단으로 나누기", () => {
  it("빈 줄로 문단을 가른다", () => {
    const blocks = toBlocks("첫 문단입니다.\n\n둘째 문단입니다.");
    expect(blocks).toHaveLength(2);
    expect(blocks.every(b => b.kind === "p")).toBe(true);
  });

  it("이어진 목록은 한 덩어리로 묶는다", () => {
    const blocks = toBlocks("필요한 부품:\n- 아두이노 나노\n- FSR 402\n- 저항 10k");
    expect(blocks.map(b => b.kind)).toEqual(["p", "ul"]);
    expect(blocks[1].lines).toEqual(["아두이노 나노", "FSR 402", "저항 10k"]);
  });

  it("번호 목록도 알아본다", () => {
    const blocks = toBlocks("1. 전압을 잰다\n2. 결과를 적는다");
    expect(blocks[0].kind).toBe("ol");
    expect(blocks[0].lines).toEqual(["전압을 잰다", "결과를 적는다"]);
  });

  it("한 문단 안의 줄바꿈은 살린다", () => {
    const blocks = toBlocks("첫 줄\n둘째 줄");
    expect(blocks).toHaveLength(1);
    expect(blocks[0].lines).toEqual(["첫 줄", "둘째 줄"]);
  });

  it("빈 줄만 있거나 비어 있으면 아무것도 만들지 않는다", () => {
    expect(toBlocks("")).toEqual([]);
    expect(toBlocks("\n\n   \n")).toEqual([]);
  });

  it("줄글 한 덩어리는 그대로 한 문단이다", () => {
    const long = "회로를 먼저 정하고 부품을 고른 뒤에 3D 목업을 만듭니다.";
    expect(toBlocks(long)).toEqual([{ kind: "p", lines: [long] }]);
  });
});
