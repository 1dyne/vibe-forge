"use client";
import { useEffect, useRef, useState } from "react";
import type { LocalProject } from "../lib/project-types";

// ── MEETUP: 2026-11-28 밋업 시연 전용 (lib/meetup-inbox.ts 참고). 밋업이 끝나면 지운다 ──
// 시연용 프로젝트의 대장 방 위에 뜨는 띠. 로그인 없는 사람이 아이디어를 보낼 주소를 보여 주고,
// 4초마다 그동안 온 아이디어를 가져와 대화에 적는다.
export default function MeetupInbox({ project, onProject }: { project: LocalProject; onProject: (p: LocalProject) => void }) {
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState("");
  const latest = useRef(onProject); latest.current = onProject;
  const id = project.id;

  useEffect(() => {
    let stop = false, timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (stop) return;
      if (!document.hidden) {
        const b = await fetch("/api/meetup/inbox", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectId: id }) }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
        if (!stop && b?.code) setCode(b.code);
        if (!stop && b?.project) latest.current(b.project as LocalProject);
      }
      timer = setTimeout(tick, 4000);
    };
    void tick();
    return () => { stop = true; clearTimeout(timer); };
  }, [id]);

  if (!code) return null;
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const links: Array<[string, string, string]> = [
    ["아이디어 보내기", `${origin}/find/idea/${code}`, "로그인 없이 한 줄 보내기"],
    ["내 계정에 받기", `${origin}/api/meetup/start`, "가입한 사람이 이 프로젝트를 자기 것으로"],
    ["셈 사용설명서", `${origin}/find/sam`, "설치법과 쓰는 법"],
    ["3D 조립 따라 하기", `${origin}/find/practice/sam-scale`, "로그인 없이 조립만"]
  ];
  const copy = (label: string, url: string) => { void navigator.clipboard?.writeText(url).then(() => { setCopied(label); setTimeout(() => setCopied(""), 1800); }); };
  return (
    <details className="meetup-inbox">
      <style>{`
        .meetup-inbox{margin:0 0 10px;border:1.5px dashed var(--ink,#232323);border-radius:12px;background:#fffdf8;padding:7px 12px;font-size:13.5px}
        .meetup-inbox summary{cursor:pointer;font-weight:700}
        .meetup-inbox ul{list-style:none;margin:8px 0 2px;padding:0;display:grid;gap:6px}
        .meetup-inbox li{display:grid;grid-template-columns:9.5em 1fr auto;gap:8px;align-items:center}
        .meetup-inbox code{background:#f1ead9;border-radius:6px;padding:2px 6px;overflow-wrap:anywhere}
        .meetup-inbox button{border:1.5px solid var(--ink,#232323);border-radius:999px;background:#fff;font-weight:700;padding:2px 10px;cursor:pointer}
        .meetup-inbox small{color:#6f6a61}
      `}</style>
      <summary>📮 발표 자료에 넣을 주소 4개 (QR로 만들어 쓰세요)</summary>
      <ul>{links.map(([label, url, hint]) => <li key={label}><b>{label}<br /><small>{hint}</small></b><code>{url}</code><button type="button" onClick={() => copy(label, url)}>{copied === label ? "복사됨" : "복사"}</button></li>)}</ul>
      <small>아이디어 주소는 이 화면이 열려 있는 동안에만 받아요. 온 글은 몇 초 안에 대화에 적혀요.</small>
    </details>
  );
}
