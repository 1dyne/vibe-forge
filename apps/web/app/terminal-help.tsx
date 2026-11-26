"use client";
import { useEffect, useState } from "react";

// "터미널이 뭐예요?" — 터미널을 한 번도 열어 본 적 없는 사람이 따라 할 수 있게,
// 어디서 무엇을 검색해 무엇을 열고 무엇을 하면 되는지를 그림과 함께 보여준다.
// 그림은 실제 화면을 찍은 것이 아니라 생김새를 알려주는 그림이다(컴퓨터마다 조금씩 다르다).

type Os = "windows" | "mac";
const detect = (): Os => (typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent) ? "mac" : "windows");

function CopyLine({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return <div className="copy-row"><code>{text}</code><button type="button" className="copy-button" onClick={() => { void navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}>{copied ? "복사됨" : "복사"}</button></div>;
}

/** 검색해서 여는 모습 (그림) */
function SearchPicture({ os }: { os: Os }) {
  const word = os === "windows" ? "powershell" : "터미널";
  const app = os === "windows" ? "Windows PowerShell" : "터미널";
  return <svg viewBox="0 0 360 150" role="img" aria-label={`${os === "windows" ? "시작 메뉴" : "Spotlight"}에서 ${word}을 검색한 모습 (그림)`} className="th-picture">
    <rect x="1" y="1" width="358" height="148" rx="12" fill="#f4f1ea" stroke="#232323" strokeWidth="2" />
    <rect x="18" y="16" width="324" height="30" rx="15" fill="#fff" stroke="#232323" strokeWidth="1.6" />
    <circle cx="36" cy="31" r="6" fill="none" stroke="#232323" strokeWidth="1.6" /><path d="M40.5 35.5l5 5" stroke="#232323" strokeWidth="1.6" strokeLinecap="round" />
    <text x="54" y="36" fontSize="14" fill="#232323">{word}</text>
    <rect x="18" y="58" width="324" height="40" rx="9" fill="#EDB69A" stroke="#232323" strokeWidth="1.6" />
    <rect x="28" y="66" width="24" height="24" rx="5" fill="#1f3a5f" /><text x="33" y="83" fontSize="12" fill="#fff" fontFamily="monospace">{">_"}</text>
    <text x="62" y="76" fontSize="13" fontWeight="700" fill="#232323">{app}</text><text x="62" y="91" fontSize="11" fill="#5a2e17">앱 · 이것을 눌러요</text>
    <rect x="18" y="106" width="324" height="30" rx="9" fill="#fff" stroke="#c9c2b4" strokeWidth="1.2" /><text x="62" y="126" fontSize="12" fill="#8a8478">{os === "windows" ? "Windows PowerShell ISE (이건 아니에요)" : "다른 검색 결과"}</text>
  </svg>;
}

/** 열린 창에 붙여넣는 모습 (그림) */
function WindowPicture({ os, command }: { os: Os; command: string }) {
  const prompt = os === "windows" ? "PS C:\\Users\\나>" : "나@내컴퓨터 ~ %";
  return <svg viewBox="0 0 360 130" role="img" aria-label="터미널 창에 명령을 붙여넣은 모습 (그림)" className="th-picture">
    <rect x="1" y="1" width="358" height="128" rx="12" fill={os === "windows" ? "#12284a" : "#1f1f1f"} stroke="#232323" strokeWidth="2" />
    <rect x="1" y="1" width="358" height="24" rx="12" fill="#3a3a3a" /><rect x="1" y="14" width="358" height="11" fill="#3a3a3a" />
    <circle cx="16" cy="13" r="4" fill="#ed6a5e" /><circle cx="30" cy="13" r="4" fill="#f4bf4f" /><circle cx="44" cy="13" r="4" fill="#61c554" />
    <text x="14" y="50" fontSize="12" fill="#cfd6e4" fontFamily="monospace">{prompt}</text>
    <text x="14" y="72" fontSize="12" fill="#fff" fontFamily="monospace">{command.length > 44 ? command.slice(0, 44) + "…" : command}<tspan fill="#EDB69A"> ▌</tspan></text>
    <text x="14" y="104" fontSize="11" fill="#9DD2C8">여기에 붙여넣고 Enter</text>
  </svg>;
}

export default function TerminalHelp({ command, onClose }: { command: string; onClose: () => void }) {
  const [os, setOs] = useState<Os>("windows");
  useEffect(() => { setOs(detect()); const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", esc); return () => window.removeEventListener("keydown", esc); }, [onClose]);
  const win = os === "windows";
  return <div className="modal-backdrop" onClick={onClose}>
    <section className="profile-modal terminal-help" role="dialog" aria-modal="true" aria-label="터미널 여는 법" onClick={(e) => e.stopPropagation()}>
      <header><h2>터미널이 뭐예요?</h2><button aria-label="닫기" onClick={onClose}>×</button></header>
      <p>컴퓨터에게 글자로 일을 시키는 창이에요. 검은(또는 파란) 창에 글자만 보여서 낯설지만, 여기서는 <b>한 줄을 붙여넣고 Enter</b>만 누르면 돼요. 컴퓨터에 원래 들어 있어서 따로 설치하지 않아요.</p>
      <div className="th-tabs" role="tablist"><button role="tab" aria-selected={win} className={win ? "on" : ""} onClick={() => setOs("windows")}>윈도우</button><button role="tab" aria-selected={!win} className={!win ? "on" : ""} onClick={() => setOs("mac")}>맥</button></div>
      <ol className="th-steps">
        <li><b>검색창 열기</b>{win ? <> 키보드의 <kbd>⊞ Win</kbd> 키를 누르거나, 화면 아래 작업 표시줄의 돋보기(검색)를 눌러요.</> : <> 키보드에서 <kbd>⌘ Command</kbd> + <kbd>Space</kbd>를 함께 눌러요. 화면 가운데에 검색창(Spotlight)이 떠요.</>}</li>
        <li><b>{win ? "powershell" : "터미널"}</b>이라고 쳐요.{win ? " 한글 상태라면 한/영 키를 눌러 영어로 바꿔요." : " 영어로 terminal이라고 쳐도 돼요."}<SearchPicture os={os} /></li>
        <li>맨 위에 나온 <b>{win ? "Windows PowerShell" : "터미널"}</b>을 눌러 열어요.{win && " ‘관리자 권한으로 실행’은 고르지 않아요. 그냥 열면 돼요."}</li>
        <li>아래 줄을 <b>복사</b>해서, 열린 창을 한 번 누른 뒤 붙여넣고(<kbd>{win ? "Ctrl" : "⌘"}</kbd> + <kbd>V</kbd>, {win ? "또는 마우스 오른쪽 버튼" : ""}) <kbd>Enter</kbd>를 눌러요.<CopyLine text={command} /><WindowPicture os={os} command={command} /></li>
        <li>로그인하라는 안내가 나오면 <b>브라우저가 저절로 열려요.</b> 거기서 로그인하고 돌아오면 끝이에요.</li>
      </ol>
      <h3>주의할 것</h3>
      <ul className="th-cautions">
        <li><b>창을 닫으면 꺼져요.</b> 달그락과 대화하는 동안에는 이 창을 그대로 두세요. 작게 줄여 두는 건 괜찮아요.</li>
        <li><b>비밀번호는 이 창에 치지 않아요.</b> 로그인은 항상 브라우저에서 해요. 터미널이 비밀번호를 치라고 하면 멈추고 물어보세요.</li>
        <li><b>모르는 곳에서 받은 명령은 붙여넣지 마세요.</b> 터미널은 시키는 대로 다 해요. 달그락 화면에 적힌 줄만 쓰세요.</li>
        <li>글자가 줄줄 올라가거나 영어가 나와도 고장이 아니에요. <b>“준비됐어요”</b>가 보이면 된 거예요.</li>
        <li>‘명령을 찾을 수 없다’고 나오면 Node.js가 아직 없는 거예요. <a href="https://nodejs.org/ko" target="_blank" rel="noreferrer noopener">nodejs.org</a>에서 LTS를 설치하고, 터미널을 <b>닫았다가 다시 열어</b> 한 번 더 해보세요.</li>
      </ul>
      <p className="muted"><small>그림은 생김새를 알려주는 그림이에요. 컴퓨터마다 색과 글자가 조금 달라요.</small></p>
    </section>
  </div>;
}
