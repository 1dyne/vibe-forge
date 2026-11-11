"use client";
import { useMemo, useState } from "react";
import type { LocalProject } from "../lib/project-types";
import { crossCheck, validateLog } from "../lib/contract";
import { workbenchDownloadUrl } from "../lib/workbench";

// 데이터 약속 (펌웨어 ↔ 앱): 설계물 대조 + 실제 줄 검사기
type Act = (input: Record<string, unknown>) => void;
const ICON = { ok: "✅", warn: "⚠️", fail: "❌", unknown: "❔" } as const;
const SIDE = { firmware: "펌웨어 (HW 달그락)", sw: "앱 (SW 달그락)", tests: "테스트 계획" } as const;

type SerialPortLike = { open: (o: { baudRate: number }) => Promise<void>; close: () => Promise<void>; readable: ReadableStream<Uint8Array> | null };

export function ContractView({ project, onAction, busy }: { project: LocalProject; onAction: Act; busy: boolean }) {
  const c = project.dataContract!;
  const findings = crossCheck(project);
  const [source, setSource] = useState<"device_log" | "app_sample">("device_log");
  const [text, setText] = useState("");
  const [reading, setReading] = useState(false);
  const [note, setNote] = useState("");
  const result = useMemo(() => (text.trim() ? validateLog(c, text, { dir: source === "device_log" ? "device_to_app" : "app_to_device", ignoreNoise: false }) : null), [c, text, source]);
  const canSerial = typeof navigator !== "undefined" && "serial" in navigator && c.transport === "serial";

  // 데스크톱 Chrome: 보드에서 직접 5초 동안 읽기 (Web Serial). 판정은 사람이 기록 버튼으로 확정한다.
  async function readBoard() {
    setNote(""); setReading(true);
    let port: SerialPortLike | null = null;
    try {
      port = await (navigator as unknown as { serial: { requestPort: () => Promise<SerialPortLike> } }).serial.requestPort();
      await port.open({ baudRate: c.baud ?? 115200 });
      const reader = port.readable!.getReader(); const dec = new TextDecoder(); let buf = "";
      const stop = Date.now() + 5000;
      while (Date.now() < stop) {
        const r = await Promise.race([reader.read(), new Promise<{ value?: Uint8Array; done: boolean }>((res) => setTimeout(() => res({ done: false }), 400))]);
        if (r.value) buf += dec.decode(r.value, { stream: true });
        if (r.done) break;
      }
      await reader.cancel().catch(() => {}); reader.releaseLock();
      setSource("device_log"); setText(buf.split(/\r?\n/).slice(0, 200).join("\n"));
      if (!buf.trim()) setNote("5초 동안 아무 줄도 안 왔어요. 펌웨어가 올라갔는지, 통신 속도가 맞는지 확인해 주세요.");
    } catch (e) { setNote(e instanceof Error && e.name === "NotFoundError" ? "포트를 고르지 않았어요." : "보드를 열지 못했어요. Arduino IDE 시리얼 모니터가 열려 있으면 닫아 주세요."); }
    finally { await port?.close().catch(() => {}); setReading(false); }
  }

  return <div className="plan-view contract-view">
    <div className="artifact-title"><span className="pill">데이터 약속</span><h3>보드와 앱이 같은 말을 하나요</h3></div>
    <p className="muted">{c.transport}{c.baud ? ` · ${c.baud}bps` : ""} · 형식 {c.format} · 한 줄 = 메시지 하나</p>
    <table className="contract-table"><thead><tr><th>메시지</th><th>방향</th><th>예시</th></tr></thead><tbody>
      {c.messages.map((m) => <tr key={m.id}><td><b>{m.id}</b><br /><small>{m.description}{m.every ? ` · ${m.every}` : ""}</small></td><td>{m.direction === "device_to_app" ? "보드 → 앱" : "앱 → 보드"}</td><td><code>{m.example}</code><br /><small>{m.fields.map((f) => `${f.name}: ${f.type}${f.unit ? ` ${f.unit}` : ""}${f.min != null || f.max != null ? ` ${f.min ?? ""}~${f.max ?? ""}` : ""}${f.values ? ` (${f.values.join("/")})` : ""}`).join(" · ")}</small></td></tr>)}
    </tbody></table>
    <div className="housing-files"><a href={workbenchDownloadUrl(project.id, "contract:h")} download="contract.h">↓ contract.h (펌웨어)</a><a href={workbenchDownloadUrl(project.id, "contract:ts")} download="contract.ts">↓ contract.ts (앱)</a></div>

    <h4>설계끼리 맞춰 보기</h4>
    {(["firmware", "sw", "tests"] as const).map((side) => { const fs = findings.filter((f) => f.side === side); return fs.length ? <div key={side} className="contract-side"><b>{SIDE[side]}</b><ul>{fs.map((f, i) => <li key={i} className={f.level}>{ICON[f.level]} {f.text}</li>)}</ul></div> : null; })}
    {findings.some((f) => f.level === "fail") && <p className="notice">❌가 있으면 채팅에서 “데이터 약속에 맞게 펌웨어(또는 앱)를 고쳐줘”라고 말해 주세요.</p>}

    <h4>실제로 주고받는 줄 검사</h4>
    <div className="row-btns">
      <button className={source === "device_log" ? "primary" : ""} onClick={() => setSource("device_log")}>보드가 보낸 줄 (시리얼 모니터)</button>
      <button className={source === "app_sample" ? "primary" : ""} onClick={() => setSource("app_sample")}>앱이 보낼 줄</button>
      {canSerial && source === "device_log" && <button disabled={reading} onClick={readBoard}>{reading ? "5초 동안 읽는 중…" : "🔌 보드에서 바로 읽기"}</button>}
    </div>
    {note && <p className="notice">{note}</p>}
    <textarea className="contract-input" value={text} onChange={(e) => setText(e.target.value)} placeholder={source === "device_log" ? "Arduino IDE 시리얼 모니터에 나온 줄을 그대로 붙여 넣어 주세요" : "앱이 보드로 보내는 줄을 붙여 넣어 주세요"} rows={6} />
    {result && <div className="contract-result">
      <p><b>{result.total}줄 중 {result.ok}줄 일치</b>{result.missing.length > 0 && <> · 한 번도 안 나온 메시지: {result.missing.join(", ")}</>}</p>
      <ol>{result.results.slice(0, 60).map((r, i) => <li key={i} className={r.ok ? "ok" : r.messageId ? "fail" : "noise"}><code>{r.line}</code> {r.ok ? `✅ ${r.messageId}` : r.messageId ? `❌ ${r.errors.join(" / ")}` : "· 약속 밖 줄 (부팅 메시지면 괜찮아요)"}</li>)}</ol>
      <button className="primary" disabled={busy} onClick={() => onAction({ action: "contract_check", source, lines: text })}>이 결과를 팀에 기록하기</button>
    </div>}
    {c.runs.length > 0 && <><h4>검사 기록</h4><ul className="contract-runs">{[...c.runs].reverse().slice(0, 5).map((r) => <li key={r.id}>{new Date(r.at).toLocaleString("ko-KR")} · {{ device_log: "보드 로그", app_sample: "앱 출력", claude: "Claude 검사" }[r.source]} · {r.ok}/{r.total} 일치{r.problems.length ? ` · ${r.problems[0]}` : ""}</li>)}</ul></>}
  </div>;
}
