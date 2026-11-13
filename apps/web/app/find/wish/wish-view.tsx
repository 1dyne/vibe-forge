"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LanternGroup, LanternRecord, PublicLantern } from "../../../lib/find/lantern";
import { AllRopes, MyLanterns, RopeSheet, forWhom, patchLantern } from "../lantern-panel";
import { track } from "../track";
import { createWishSound } from "../world/world-sound";
import type { WishFilter, WishScene } from "./wish-scene";

type Mine = { lanterns: LanternRecord[]; allowance: number; fires: Array<{ id: string; name: string }> };
type Props = { groups: LanternGroup[]; hue: number; mine: Mine };

const FILTERS: Array<{ id: WishFilter; label: string; empty: string }> = [
  { id: "all", label: "전체", empty: "" },
  { id: "cheered", label: "응원 많은", empty: "아직 응원 받은 등불이 없어. 첫 응원을 해줘." },
  { id: "done", label: "이뤄진", empty: "아직 이뤄진 소원이 없어. 이뤄지면 물 위에 띄워져." },
  { id: "mine", label: "내 소원", empty: "선착장에 걸린 내 등불이 없어. ‘내 등 달기’로 걸어봐." }
];

const TUT: Array<{ title: string; body: string }> = [
  { title: "여기는 소원 선착장이야", body: "호수 건너 줄마다 같은 소원을 빈 도깨비들의 한지 초롱이 매달려 있어. 이뤄진 소원은 물 위에 띄워 보내. 화면을 끌면 둘러볼 수 있어." },
  { title: "등불을 눌러봐", body: "누구를 위한 소원인지 보이고, ‘응원하기’를 누르면 그 등불이 조금 더 밝아져. 만들 수 있을 것 같으면 ‘만들어볼게’를 눌러 솜씨 도깨비가 돼줘." },
  { title: "내 등불도 걸 수 있어", body: "아래 ‘내 등 달기’를 누르고 누구를 위해, 기원 한 줄을 적어. 달그락이 선착장에서 띄운 등불이 같은 소원 줄에 가서 걸려. 선착장의 주황 화살표를 누르면 마을로 돌아가." }
];

