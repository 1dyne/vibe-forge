"use client";
import { useEffect, useState } from "react";
import type { LocalProject, MakerProfile } from "../lib/project-types";
import { CHECKLIST } from "../lib/checklist";
import { CODING_EXPERIENCE, DEV_INSTALL_OPTIONS, DEV_TOOLS, emptyDevProfile, projectInstructions } from "../lib/dev-handoff";
import { emptyProfile, personPart, TOOL_OPTIONS } from "../lib/workflow";
import AccountPanel from "./account-panel";
import { HELPER_COMMAND, HELPER_REPO_URL } from "./helper-composer";
import MakerspaceList from "./makerspace-list";
import OwnedPartsField from "./owned-parts-field";

// 나에 대한 것은 전부 여기 한 곳에 모은다. 예전에는 '내 계정', '제작 프로필',
// '메이커스페이스', 'AI 연결', '개발 연결'이 사이드바에 따로 있었고, 같은 질문(코딩 경험,
// 쓰는 도구)이 두 군데에서 따로 물렸다. 프로젝트마다 달라지는 것(핵심 동작·예산·기한)만
// 프로젝트 설정에 남긴다.
//
// 여기 값은 어디서 채워지든 같은 자리다: 처음 들어올 때의 체크리스트, 대장 달그락이
// 대화하다 물어서 적은 것, 내가 여기서 직접 고친 것.
export type HubTab = "skill" | "gear" | "place" | "ai" | "account";
const TABS: Array<{ id: HubTab; label: string; hint: string }> = [
  { id: "skill", label: "경험", hint: "설명을 얼마나 자세히 할지 정하는 데만 써요. 목표를 낮추지 않아요." },
  { id: "gear", label: "장비·부품", hint: "가진 것은 사라고 하지 않고, 없는 도구는 대신할 방법을 안내해요." },
  { id: "place", label: "만드는 곳", hint: "3D 프린터가 없어도 근처에서 쓸 수 있는 곳을 기준으로 설계해요." },
  { id: "ai", label: "AI 연결", hint: "달그락과의 대화에 어떤 AI를 쓸지 정해요." },
  { id: "account", label: "로그인·보안", hint: "" }
];
const option = (key: "solderingSkill" | "printerAccess" | "travelRange") => CHECKLIST.find((q) => q.key === key)!;
const EDITED: Array<keyof MakerProfile> = ["tools", "toolsConfirmed", "firmwareExperience", "solderingSkill", "printerAccess", "region", "travelRange", "ownedParts", "devProfile"];

function Copy({ value, label = "복사" }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return <button type="button" className="copy-button" onClick={() => { void navigator.clipboard?.writeText(value).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }); }}>{done ? "복사됨" : label}</button>;
}

