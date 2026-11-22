"use client";
import { useEffect, useState } from "react";
import type { MakerProfile, MakerSpace } from "../lib/project-types";
import { emptyProfile, personPart } from "../lib/workflow";

// 자주 가는 메이커스페이스를 계정에 등록해둔다. 예약을 여기서 대신 걸어주지는 않는다.
// 국내 공간들은 예약 창구가 제각각이라(메이크올·지자체 사이트·전화) 공통으로 부를
// 방법이 없다. 대신 어디에 무엇이 있고 어디서 예약하는지를 들고 있다가, 출력 크기를
// 적어두면 ME 달그락이 그 장비로 낼 수 있는 크기 안에서 설계한다.
const blank = (): MakerSpace => ({ id: "", name: "", where: "", printers: "", maxPrintMm: null, url: "", note: "" });
const mm = (space: MakerSpace, index: number) => space.maxPrintMm?.[index] ?? "";

export default function MakerspaceList() {
  const [profile, setProfile] = useState<MakerProfile | null>(null);
  const [draft, setDraft] = useState<MakerSpace>(blank());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { void (async () => {
    try {
      const response = await fetch("/api/me/profile", { cache: "no-store" });
      const body = response.ok ? await response.json() : null;
      setProfile({ ...emptyProfile(), ...(body?.profile ?? {}) });
    } catch { setProfile(emptyProfile()); }
  })(); }, []);

  const spaces = profile?.makerspaces ?? [];

  async function save(next: MakerSpace[]) {
    if (!profile) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/me/profile", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...personPart(profile), makerspaces: next }) });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? "저장하지 못했어요.");
      setProfile({ ...profile, makerspaces: next });
      setDraft(blank());
    } catch (e) { setError(e instanceof Error ? e.message : "저장하지 못했어요."); }
    finally { setBusy(false); }
  }

  function setSize(index: number, value: string) {
    const current: [number, number, number] = [...(draft.maxPrintMm ?? [0, 0, 0])] as [number, number, number];
    current[index] = Number(value) || 0;
    setDraft({ ...draft, maxPrintMm: current.every((n) => n <= 0) ? null : current });
  }

  if (!profile) return <p className="muted">불러오는 중이에요…</p>;
  return <div className="makerspace-list">
    <h3>자주 가는 곳 등록</h3>
    <p className="muted">한 번 등록해두면 모든 프로젝트에서 같이 써요. 출력 크기를 적으면 그 안에 들어가게 설계해요.</p>
    {spaces.length > 0 && <ul className="space-items">{spaces.map((space) => <li key={space.id}>
      <div><b>{space.name}</b>{space.where && <small> · {space.where}</small>}
        {space.printers && <small className="space-line">장비: {space.printers}</small>}
        {space.maxPrintMm && <small className="space-line">출력 가능 크기: {space.maxPrintMm.join(" × ")} mm</small>}
        {space.note && <small className="space-line">{space.note}</small>}
        {space.url && <a href={space.url} target="_blank" rel="noreferrer noopener">예약·안내 페이지 ↗</a>}
      </div>
      <button disabled={busy} aria-label={`${space.name} 지우기`} onClick={() => void save(spaces.filter((s) => s.id !== space.id))}>🗑</button>
    </li>)}</ul>}
    <div className="space-form">
      <label>이름<input className="profile-input" maxLength={60} placeholder="예: 마포 무한상상실" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
      <label>어디<input className="profile-input" maxLength={80} placeholder="예: 서울 마포구 · 지하철 15분" value={draft.where} onChange={(e) => setDraft({ ...draft, where: e.target.value })} /></label>
      <label>보유 장비<input className="profile-input" maxLength={200} placeholder="예: 뱀부랩 P1S, 레이저 커터" value={draft.printers} onChange={(e) => setDraft({ ...draft, printers: e.target.value })} /></label>
      <fieldset className="space-size"><legend>출력 가능 크기 (mm, 선택)</legend>
        {[0, 1, 2].map((index) => <input key={index} className="profile-input" type="number" min={0} max={2000} aria-label={["가로", "세로", "높이"][index]} placeholder={["가로", "세로", "높이"][index]} value={mm(draft, index)} onChange={(e) => setSize(index, e.target.value)} />)}
      </fieldset>
      <label>예약·안내 페이지<input className="profile-input" maxLength={300} placeholder="https://" value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} /></label>
      <label>메모<input className="profile-input" maxLength={300} placeholder="예: 기본 교육 이수해야 씀, 재료비 별도" value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} /></label>
      {error && <p className="login-error" role="alert">{error}</p>}
      <button className="primary" disabled={busy || !draft.name.trim() || spaces.length >= 10}
        onClick={() => void save([...spaces, { ...draft, id: crypto.randomUUID().slice(0, 8) }])}>이 공간 등록</button>
      {spaces.length >= 10 && <small className="muted">열 곳까지 등록할 수 있어요.</small>}
    </div>
  </div>;
}
