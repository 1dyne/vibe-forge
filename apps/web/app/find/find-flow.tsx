"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CATS, FIRE, REACT_FIRE, ROOT_VISIBLE, compose, fireGain, fireLabel, fireName, lookup, reactKind, type Chip, type ChipTree, type ReactKind } from "../../lib/find/chips";
import type { FindAnalysis } from "../../lib/find/classify";
import type { Maturity } from "../../lib/find/maturity";
import type { ProjectMatch } from "../../lib/find/projects";
import Dokkaebi from "./dokkaebi";
import FireCardView, { Roast } from "./fire-card";
import type { FireCard } from "../../lib/find/card";
import Opening from "./opening";
import ForgeSignup from "./waitlist";
import Mailbox from "./mailbox";
import VillageNews from "./village-news";
import { track } from "./track";

const EXAMPLES = ["물 마시는 걸 자꾸 까먹어", "고양이가 밥 먹었는지 모르겠어", "책상에서 집중 시간을 재고 싶어"];
const DICE = ["현관문 잠갔는지 매번 불안해", "화분에 물 줄 때를 모르겠어", "밤에 불 끄러 일어나기 귀찮아", "택배 왔는지 자꾸 나가봐", "스트레칭을 자꾸 까먹어", "방이 건조한지 모르겠어", "공부할 때 폰을 자꾸 만져", "강아지가 물을 얼마나 마셨는지 궁금해"];
const CAT_COLOR: Record<string, string> = { 형태: "var(--cat-form)", 반응: "var(--cat-react)", 감지: "var(--cat-sense)", 누구: "var(--cat-who)" };
const STEP: Record<Screen, string> = { opening: "", intro: "1 / 4", thinking: "1 / 4", software: "1 / 4", unsafe: "1 / 4", stoke: "2 / 4", reveal: "3 / 4", forge: "4 / 4" };
const VIBE_PROMPT = (idea: string) => `나는 개발자가 아니야. "${idea.trim().slice(0, 200)}" 이걸 해결하는 걸 만들고 싶어.\n1) 하루 만에 써볼 수 있는 가장 작은 버전을 기능 3개 이내로 제안해줘.\n2) 모르는 용어는 풀어서 설명하고, 정할 건 선택지로 물어봐줘.\n3) 동작하는 첫 화면부터 만들고 하나씩 붙여가자.`;

type Screen = "opening" | "intro" | "thinking" | "software" | "unsafe" | "stoke" | "reveal" | "forge";
type Fire = { id: string; name: string; nickname?: string; sentence: string; color: string; reactKind: string; peak: number; labels: string[]; card: FireCard | null };
type ForgeSummary = { id: string; isNew: boolean; alley: string; plotNo: number; line: string };
type Result = { fire: Fire; matches: ProjectMatch[]; unique: string[]; maturity: Maturity; forge: ForgeSummary | null };

const EMPTY_TREE: ChipTree = { root: [], follow: {} };