function AiTab({ project }: { project: LocalProject | null }) {
  const [helper, setHelper] = useState<{ online: boolean; model: string | null; account: string | null } | null>(null);
  const [connectorUrl, setConnectorUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => fetch("/api/helper/status", { cache: "no-store" }).then((r) => r.ok ? r.json() : null).then((b) => { if (alive && b) setHelper(b); }).catch(() => {});
    void load();
    void fetch("/api/me", { cache: "no-store" }).then((r) => r.ok ? r.json() : null).then((b) => { if (alive && b?.connectorUrl) setConnectorUrl(b.connectorUrl); }).catch(() => {});
    const timer = setInterval(load, 8000);
    return () => { alive = false; clearInterval(timer); };
  }, []);
  const command = HELPER_COMMAND;
  return <>
    <h3 className="connect-subtitle">이 화면에서 바로 대화하기 · 내 ChatGPT 요금제</h3>
    <p className={`helper-state ${helper?.online ? "on" : ""}`}>{helper == null ? "확인하는 중…" : helper.online ? `달그락 도우미가 켜져 있어요${helper.account ? ` · ${helper.account}` : ""}${helper.model ? ` · ${helper.model}` : ""}` : "달그락 도우미가 꺼져 있어요"}</p>
    <p>내 컴퓨터에서 달그락 도우미를 켜 두면, 이 화면에서(휴대폰에서도) 바로 대화할 수 있어요. AI 사용량은 내 ChatGPT 요금제에서 나가고, 로그인 정보는 내 컴퓨터에만 남아요.</p>
    <ol className="connect-steps">
      <li><strong>Node.js 설치 (처음 한 번)</strong><p>nodejs.org에서 LTS 버전을 받아 설치해요.</p></li>
      <li><strong>터미널에서 도우미 켜기</strong><p>맥은 “터미널”, 윈도우는 “PowerShell”을 열고 아래를 붙여넣어요. 브라우저가 열리면 달그락과 ChatGPT에 차례로 로그인해요.</p><div className="copy-row"><code>{command}</code><Copy value={command} /></div></li>
      <li><strong>창을 켜 둔 채 대화하기</strong><p>“준비됐어요”가 뜨면 끝이에요. 창을 닫으면 대화가 멈추고, 다시 켜면 이어져요.</p></li>
    </ol>
    <p className="muted"><a href={HELPER_REPO_URL} target="_blank" rel="noreferrer noopener">도우미가 무엇을 어디로 보내는지 보기 (공개 코드)</a></p>

    <details className="hub-more"><summary>다른 AI 앱에서 대화하고 싶어요 (Claude 등, 커넥터)</summary>
      <p>Claude 같은 AI 앱에 달그락 대장간을 커넥터로 붙여 그 앱에서 대화할 수도 있어요. 그 앱의 설정 → 커넥터 → 커스텀 커넥터 추가에 아래 주소를 넣고 연결해요.</p>
      {connectorUrl ? <div className="copy-row"><code>{connectorUrl}</code><Copy value={connectorUrl} /></div> : <p className="muted">커넥터 주소를 불러오지 못했어요.</p>}
      {project ? <>
        <p className="muted">아래 문구는 <b>지금 열어 둔 프로젝트 「{project.name}」에만</b> 해당해요. 그 AI 앱의 프로젝트 지침에 붙여넣으면 그 대화가 이 프로젝트에만 쌓여요. 다른 프로젝트를 열면 문구가 바뀌어요.</p>
        <pre className="instructions-box">{projectInstructions(project)}</pre><Copy value={projectInstructions(project)} label="지침 복사" />
      </> : <p className="muted">프로젝트를 하나 열면 그 프로젝트 전용 지침 문구가 여기에 나와요.</p>}
    </details>
  </>;
}

