import { describe, expect, it } from "vitest";
import { buildFileTree, contentHash, fileNameIndex, markFinal, outputFiles, unmarkFinal, FileMarkError } from "../apps/web/lib/file-tree";
import type { LocalProject } from "../apps/web/lib/project-types";
import { splitFileNames } from "../apps/web/app/message-text";

const file = (id: string, agent: string, filename: string, createdAt: string, content = filename) => ({ id, agent, filename, content, createdAt });
function project(over: Record<string, unknown> = {}): LocalProject {
  return {
    id: "p1", name: "셈 sam v1", idea: "저울", oneLiner: "", stage: "workshop", designRevision: 1,
    tasks: [{ id: "t1", kind: "measure", title: "폭 재기", plain: "", status: "ready" }],
    messages: [{ id: "m1", role: "assistant", agent: "me", channel: "me", text: "뚜껑을 고쳤어요", createdAt: "2026-11-21T10:00:00.000Z" }],
    workspaceFiles: [
      file("a", "me", "housing_lid_v1.stl", "2026-11-20T10:00:00.000Z"),
      file("b", "me", "housing_lid_v2.stl", "2026-11-21T10:00:00.000Z"),
      file("c", "me", "housing_body.stl", "2026-11-20T11:00:00.000Z"),
      file("d", "hw", "read_hx711.ino", "2026-11-20T09:00:00.000Z"),
      file("e", "sw", "SPEC.md", "2026-11-20T08:00:00.000Z")
    ],
    ...over
  } as unknown as LocalProject;
}
const subject = (p: LocalProject, name: string) => buildFileTree(p).groups.flatMap((g) => g.subjects).find((s) => s.name === name)!;
const marked = (p: LocalProject, itemId: string, now: string) => ({ ...p, fileMarks: markFinal(p, itemId, now) }) as LocalProject;

describe("파일 트리", () => {
  it("달그락별로 묶고, 대장 → 하드웨어 → 기구설계 → 소프트웨어 순서로 놓는다", () => {
    const tree = buildFileTree(project());
    expect(tree.groups.map((g) => g.agent)).toEqual(["chief", "hw", "me", "sw"]);
    expect(tree.groups.find((g) => g.agent === "chief")!.subjects.map((s) => s.name)).toEqual(["작업목록"]);
    expect(tree.groups.find((g) => g.agent === "me")!.subjects.map((s) => s.name).sort()).toEqual(["housing_body", "housing_lid"]);
    expect(tree.total).toBe(6);
  });

  it("같은 대상의 판은 최신이 위에 오고, 초안 번호는 오래된 것부터 매긴다", () => {
    const lid = subject(project(), "housing_lid");
    expect(lid.versions.map((v) => [v.filename, v.label])).toEqual([["housing_lid_v2.stl", "초안 2"], ["housing_lid_v1.stl", "초안 1"]]);
    expect(lid.versions[0].displayName).toBe("셈-sam-v1_ME_housing-lid_초안2.stl");
    expect(lid.current).toBeNull();
  });

  it("어느 대장간의 대화에서 나왔는지 안다", () => {
    const lid = subject(project(), "housing_lid");
    // v2는 ME 대장간의 답과 같은 시각에 저장됐다
    expect(lid.versions[0].fromChannel).toBe("me");
    expect(lid.versions[0].printable).toBe(true);
    expect(subject(project(), "SPEC").versions[0]).toMatchObject({ agent: "sw", printable: false });
  });

  it("사람이 최종으로 표시하면 출력용에 오르고, 새 최종이 나오면 예전 것은 대체됨이 된다", () => {
    let p = marked(project(), "file:a", "2026-11-20T12:00:00.000Z");
    expect(subject(p, "housing_lid").versions.map((v) => v.label)).toEqual(["개정 1 초안", "최종"]);
    expect(outputFiles(buildFileTree(p)).map((v) => v.filename)).toEqual(["housing_lid_v1.stl"]);
    p = marked(p, "file:b", "2026-11-22T12:00:00.000Z");
    const lid = subject(p, "housing_lid");
    expect(lid.versions.map((v) => [v.filename, v.label, v.state])).toEqual([["housing_lid_v2.stl", "개정 1", "final"], ["housing_lid_v1.stl", "대체됨", "superseded"]]);
    expect(lid.current?.filename).toBe("housing_lid_v2.stl");
    expect(lid.versions[0].displayName).toBe("셈-sam-v1_ME_housing-lid_개정1.stl");
    // 출력용은 대상마다 하나
    expect(outputFiles(buildFileTree(p)).map((v) => v.filename)).toEqual(["housing_lid_v2.stl"]);
  });

  it("최종 뒤에 새로 나온 판은 개정 초안이고, 출력용이 아니다", () => {
    const base = marked(project(), "file:b", "2026-11-22T12:00:00.000Z");
    const p = { ...base, workspaceFiles: [...base.workspaceFiles!, file("f", "me", "housing_lid_v3.stl", "2026-11-23T10:00:00.000Z")] } as LocalProject;
    const lid = subject(p, "housing_lid");
    expect(lid.versions.map((v) => v.label)).toEqual(["개정 1 초안", "최종", "초안 1"]);
    expect(outputFiles(buildFileTree(p)).map((v) => v.filename)).toEqual(["housing_lid_v2.stl"]);
  });

  it("같은 자리의 파일이 최종 표시 뒤에 바뀌면 더는 최종이 아니다", () => {
    const base = marked(project(), "file:c", "2026-11-22T12:00:00.000Z");
    expect(subject(base, "housing_body").current?.filename).toBe("housing_body.stl");
    const changed = { ...base, workspaceFiles: base.workspaceFiles!.map((f) => (f.id === "c" ? { ...f, content: "다른 내용" } : f)) } as LocalProject;
    const body = subject(changed, "housing_body");
    expect(body.versions[0]).toMatchObject({ state: "revised", label: "개정 1 초안", changedSinceFinal: true });
    expect(body.current).toBeNull();
    expect(outputFiles(buildFileTree(changed))).toEqual([]);
    // 사람이 다시 확인하고 표시하면 개정 1이 된다
    expect(subject(marked(changed, "file:c", "2026-11-24T12:00:00.000Z"), "housing_body").versions[0]).toMatchObject({ state: "final", label: "개정 1" });
  });

  it("뽑는 파일이 아닌 최종은 출력용에 오르지 않는다", () => {
    const p = marked(project(), "file:d", "2026-11-22T12:00:00.000Z");
    expect(subject(p, "read_hx711").current?.label).toBe("최종");
    expect(outputFiles(buildFileTree(p))).toEqual([]);
  });

  it("없는 파일은 표시할 수 없고, 표시를 거둘 수 있다", () => {
    expect(() => markFinal(project(), "file:zzz")).toThrowError(FileMarkError);
    const p = marked(project(), "file:a", "2026-11-20T12:00:00.000Z");
    expect(unmarkFinal(p, "file:a")).toEqual({});
    expect(() => unmarkFinal(project(), "file:a")).toThrowError(FileMarkError);
    expect(contentHash("a")).not.toBe(contentHash("b"));
  });

  it("이름 색인은 긴 이름부터, 저장된 이름과 통일된 이름을 모두 담는다", () => {
    const index = fileNameIndex(project());
    expect(index.every((entry, i) => i === 0 || index[i - 1].name.length >= entry.name.length)).toBe(true);
    const names = index.map((e) => e.name);
    expect(names).toContain("housing_lid_v2.stl");
    expect(names).toContain("셈-sam-v1_ME_housing-lid_초안2.stl");
    const spec = index.find((e) => e.name === "SPEC.md")!;
    expect(spec.itemId).toBe("file:e");
    // 내려받을 때는 통일된 이름으로 저장되게 ?name= 이 붙는다
    expect(spec.url.startsWith("/api/projects/p1/workbench/file%3Ae?name=")).toBe(true);
    expect(fileNameIndex(null)).toEqual([]);
  });
});