export default function FindFlow({ couponText }: { couponText: string | null }) {
  const [screen, setScreen] = useState<Screen>("opening");
  const [nickname, setNickname] = useState("");
  const [idea, setIdea] = useState("");
  const [analysis, setAnalysis] = useState<FindAnalysis | null>(null);
  const [tree, setTree] = useState<ChipTree>(EMPTY_TREE);
  const [picked, setPicked] = useState<string[]>([]);
  const [fire, setFire] = useState<number>(FIRE.start);
  const [peak, setPeak] = useState<number>(FIRE.start);
  const [shown, setShown] = useState("");
  const [gulp, setGulp] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [ref, setRef] = useState<string | null>(null);
  const fireRef = useRef(fire);
  fireRef.current = fire;

  const find = useMemo(() => lookup(tree), [tree]);
  const kind = reactKind(picked, find);
  const color = REACT_FIRE[kind];
  const scrollText = useMemo(() => {
    const body = compose(picked, find);
    return `“${idea.trim()}”` + (body ? `\n${body}` : "");
  }, [picked, find, idea]);

  useEffect(() => {
    try {
      const fromUrl = new URLSearchParams(window.location.search).get("ref")?.toUpperCase();
      if (fromUrl && /^[A-Z0-9]{6}$/.test(fromUrl)) sessionStorage.setItem("find_ref", fromUrl);
      setRef(sessionStorage.getItem("find_ref"));
    } catch { /* 저장소를 못 쓰면 초대 코드 없이 진행 */ }
    // 한 번 인사한 사람은 오프닝을 건너뛴다
    try {
      const saved = localStorage.getItem("find_name");
      if (saved) { setNickname(saved); setScreen("intro"); }
    } catch { /* 저장소를 못 쓰면 매번 인사 */ }
  }, []);

  const go = useCallback((next: Screen) => {
    setScreen(next);
    window.scrollTo(0, 0);
    track("screen_view", { screen: next });
  }, []);
  useEffect(() => { track("screen_view", { screen: "opening" }); }, []);

  function finishOpening(name: string) {
    setNickname(name);
    try { localStorage.setItem("find_name", name); } catch { /* 저장 못 해도 진행 */ }
    track("name_set", { skipped: name === "이름 없는 도깨비" });
    go("intro");
  }

  // 불이 사그라드는 시계 — 타이머 대신 시간 압박
  useEffect(() => {
    if (screen !== "stoke") return;
    const t = setInterval(() => setFire((f) => {
      const next = Math.max(FIRE.floor, f - FIRE.decayPerTick);
      if (next === FIRE.floor && f > FIRE.floor) track("fire_out");
      return next;
    }), FIRE.tickMs);
    return () => clearInterval(t);
  }, [screen]);

  // 받아 적기: 바뀐 지점까지 빠르게 지우고(2글자/틱) 한 글자씩 다시 쓴다
  useEffect(() => {
    if (screen !== "stoke") return;
    const t = setInterval(() => setShown((s) => {
      let p = 0;
      while (p < s.length && s[p] === scrollText[p]) p++;
      if (s.length > p) return s.slice(0, Math.max(p, s.length - 2));
      if (s.length < scrollText.length) return scrollText.slice(0, s.length + 1);
      return s;
    }), FIRE.typeMs);
    return () => clearInterval(t);
  }, [screen, scrollText]);

  function resetFire() {
    setPicked([]); setFire(FIRE.start); setPeak(FIRE.start); setShown(""); setResult(null);
  }

  async function submitIdea(forceHardware = false) {
    if (!idea.trim()) return;
    setError("");
    if (!forceHardware) track("idea_submit", { length: idea.trim().length });
    go("thinking");
    const started = Date.now();
    try {
      const response = await fetch("/api/find/analyze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idea: idea.trim(), forceHardware }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "다시 해줘.");
      // 판별 중 연출(갸웃)을 최소 1.4초는 보여준다
      await new Promise((r) => setTimeout(r, Math.max(0, 1400 - (Date.now() - started))));
      const a = body as FindAnalysis;
      setAnalysis(a);
      setTree(a.chips);
      resetFire();
      go(!a.safety.ok ? "unsafe" : a.kind === "software" ? "software" : "stoke");
    } catch (e) {
      setError(e instanceof Error ? e.message : "다시 해줘.");
      go("intro");
    }
  }

  function pick(chip: Chip) {
    if (picked.includes(chip.id)) return;
    const isFollow = !tree.root.some((r) => r.id === chip.id);
    const add = fireGain(chip, picked, find, isFollow);
    const next = Math.min(FIRE.max, fireRef.current + add);
    setPicked((p) => [...p, chip.id]);
    setFire(next);
    setPeak((p) => Math.max(p, next));
    setGulp((g) => g + 1);
    track("chip_pick", { id: chip.id, fire: Math.round(next) });
  }

  async function lockFire() {
    if (!picked.length || busy) return;
    setBusy(true);
    setError("");
    track("fire_locked", { peak: Math.round(peak), picked });
    try {
      const response = await fetch("/api/find/fires", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idea: idea.trim(), picked: picked.map((id) => find(id)), peak, nickname }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "불을 저장하지 못했어.");
      setResult(body as Result);
      go("reveal");
    } catch (e) {
      setError(e instanceof Error ? e.message : "불을 저장하지 못했어.");
    } finally {
      setBusy(false);
    }
  }

  // 방금 고른 장작의 후속(더 구체적인 것)을 앞에, 그 뒤로 아직 안 고른 뿌리 장작을 채운다.
  // 뿌리 장작은 첫 입력과 관련 있는 순서라서, 하나를 고르면 다음으로 관련 있는 장작이 빈자리에 들어온다.
  const follows = [...picked].reverse().flatMap((id) => tree.follow[id] ?? []).filter((c) => !picked.includes(c.id));
  const roots = tree.root.filter((c) => !picked.includes(c.id)).slice(0, Math.max(4, ROOT_VISIBLE - Math.min(follows.length, 6)));
  const visible = [...new Map([...follows, ...roots].map((c) => [c.id, c])).values()];
  const freshIds = new Set(picked.length ? (tree.follow[picked[picked.length - 1]] ?? []).map((c) => c.id) : []);
  const filledCats = CATS.filter((c) => picked.some((id) => find(id)?.cat === c)).length;
  const stokeMotion = fire <= FIRE.floor + 0.01 ? "fallen" : fire >= 55 ? "blaze" : "stoke";

  return (
    <main className="find" style={{ ["--fire" as string]: result?.fire.color ?? color }}>
      <header className="top">
        <a className="brand" href="/find">달그락 대장간</a>
        <div className="step">{STEP[screen]}</div>
      </header>

      {screen === "opening" && <Opening onDone={finishOpening} />}

      {screen === "intro" && (
        <section className="screen">
          <VillageNews />
          <div className="intro-head">
            <Dokkaebi motion="idle" fire={30} width={112} />
            <div className="bubble">좋아, {nickname || "인간"}!<br />만들고 싶은 거, 아니면<br />요즘 귀찮은 거 하나만 말해줘.</div>
          </div>
          <h1>내 도깨비불 찾기</h1>
          <div className="field">
            <label htmlFor="idea">뭘 만들고 싶어?</label>
            <textarea id="idea" rows={3} maxLength={300} placeholder="예: 물 마시는 걸 자꾸 까먹어" value={idea} onChange={(e) => setIdea(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submitIdea(); } }} />
          </div>
          <div className="chips">
            {EXAMPLES.map((t) => <button key={t} type="button" className="chip example" onClick={() => setIdea(t)}>{t}</button>)}
            <button type="button" className="chip dice" onClick={() => { setIdea(DICE[Math.floor(Math.random() * DICE.length)]); track("dice"); }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><rect x="3" y="3" width="18" height="18" rx="4" /><circle cx="8.5" cy="8.5" r="1.2" fill="currentColor" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /><circle cx="15.5" cy="15.5" r="1.2" fill="currentColor" /></svg>
              아무거나 던져줘
            </button>
          </div>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="spacer" />
          <button className="btn" type="button" disabled={!idea.trim()} onClick={() => submitIdea()}>나와라, 뚝딱!</button>
          <a className="link" href="/find/village" style={{ textAlign: "center" }}>먼저 도깨비 마을 구경하기</a>
        </section>
      )}

      {screen === "thinking" && (
        <section className="screen center">
          <Dokkaebi motion="tilt" fire={35} width={170} />
          <h2>음… 손이 가는 일인가?</h2>
          <div className="muted small">달그락 달그락</div>
        </section>
      )}

      {screen === "software" && (
        <section className="screen">
          <div className="muted small">“{idea}”</div>
          <h2>이건 손 안 대도<br />되는 거야.</h2>
          <p className="lead">{analysis?.reason ?? "앱이나 웹으로 충분해 보여."} 이럴 땐 바이브코딩이 제일 빨라.</p>
          <VibeGuide idea={idea} />
          <div className="note row">
            <div style={{ width: 76, flexShrink: 0 }}><Dokkaebi motion="idle" fire={50} width={76} /></div>
            <div>
              <div className="display" style={{ fontSize: 18 }}>근데 손을 대면?</div>
              <div className="small body">책상 위에 버튼 하나, 불빛 하나로 만들면 화면을 안 봐도 돼.</div>
            </div>
          </div>
          <div className="spacer" />
          <button className="btn" type="button" onClick={() => submitIdea(true)}>하드웨어로 바꿔보기</button>
        </section>
      )}

      {screen === "unsafe" && (
        <section className="screen center">
          <Dokkaebi motion="fallen" fire={10} width={180} once />
          <h2>앗, 이건 아직 못 다뤄.</h2>
          <p className="lead" style={{ textAlign: "center" }}>{analysis?.safety.note}</p>
          <p className="muted small" style={{ textAlign: "center" }}>대신 센서·불빛·작은 모터로 풀 수 있는 쪽으로 바꿔볼래?</p>
          <button className="btn" type="button" onClick={() => go("intro")}>다른 걸로 해볼래</button>
        </section>
      )}

      {screen === "stoke" && (
        <section className="screen" style={{ gap: 14 }}>
          <div className="stoke-top">
          <div className="stage">
            <Dokkaebi key={gulp} motion={stokeMotion} fire={fire} kind={kind} className={gulp ? "gulp" : ""} once={stokeMotion === "fallen"} />
            {gulp > 0 && <Embers key={`e${gulp}`} />}
          </div>
          <div className="meter">
            <div className="meter-row"><div className="fire-label">{fireLabel(fire)}</div><div className="muted small">화력 <span className="fire-num">{Math.round(fire)}</span></div></div>
            <div className="bar"><i style={{ width: `${fire}%` }} /></div>
            <div className="muted tiny">{fire <= FIRE.floor + 0.01 ? "불이 꺼지려 해! 장작을 넣어줘." : "가만두면 불이 줄어. 장작을 넣어!"} · 채운 갈래 <b>{filledCats}</b>/4</div>
          </div>
          </div>
          <div className="scroll" aria-live="polite">
            <div className="scroll-head"><span>도깨비가 받아 적는 중</span><span>장작 {picked.length}개</span></div>
            <div className="scroll-text"><span>{shown}</span><span className="caret" /></div>
          </div>
          <div className="chips">
            {visible.map((c) => (
              <button key={c.id} type="button" className={`chip${freshIds.has(c.id) ? " fresh" : ""}`} onClick={() => pick(c)}>
                <span className="tag" style={{ background: CAT_COLOR[c.cat] }}>{c.cat}</span>{c.label}
              </button>
            ))}
          </div>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="spacer" />
          <button className="btn btn-fire lock" type="button" disabled={!picked.length || busy} onClick={lockFire}>{busy ? "불 옮겨 담는 중…" : "이 불로 할래!"}</button>
        </section>
      )}

      {screen === "reveal" && result && (
        <Reveal result={result} picked={picked} find={find} idea={idea} onShare={() => { setShareOpen(true); track("share_open"); }}
          onAgain={() => { resetFire(); go("stoke"); }} onMore={() => { setResult(null); go("stoke"); }} onForge={() => go("forge")} />
      )}

      {screen === "forge" && (
        <ForgeSignup fire={result?.fire ?? null} forgeId={result?.forge?.id ?? null} refCode={ref} couponText={couponText} onRestart={() => { setIdea(""); setAnalysis(null); setTree(EMPTY_TREE); resetFire(); go("intro"); }} />
      )}

      {shareOpen && result && <ShareSheet fire={result.fire} onClose={() => setShareOpen(false)} />}
      {screen !== "opening" && screen !== "stoke" && <Mailbox screen={`find:${screen}`} />}
    </main>
  );
}