export default function AccountHub({ initialTab = "skill", project, hasAccount, onClose, onSaved }: {
  initialTab?: HubTab;
  project: LocalProject | null;
  /** 참여자 계정이면 로그인·보안 탭이 있다. 운영자 로그인에는 없다 */
  hasAccount: boolean;
  onClose: () => void;
  /** 경험·장비가 바뀌면 열려 있는 프로젝트들도 다시 읽는다 */
  onSaved: () => void;
}) {
  const [tab, setTab] = useState<HubTab>(initialTab);
  const [profile, setProfile] = useState<MakerProfile | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const tabs = TABS.filter((t) => hasAccount || t.id !== "account");

  useEffect(() => {
    fetch("/api/me/profile", { cache: "no-store" }).then((r) => r.ok ? r.json() : null).then((b) => setProfile({ ...emptyProfile(), ...(b?.profile ?? {}) })).catch(() => setProfile(emptyProfile()));
  }, []);

  const change = (patch: Partial<MakerProfile>) => { setProfile((p) => ({ ...(p ?? emptyProfile()), ...patch })); setDirty(true); setNote(""); };
  const dev = profile?.devProfile ?? emptyDevProfile();
  const changeDev = (patch: Partial<typeof dev>) => change({ devProfile: { ...dev, ...patch } });

  async function save() {
    if (!profile || busy) return;
    setBusy(true); setError("");
    try {
      // 메이커스페이스 목록은 자기 자리에서 따로 저장된다. 그 사이 바뀐 것을 덮어쓰지 않도록
      // 최신 값을 읽어 이 창에서 고친 항목만 얹는다.
      const latest = await fetch("/api/me/profile", { cache: "no-store" }).then((r) => r.ok ? r.json() : null).catch(() => null);
      const base: MakerProfile = { ...emptyProfile(), ...(latest?.profile ?? {}) };
      const merged = { ...base, ...Object.fromEntries(EDITED.map((key) => [key, profile[key]])) } as MakerProfile;
      const response = await fetch("/api/me/profile", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(personPart(merged)) });
      if (response.status === 401) { window.location.assign("/login"); return; }
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? "저장하지 못했어요.");
      setDirty(false); setNote("저장했어요. 모든 프로젝트에 함께 반영돼요.");
      onSaved();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "저장하지 못했어요."); }
    finally { setBusy(false); }
  }
  const close = () => { if (!dirty || window.confirm("저장하지 않은 변경이 있어요. 닫을까요?")) onClose(); };
  const radios = (key: "solderingSkill" | "printerAccess" | "travelRange") => <fieldset><legend>{option(key).question}</legend>{option(key).options!.map((o) => <label className="radio-option" key={o.value}><input type="radio" name={`hub-${key}`} checked={profile?.[key] === o.value} onChange={() => change({ [key]: o.value } as Partial<MakerProfile>)} />{o.label}</label>)}</fieldset>;
  const current = tabs.find((t) => t.id === tab) ?? tabs[0];
  const editable = tab === "skill" || tab === "gear" || tab === "place";

  return <div className="modal-backdrop" onClick={close}>
    <section className="profile-modal connect-modal account-hub" role="dialog" aria-modal="true" aria-label="내 계정" onClick={(e) => e.stopPropagation()}>
      <header><h2>내 계정</h2><button aria-label="닫기" onClick={close}>×</button></header>
      <div className="connect-tabs hub-tabs" role="tablist">{tabs.map((t) => <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? "active" : ""} onClick={() => setTab(t.id)}>{t.label}</button>)}</div>
      {current.hint && <p className="muted hub-hint">{current.hint}</p>}

      {editable && !profile && <p>불러오는 중…</p>}

      {tab === "skill" && profile && <>
        <fieldset><legend>보드에 코드를 올려본 적 있나요? <small>(하드웨어)</small></legend>{([["none", "처음이에요 · 단계마다 안내가 필요해요"], ["guided", "안내를 보면서 해본 적 있어요"], ["independent", "보드 설정과 업로드를 직접 할 수 있어요"]] as const).map(([v, label]) => <label className="radio-option" key={v}><input type="radio" name="hub-firmware" checked={profile.firmwareExperience === v} onChange={() => change({ firmwareExperience: v })} />{label}</label>)}</fieldset>
        {radios("solderingSkill")}
        <fieldset><legend>코딩 경험 <small>(소프트웨어)</small></legend>{(["none", "guided", "independent"] as const).map((v) => <label className="radio-option" key={v}><input type="radio" name="hub-coding" checked={dev.codingExperience === v} onChange={() => changeDev({ codingExperience: v })} />{CODING_EXPERIENCE[v]}</label>)}<small className="muted">하드웨어 경험과 따로 물어요. 웹은 짜지만 보드는 처음인 분이 많아서요.</small></fieldset>
        <fieldset><legend>코드를 만들 때 쓸 도구 <small>(선택)</small></legend><div className="choice-row">{(["claude_code", "codex", "undecided"] as const).map((v) => <label key={v} className={dev.tool === v ? "on" : ""}><input type="radio" name="hub-devtool" checked={dev.tool === v} onChange={() => changeDev({ tool: v })} />{DEV_TOOLS[v]}</label>)}</div></fieldset>
        <fieldset><legend>내 컴퓨터</legend><div className="choice-row">{(["mac", "windows", "linux"] as const).map((v) => <label key={v} className={dev.os === v ? "on" : ""}><input type="radio" name="hub-os" checked={dev.os === v} onChange={() => changeDev({ os: v })} />{{ mac: "Mac", windows: "Windows", linux: "Linux" }[v]}</label>)}</div></fieldset>
        <fieldset><legend>컴퓨터에 이미 설치된 것</legend><div className="tool-checks">{DEV_INSTALL_OPTIONS.map((t) => <label key={t}><input type="checkbox" checked={dev.installed.includes(t)} onChange={(e) => changeDev({ confirmed: true, installed: e.target.checked ? [...dev.installed, t] : dev.installed.filter((x) => x !== t) })} />{t}</label>)}</div><label className="none-check"><input type="checkbox" checked={dev.confirmed && !dev.installed.length} onChange={(e) => changeDev({ installed: [], confirmed: e.target.checked })} />아무것도 설치하지 않았어요</label></fieldset>
      </>}

      {tab === "gear" && profile && <>
        <fieldset><legend>사용할 수 있는 제작 도구</legend><div className="tool-checks">{TOOL_OPTIONS.map((t) => <label key={t}><input type="checkbox" checked={profile.tools.includes(t)} onChange={(e) => change({ toolsConfirmed: true, tools: e.target.checked ? [...profile.tools, t] : profile.tools.filter((x) => x !== t) })} />{t}</label>)}</div><label className="none-check"><input type="checkbox" checked={profile.toolsConfirmed && !profile.tools.length} onChange={(e) => change({ tools: [], toolsConfirmed: e.target.checked })} />아직 보유한 도구가 없어요</label></fieldset>
        <OwnedPartsField parts={profile.ownedParts ?? []} onChange={(next) => change({ ownedParts: next })} />
        {radios("printerAccess")}
      </>}

      {tab === "place" && profile && <>
        <label>어느 지역에서 만드나요?<input className="profile-input" type="text" maxLength={60} placeholder="예: 서울 마포구" value={profile.region ?? ""} onChange={(e) => change({ region: e.target.value })} /></label>
        {radios("travelRange")}
        <h3 className="connect-subtitle">자주 가는 메이커스페이스</h3>
        <MakerspaceList />
        <details className="hub-more"><summary>메이커스페이스가 뭐예요? 어떻게 찾나요?</summary>
          <p>3D 프린터, 레이저 커터, 납땜 도구 같은 장비를 기본 교육을 받은 뒤 무료나 재료비 정도로 빌려 쓰는 작업 공간이에요. 비슷한 곳으로 팹랩(Fab Lab), 무한상상실, 도서관·과학관 메이커존, 구청·시청 메이커스페이스, 대학 팹랩·창업지원센터가 있고, 직접 출력하기 어려우면 3D 출력 대행 서비스도 있어요.</p>
          <ul className="maker-tips"><li><b>메이크올(makeall.com)</b>에서 지역으로 메이커스페이스와 보유 장비를 검색해요.</li><li>검색어: “[내 지역] 메이커스페이스 3D 프린터 예약”, “[내 지역] 팹랩”, “[내 지역] 무한상상실”.</li><li>이용 조건(기본 교육 이수, 예약 방법, 재료비)과 운영 시간은 방문 전에 공식 페이지에서 꼭 확인하세요.</li><li>달그락에게 “내 근처 메이커스페이스 찾아줘”라고 말해도 돼요.</li></ul>
        </details>
      </>}

      {tab === "ai" && <AiTab project={project} />}
      {tab === "account" && hasAccount && <AccountPanel embedded onClose={onClose} />}

      {editable && profile && <div className="hub-save">
        {error && <p className="login-error" role="alert">{error}</p>}
        {note && <p className="notice" role="status">{note}</p>}
        <button className="primary" disabled={busy || !dirty} onClick={() => void save()}>{busy ? "저장하는 중…" : dirty ? "저장" : "저장됨"}</button>
        <small>여기 값은 계정에 저장돼 모든 프로젝트가 같이 써요. 달그락이 대화 중에 물어서 알게 된 것도 여기에 모여요. 예산·기한·핵심 동작은 프로젝트마다 따로 정해요.</small>
      </div>}
    </section>
  </div>;
}
