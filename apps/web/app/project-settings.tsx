"use client";
import type { MakerProfile } from "../lib/project-types";
import { CHECKLIST } from "../lib/checklist";
import { intakeMissing } from "../lib/workflow";
import type { HubTab } from "./account-hub";

// 이 프로젝트에만 해당하는 것: 무엇을 만드는지, 왜, 언제까지, 얼마로.
// 장비와 경험은 사람의 것이라 내 계정에 있다. 여기서는 요약만 보여주고 그쪽으로 보낸다.
const FIRMWARE: Record<string, string> = { none: "보드에 코드 올리기는 처음", guided: "안내를 보며 해봄", independent: "직접 할 수 있음" };

export default function ProjectSettings({ projectName, profile, busy, onChange, onSave, onClose, onAccount }: {
  projectName: string; profile: MakerProfile; busy: boolean;
  onChange: (profile: MakerProfile) => void; onSave: () => void; onClose: () => void; onAccount: (tab: HubTab) => void;
}) {
  const purpose = CHECKLIST.find((q) => q.key === "purpose")!;
  const timeline = CHECKLIST.find((q) => q.key === "timelineWeeks")!;
  const budget = CHECKLIST.find((q) => q.key === "budgetKRW")!;
  const personMissing = intakeMissing(profile).filter((item) => item !== "핵심 동작");
  const gear = profile.toolsConfirmed ? (profile.tools.length ? profile.tools.join(", ") : "보유한 도구 없음") : null;
  const skill = profile.firmwareExperience !== "unanswered" ? FIRMWARE[profile.firmwareExperience] : null;
  return <div className="modal-backdrop" onClick={onClose}>
    <section className="profile-modal" role="dialog" aria-modal="true" aria-label="프로젝트 설정" onClick={(e) => e.stopPropagation()}>
      <header><h2>프로젝트 설정 · {projectName}</h2><button aria-label="닫기" onClick={onClose}>×</button></header>
      <p>이 프로젝트에만 해당하는 것들이에요. 목표를 작게 만들기 위한 질문이 아니라, 순서와 설명을 맞추기 위한 준비예요.</p>
      <label>핵심 동작<textarea aria-label="핵심 동작" placeholder="무엇을 감지하고, 어떻게 반응하면 좋을까요?" value={profile.coreBehavior} onChange={(e) => onChange({ ...profile, coreBehavior: e.target.value })} /></label>
      <fieldset><legend>{purpose.question}</legend>{purpose.options!.map((o) => <label className="radio-option" key={o.value}><input type="radio" name="purpose" checked={profile.purpose === o.value} onChange={() => onChange({ ...profile, purpose: o.value as MakerProfile["purpose"] })} />{o.label}</label>)}</fieldset>
      {profile.purpose === "sell" && <label>목표 판매가 (원)<input className="profile-input" type="number" min={0} step={1000} value={profile.targetPriceKRW ?? ""} onChange={(e) => onChange({ ...profile, targetPriceKRW: e.target.value === "" ? null : Number(e.target.value) })} /></label>}
      <fieldset><legend>언제까지 만들고 싶나요? <small>(선택)</small></legend><div className="choice-row">{timeline.options!.map((o) => { const on = o.value === "" ? profile.timelineWeeks == null : profile.timelineWeeks === Number(o.value); return <label key={o.value || "none"} className={on ? "on" : ""}><input type="radio" name="timeline" checked={on} onChange={() => onChange({ ...profile, timelineWeeks: o.value === "" ? null : Number(o.value) })} />{o.label}</label>; })}</div><small className="muted">실력에 비해 짧으면 목표는 유지하고, 왜 어려운지와 어떤 순서로 가야 하는지 알려드려요.</small></fieldset>
      <fieldset><legend>이 프로젝트에 투자하고 싶은 예산은요? <small>(선택)</small></legend><small className="muted">정확하지 않아도 돼요. 쓰고 싶은 만큼을 적어주세요.</small><div className="choice-row">{budget.options!.filter((o) => o.value !== "custom").map((o) => <label key={o.value} className={profile.budgetKRW === Number(o.value) ? "on" : ""}><input type="radio" name="budget" checked={profile.budgetKRW === Number(o.value)} onChange={() => onChange({ ...profile, budgetKRW: Number(o.value) })} />{o.label}</label>)}</div><label className="custom-budget">직접 입력 (원)<input className="profile-input" type="number" min={0} step={1000} value={profile.budgetKRW ?? ""} onChange={(e) => onChange({ ...profile, budgetKRW: e.target.value === "" ? null : Number(e.target.value) })} /></label></fieldset>

      <div className={`person-summary ${personMissing.length ? "missing" : ""}`}>
        <strong>내 장비와 경험 <small>(내 계정 · 모든 프로젝트가 같이 써요)</small></strong>
        <p>{gear ? `도구: ${gear}` : "도구: 아직 안 적었어요"}<br />{skill ? `경험: ${skill}` : "경험: 아직 안 적었어요"}</p>
        {personMissing.length > 0 && <p className="notice">설계를 시작하려면 {personMissing.join(", ")}이(가) 필요해요.</p>}
        <button type="button" onClick={() => onAccount(profile.toolsConfirmed ? "skill" : "gear")}>내 계정에서 {personMissing.length ? "채우기" : "고치기"}</button>
      </div>
      <button className="primary" disabled={busy} onClick={onSave}>저장 · 팀에 알려주기</button>
    </section>
  </div>;
}