function Embers() {
  return (
    <div className="embers" aria-hidden>
      {[0, 1, 2, 3].map((i) => <i key={i} className="ember" style={{ ["--dx" as string]: `${Math.round(Math.random() * 80 - 40)}px`, animationDelay: `${i * 60}ms`, left: `calc(50% + ${Math.round(Math.random() * 30 - 15)}px)` }} />)}
    </div>
  );
}

function VibeGuide({ idea }: { idea: string }) {
  const [copied, setCopied] = useState(false);
  const prompt = VIBE_PROMPT(idea);
  return (
    <div className="note">
      <div className="display" style={{ fontSize: 18 }}>바이브코딩 3분 시작법</div>
      <ol className="steps">
        <li>쓰고 있는 AI(Claude 등)를 열어.</li>
        <li>아래 문장을 그대로 붙여넣어.</li>
        <li>첫 화면이 뜨면 절반은 온 거야. 막히면 에러를 그대로 붙여넣고 “쉽게 설명해줘”.</li>
      </ol>
      <pre className="prompt">{prompt}</pre>
      <button className="btn btn-ghost" type="button" onClick={async () => { try { await navigator.clipboard.writeText(prompt); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* 직접 선택해서 복사 */ } }}>{copied ? "복사했어!" : "시작 문장 복사"}</button>
    </div>
  );
}

