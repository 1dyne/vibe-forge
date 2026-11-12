import type { ContractField, ContractMessage, DataContract, LocalProject } from "./project-types";

// 펌웨어 ↔ 앱 데이터 약속 검사. 같은 함수가 서버(MCP·저장 검사)와 브라우저(로그 붙여넣기 검사기)에서 돈다.

export type LineResult = { line: string; ok: boolean; messageId: string | null; direction: ContractMessage["direction"] | null; values: Record<string, string>; errors: string[] };

function matchMessage(c: Pick<DataContract, "format" | "messages">, line: string, dir?: ContractMessage["direction"]) {
  const cands = c.messages.filter((m) => (!dir || m.direction === dir) && line.startsWith(m.prefix));
  return cands.sort((a, b) => b.prefix.length - a.prefix.length)[0] ?? null;
}

function parseValues(format: DataContract["format"], m: ContractMessage, line: string): { values: Record<string, string>; errors: string[] } {
  const values: Record<string, string> = {}, errors: string[] = [];
  if (format === "json") {
    try { const o = JSON.parse(line) as Record<string, unknown>; for (const f of m.fields) if (o[f.name] !== undefined) values[f.name] = typeof o[f.name] === "string" ? String(o[f.name]) : JSON.stringify(o[f.name]); }
    catch { errors.push("JSON으로 읽을 수 없어요 (따옴표·중괄호 확인)"); }
  } else if (format === "csv") {
    const rest = line.slice(m.prefix.length).replace(/^,/, "").split(",");
    if (rest.length !== m.fields.length) errors.push(`값이 ${m.fields.length}개여야 하는데 ${rest.length}개예요`);
    m.fields.forEach((f, i) => { if (rest[i] !== undefined) values[f.name] = rest[i].trim(); });
  } else {
    for (const part of line.split(";")) { const k = part.indexOf("="); if (k > 0) values[part.slice(0, k).trim()] = part.slice(k + 1).trim(); else if (part.trim()) errors.push(`"${part}"에 = 가 없어요`); }
    const extra = Object.keys(values).filter((k) => !m.fields.some((f) => f.name === k));
    if (extra.length) errors.push(`약속에 없는 이름: ${extra.join(", ")}`);
  }
  return { values, errors };
}

function checkField(f: ContractField, raw: string | undefined): string | null {
  if (raw === undefined || raw === "") return `${f.name} 값이 없어요`;
  if (f.type === "int") { if (!/^-?\d+$/.test(raw)) return `${f.name}=${raw}는 정수가 아니에요`; }
  if (f.type === "float") { if (!/^-?\d+(\.\d+)?$/.test(raw)) return `${f.name}=${raw}는 숫자가 아니에요`; }
  if (f.type === "bool") { if (!["0", "1", "true", "false"].includes(raw)) return `${f.name}=${raw}는 0/1(또는 true/false)이어야 해요`; }
  if (f.type === "enum" && f.values && !f.values.includes(raw)) return `${f.name}=${raw}는 ${f.values.join("/")} 중 하나여야 해요`;
  if ((f.type === "int" || f.type === "float")) { const n = Number(raw); if (f.min != null && n < f.min) return `${f.name}=${raw}가 최소 ${f.min}보다 작아요`; if (f.max != null && n > f.max) return `${f.name}=${raw}가 최대 ${f.max}보다 커요`; }
  return null;
}

export function validateLine(c: Pick<DataContract, "format" | "messages">, raw: string, dir?: ContractMessage["direction"]): LineResult {
  const line = raw.replace(/\r?\n$/, "").trim();
  const m = matchMessage(c, line, dir);
  if (!m) return { line, ok: false, messageId: null, direction: null, values: {}, errors: [`어느 약속 메시지에도 안 맞아요 (시작: ${c.messages.filter((x) => !dir || x.direction === dir).map((x) => `"${x.prefix}"`).join(", ")})`] };
  const { values, errors } = parseValues(c.format, m, line);
  for (const f of m.fields) { const e = checkField(f, values[f.name]); if (e) errors.push(e); }
  return { line, ok: errors.length === 0, messageId: m.id, direction: m.direction, values, errors };
}