export default function WishView({ groups: initialGroups, hue, mine: initialMine }: Props) {
  const mount = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<WishScene | null>(null);
  // 선착장 소리: 물결·바람·풀벌레·대금 가락 (켜야 난다, 브라우저 규칙)
  const snd = useRef<ReturnType<typeof createWishSound> | null>(null);
  const [soundOn, setSoundOn] = useState(false);
  function toggleSound() {
    if (!snd.current) snd.current = createWishSound();
    const on = !soundOn; setSoundOn(on); snd.current.resume(); snd.current.setMuted(!on);
    track("world_sound", { on: String(on), where: "wish" });
  }
  useEffect(() => () => snd.current?.close(), []);
  const [groups, setGroups] = useState(initialGroups);
  const [mine, setMine] = useState(initialMine);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [filter, setFilter] = useState<WishFilter>("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [hang, setHang] = useState(false);
  const [list, setList] = useState(false);
  const [rope, setRope] = useState<LanternGroup | null>(null);
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [tut, setTut] = useState<number | null>(null);
  const groupsRef = useRef(groups); groupsRef.current = groups;

  const byId = useMemo(() => { const m = new Map<string, { l: PublicLantern; g: LanternGroup }>(); for (const g of groups) for (const l of g.lanterns) m.set(l.id, { l, g }); return m; }, [groups]);
  const cur = selected ? byId.get(selected) ?? null : null;
  const lit = groups.reduce((n, g) => n + g.lanterns.filter((l) => l.status === "lit").length, 0);
  const done = groups.reduce((n, g) => n + g.done, 0);

  useEffect(() => { try { if (!localStorage.getItem("wish_tut_v1")) setTut(0); } catch { /* 저장소 막힘: 안내 생략 */ } track("wish_open", { ropes: groupsRef.current.length }); }, []);
  const endTut = () => { setTut(null); try { localStorage.setItem("wish_tut_v1", "1"); } catch { /* 무시 */ } };

  const exit = useCallback(() => { track("wish_exit"); window.location.href = "/find/village?at=wish"; }, []);

  useEffect(() => {
    let disposed = false;
    (async () => {
      const three = await import("three");
      const { createWishScene } = await import("./wish-scene");
      if ("fonts" in document) await document.fonts.load("40px Jua").catch(() => {});
      if (disposed || !mount.current) return;
      const s = await createWishScene(three, {
        el: mount.current, hue,
        onPick: (id) => { setSelected(id); if (id) track("wish_card"); },
        onExit: exit,
        onRiseDone: (id) => { setSelected(id); sceneRef.current?.select(id); }
      });
      if (disposed) { s.dispose(); return; }
      sceneRef.current = s;
      s.setGroups(groupsRef.current);
      setReady(true);
    })().catch((e) => { console.error("3D 장면을 만들지 못함", e); setFailed(true); });
    return () => { disposed = true; sceneRef.current?.dispose(); sceneRef.current = null; };
  }, [hue, exit]);

  const showToast = (m: string) => { setToast(m); window.setTimeout(() => setToast((t) => (t === m ? "" : t)), 3200); };
  // 장면은 고른 등불과 거르기를 기억한 채 줄과 등불만 다시 만든다
  const applyGroups = (g: LanternGroup[], rise?: string) => { setGroups(g); sceneRef.current?.setGroups(g, rise ? { rise } : undefined); };

  function pickFilter(f: WishFilter) {
    setFilter(f);
    const n = sceneRef.current?.setFilter(f) ?? 0;
    const meta = FILTERS.find((x) => x.id === f)!;
    if (f !== "all" && n === 0) showToast(meta.empty);
    track("wish_filter", { filter: f });
  }

  async function act(action: "cheer" | "uncheer" | "make" | "unmake") {
    if (!cur || busy) return;
    setBusy(true);
    const { ok, json } = await patchLantern(cur.l.id, action);
    setBusy(false);
    if (!ok) { showToast(json.error ?? json.message ?? "바꾸지 못했어."); return; }
    applyGroups(json.groups as LanternGroup[]);
    if (action === "cheer" || action === "uncheer") track(action === "cheer" ? "wish_cheer" : "wish_uncheer");
    else track(action === "make" ? "lantern_make" : "lantern_unmake", { where: "wish" });
  }

  async function refresh(rise?: string) {
    const j = await fetch("/api/find/lantern", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    if (!j) return;
    if (j.mine) setMine(j.mine);
    applyGroups(j.groups as LanternGroup[], rise);
  }

  function hung(l: LanternRecord) {
    setHang(false); setSelected(null); setFilter("all"); sceneRef.current?.setFilter("all");
    track("wish_hang", { private: String(l.private) });
    if (l.private) { showToast("‘나만 보기’ 등불은 선착장 줄에는 안 걸려. 내 등 달기에서 볼 수 있어."); refresh(); return; }
    if (!sceneRef.current) { refresh(); setSelected(l.id); return; }
    refresh(l.id);
  }

  function close() { setSelected(null); sceneRef.current?.select(null); }

  return (
    <section className="wish-full">
      <div className="wish-stage" ref={mount} role="img" aria-label="밤 호수의 소원 선착장. 호수 건너 줄마다 한지 초롱이 매달려 있고, 이뤄진 소원은 물 위에 떠 있어." />
      {failed && (
        <div className="wish-fallback">
          <p className="small">이 기기에선 3D 호수를 그리지 못했어. 목록으로 볼게.</p>
          {groups.map((g) => (
            <div key={g.key} className="wish-fb-rope">
              <b>{g.label}</b>
              {g.lanterns.map((l) => <button key={l.id} type="button" className={`wish-fb-lantern ${l.status}`} onClick={() => setSelected(l.id)}>{forWhom(l.target)} · {l.wish}</button>)}
            </div>
          ))}
          {groups.length === 0 && <p className="small">아직 걸린 등불이 없어.</p>}
        </div>
      )}
      <header className="wish-top">
        <button type="button" className="wish-pill" onClick={() => (sceneRef.current ? sceneRef.current.leave() : exit())}>← 마을로</button>
        <div className="wish-title"><b>소원 선착장</b><span>소원 줄 {groups.filter((g) => g.count > g.done).length} · 걸린 등불 {lit}{done ? ` · 이뤄진 소원 ${done}` : ""}</span></div>
        <span className="wish-right"><button type="button" className="wish-pill" onClick={toggleSound} aria-pressed={soundOn} aria-label={soundOn ? "소리 끄기" : "소리 켜기"}>{soundOn ? "소리 끔" : "소리"}</button>
        <button type="button" className="wish-pill" onClick={() => setTut(0)} aria-label="선착장 안내 다시 보기">?</button></span>
      </header>
      <div className="wish-filters" role="radiogroup" aria-label="등불 골라 보기">
        {FILTERS.map((f) => <button key={f.id} type="button" role="radio" aria-checked={filter === f.id} className={filter === f.id ? "on" : ""} onClick={() => pickFilter(f.id)}>{f.label}</button>)}
      </div>
      {toast && <div className="wish-toast" role="status">{toast}</div>}
      {!cur && ready && groups.length === 0 && <div className="wish-empty">아직 걸린 등불이 없어. 첫 등불을 걸어봐.</div>}

      {cur ? (
        <div className="wish-card" role="dialog" aria-label="소원 등불">
          <button type="button" className="wish-x" onClick={close} aria-label="닫기">×</button>
          <div className="tiny muted">{cur.l.status === "done" ? "이뤄진 소원 · " : "소원 줄 · "}{cur.g.label}</div>
          <div className="wish-for">{forWhom(cur.l.target)}</div>
          <p className="wish-line">“{cur.l.wish}”</p>
          <div className="wish-meta">
            {cur.l.fireName && <span>도깨비불 <b>{cur.l.fireName}</b></span>}
            <span>{cur.l.mine ? "내 등불" : cur.l.forgeId ? <a href={`/f/${cur.l.forgeId}`}>{cur.l.nickname}의 대장간 →</a> : <>{cur.l.nickname}의 등불</>}</span>
          </div>
          <div className="wish-stats"><span>응원 <b>{cur.l.cheers}</b></span><span>만들어보는 솜씨 도깨비 <b>{cur.l.makers}</b></span></div>
          {cur.l.mine ? (
            <div className="wish-actions one">
              <button type="button" className="wish-btn" onClick={() => setHang(true)}>내 등불 살피기</button>
            </div>
          ) : (
            <div className={`wish-actions ${cur.l.status === "done" ? "one" : ""}`}>
              <button type="button" className={`wish-btn main ${cur.l.iCheered ? "on" : ""}`} disabled={busy} aria-pressed={cur.l.iCheered} onClick={() => act(cur.l.iCheered ? "uncheer" : "cheer")}>{cur.l.iCheered ? "응원했어 ✓" : "응원하기"}</button>
              {cur.l.status === "lit" && <button type="button" className={`wish-btn ${cur.l.iMake ? "on" : ""}`} disabled={busy} aria-pressed={cur.l.iMake} onClick={() => act(cur.l.iMake ? "unmake" : "make")}>{cur.l.iMake ? "만드는 중 ✓" : "만들어볼게"}</button>}
            </div>
          )}
          {!cur.l.mine && cur.l.iCheered && <div className="tiny muted">다시 누르면 응원을 거둬. 응원은 글 없이 불빛으로만 전해져.</div>}
        </div>
      ) : (
        <>
          <p className="wish-hint">등불을 눌러봐 · 끌면 둘러보기 · 주황 화살표는 마을로</p>
          <nav className="wish-dock" aria-label="선착장에서 할 일">
            <button type="button" className="main" onClick={() => setHang(true)}>내 등 달기</button>
            <button type="button" onClick={() => setList(true)}>소원 줄 목록</button>
          </nav>
        </>
      )}

      {hang && <MyLanterns initial={mine.lanterns} allowance={mine.allowance} fires={mine.fires} onHung={hung} onChanged={() => refresh()} onClose={() => { setHang(false); refresh(); }} />}
      {list && <AllRopes groups={groups} onPick={(g) => { setList(false); setRope(g); track("rope_open", { where: "wish" }); }} onHang={() => { setList(false); setHang(true); }} onClose={() => setList(false)} />}
      {rope && <RopeSheet group={rope} hasForge onHang={() => { setRope(null); setHang(true); }} onClose={() => { setRope(null); refresh(); }} />}
      {tut !== null && (
        <div className="overlay tut" role="dialog" aria-label="소원 선착장 안내">
          <div className="sheet tut-card">
            <div className="tiny muted">{tut + 1} / {TUT.length}</div>
            <div className="display" style={{ fontSize: 22 }}>{TUT[tut].title}</div>
            <p className="body" style={{ margin: 0 }}>{TUT[tut].body}</p>
            <div className="two">
              <button className="btn btn-ghost" type="button" onClick={endTut}>건너뛰기</button>
              <button className="btn btn-fire" type="button" onClick={() => (tut === TUT.length - 1 ? endTut() : setTut(tut + 1))}>{tut === TUT.length - 1 ? "시작하기" : "다음"}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