function Reveal({ result, picked, find, idea, onShare, onAgain, onMore, onForge }: {
  result: Result; picked: string[]; find: (id: string) => Chip | undefined; idea: string; onShare: () => void; onAgain: () => void; onMore: () => void; onForge: () => void;
}) {
  const { fire, matches, unique, maturity, forge } = result;
  return (
    <section className="screen">
      <div className="muted small" style={{ textAlign: "center", letterSpacing: 2 }}>네 도깨비불이 태어났어</div>
      {fire.card ? (
        <>
          <FireCardView name={fire.name} owner={fire.nickname} peak={fire.peak} kind={fire.reactKind as ReactKind} card={fire.card} />
          <Roast head={fire.card.roast.head} body={fire.card.roast.body} kind={fire.reactKind as ReactKind} />
        </>
      ) : (
        <div className="card">
          <Dokkaebi motion="blaze" fire={fire.peak} width={160} kind={fire.reactKind as never} />
          <div className="display" style={{ fontSize: 26, textAlign: "center" }}>{fire.name}</div>
          <div className="muted small">최고 화력 <span className="display ink" style={{ fontSize: 20 }}>{fire.peak}</span> · {fireLabel(fire.peak)}</div>
        </div>
      )}
      <div className="note">
        <div className="tiny muted">도깨비가 받아 적은 설계 한 줄</div>
        <div className="sentence">“{idea.trim()}”{"\n"}{fire.sentence}</div>
      </div>
      {forge && (
        <div className="forge-made">
          <span className="tiny muted">{forge.isNew ? "도깨비 마을에 네 대장간이 생겼어" : "네 대장간 선반에 불이 하나 더 생겼어"}</span>
          <b>{forge.line}</b>
          <a className="tiny" href="/find/village">도깨비 마을 지도에서 보기</a>
          <a className="btn btn-fire" href={`/f/${forge.id}`} style={{ display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }} onClick={() => track(forge.isNew ? "forge_created" : "forge_open")}>{forge.isNew ? "내 대장간 짓기" : "내 대장간 가기"}</a>
        </div>
      )}
      <div className="blueprint-cta">
        <div className="display">말하면, 회로도부터 조립까지.</div>
        <p>대장간이 열리면 네 도깨비불의 회로도 첫 장을 보내줄게.</p>
        <button className="btn" type="button" style={{ background: "#fff", color: "var(--ink)" }} onClick={onForge}>이 도깨비불의 회로도 받기</button>
      </div>
      <details className="fold">
        <summary>지금 더 해보면 좋은 것</summary>
        <div className="fold-body">
          <div className="growth">
            <div className="growth-head">
              <div><div className="tiny muted">지금 네 아이디어는</div><div className="display" style={{ fontSize: 21 }}>{maturity.label}</div></div>
              <div className="growth-steps" aria-label={`4단계 중 ${maturity.level}단계`}>{[1, 2, 3, 4].map((n) => <i key={n} className={n <= maturity.level ? "on" : ""} />)}</div>
            </div>
            <div className="body">{maturity.summary}</div>
            <ol className="growth-next">
              {maturity.next.map((n) => (
                <li key={n.title}><b>{n.title}</b><span>{n.body}</span>{n.href && <a href={n.href} target="_blank" rel="noopener noreferrer">원문 열기 ↗</a>}</li>
              ))}
            </ol>
            {maturity.level <= 2 && <button className="btn btn-ghost" type="button" onClick={onMore}>고른 장작 그대로, 더 넣으러 가기</button>}
          </div>
        </div>
      </details>
      <details className="fold">
        <summary>닮은 메이커 프로젝트 {matches.length}</summary>
        <div className="fold-body">
          {matches.length > 0 && <span className="badge" style={{ alignSelf: "flex-start" }}>일치율 = 갈래별 겹친 태그</span>}
          {matches.length ? (
            <div className="rail" aria-label="닮은 프로젝트 목록">
              {matches.map((p) => (
                <a className="proj" key={p.id} href={p.source_url} target="_blank" rel="noopener noreferrer">
                  <div className="img">{p.image ? <img src={p.image.url} alt={`${p.title_ko} 작품 사진`} loading="lazy" /> : <span>사진은 원문에서 볼 수 있어 ↗</span>}</div>
                  <div className="meta">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="proj-title">{p.title_ko}</div>
                      <div className="muted tiny" style={{ marginTop: 3 }}>닮은 점: {p.shared.slice(0, 3).join(" · ")}</div>
                    </div>
                    <div className="pct">{p.match}%</div>
                  </div>
                  <div className="credit">{p.source}{p.author ? ` · ${p.author}` : ""}{p.license ? ` · ${p.license}` : " · 라이선스 표기 없음(링크만)"}</div>
                </a>
              ))}
            </div>
          ) : (
            <div className="small body">아직 닮은 프로젝트가 없어. 세상에 없는 도깨비불이야 — 처음부터 같이 설계해야 해.</div>
          )}
          <div className="note">
            <div className="small" style={{ fontWeight: 700, color: "#B5591A" }}>네 아이디어에만 있는 것</div>
            <div className="body">{unique.length ? unique.join(", ") : "장작을 한 단계 더 넣으면 여기에 네 것만의 특징이 나타나"}</div>
            <div className="muted tiny">→ 위의 닮은 프로젝트 어디에도 없어서 추가 설계가 필요해. 달그락이 같이 그려줄게.</div>
          </div>
        </div>
      </details>
      <div className="two">
        <button className="btn btn-ghost" type="button" onClick={onShare}>카드 저장·공유</button>
        <button className="btn btn-ghost" type="button" onClick={onAgain}>다시 피우기</button>
      </div>
    </section>
  );
}