/** 로그 여러 줄 검사. 빈 줄·'#'로 시작하는 줄·부팅 잡음(약속 prefix가 없는 줄)은 ignoreNoise면 건너뛴다 */
export function validateLog(c: Pick<DataContract, "format" | "messages">, text: string, opts: { dir?: ContractMessage["direction"]; ignoreNoise?: boolean } = {}) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  const results = lines.map((l) => validateLine(c, l, opts.dir)).filter((r) => !(opts.ignoreNoise && !r.messageId));
  const seen = new Set(results.filter((r) => r.ok).map((r) => r.messageId));
  const missing = c.messages.filter((m) => (!opts.dir || m.direction === opts.dir) && !seen.has(m.id)).map((m) => m.id);
  return { results, ok: results.filter((r) => r.ok).length, total: results.length, missing };
}

/** 약속을 저장하기 전 자기 검사: 예시 줄이 자기 규칙에 맞아야 한다 */
export function selfCheck(c: Pick<DataContract, "format" | "messages" | "transport" | "baud">): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const m of c.messages) {
    if (ids.has(m.id)) problems.push(`메시지 id ${m.id}가 중복돼요`); ids.add(m.id);
    const r = validateLine(c, m.example, m.direction);
    if (!r.ok || r.messageId !== m.id) problems.push(`${m.id}의 예시 "${m.example}"가 약속과 안 맞아요: ${r.errors.join(" / ") || `${r.messageId} 메시지로 읽혀요`}`);
    if (m.fields.some((f) => f.type === "enum" && !f.values?.length)) problems.push(`${m.id}: enum 필드는 values가 필요해요`);
  }
  for (const a of c.messages) for (const b of c.messages) if (a !== b && a.direction === b.direction && b.prefix.startsWith(a.prefix) && a.prefix === b.prefix) problems.push(`${a.id}와 ${b.id}의 시작 글자가 같아 구분할 수 없어요`);
  if (c.transport === "serial" && !c.baud) problems.push("시리얼이면 통신 속도(baud, 예: 115200)를 정해요");
  return problems;
}

export type ContractFinding = { side: "firmware" | "sw" | "tests"; level: "ok" | "warn" | "fail" | "unknown"; text: string };

