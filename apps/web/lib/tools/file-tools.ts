import { z } from "zod";
import { buildFileTree, outputFiles } from "../file-tree";
import { kit, projectIdSchema, type ToolDefinition } from "../tool-kit";

// 파일 도구. 달그락이 파일을 가리킬 때 쓸 정확한 이름을 읽는 용도다.
// '최종' 표시는 여기에 없다. 사람이 작업대의 파일에서만 붙인다.

const STATE_HELP = "초안 N = 아직 사람이 최종으로 표시하지 않음 · 최종 = 사람이 최종으로 표시함 · 개정 N = 최종 뒤에 바뀌어 다시 최종이 된 판 · 개정 N 초안 = 최종 뒤에 바뀌었고 아직 사람이 확인하지 않음 · 대체됨 = 새 최종이 나와서 더는 쓰지 않음";

export const tools: ToolDefinition[] = [
  {
    name: "list_files", title: "파일 목록 (정확한 이름과 상태)",
    description: "이 프로젝트의 파일을 달그락 > 대상 > 판으로 묶어 정확한 파일 이름과 상태(초안·최종·개정·대체됨)로 돌려준다. 사용자에게 파일을 가리켜 말하기 전에 호출해서, filename을 글자 그대로 쓴다. 이름을 줄이거나 바꿔 말하면 화면에서 파일로 연결되지 않는다. 파일을 '최종'으로 만드는 일은 이 도구로도, 다른 어떤 도구로도 할 수 없다 — 사람이 작업대의 파일에서 표시한다.",
    inputSchema: { type: "object", additionalProperties: false, required: ["projectId"], properties: { projectId: projectIdSchema } },
    annotations: { readOnlyHint: true },
    run: async (input, context) => {
      const { projectId } = z.object({ projectId: z.string().uuid() }).strict().parse(input);
      const project = await kit.ownedProject(projectId, context);
      const tree = buildFileTree(project);
      const output = outputFiles(tree);
      const lines: string[] = [];
      for (const group of tree.groups) {
        lines.push(`## ${group.name}`);
        for (const subject of group.subjects) {
          lines.push(`- ${subject.name}`);
          for (const v of subject.versions) lines.push(`  - ${v.filename} · ${v.label}${v.changedSinceFinal ? " (최종 표시 뒤에 내용이 바뀌었어요)" : ""}${v.printable ? " · 출력 파일" : ""}`);
        }
      }
      const text = tree.total
        ? `파일 ${tree.total}개예요. 사용자에게 말할 때는 아래 파일 이름을 글자 그대로 쓰세요.\n\n${lines.join("\n")}\n\n${output.length ? `지금 출력용(사람이 최종으로 표시한 출력 파일): ${output.map((v) => v.filename).join(", ")}` : "사람이 최종으로 표시한 출력 파일은 아직 없어요. 출력해도 된다고 말하지 마세요."}\n\n상태: ${STATE_HELP}`
        : "아직 만들어진 파일이 없어요.";
      return { text, data: { files: tree.groups.map((g) => ({ agent: g.agent, name: g.name, subjects: g.subjects.map((s) => ({ subject: s.name, current: s.current?.filename ?? null, versions: s.versions.map((v) => ({ filename: v.filename, displayName: v.displayName, state: v.state, label: v.label, printable: v.printable, createdAt: v.createdAt, fromChannel: v.fromChannel, changedSinceFinal: v.changedSinceFinal })) })) })), output: output.map((v) => v.filename) } };
    }
  }
];

export const GUIDE_SECTION = `## 파일: 정확한 이름으로 말하고, '최종'은 사람이 붙인다 (list_files)
사람은 대화에서 파일 이름을 누르면 바로 내려받고, 작업대의 '파일'에서 달그락별·대상별로 모아 본다. 출력할 때는 '출력용'에 뜬 파일만 보면 되게 하는 것이 목표다.
- 파일을 가리킬 때는 list_files(또는 get_project의 files)에 나온 파일 이름을 글자 그대로 쓴다. "하우징 파일", "아까 그 STL"처럼 줄이거나 바꿔 말하지 않는다. 이름이 정확해야 화면에서 누를 수 있는 파일로 바뀐다.
- 파일을 새로 만들었거나 바꿨으면, 무엇이 바뀌었는지 한 줄과 함께 그 파일 이름을 말한다.
- 어떤 파일도 '최종'이라고 부르지 않는다. 최종은 사람이 작업대 → 파일에서 '최종으로 표시'를 눌러야 생긴다. 준비가 됐다고 판단하면 "○○ 파일을 확인하고 최종으로 표시해 주세요"라고 요청하고, 작업 카드를 사람 차례로 넘긴다.
- 파일 이름에 final·최종 같은 말을 직접 넣지 않는다. 상태는 서버가 붙인다(초안 N · 최종 · 개정 N · 대체됨).
- 사람이 최종으로 표시한 뒤에 고친 것은 '개정 N 초안'이다. 어느 최종을 대신하려는 것인지, 무엇이 달라졌는지 말하고, 사람이 다시 최종으로 표시하기 전에는 출력하라고 하지 않는다.
- list_files의 '지금 출력용'에 없는 파일을 출력해도 된다고 말하지 않는다. 출력용이 비어 있으면 그렇게 말한다.`;