describe("대화 속 파일 이름", () => {
  const files = [{ name: "housing_lid_v2.stl", url: "/u/lid2" }, { name: "housing_lid.stl", url: "/u/lid" }, { name: "SPEC.md", url: "/u/spec" }];
  it("정확한 파일 이름만 파일로 가른다", () => {
    expect(splitFileNames("뚜껑은 housing_lid_v2.stl 로 뽑아 주세요.", files)).toEqual([
      { kind: "text", text: "뚜껑은 " }, { kind: "file", name: "housing_lid_v2.stl", url: "/u/lid2" }, { kind: "text", text: " 로 뽑아 주세요." }
    ]);
  });
  it("문장 끝의 마침표와 한글 조사가 붙어도 알아본다", () => {
    expect(splitFileNames("명세는 SPEC.md에 있어요. 다시 볼 것: SPEC.md.", files).filter((s) => s.kind === "file")).toHaveLength(2);
  });
  it("더 긴 낱말의 일부이면 건드리지 않는다", () => {
    expect(splitFileNames("my_housing_lid.stl 과 SPEC.md5 는 다른 파일이에요", files)).toEqual([{ kind: "text", text: "my_housing_lid.stl 과 SPEC.md5 는 다른 파일이에요" }]);
  });
  it("코드 표시로 감싼 이름은 감싼 표시까지 칩이 대신한다", () => {
    expect(splitFileNames("`SPEC.md`를 보세요", files)).toEqual([{ kind: "file", name: "SPEC.md", url: "/u/spec" }, { kind: "text", text: "를 보세요" }]);
  });
  it("파일 목록이 없으면 글자 그대로 둔다", () => {
    expect(splitFileNames("SPEC.md", undefined)).toEqual([{ kind: "text", text: "SPEC.md" }]);
    expect(splitFileNames("SPEC.md", [])).toEqual([{ kind: "text", text: "SPEC.md" }]);
  });
});
