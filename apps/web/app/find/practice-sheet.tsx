"use client";
import { useEffect, useState } from "react";
import { KITS } from "../../lib/bench/kits";
import { track } from "./track";

/** 내 대장간 연장 걸이: 손 기술 연습(3D 작업대). 끝낸 연습은 이 기기에 기억하고, 연장 걸이에 걸린다 */
export function PracticeSheet({ forgeId, hue, onClose }: { forgeId: string; hue: number; onClose: () => void }) {
  const [done, setDone] = useState<Record<string, string>>({});
  useEffect(() => { try { setDone(JSON.parse(localStorage.getItem("dalgeurak_practice") ?? "{}")); } catch { /* 저장소가 막혀도 목록은 보인다 */ } }, []);
  const back = encodeURIComponent(`/f/${forgeId}`);
  const kits = KITS.filter((k) => !k.draft);
  const n = kits.filter((k) => done[k.id]).length;
  return (
    <div className="overlay" role="dialog" aria-label="연장 걸이" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet tall">
        <div className="display" style={{ fontSize: 22 }}>연장 걸이</div>
        <div className="small body">부품을 사기 전에 3D 작업대에서 손 기술을 먼저 익혀봐. 하나 끝낼 때마다 연장이 하나씩 걸려. {kits.length ? `(${n}/${kits.length})` : ""}</div>
        <div className="practice-list">
          <a className="practice-kit" href={`/find/setup?back=/f/${forgeId}`} onClick={() => track("forge_sheet", { sheet: "setup" })}>
            <div className="pk-top"><b>💻 보드에 코드 넣기 준비</b><span>약 15분 · 처음</span></div>
            <p>아두이노 IDE가 뭔지부터, 설치하고 LED를 깜빡이는 것까지</p>
          </a>
          {kits.map((k) => (
            <a key={k.id} className="practice-kit" href={`/find/practice/${k.id}?hue=${hue}&back=${back}`} onClick={() => track("forge_sheet", { sheet: `practice:${k.id}` })}>
              <div className="pk-top"><b>{k.title}</b><span>{done[k.id] ? "✓ 해봤어" : `약 ${k.minutes}분 · ${k.level}`}</span></div>
              <p>{k.subtitle}</p>
            </a>
          ))}
        </div>
        <button className="link" type="button" onClick={onClose}>닫기</button>
      </div>
    </div>
  );
}