/** 설계물끼리 대조: 펌웨어 코드, SW 명세, 테스트 계획 */
export function crossCheck(project: LocalProject): ContractFinding[] {
  const c = project.dataContract; if (!c) return [];
  const out: ContractFinding[] = [];
  const fw = (project.build?.artifacts ?? []).find((a) => a.kind === "firmware")?.content ?? (project.workspaceFiles ?? []).find((f) => /\.ino$/i.test(f.filename))?.content;
  if (!fw) out.push({ side: "firmware", level: "unknown", text: "펌웨어 코드가 아직 없어 대조하지 못했어요" });
  else {
    if (c.transport === "serial") {
      const baud = /Serial\.begin\(\s*(\d+)\s*\)/.exec(fw)?.[1];
      out.push(!baud ? { side: "firmware", level: "fail", text: "펌웨어에 Serial.begin(…)이 없어요" } : Number(baud) !== c.baud ? { side: "firmware", level: "fail", text: `통신 속도가 달라요: 펌웨어 ${baud}, 약속 ${c.baud}` } : { side: "firmware", level: "ok", text: `통신 속도 ${baud} 일치` });
    }
    for (const m of c.messages) {
      const lit = m.prefix.replace(/[{"]/g, "").slice(0, 24);
      const has = lit.length > 0 && fw.includes(lit);
      out.push(has ? { side: "firmware", level: "ok", text: `${m.id}: 펌웨어에 "${m.prefix}" 처리 코드가 있어요` } : { side: "firmware", level: m.direction === "device_to_app" ? "fail" : "warn", text: `${m.id}: 펌웨어에서 "${m.prefix}"로 ${m.direction === "device_to_app" ? "보내는" : "받는"} 코드가 안 보여요` });
    }
  }
  const sw = project.swInterface;
  if (!sw) out.push({ side: "sw", level: "unknown", text: "SW 명세서가 아직 없어요" });
  else {
    out.push(sw.transport === c.transport ? { side: "sw", level: "ok", text: `통신 방식 ${c.transport} 일치` } : { side: "sw", level: "fail", text: `통신 방식이 달라요: SW ${sw.transport}, 약속 ${c.transport}` });
    const candidates = sw.format.split(/\n|\\n|`|'|"(?=\s)/).map((x) => x.trim()).filter((x) => c.messages.some((m) => x.startsWith(m.prefix)));
    for (const l of candidates) { const r = validateLine(c, l); out.push(r.ok ? { side: "sw", level: "ok", text: `SW 명세 예시 "${l}" 일치` } : { side: "sw", level: "fail", text: `SW 명세 예시 "${l}": ${r.errors.join(" / ")}` }); }
    if (!candidates.length) out.push({ side: "sw", level: "warn", text: `SW 명세의 형식(${sw.format.slice(0, 60)})에서 약속 메시지 예시를 찾지 못했어요. 명세를 약속 기준으로 다시 써 주세요` });
  }
  const serial = (project.testPlan?.cases ?? []).flatMap((t) => (t.expect.serial ?? []).map((l) => ({ t, l })));
  const relevant = serial.filter(({ l }) => c.messages.some((m) => l.startsWith(m.prefix.slice(0, 1))));
  for (const { t, l } of relevant) { const r = validateLine(c, l, "device_to_app"); out.push(r.ok ? { side: "tests", level: "ok", text: `테스트 ${t.id}의 기대 "${l}" 일치` } : { side: "tests", level: "warn", text: `테스트 ${t.id}의 기대 "${l}": ${r.errors.join(" / ")}` }); }
  return out;
}

// 생성 코드에 들어가는 사용자 글: 주석은 한 줄로·주석 닫기 기호 제거, 문자열은 이스케이프
const note = (t: string | undefined) => (t ?? "").replace(/[\r\n]+/g, " ").replace(/\*\//g, "* /").slice(0, 200);
const cstr = (t: string) => t.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[\r\n]/g, "");
const cType = (f: ContractField) => (f.type === "float" ? "float" : f.type === "int" || f.type === "bool" ? "int" : "const char*");
const tsType = (f: ContractField) => (f.type === "int" || f.type === "float" ? "number" : f.type === "bool" ? "boolean" : f.type === "enum" ? (f.values ?? []).map((v) => JSON.stringify(v)).join(" | ") || "string" : "string");

/** 펌웨어에 넣을 헤더: 속도·시작 글자 상수와 보내는 함수 */
export function contractHeader(c: DataContract, project: Pick<LocalProject, "name">): string {
  const send = c.messages.filter((m) => m.direction === "device_to_app").map((m) => {
    const args = m.fields.map((f) => `${cType(f)} ${f.name}`).join(", ");
    const body = c.format === "json"
      ? `  Serial.print("{\\"t\\":\\"${m.id}\\"");\n${m.fields.map((f) => `  Serial.print(",\\"${f.name}\\":"); ${f.type === "string" || f.type === "enum" ? `Serial.print("\\""); Serial.print(${f.name}); Serial.print("\\"");` : `Serial.print(${f.name});`}`).join("\n")}\n  Serial.println("}");`
      : c.format === "csv"
        ? `  Serial.print("${cstr(m.prefix)}");\n${m.fields.map((f) => `  Serial.print(","); Serial.print(${f.name});`).join("\n")}\n  Serial.println();`
        : `${m.fields.map((f, i) => `  Serial.print("${i ? ";" : ""}${f.name}="); Serial.print(${f.name});`).join("\n")}\n  Serial.println();`;
    return `// ${note(m.description)}${m.every ? ` (${note(m.every)})` : ""}\n// 예: ${note(m.example)}\ninline void send_${m.id}(${args}) {\n${body}\n}`;
  }).join("\n\n");
  const recv = c.messages.filter((m) => m.direction === "app_to_device").map((m) => `// 받기: ${note(m.description)} · 예: ${note(m.example)}\nconst char* MSG_${m.id.toUpperCase()} = "${cstr(m.prefix)}";`).join("\n");
  return `// ${note(project.name)} · 데이터 약속 (달그락 대장간이 만든 파일, 손으로 고치지 말고 약속을 고쳐 다시 받기)
// 방식: ${c.transport}${c.baud ? ` · ${c.baud}bps` : ""} · 형식: ${c.format} · 한 줄 = 메시지 하나
#pragma once
#include <Arduino.h>
${c.baud ? `const long CONTRACT_BAUD = ${c.baud}; // setup()에서 Serial.begin(CONTRACT_BAUD);` : ""}

${send}

${recv}
`;
}

/** 앱(웹)에 넣을 TypeScript: 타입과 한 줄 읽기 함수 */
export function contractTs(c: DataContract): string {
  const types = c.messages.map((m) => `/** ${note(m.description)} · 예: ${note(m.example)} */\nexport type ${m.id[0].toUpperCase()}${m.id.slice(1)}Msg = { id: "${m.id}"; ${m.fields.map((f) => `${f.name}: ${tsType(f)}`).join("; ")} };`).join("\n\n");
  const union = c.messages.map((m) => `${m.id[0].toUpperCase()}${m.id.slice(1)}Msg`).join(" | ");
  return `// 데이터 약속 (달그락 대장간이 만든 파일). 펌웨어의 contract.h와 같은 약속이에요.
// 방식: ${c.transport}${c.baud ? ` · ${c.baud}bps` : ""} · 형식: ${c.format}

${types}

export type Msg = ${union};
export const CONTRACT = ${JSON.stringify({ transport: c.transport, format: c.format, baud: c.baud, messages: c.messages.map(({ id, direction, prefix, fields }) => ({ id, direction, prefix, fields })) }, null, 2)} as const;

/** 한 줄을 읽어 메시지로. 약속과 안 맞으면 null (잡음·부팅 메시지는 null) */
export function parseLine(raw: string): Msg | null {
  const line = raw.trim();
  const m = [...CONTRACT.messages].filter((x) => line.startsWith(x.prefix)).sort((a, b) => b.prefix.length - a.prefix.length)[0];
  if (!m) return null;
  const v: Record<string, string> = {};
  ${c.format === "json" ? `try { const o = JSON.parse(line); for (const f of m.fields) if (o[f.name] !== undefined) v[f.name] = String(o[f.name]); } catch { return null; }` : c.format === "csv" ? `line.slice(m.prefix.length).replace(/^,/, "").split(",").forEach((x, i) => { if (m.fields[i]) v[m.fields[i].name] = x.trim(); });` : `for (const p of line.split(";")) { const k = p.indexOf("="); if (k > 0) v[p.slice(0, k).trim()] = p.slice(k + 1).trim(); }`}
  const out: Record<string, unknown> = { id: m.id };
  for (const f of m.fields as ReadonlyArray<{ name: string; type: string }>) {
    const x = v[f.name]; if (x === undefined) return null;
    out[f.name] = f.type === "int" || f.type === "float" ? Number(x) : f.type === "bool" ? x === "1" || x === "true" : x;
  }
  return out as Msg;
}
${c.messages.filter((m) => m.direction === "app_to_device").map((m) => `\n/** 보내기: ${note(m.description)} · 예: ${note(m.example)} */\nexport function make_${m.id}(${m.fields.map((f) => `${f.name}: ${tsType(f)}`).join(", ")}): string {\n  return ${c.format === "json" ? `JSON.stringify({ t: "${m.id}", ${m.fields.map((f) => f.name).join(", ")} }) + "\\n"` : c.format === "csv" ? `[${JSON.stringify(m.prefix.replace(/,$/, ""))}, ${m.fields.map((f) => f.type === "bool" ? `${f.name} ? 1 : 0` : f.name).join(", ")}].join(",") + "\\n"` : `[${m.fields.map((f) => `\`${f.name}=\${${f.type === "bool" ? `${f.name} ? 1 : 0` : f.name}}\``).join(", ")}].join(";") + "\\n"`};\n}`).join("\n")}
`;
}

export function contractMarkdown(c: DataContract, project: LocalProject): string {
  const findings = crossCheck(project);
  const icon = { ok: "✅", warn: "⚠️", fail: "❌", unknown: "❔" };
  return `# ${project.name} · 데이터 약속 (펌웨어 ↔ 앱)

- 방식: ${c.transport}${c.baud ? ` · ${c.baud}bps` : ""} · 형식: ${c.format} · 한 줄 = 메시지 하나

| 메시지 | 방향 | 시작 | 값 | 예시 |
|---|---|---|---|---|
${c.messages.map((m) => `| ${m.id} | ${m.direction === "device_to_app" ? "보드 → 앱" : "앱 → 보드"} | \`${m.prefix}\` | ${m.fields.map((f) => `${f.name}(${f.type}${f.unit ? ` ${f.unit}` : ""}${f.min != null || f.max != null ? ` ${f.min ?? ""}~${f.max ?? ""}` : ""}${f.values ? ` ${f.values.join("/")}` : ""})`).join(", ")} | \`${m.example}\` |`).join("\n")}

## 맞춰 보기
${findings.map((f) => `- ${icon[f.level]} [${{ firmware: "펌웨어", sw: "SW", tests: "테스트" }[f.side]}] ${f.text}`).join("\n") || "- 대조할 것이 아직 없어요"}

## 실제 로그 검사 기록
${c.runs.length ? c.runs.slice(-5).map((r) => `- ${r.at} · ${{ device_log: "보드 로그", app_sample: "앱 출력", claude: "Claude 검사" }[r.source]} · ${r.ok}/${r.total} 일치${r.problems.length ? ` · ${r.problems.slice(0, 3).join(" / ")}` : ""}`).join("\n") : "- 아직 없어요. 보드를 연결하고 시리얼 모니터의 줄을 붙여 넣어 검사해 보세요."}
`;
}
