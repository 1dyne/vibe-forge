import type { ReactNode } from "react";

// 커넥터로 들어온 Claude 대화가 통짜 줄글로 쌓여서, 길어지면 눈이 어디에 머물 데가
// 없었다. 저장된 글은 그대로 두고 보여줄 때만 나눈다. 이미 쌓인 기록에도 바로 적용되고,
// 글 자체를 건드리지 않으니 내보내기와 커넥터가 읽는 내용은 달라지지 않는다.
//
// 마크다운을 통째로 해석하지는 않는다. 모델이 실제로 쓰는 몇 가지만 다룬다:
// 빈 줄로 나뉜 문단, "- "/"• " 목록, "1. " 번호 목록, **굵게**.

// 달그락이 파일 이름을 정확히 말하면, 그 이름을 파일로 알아보고 누르면 내려받게 한다.
// 정확히 같은 글자일 때만 건다(줄여 말한 이름은 걸리지 않는다 — 그래서 달그락에게는
// 파일 이름을 그대로 쓰라고 시킨다).

const BOLD = /\*\*([^*]+)\*\*/g;

export type FileLink = { name: string; url: string };
export type Segment = { kind: "text"; text: string } | { kind: "file"; name: string; url: string };

const WORD = /[A-Za-z0-9_-]/;

/** 글에서 파일 이름이 나온 자리를 가른다. 긴 이름부터 찾고, 더 긴 낱말의 일부이면 건너뛴다. */
export function splitFileNames(text: string, files: FileLink[] | undefined): Segment[] {
  if (!files?.length || !text) return [{ kind: "text", text }];
  const names = [...files].filter((f) => f.name).sort((a, b) => b.name.length - a.name.length);
  const out: Segment[] = [];
  let plain = "";
  let at = 0;
  while (at < text.length) {
    const hit = names.find((f) => text.startsWith(f.name, at) && !(at > 0 && WORD.test(text[at - 1])) && !(at + f.name.length < text.length && WORD.test(text[at + f.name.length])));
    if (!hit) { plain += text[at]; at += 1; continue; }
    let end = at + hit.name.length;
    // `이름`처럼 코드 표시로 감싼 것도 같은 파일이다. 감싼 표시는 칩이 대신한다.
    if (plain.endsWith("`") && text[end] === "`") { plain = plain.slice(0, -1); end += 1; }
    if (plain) { out.push({ kind: "text", text: plain }); plain = ""; }
    out.push({ kind: "file", name: hit.name, url: hit.url });
    at = end;
  }
  if (plain) out.push({ kind: "text", text: plain });
  return out;
}

function withFiles(text: string, files: FileLink[] | undefined, keyPrefix: string): ReactNode[] {
  return splitFileNames(text, files).map((segment, index) => segment.kind === "text"
    ? segment.text
    : <a key={`${keyPrefix}-f${index}`} className="file-chip" href={segment.url} download={segment.name} title={`${segment.name} 내려받기`}>
        <svg aria-hidden="true" viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"><path d="M4 1.8h5l3 3v9.4H4z" /><path d="M9 1.8v3h3" /></svg>
        <span>{segment.name}</span>
      </a>);
}

// **굵게**와 파일 이름만 살리고 나머지는 글자 그대로 둔다. HTML을 만들지 않으므로 끼워넣기 위험이 없다.
function inline(text: string, keyPrefix: string, files?: FileLink[]): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(BOLD)) {
    const at = match.index ?? 0;
    if (at > last) out.push(...withFiles(text.slice(last, at), files, `${keyPrefix}-t${last}`));
    out.push(<b key={`${keyPrefix}-b${at}`}>{withFiles(match[1], files, `${keyPrefix}-bf${at}`)}</b>);
    last = at + match[0].length;
  }
  if (last < text.length) out.push(...withFiles(text.slice(last), files, `${keyPrefix}-t${last}`));
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

export default function MessageText({ text, files }: { text: string; /** 이 프로젝트의 파일 이름과 내려받기 주소. 주면 글 속의 파일 이름이 누를 수 있는 칩이 된다 */ files?: FileLink[] }) {
  const blocks = toBlocks(text);
  if (!blocks.length) return null;
  return <div className="message-text">{blocks.map((block, index) => {
    if (block.kind === "p") return <p key={index}>{block.lines.map((line, i) => <span key={i}>{i > 0 && <br />}{inline(line, `${index}-${i}`, files)}</span>)}</p>;
    const Tag = block.kind === "ul" ? "ul" : "ol";
    return <Tag key={index}>{block.lines.map((line, i) => <li key={i}>{inline(line, `${index}-${i}`, files)}</li>)}</Tag>;
  })}</div>;
}
