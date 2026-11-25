"use client";
import { useMemo } from "react";
import { buildFileTree, outputFiles, type FileVersion } from "../lib/file-tree";
import type { LocalProject } from "../lib/project-types";
import { agentName } from "../lib/workflow";

// 작업대의 '파일'. 맨 위에는 지금 뽑아도 되는 것(출력용)만, 그 아래에 달그락별로
// 무엇의 몇 번째 판인지가 쌓인다. '최종'은 여기서 사람이 붙인다.

const day = (iso: string | null) => (iso ? `${iso.slice(5, 10).replace("-", "/")} ${iso.slice(11, 16)}` : "");

export default function FilesView({ project, newMarks = [], onOpen, onMark, busy = false, shortNames = false }: {
  project: LocalProject;
  /** 새로 온 파일의 id (workbench item id) */
  newMarks?: string[];
  /** 그 파일을 작업대에서 열어 본다 */
  onOpen: (itemId: string) => void;
  /** 사람이 최종으로 표시하거나 거둔다 */
  onMark: (itemId: string, action: "final" | "unfinal") => void;
  busy?: boolean;
  shortNames?: boolean;
}) {
  const tree = useMemo(() => buildFileTree(project), [project]);
  const output = useMemo(() => outputFiles(tree), [tree]);
  // 탭에 보이는 것만 '보기'가 된다. STL·전개도처럼 내려받기만 되는 파일은 보기 버튼을 두지 않는다.
  const viewable = (v: FileVersion) => !v.itemId.startsWith("housing:") && !v.itemId.startsWith("contract:");
  if (!tree.total) return <p className="ft-empty">아직 만들어진 파일이 없어요.</p>;

  const row = (v: FileVersion, key: string) => <li key={key} className={`ft-version ft-${v.state}`}>
    <div className="ft-line">
      <span className={`ft-badge ft-badge-${v.state}`}>{v.label}</span>
      <span className="ft-name" title={v.filename}>{v.filename}</span>
      {newMarks.includes(v.itemId) && <em className="ft-new" role="img" aria-label="새로 온 파일" />}
    </div>
    <div className="ft-meta">
      {v.displayName !== v.filename && <span className="ft-display" title="통일된 이름">{v.displayName}</span>}
      {(v.fromChannel || v.createdAt) && <span>{v.fromChannel ? `${agentName(v.fromChannel === "main" ? "chief" : v.fromChannel, shortNames)} 대장간` : ""}{v.fromChannel && v.createdAt ? " · " : ""}{day(v.createdAt)}</span>}
      {v.changedSinceFinal && <span className="ft-warn">최종으로 표시한 뒤에 바뀌었어요. 다시 확인해 주세요.</span>}
    </div>
    <div className="ft-actions">
      {viewable(v) && <button type="button" onClick={() => onOpen(v.itemId)}>보기</button>}
      <a href={v.url} download={v.filename}>내려받기</a>
      {v.state === "final"
        ? <button type="button" className="ft-quiet" disabled={busy} onClick={() => onMark(v.itemId, "unfinal")}>최종 표시 거두기</button>
        : v.state !== "superseded" && <button type="button" className="ft-final" disabled={busy} onClick={() => onMark(v.itemId, "final")}>최종으로 표시</button>}
    </div>
  </li>;

  return <div className="ft-view">
    <section className="ft-output" aria-label="출력용">
      <h3>출력용 <small>{output.length}</small></h3>
      {output.length
        ? <ul className="ft-list">{output.map((v) => <li key={v.itemId} className="ft-out"><span className="ft-name" title={v.filename}>{v.filename}</span><span className="ft-out-actions">{viewable(v) && <button type="button" onClick={() => onOpen(v.itemId)}>보기</button>}<a href={v.url} download={v.filename}>내려받기</a></span></li>)}</ul>
        : <p className="ft-hint">출력해도 되는 파일을 확인한 뒤 ‘최종으로 표시’를 누르면 여기에 모여요.</p>}
    </section>
    {tree.groups.map((group) => <section key={group.agent} className="ft-group">
      <h3><span className={"agent-dot dot-" + group.agent} />{agentName(group.agent, shortNames)}</h3>
      {group.subjects.map((subject) => <details key={subject.key} className="ft-subject" open={subject.versions.length <= 3 || subject.versions.some((v) => newMarks.includes(v.itemId))}>
        <summary><b>{subject.name}</b><small>{subject.current ? subject.current.label : subject.versions[0].label}{subject.versions.length > 1 ? ` · ${subject.versions.length}개 판` : ""}</small></summary>
        <ul className="ft-list">{subject.versions.map((v) => row(v, v.itemId))}</ul>
      </details>)}
    </section>)}
  </div>;
}
