"use client";
import { useEffect, useState } from "react";
import { ALTERNATIVES, BLINK, BOARDS, IDE_LEVELS, INSTALL, OS_LABEL, WHAT_IS, boardGuide, type IdeLevel, type Os } from "../../../lib/ide-setup";
import { track } from "../track";

// 온보딩: 아두이노 IDE를 아는지 묻고 → 무엇인지 → 설치 → 보드 → 첫 업로드(Blink)
type Screen = "ask" | "what" | "os" | "install" | "board" | "blink" | "done";
type Saved = { level?: IdeLevel; os?: Os; board?: string; done?: boolean };

function guessOs(): Os { if (typeof navigator === "undefined") return "windows"; const u = navigator.userAgent; return /CrOS/.test(u) ? "chromebook" : /Mac/.test(u) ? "mac" : /Linux/.test(u) && !/Android/.test(u) ? "linux" : "windows"; }

export default function IdeSetup({ initialBoard, back }: { initialBoard: string | null; back: string }) {
  const [screen, setScreen] = useState<Screen>("ask");
  const [s, setS] = useState<Saved>({});
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    try { const v = JSON.parse(localStorage.getItem("dalgeurak_ide") ?? "{}") as Saved; setS({ os: guessOs(), ...v, ...(initialBoard ? { board: initialBoard } : {}) }); } catch { setS({ os: guessOs(), board: initialBoard ?? undefined }); }
    track("screen_view", { s: "ide_setup" });
  }, [initialBoard]);
  const save = (patch: Saved) => { const next = { ...s, ...patch }; setS(next); try { localStorage.setItem("dalgeurak_ide", JSON.stringify(next)); } catch { /* 저장 못 해도 진행 */ } };
  const pick = (level: IdeLevel) => { save({ level }); setScreen(level === "never" ? "what" : level === "heard" ? "os" : "board"); };
  const order: Screen[] = ["ask", "what", "os", "install", "board", "blink", "done"];
  const step = order.indexOf(screen);
  const guide = s.board ? boardGuide(s.board) : null;
  const os = s.os ?? "windows";
  const boardInfo = BOARDS.find((b) => b.id === s.board);

  return <main className="find ide">
    <header className="top"><a className="brand" href={back}>← 달그락 대장간</a><div className="step">{screen === "done" ? "준비 끝" : `보드에 코드 넣기 ${step + 1}/6`}</div></header>
    <section className="screen">
      {screen === "ask" && <>
        <h1>아두이노 IDE,<br />들어 봤어요?</h1>
        <p className="lead">만든 물건이 움직이려면 보드에 코드를 넣어야 해요. 그때 쓰는 프로그램이에요.</p>
        <div className="ide-choices">{IDE_LEVELS.map((l) => <button key={l.value} className={`ide-choice ${s.level === l.value ? "on" : ""}`} onClick={() => pick(l.value)}><b>{l.label}</b><span>{l.hint}</span></button>)}</div>
      </>}

      {screen === "what" && <>
        <h2>아두이노 IDE가 뭐냐면</h2>
        <div className="ide-cards">{WHAT_IS.map((w, i) => <article key={i} className="ide-card"><span className="n">{i + 1}</span><div><b>{w.title}</b><p>{w.text}</p></div></article>)}</div>
        <div className="ide-diagram" aria-hidden><span>💻 내 컴퓨터<br /><small>코드 쓰기</small></span><i>→ 컴파일 →</i><span>🔌 USB 선</span><i>→ 업로드 →</i><span>🟦 보드<br /><small>계속 반복</small></span></div>
        <button className="btn" onClick={() => setScreen("os")}>설치하러 가기</button>
      </>}

      {screen === "os" && <>
        <h2>어떤 컴퓨터를 써요?</h2>
        <div className="two">{(Object.keys(OS_LABEL) as Os[]).map((o) => <button key={o} className={`ide-choice ${os === o ? "on" : ""}`} onClick={() => { save({ os: o }); setScreen("install"); }}><b>{OS_LABEL[o]}</b>{o === guessOs() && <span>지금 이 컴퓨터</span>}</button>)}</div>
        <p className="tiny muted">휴대폰·태블릿에서는 보드에 코드를 넣기 어려워요. 컴퓨터에서 이어서 해요.</p>
      </>}

      {screen === "install" && <>
        <h2>{OS_LABEL[os]}에 설치하기</h2>
        <ol className="ide-steps">{INSTALL[os].map((st, i) => <li key={i}><b>{st.title}</b><p>{st.text}</p>{st.link && <a href={st.link.href} target="_blank" rel="noreferrer noopener" onClick={() => track("screen_view", { s: "ide_download" })}>{st.link.label} ↗</a>}</li>)}</ol>
        <p className="tiny muted">무료예요. 설치는 보통 5~10분 걸려요.</p>
        <button className="btn" onClick={() => setScreen("board")}>설치했어요</button>
      </>}

      {screen === "board" && <>
        <h2>어떤 보드를 쓰나요?</h2>
        <div className="two">{BOARDS.map((b) => <button key={b.id} className={`ide-choice ${s.board === b.id ? "on" : ""}`} onClick={() => { save({ board: b.id }); setScreen("blink"); }}><b>{b.label}</b></button>)}</div>
        <p className="tiny muted">아직 몰라도 괜찮아요. 프로젝트 설계가 끝나면 달그락이 정해 줘요.</p>
      </>}

      {screen === "blink" && <>
        <h2>첫 업로드: LED 깜빡이기</h2>
        {s.board === "unknown" || !guide ? <p className="lead">보드가 정해지면 이 화면에서 이어서 해요. 지금은 설치까지 끝났으면 충분해요!</p> : <>
          <ol className="ide-steps">
            {guide.managerUrl && <li><b>보드 주소 넣기</b><p>Arduino IDE → 설정(Preferences) → ‘추가 보드 관리자 URL’ 칸에 아래 주소를 붙여 넣어요.</p><code className="ide-code">{guide.managerUrl}</code></li>}
            {guide.managerUrl && <li><b>보드 패키지 설치</b><p>왼쪽 보드 관리자(📦 모양)에서 <b>{guide.package}</b>를 검색해 설치해요.</p></li>}
            {!guide.managerUrl && <li><b>보드 패키지</b><p>{guide.package}라 따로 설치할 게 없어요.</p></li>}
            <li><b>USB로 연결</b><p>보드를 컴퓨터에 꽂아요. 충전만 되는 케이블이면 안 보여요. 데이터용 케이블을 써요.</p></li>
            <li><b>보드·포트 고르기</b><p>{guide.select}<br />포트: {guide.port}</p></li>
            <li><b>코드 붙여 넣기</b><p>새 스케치를 열고 내용을 지운 뒤 아래 코드를 붙여 넣어요.</p>
              <pre className="ide-code">{BLINK}</pre>
              <button className="btn-ghost btn" onClick={() => { navigator.clipboard?.writeText(BLINK).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }).catch(() => {}); }}>{copied ? "✓ 복사했어요" : "코드 복사"}</button></li>
            <li><b>업로드</b><p>위쪽 → (오른쪽 화살표) 버튼을 눌러요. 아래에 ‘업로드 완료’가 나오면 성공이에요.</p></li>
            <li><b>확인</b><p>{boardInfo?.led}가 1초마다 깜빡이면 끝!</p></li>
          </ol>
          <details className="ide-trouble"><summary>잘 안 돼요</summary><ul>{guide.errors.map((e) => <li key={e.symptom}><b>{e.symptom}</b> — {e.fix}</li>)}</ul></details>
        </>}
        <button className="btn" onClick={() => { save({ done: true }); track("screen_view", { s: "ide_done" }); setScreen("done"); }}>{s.board === "unknown" ? "다음에 이어서 할게요" : "깜빡여요!"}</button>
      </>}

      {screen === "done" && <>
        <h1>준비 끝 🔥</h1>
        <p className="lead">이제 달그락이 만든 코드를 받으면 붙여 넣고 업로드만 하면 돼요. 막히면 HW 달그락에게 화면 사진을 보내 주세요.</p>
        <a className="btn" href={back} style={{ display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>돌아가기</a>
      </>}

      {screen !== "ask" && screen !== "done" && <button className="link" onClick={() => setScreen(order[Math.max(0, step - 1)] === "what" && s.level !== "never" ? "ask" : order[Math.max(0, step - 1)])}>← 이전</button>}

      <details className="ide-alt"><summary>아두이노 IDE 말고 다른 도구도 있어요?</summary>
        <ul>{ALTERNATIVES.map((a) => <li key={a.name}><b>{a.name}</b> <span className="pill-s">{a.level}</span><br /><span>{a.when}</span></li>)}</ul>
      </details>
    </section>
  </main>;
}
