"use client";
import { useState } from "react";
import { Reveal } from "../../intro-kit";
import TerminalHelp from "../../terminal-help";

const COMMAND = "npx github:1dyne/dalgrak-helper";

function Copy({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return <div className="prep-copy"><code>{text}</code><button type="button" onClick={() => { void navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }); }}>{done ? "복사됨" : "복사"}</button></div>;
}

export default function PrepView({ contact }: { contact: string }) {
  const [terminal, setTerminal] = useState<string | null>(null);
  const [ai, setAi] = useState<"gpt" | "claude">("gpt");
  const term = (label: string, command = COMMAND) => <button type="button" className="prep-link" onClick={() => setTerminal(command)}>{label}</button>;
  return <main className="intro prep">
    <section className="hero" style={{ minHeight: "auto", paddingBottom: 24 }}>
      <Reveal kind="pop"><img src="/characters/idle.png" alt="" width={110} height={110} /></Reveal>
      <Reveal delay={80}><h1>밋업 오기 전에<br />이것만 해 와요</h1></Reveal>
      <Reveal delay={180}><p>15분이면 돼요. 현장 와이파이는 느릴 수 있어서, 내려받는 일은 집에서 미리 해 두면 좋아요. <b>3번이 안 돼도 참여할 수 있어요.</b> 막히면 그대로 오세요.</p></Reveal>
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
      <Reveal><span className="tag">1 · 꼭</span><h2>달그락 대장간에 가입해요</h2></Reveal>
      <Reveal><div className="install"><ol>
        <li>노트북에서 <a href="/find" target="_blank" rel="noreferrer">dalgrak.app/find</a>를 열어요. 만들고 싶은 것을 한 줄 적으면 내 달그락 카드가 나와요.</li>
        <li><b>이 아이디어 직접 만들어 보기</b>를 누르고, 소개 끝에서 <b>구글로 가입</b>해요.</li>
        <li>가입이 끝나 대장간 화면이 보이면 된 거예요. 창은 닫아도 돼요.</li>
      </ol><p className="prep-note">카카오톡에서 이 페이지를 열었다면, 오른쪽 위 메뉴에서 <b>다른 브라우저로 열기</b>를 먼저 눌러 주세요. 카카오톡 안에서는 구글 가입이 막혀요.</p></div></Reveal>
    </section>

    <section>
      <Reveal><span className="tag">2 · 꼭</span><h2>Node.js를 설치해요</h2><p className="lead">달그락과 내 AI를 이어 주는 작은 프로그램을 돌리는 데 필요해요. 무료이고, 한 번만 깔면 돼요.</p></Reveal>
      <Reveal><div className="install"><ol>
        <li><a href="https://nodejs.org/ko" target="_blank" rel="noreferrer noopener">nodejs.org</a>에서 <b>LTS</b>라고 적힌 것을 내려받아 설치해요. 묻는 것은 모두 기본값으로 <b>다음</b>을 눌러요.</li>
        <li>{term("터미널(윈도우는 PowerShell)", "node -v")}을 <b>새로</b> 열고 아래를 붙여넣어 Enter를 눌러요. 처음 듣는 말이라면 저 글자를 눌러 보세요. 여는 법이 그림으로 나와요.<Copy text="node -v" /></li>
        <li><code>v20</code> 이상의 숫자가 나오면 된 거예요. (예: <code>v22.11.0</code>)</li>
      </ol></div></Reveal>
    </section>

    <section>
      <Reveal><span className="tag">3 · 되면 좋아요</span><h2>연결 프로그램을 한 번 켜 봐요</h2><p className="lead">내 AI 구독으로 대장 달그락의 답을 받기 위한 준비예요. 이게 안 돼도 밋업의 조립과 흐름은 전부 따라올 수 있어요. 마지막 편지만 기본 편지로 받게 돼요.</p></Reveal>
      <Reveal><div className="install">
        <div className="os-tabs" role="tablist"><button role="tab" aria-selected={ai === "gpt"} className={ai === "gpt" ? "on" : ""} onClick={() => setAi("gpt")}>ChatGPT를 써요 (추천)</button><button role="tab" aria-selected={ai === "claude"} className={ai === "claude" ? "on" : ""} onClick={() => setAi("claude")}>Claude Code를 써요</button></div>
        {ai === "gpt" ? <ol>
          <li>{term("터미널")}에 아래를 붙여넣고 Enter를 눌러요.<Copy text={COMMAND} /></li>
          <li><code>Ok to proceed? (y)</code>라고 물으면 <kbd>y</kbd>를 치고 Enter를 눌러요.</li>
          <li>브라우저가 열리면 <b>달그락 대장간</b>에 로그인하고 <b>허용</b>을 눌러요.</li>
          <li>브라우저가 한 번 더 열리면 <b>ChatGPT</b>에 로그인하고 “ChatGPT 요금제 사용”을 <b>허용</b>해요.</li>
          <li>터미널에 <b>“준비됐어요”</b>가 보이면 끝이에요. <a href="/" target="_blank" rel="noreferrer">dalgrak.app</a>을 열어 아래에 입력창이 보이는지 확인해요.</li>
          <li>확인했으면 터미널 창을 닫아요. 밋업 날에는 1번 줄만 다시 붙여넣으면 바로 켜져요(로그인은 다시 묻지 않아요).</li>
        </ol> : <ol>
          <li>Claude Code가 이미 깔려 있고 로그인돼 있어야 해요. 없다면 {term("터미널", "npm install -g @anthropic-ai/claude-code")}에 아래를 붙여넣어 설치하고,<Copy text="npm install -g @anthropic-ai/claude-code" />이어서 <code>claude</code>를 실행해 브라우저에서 로그인해요. 입력 줄이 보이면 그 창은 닫아요.</li>
          <li>새 터미널에 아래를 붙여넣고 Enter를 눌러요. <code>Ok to proceed? (y)</code>에는 <kbd>y</kbd>.<Copy text={COMMAND} /></li>
          <li>브라우저가 열리면 <b>달그락 대장간</b>에 로그인하고 <b>허용</b>을 눌러요. ChatGPT 로그인은 묻지 않아요.</li>
          <li><b>“준비됐어요”</b>가 보이면 <a href="/" target="_blank" rel="noreferrer">dalgrak.app</a>을 열어, 입력창 아래 모델 고르기에 <b>Claude</b>가 있는지 확인해요.</li>
          <li>확인했으면 터미널 창을 닫아요. 밋업 날에는 2번 줄만 다시 붙여넣어요.</li>
        </ol>}
        <p className="prep-note">{ai === "gpt" ? "ChatGPT 유료 요금제(Plus 등)에서 되는 것을 확인했어요. 무료 계정에서 되는지는 확인하지 못했어요." : "Claude 유료 구독이 필요해요. 이 방식은 윈도우에서 아직 충분히 확인하지 못했어요. 안 되면 ChatGPT 쪽으로 해 보세요."}</p>
      </div></Reveal>
    </section>

    <section>
      <Reveal><span className="tag">알아 둘 것</span><h2>이 프로그램이 하는 일</h2></Reveal>
      <div className="needs" style={{ marginTop: 0 }}>
        <Reveal><div><b>하는 일</b>달그락 화면에서 보낸 말을 내 AI에게 전하고, 답을 화면으로 돌려보내요. AI 값은 내 구독에서 나가요.</div></Reveal>
        <Reveal delay={100}><div><b>하지 않는 일</b>내 컴퓨터의 파일을 읽거나 고치지 않아요. 내 AI 로그인 정보를 달그락 서버로 보내지 않아요.</div></Reveal>
        <Reveal><div><b>끄기와 지우기</b>터미널 창을 닫으면 꺼져요. 로그인 정보까지 지우려면 <code>{COMMAND} logout</code>.</div></Reveal>
        <Reveal delay={100}><div><b>더 자세히</b>코드는 공개돼 있어요. <a href="https://github.com/1dyne/dalgrak-helper/blob/main/SECURITY.md" target="_blank" rel="noreferrer noopener">보안 안내 읽기</a>. 내키지 않으면 3번은 건너뛰어도 돼요.</div></Reveal>
      </div>
    </section>

    <section className="cta" style={{ paddingBottom: 70 }}>
      <Reveal kind="pop"><h2>막히면 그대로 오세요</h2><p className="lead" style={{ margin: "0 auto 14px" }}>어디서 멈췄는지 화면을 찍어 <a href={`mailto:${contact}`}>{contact}</a>으로 보내 주시거나, 조금 일찍 오시면 같이 봐요.</p><a className="btn-main" href="/find">1번부터 시작하기</a></Reveal>
    </section>
    {terminal && <TerminalHelp command={terminal} onClose={() => setTerminal(null)} />}
  </main>;
}
