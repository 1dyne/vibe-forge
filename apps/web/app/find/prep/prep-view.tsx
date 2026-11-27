"use client";
import { useState } from "react";
import { Reveal } from "../../intro-kit";
import TerminalHelp from "../../terminal-help";

const COMMAND = "npx github:1dyne/dalgrak-helper";
const CLAUDE_INSTALL = "npm install -g @anthropic-ai/claude-code";

function Copy({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return <div className="prep-copy"><code>{text}</code><button type="button" onClick={() => { void navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }); }}>{done ? "복사됨" : "복사"}</button></div>;
}

export default function PrepView({ contact }: { contact: string }) {
  const [terminal, setTerminal] = useState<string | null>(null);
  const term = (label: string, command = COMMAND) => <button type="button" className="prep-link" onClick={() => setTerminal(command)}>{label}</button>;
  return <main className="intro prep">
    <section className="hero" style={{ minHeight: "auto", paddingBottom: 24 }}>
      <Reveal kind="pop"><img src="/characters/idle.png" alt="" width={110} height={110} /></Reveal>
      <Reveal delay={80}><h1>밋업 오기 전에<br />이것만 해 와요</h1></Reveal>
      <Reveal delay={180}><p><b>직접 해 보고 싶은 분께 추천해요.</b> 15분이면 돼요. Claude 무료 계정을 쓰고 있거나 설치가 내키지 않으면 아무것도 깔지 않고 오셔도 돼요. 현장에서 함께 보는 화면을 따라오면 돼요.</p></Reveal>
    </section>

    <section style={{ paddingTop: 24 }}>
      <Reveal><span className="tag">가져올 것</span><h2>가방에 넣을 것</h2></Reveal>
      <div className="town-grid">
        <Reveal as="article"><b>노트북</b>윈도우나 맥. 크롬·엣지·사파리 같은 브라우저가 있으면 돼요.</Reveal>
        <Reveal as="article" delay={100}><b>충전기 또는 보조배터리</b>노트북 C타입 충전기, 또는 노트북을 충전할 수 있는 보조배터리(PD 지원). 콘센트 자리가 넉넉하지 않을 수 있어요.</Reveal>
        <Reveal as="article"><b>휴대폰</b>만든 저울을 휴대폰 앱과 이어 볼 거예요. 블루투스가 되면 돼요.</Reveal>
        <Reveal as="article" delay={100}><b>구글 계정</b>달그락 대장간 가입에 써요.</Reveal>
      </div>
    </section>

    <section>
      <Reveal><span className="tag">1</span><h2>달그락 대장간에 가입해요</h2></Reveal>
      <Reveal><div className="install"><ol>
        <li>노트북에서 <a href="/find" target="_blank" rel="noreferrer">dalgrak.app/find</a>를 열어요. 만들고 싶은 것을 한 줄 적으면 내 달그락 카드가 나와요.</li>
        <li><b>이 아이디어 직접 만들어 보기</b>를 누르고, 소개 끝에서 <b>구글로 가입</b>해요.</li>
        <li>가입이 끝나 대장간 화면이 보이면 된 거예요. 창은 닫아도 돼요.</li>
      </ol><p className="prep-note">카카오톡에서 이 페이지를 열었다면, 오른쪽 위 메뉴에서 <b>다른 브라우저로 열기</b>를 먼저 눌러 주세요. 카카오톡 안에서는 구글 가입이 막혀요.</p></div></Reveal>
    </section>

    <section>
      <Reveal><span className="tag">2</span><h2>Node.js를 설치해요</h2><p className="lead">Claude Code와 연결 프로그램을 돌리는 데 필요해요. 무료이고, 한 번만 깔면 돼요.</p></Reveal>
      <Reveal><div className="install"><ol>
        <li><a href="https://nodejs.org/ko" target="_blank" rel="noreferrer noopener">nodejs.org</a>에서 <b>LTS</b>라고 적힌 것을 내려받아 설치해요. 묻는 것은 모두 기본값으로 <b>다음</b>을 눌러요.</li>
        <li>{term("터미널(윈도우는 PowerShell)", "node -v")}을 <b>새로</b> 열고 아래를 붙여넣어 Enter를 눌러요. 처음 듣는 말이라면 저 글자를 눌러 보세요. 여는 법이 그림으로 나와요.<Copy text="node -v" /></li>
        <li><code>v20</code> 이상의 숫자가 나오면 된 거예요. (예: <code>v22.11.0</code>)</li>
      </ol></div></Reveal>
    </section>

    <section>
      <Reveal><span className="tag">3</span><h2>Claude Code를 설치하고 로그인해요</h2><p className="lead">Claude Code는 Anthropic이 만든 프로그램이에요. 달그락 대장간은 내 컴퓨터의 Claude Code에게 일을 부탁해요. <b>Claude 유료 구독(Pro 이상)</b>이 필요해요.</p></Reveal>
      <Reveal><div className="install"><ol>
        <li>{term("터미널", CLAUDE_INSTALL)}에 아래를 붙여넣고 Enter를 눌러요. 1~2분 걸려요.<Copy text={CLAUDE_INSTALL} /></li>
        <li>끝나면 아래를 치고 Enter를 눌러요.<Copy text="claude" /></li>
        <li>처음이면 로그인하라고 물어요. 브라우저가 열리면 <b>내 Claude 계정</b>으로 로그인하고 허용해요. (API 키가 아니라 <b>Claude 구독 계정</b>을 골라요.)</li>
        <li>터미널에 글을 입력하는 줄이 보이면 로그인된 거예요. <code>/exit</code>를 치거나 창을 닫아요.</li>
      </ol></div></Reveal>
    </section>

    <section>
      <Reveal><span className="tag">4</span><h2>연결 프로그램을 한 번 켜 봐요</h2><p className="lead">달그락 화면과 내 Claude Code를 이어 주는 작은 프로그램이에요. 집에서 한 번 켜 보면 밋업 날에는 한 줄이면 돼요.</p></Reveal>
      <Reveal><div className="install"><ol>
        <li>새 {term("터미널")}에 아래를 붙여넣고 Enter를 눌러요.<Copy text={COMMAND} /></li>
        <li><code>Ok to proceed? (y)</code>라고 물으면 <kbd>y</kbd>를 치고 Enter를 눌러요.</li>
        <li>브라우저가 열리면 <b>달그락 대장간</b>에 로그인하고 <b>허용</b>을 눌러요.</li>
        <li>터미널에 <b>“준비됐어요”</b>가 보이면 끝이에요. <a href="/" target="_blank" rel="noreferrer">dalgrak.app</a>을 열어, 아래 입력창의 모델 고르기에 <b>Claude</b>가 있는지 확인해요.</li>
        <li>확인했으면 터미널 창을 닫아요. 밋업 날에는 1번 줄만 다시 붙여넣으면 바로 켜져요.</li>
      </ol>
      <details className="prep-alt"><summary>Claude 구독은 없고 ChatGPT 유료 요금제만 있어요</summary><p>3번을 건너뛰고 4번만 해요. 달그락 로그인 다음에 브라우저가 한 번 더 열리면 <b>ChatGPT</b>에 로그인하고 “ChatGPT 요금제 사용”을 허용해요. 이때는 연결 프로그램이 ChatGPT 로그인 증표를 내 컴퓨터에 잠가서 보관해요.</p></details>
      </div></Reveal>
    </section>

    <section>
      <Reveal><span className="tag">알아 둘 것</span><h2>이 프로그램이 하는 일</h2></Reveal>
      <div className="needs" style={{ marginTop: 0 }}>
        <Reveal><div><b>하는 일</b>달그락 화면에서 보낸 말을 내 AI에게 전하고, 답을 화면으로 돌려보내요. AI 값은 내 구독에서 나가요.</div></Reveal>
        <Reveal delay={100}><div><b>하지 않는 일</b>내 Claude 로그인에 손대지 않아요(로그인은 Claude Code가 직접 해요). 내 컴퓨터의 파일을 읽거나 고치지 않아요. 달그락 서버는 내 AI 계정 정보를 받지 않아요.</div></Reveal>
        <Reveal><div><b>끄기와 지우기</b>터미널 창을 닫으면 꺼져요. 로그인 정보까지 지우려면 <code>{COMMAND} logout</code>.</div></Reveal>
        <Reveal delay={100}><div><b>더 자세히</b>코드는 공개돼 있어요. <a href="https://github.com/1dyne/dalgrak-helper/blob/main/SECURITY.md" target="_blank" rel="noreferrer noopener">보안 안내 읽기</a>. 내키지 않으면 깔지 않고 오셔도 돼요.</div></Reveal>
      </div>
    </section>

    <section className="cta" style={{ paddingBottom: 70 }}>
      <Reveal kind="pop"><h2>막히면 그대로 오세요</h2><p className="lead" style={{ margin: "0 auto 14px" }}>어디서 멈췄는지 화면을 찍어 <a href={`mailto:${contact}`}>{contact}</a>으로 보내 주시거나, 조금 일찍 오시면 같이 봐요.</p><a className="btn-main" href="/find">1번부터 시작하기</a></Reveal>
    </section>
    {terminal && <TerminalHelp command={terminal} onClose={() => setTerminal(null)} />}
  </main>;
}
