import type { ReactNode } from "react";

// 커넥터로 들어온 Claude 대화가 통짜 줄글로 쌓여서, 길어지면 눈이 어디에 머물 데가
// 없었다. 저장된 글은 그대로 두고 보여줄 때만 나눈다. 이미 쌓인 기록에도 바로 적용되고,
// 글 자체를 건드리지 않으니 내보내기와 커넥터가 읽는 내용은 달라지지 않는다.
//
// 마크다운을 통째로 해석하지는 않는다. 모델이 실제로 쓰는 몇 가지만 다룬다:
// 빈 줄로 나뉜 문단, "- "/"• " 목록, "1. " 번호 목록, **굵게**.

const BOLD = /\*\*([^*]+)\*\*/g;

// **굵게**만 살리고 나머지는 글자 그대로 둔다. HTML을 만들지 않으므로 끼워넣기 위험이 없다.
function inline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(BOLD)) {
    const at = match.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    out.push(<b key={`${keyPrefix}-b${at}`}>{match[1]}</b>);
    last = at + match[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out.length ? out : [text];
}

type Block = { kind: "p" | "ul" | "ol"; lines: string[] };

export function toBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  for (const chunk of text.split(/\n{2,}/)) {
    const lines = chunk.split("\n").map(l => l.trimEnd()).filter(l => l.trim().length > 0);
    if (!lines.length) continue;
    let current: Block | null = null;
    for (const line of lines) {
      const bullet = /^\s*[-•*]\s+(.*)$/.exec(line);
      const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
      const kind: Block["kind"] = bullet ? "ul" : numbered ? "ol" : "p";
      const body = bullet?.[1] ?? numbered?.[1] ?? line;
      // 같은 종류가 이어지면 한 덩어리로 묶는다. 문단은 줄바꿈을 살려 이어 붙인다.
      if (current && current.kind === kind) current.lines.push(body);
      else { current = { kind, lines: [body] }; blocks.push(current); }
    }
  }
  return blocks;
}

export default function MessageText({ text }: { text: string }) {
  const blocks = toBlocks(text);
  if (!blocks.length) return null;
  return <div className="message-text">{blocks.map((block, index) => {
    if (block.kind === "p") return <p key={index}>{block.lines.map((line, i) => <span key={i}>{i > 0 && <br />}{inline(line, `${index}-${i}`)}</span>)}</p>;
    const Tag = block.kind === "ul" ? "ul" : "ol";
    return <Tag key={index}>{block.lines.map((line, i) => <li key={i}>{inline(line, `${index}-${i}`)}</li>)}</Tag>;
  })}</div>;
}