function ShareSheet({ fire, onClose }: { fire: Fire; onClose: () => void }) {
  const [status, setStatus] = useState("");
  const link = typeof window === "undefined" ? "" : `${window.location.origin}/f/${fire.id}`;
  const text = `내 도깨비불은 “${fire.name}” (화력 ${fire.peak}). 너의 도깨비불은?`;
  async function share() {
    try {
      const blob = await (await fetch(`/f/${fire.id}/card.png`)).blob();
      const file = new File([blob], `dokkaebi-${fire.id}.png`, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text: `${text}\n${link}` });
        track("share_done", { method: "file" });
        return;
      }
      if (navigator.share) {
        await navigator.share({ title: "내 도깨비불", text, url: link });
        track("share_done", { method: "link" });
        return;
      }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = file.name;
      a.click();
      track("share_done", { method: "download" });
      setStatus("카드를 저장했어!");
    } catch { /* 공유 창을 닫은 경우 */ }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(`${text}\n${link}`); setStatus("링크를 복사했어!"); track("share_done", { method: "copy" }); } catch { setStatus(link); }
  }
  return (
    <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} role="dialog" aria-label="공유 카드">
      <div className="sheet">
        <img className="share-img" src={`/f/${fire.id}/card.png`} alt={`${fire.name} 공유 카드`} />
        <div className="two">
          <button className="btn" type="button" onClick={share}>저장·공유</button>
          <button className="btn btn-ghost" type="button" onClick={copy}>링크 복사</button>
        </div>
        {status && <div className="muted small" style={{ textAlign: "center" }}>{status}</div>}
        <button className="link" type="button" onClick={onClose}>닫기</button>
      </div>
    </div>
  );
}
