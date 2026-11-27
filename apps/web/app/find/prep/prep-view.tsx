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

// 밋업 참가자가 오기 전에 읽는 안내. 대부분 PDF로 본다. 터미널을 처음 보는 사람이 읽는다.
export default function PrepView({ contact }: { contact: string }) {
  const [terminal, setTerminal] = useState<string | null>(null);
  return <main className="intro prep">
    <section className="hero" style={{ minHeight: "auto", paddingBottom: 20 }}>
      <Reveal kind="pop"><img src="/characters/idle.png" alt="" width={100} height={100} /></Reveal>
      <Reveal delay={80}><h1>밋업 오기 전에</h1></Reveal>
      <Reveal delay={160}><p><b>직접 해 보고 싶은 분만 하시면 돼요.</b> 아무것도 준비하지 않고 오셔도 괜찮아요. 현장에서 함께 보는 화면을 따라오면 돼요.</p></Reveal>
      <Reveal delay={240}><p className="prep-pdf"><a href="/find/prep.pdf" download="달그락-밋업-준비.pdf">PDF로 받기 ↓</a></p></Reveal>
    </section>

    <section>
      <Reveal><span className="tag">먼저 읽어 주세요</span><h2>달그락 대장간에 대해</h2></Reveal>
      <div className="prep-facts">
        <Reveal><div><b>가입은 필수가 아니에요</b>달그락 대장간에 가입하지 않아도 하드웨어를 만들 수 있고, 밋업에도 참여할 수 있어요. 현장에서 같은 화면을 보며 빠르게 진행하려고 쓰는 도구예요.</div></Reveal>
        <Reveal><div><b>돈을 받지 않아요</b>가입도 사용도 무료예요. 결제 기능이 없고, 가입했다고 나중에 비용이 생기지도 않아요. 이 밋업에서 무엇을 판매하지 않아요.</div></Reveal>
        <Reveal><div><b>어떻게 생긴 도구인가요</b>화면은 웹사이트(dalgrak.app)예요. AI는 달그락이 따로 갖고 있지 않고, <b>내 컴퓨터의 Claude</b>가 내 구독으로 답해요. 그래서 직접 해 보려면 Claude 유료 구독이 있어야 해요.</div></Reveal>
        <Reveal><div><b>무엇을 받고, 어떻게 지키나요</b>
          <ul>
            <li>가입할 때 받는 것: 구글 계정의 이메일 주소와 이름(별명으로 바꿀 수 있어요).</li>
            <li>받지 않는 것: 전화번호, 결제 정보, 내 Claude 계정의 로그인 정보.</li>
            <li>실습하며 적은 내용은 암호화해서 저장해요. 운영자 화면에는 다른 사람의 기록을 여는 기능이 없어요.</li>
            <li>AI와 나눈 대화는 내 Claude 계정으로 Anthropic에 가요. 평소 Claude를 쓸 때와 같아요.</li>
          </ul>
        </div></Reveal>
        <Reveal><div><b>지우고 싶을 때</b>직접 지울 수 있어요: 달그락 대장간 → 내 계정 → “탈퇴하고 모두 삭제”. 누르는 즉시 계정과 실습 기록이 지워져요. 불편한 점이 있거나 대신 지워 주기를 원하시면 <a href={`mailto:${contact}`}>{contact}</a>으로, 또는 밋업이 끝난 뒤 현장에서 말씀해 주세요. 실습 데이터 삭제와 처리를 도와드릴게요.</div></Reveal>
      </div>
    </section>

    <section>
      <Reveal><span className="tag">가져올 것</span><h2>가방에 넣을 것</h2></Reveal>
      <div className="prep-facts">
        <Reveal><div><b>노트북</b>윈도우나 맥이면 돼요.</div></Reveal>
        <Reveal><div><b>노트북 충전기, 또는 노트북을 충전할 수 있는 보조배터리</b>
          <p>우리가 만드는 스마트 재고 측정기 ‘셈’은 전기를 아주 조금만 쓰는 기기예요.</p>
          <p>일반 보조배터리는 전기를 조금만 쓰면 “다 썼나 보다” 하고 전원을 스스로 끊어 버려요. 그래서 일반 보조배터리에 꽂으면 연결이 안 될 때가 있어요.</p>
          <p>현장에서는 <b>노트북의 USB-C 구멍</b>에 꽂아서 써요. 그래서 노트북이 꺼지지 않게 충전기를 챙기거나, 노트북을 충전할 수 있는 보조배터리를 가져오면 돼요.</p>
        </div></Reveal>
        <Reveal><div><b>휴대폰</b>완성된 저울을 휴대폰과 이어 보는 순서가 있어요.</div></Reveal>
        <Reveal><div><b>가져오지 않아도 되는 것</b>납땜 도구와 부품. 납땜과 펌웨어(보드 안에서 도는 프로그램) 올리기는 미리 해서 가져가요. 현장에서는 그런 단계가 있다는 것을 함께 보기만 해요.</div></Reveal>
      </div>
    </section>

    <section>
      <Reveal><span className="tag">직접 해 볼 분</span><h2>미리 해 올 네 가지</h2><p className="lead">15분쯤 걸려요. 순서대로 따라 하면 돼요. 중간에 막히면 거기까지만 하고 오세요.</p></Reveal>

      <Reveal><div className="install prep-term">
        <b>먼저, ‘터미널’이 뭐예요?</b>
        <p>컴퓨터에 원래 들어 있는 <b>글자 입력 창</b>이에요. 까만(또는 파란) 창이 뜨고, 거기에 글자를 붙여넣고 <kbd>Enter</kbd>를 누르면 컴퓨터가 그 일을 해요. 아래 2~4번에서 이 창을 써요. 할 일은 <b>복사 → 붙여넣기 → Enter</b> 뿐이에요.</p>
        <p><b>여는 법</b></p>
        <ul>
          <li><b>윈도우</b>: 키보드의 <kbd>⊞ 윈도우 키</kbd>를 누르고 <code>cmd</code>라고 친 다음, 맨 위에 나온 <b>명령 프롬프트</b>를 눌러요. (PowerShell이 아니라 <b>명령 프롬프트</b>예요.)</li>
          <li><b>맥</b>: <kbd>⌘</kbd>+<kbd>스페이스</kbd>를 누르고 <code>터미널</code>이라고 친 다음 <kbd>Enter</kbd>를 눌러요.</li>
        </ul>
        <p><b>붙여넣는 법</b>: 윈도우는 창 안에서 <b>마우스 오른쪽 버튼</b>을 한 번, 맥은 <kbd>⌘</kbd>+<kbd>V</kbd>.</p>
        <p className="prep-note"><b>“스크립트를 실행할 수 없습니다”</b>나 빨간 글씨가 나오면 PowerShell을 연 거예요. 그 창을 닫고 위 방법대로 <b>명령 프롬프트</b>를 열어 다시 해요. <b>“…은(는) 내부 또는 외부 명령이 아닙니다”</b>가 나오면 창을 닫았다가 새로 열어요(설치한 뒤에는 새 창이어야 해요).</p>
        <figure className="prep-shot"><img src="/find/cmd-open.png" alt="윈도우 검색창에 cmd를 입력하자 맨 위에 명령 프롬프트가 나온 실제 화면. 검색창과 명령 프롬프트에 빨간 상자가 쳐져 있다" /><figcaption>윈도우 실제 화면이에요. <b>위 빨간 칸</b>에 <code>cmd</code>를 치고, <b>아래 빨간 칸</b>의 명령 프롬프트를 눌러요.</figcaption></figure>
      </div></Reveal>

      <Reveal><div className="install"><h3><i>1</i>달그락 대장간에 가입해요</h3><ol>
        <li>노트북에서 <a href="/join" target="_blank" rel="noreferrer">dalgrak.app/join</a>을 열어요.</li>
        <li>별명을 적고 동의 칸을 누른 뒤 <b>구글로 가입하기</b>를 눌러요.</li>
        <li>대장간 화면이 보이면 끝이에요.</li>
      </ol><p className="prep-note">카카오톡에서 연 화면에서는 구글 가입이 막혀요. 크롬이나 사파리에서 주소를 직접 열어 주세요.</p></div></Reveal>

      <Reveal><div className="install"><h3><i>2</i>Node.js를 설치해요</h3>
        <p>3번과 4번을 돌리는 데 필요한 무료 프로그램이에요.</p><ol>
        <li><a href="https://nodejs.org/ko" target="_blank" rel="noreferrer noopener">nodejs.org</a>를 열고 <b>LTS</b>라고 적힌 버튼으로 내려받아요.</li>
        <li>내려받은 파일을 열고, 묻는 것은 전부 <b>다음</b>을 눌러 설치해요.</li>
        <li><b>확인</b>: 터미널을 열고, 아래 글자를 복사해 붙여넣고 <kbd>Enter</kbd>.<Copy text="node -v" /><code>v22.11.0</code>처럼 <b>v20보다 큰 숫자</b>가 나오면 된 거예요.</li>
      </ol></div></Reveal>

      <Reveal><div className="install"><h3><i>3</i>Claude Code를 설치하고 로그인해요</h3>
        <p>Anthropic이 만든 프로그램이에요. <b>Claude 유료 구독</b>이 필요해요. (달그락 대장간은 ChatGPT로도 쓸 수 있지만, 이번 밋업에서는 Claude를 써요.)</p><ol>
        <li>터미널에 아래 글자를 붙여넣고 <kbd>Enter</kbd>. 1~2분 기다려요.<Copy text={CLAUDE_INSTALL} /></li>
        <li>글자가 멈추면, 아래 글자를 붙여넣고 <kbd>Enter</kbd>.<Copy text="claude" /></li>
        <li>브라우저가 열리면 <b>내 Claude 계정</b>으로 로그인하고 <b>허용</b>을 눌러요. 고르는 칸이 나오면 <b>Claude 구독 계정</b> 쪽을 골라요.</li>
        <li>터미널에 글을 쓸 수 있는 칸이 보이면 로그인된 거예요. 창을 닫아요.</li>
      </ol></div></Reveal>

      <Reveal><div className="install"><h3><i>4</i>연결 프로그램을 한 번 켜 봐요</h3>
        <p>달그락 화면과 내 Claude를 이어 주는 작은 프로그램이에요.</p><ol>
        <li>터미널을 <b>새로</b> 열고, 아래 글자를 붙여넣고 <kbd>Enter</kbd>.<Copy text={COMMAND} /></li>
        <li><code>Ok to proceed? (y)</code>라고 나오면 <kbd>y</kbd>를 누르고 <kbd>Enter</kbd>.</li>
        <li>브라우저가 열리면 달그락 대장간에 로그인하고 <b>허용</b>을 눌러요.</li>
        <li>터미널에 <b>“준비됐어요. 모델: claude…”</b>가 나오면 성공이에요.</li>
        <li>창을 닫아요. 밋업 날에는 1번만 다시 하면 바로 켜져요.</li>
      </ol><p className="prep-note">이 프로그램은 내 컴퓨터의 파일을 읽거나 고치지 않고, 내 Claude 로그인 정보를 달그락 서버로 보내지 않아요. 코드는 공개돼 있어요(<a href="https://github.com/1dyne/dalgrak-helper/blob/main/SECURITY.md" target="_blank" rel="noreferrer noopener">보안 안내</a>). 지우려면 터미널에 <code>{COMMAND} logout</code>.</p></div></Reveal>
    </section>

    <section className="cta" style={{ paddingBottom: 60 }}>
      <Reveal kind="pop"><h2>막히면 그대로 오세요</h2><p className="lead" style={{ margin: "0 auto" }}>안 되는 화면을 찍어 <a href={`mailto:${contact}`}>{contact}</a>으로 보내 주시거나, 현장에서 말씀해 주세요. 준비가 안 돼도 밋업은 그대로 즐길 수 있어요.</p></Reveal>
    </section>
    {terminal && <TerminalHelp command={terminal} onClose={() => setTerminal(null)} />}
  </main>;
}
