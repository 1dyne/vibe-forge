"use client";
import { useState } from "react";
import { Reveal } from "../../intro-kit";
import TerminalHelp from "../../terminal-help";

const COMMAND = "npx github:1dyne/dalgrak-helper";
const CLAUDE_INSTALL = "npm install -g @anthropic-ai/claude-code";
const CLAUDE_PROMPT = `달그락 대장간 연결 프로그램을 내 컴퓨터에서 켜 줘. 아래 순서대로 해 줘.

1. node -v 로 Node.js가 20 이상인지 확인해 줘. 없거나 낮으면 나에게 묻고 설치해 줘. (윈도우: winget install OpenJS.NodeJS.LTS / 맥: brew install node, 둘 다 안 되면 nodejs.org 에서 LTS를 받으라고 알려 줘.)
2. claude --version 이 되는지 확인해 줘. 안 되면 npm install -g @anthropic-ai/claude-code 로 설치해 줘.
3. 다음 명령을 백그라운드로 실행해 줘. 끝나지 않고 계속 켜져 있는 프로그램이니 끝나기를 기다리지 마:
   npx -y github:1dyne/dalgrak-helper
4. 그 출력에 로그인 안내가 나오면 브라우저가 열려. 내가 로그인할 테니 출력을 지켜봐 줘.
5. 출력에 "준비됐어요"가 보이면 나에게 "연결됐어요"라고 알려 주고, 프로그램은 끄지 말고 그대로 켜 둬.
6. 오류가 나면 출력의 마지막 몇 줄을 보여 주고 무엇을 하면 되는지 쉬운 말로 알려 줘.

이 밖의 파일은 만들거나 고치지 마.`;

function Copy({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return <div className="prep-copy"><code>{text}</code><button type="button" onClick={() => { void navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }); }}>{done ? "복사됨" : "복사"}</button></div>;
}

function CopyBlock({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return <div className="prep-block"><pre>{text}</pre><button type="button" onClick={() => { void navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }); }}>{done ? "복사됨" : "통째로 복사"}</button></div>;
}

// 밋업 참가자가 오기 전에 읽는 안내. 대부분 PDF로 본다. 터미널을 처음 보는 사람이 읽는다.
export default function PrepView({ contact }: { contact: string }) {
  const [terminal, setTerminal] = useState<string | null>(null);
  return <main className="intro prep">
    <section className="hero" style={{ minHeight: "auto", paddingBottom: 20 }}>
      <Reveal kind="pop"><img src="/characters/idle.png" alt="" width={100} height={100} /></Reveal>
      <Reveal delay={80}><h1>밋업 오기 전에</h1></Reveal>
      <Reveal delay={160}><p><b>가입 하나만 해 오면 돼요.</b> 그것도 어렵다면 아무것도 준비하지 않고 오셔도 괜찮아요.<br />현장에서 함께 보는 화면을 따라오면 돼요.</p></Reveal>
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
      <Reveal><span className="tag">할 일은 하나</span><h2>달그락 대장간에 가입해 와요</h2><p className="lead">2분이면 돼요. 이것만 해 오면 현장에서 내 노트북으로 같은 화면을 보며 따라올 수 있어요. 설치할 것은 없어요.</p></Reveal>
      <Reveal><div className="install"><h3>이렇게 해요</h3><ol>
        <li>노트북에서 <a href="/meetup" target="_blank" rel="noreferrer">dalgrak.app/meetup</a>을 열어요.</li>
        <li>가입 화면이 나와요. 별명을 적고 동의 칸 세 개를 누른 뒤 <b>구글로 가입하기</b>를 눌러요.</li>
        <li>구글 계정을 고르면 잠시 뒤 아래 그림 같은 화면이 나와요. 왼쪽에 <b>사만다 재고 저울</b>이 보이면 끝이에요. 밋업에서 함께 볼 프로젝트예요.</li>
        <li>다음에 다시 올 때도 <b>dalgrak.app/meetup</b>을 열면 이 화면으로 와요.</li>
      </ol><figure className="prep-shot"><img src="/find/forge-screen.png" alt="달그락 대장간 화면. 왼쪽 목록에 사만다 재고 저울 프로젝트가 있고 가운데에 대장 달그락과의 대화가 있다" /><figcaption>달그락 대장간 화면이에요. 왼쪽은 내 프로젝트(사만다 재고 저울), 가운데는 달그락과의 대화예요. 맨 아래는 글을 쓰는 칸이에요.</figcaption></figure><p className="prep-note">카카오톡에서 연 화면에서는 구글 가입이 막혀요. 크롬이나 사파리에서 주소를 직접 열어 주세요.</p></div></Reveal>

    </section>

    <section>
      <Reveal><span className="tag">선택 · Claude Code를 쓰는 분만</span><h2>내 Claude로 대장 달그락의 답까지 받고 싶다면</h2><p className="lead">평소 <b>Claude Code</b>를 쓰는 분은, 아래 글을 Claude Code에 그대로 붙여넣으면 Claude가 알아서 설치하고 연결해 줘요. Claude Code가 없거나 처음 듣는다면 이 칸은 건너뛰세요. 밋업을 따라오는 데는 지장이 없어요.</p></Reveal>
      <Reveal><div className="install">
        <ol>
          <li>Claude Code를 열어요. (Claude 데스크톱 앱의 Code 탭, 또는 터미널의 <code>claude</code>.)</li>
          <li>아래 글을 통째로 복사해 붙여넣고 보내요.</li>
        </ol>
        <CopyBlock text={CLAUDE_PROMPT} />
        <ol start={3}>
          <li>Claude가 “이 명령을 실행해도 될까요?” 하고 물으면 <b>허용</b>을 눌러요.</li>
          <li>브라우저가 열리면 달그락 대장간에 <b>가입할 때 쓴 구글 계정</b>으로 로그인하고 <b>허용</b>을 눌러요.</li>
          <li>Claude가 “연결됐어요”라고 하면 끝이에요. <a href="/meetup" target="_blank" rel="noreferrer">dalgrak.app/meetup</a>을 새로고침하면 아래쪽에 글을 쓰는 칸이 생겨요.</li>
          <li>Claude Code 창을 닫으면 연결도 꺼져요. 밋업 날에는 같은 글을 한 번 더 붙여넣으면 돼요.</li>
        </ol>
        <p className="prep-note">이 연결 프로그램은 내 컴퓨터의 파일을 읽거나 고치지 않고, 내 Claude 로그인 정보를 달그락 서버로 보내지 않아요. 코드는 공개돼 있어요(<a href="https://github.com/1dyne/dalgrak-helper/blob/main/SECURITY.md" target="_blank" rel="noreferrer noopener">보안 안내</a>). 달그락 대장간은 ChatGPT로도 쓸 수 있지만, 이번 밋업에서는 Claude를 써요.</p>
      </div></Reveal>
      <details className="prep-manual"><summary>Claude에게 맡기지 않고 직접 하나씩 하고 싶어요</summary>
      <Reveal><div className="install prep-term">
        <b>먼저, ‘터미널’이 뭐예요?</b>
        <p>컴퓨터에 원래 들어 있는 <b>글자 입력 창</b>이에요. 까만(또는 파란) 창이 뜨고, 거기에 글자를 붙여넣고 <kbd>Enter</kbd>를 누르면 컴퓨터가 그 일을 해요. 아래 2~4번에서 이 창을 써요. 할 일은 <b>복사 → 붙여넣기 → Enter</b> 뿐이에요.</p>
        <p className="keep"><b>여는 법</b></p>
        <ul>
          <li><b>윈도우</b>: 키보드의 <kbd>⊞ 윈도우 키</kbd>를 누르고 <code>cmd</code>라고 친 다음, 맨 위에 나온 <b>명령 프롬프트</b>를 눌러요. (PowerShell이 아니라 <b>명령 프롬프트</b>예요.)</li>
          <li><b>맥</b>: <kbd>⌘</kbd>+<kbd>스페이스</kbd>를 누르고 <code>터미널</code>이라고 친 다음 <kbd>Enter</kbd>를 눌러요.</li>
        </ul>
        <figure className="prep-shot"><img src="/find/cmd-open.png" alt="윈도우 검색창에 cmd를 입력하자 맨 위에 명령 프롬프트가 나온 실제 화면. 검색창과 명령 프롬프트에 빨간 상자가 쳐져 있다" /><figcaption>윈도우 실제 화면이에요. <b>위 빨간 칸</b>에 <code>cmd</code>를 치고, <b>아래 빨간 칸</b>의 명령 프롬프트를 눌러요.</figcaption></figure>
        <p className="keep"><b>글자를 넣는 법</b> (2~4번에서 계속 이렇게 해요)</p>
        <ol>
          <li>이 안내의 회색 칸에 있는 글자를 마우스로 끌어 고르고 <b>복사</b>해요. (윈도우 <kbd>Ctrl</kbd>+<kbd>C</kbd>, 맥 <kbd>⌘</kbd>+<kbd>C</kbd>. 웹 페이지에서는 옆의 “복사” 버튼을 눌러도 돼요.)</li>
          <li>까만 창 <b>안쪽을 마우스로 한 번</b> 눌러요.</li>
          <li><b>붙여넣어요.</b> 윈도우는 까만 창 안에서 <b>마우스 오른쪽 버튼</b>을 한 번 누르면 붙어요. 맥은 <kbd>⌘</kbd>+<kbd>V</kbd>.</li>
          <li>키보드의 <kbd>Enter</kbd>를 눌러요.</li>
        </ol>
        <p className="keep"><b>글자가 안 들어갈 때</b></p>
        <ul>
          <li>창 맨 위 제목에 <b>“선택”</b>이라는 글자가 보이면 잠깐 멈춘 상태예요. <kbd>Enter</kbd>를 한 번 누르면 풀려요.</li>
          <li>앞에서 시킨 일이 아직 안 끝났으면 글자가 안 들어가요. 글자가 더 올라오지 않고, 맨 아래 줄 끝에 <code>&gt;</code> 표시와 깜빡이는 막대가 보일 때까지 기다려요.</li>
          <li>그래도 안 되면 그 창을 <b>닫고 새로 열어요.</b> 창은 몇 번을 닫고 열어도 괜찮아요.</li>
        </ul>
        <p>윈도우에서 ‘관리자 권한으로 실행’은 고르지 않아도 돼요. 그냥 눌러 열면 돼요.</p>
        <p className="prep-note"><b>“스크립트를 실행할 수 없습니다”</b>나 빨간 글씨가 나오면 PowerShell을 연 거예요. 그 창을 닫고 위 방법대로 <b>명령 프롬프트</b>를 열어 다시 해요. <b>“…은(는) 내부 또는 외부 명령이 아닙니다”</b>가 나오면 창을 닫았다가 새로 열어요(설치한 뒤에는 새 창이어야 해요).</p>

      </div></Reveal>

      <Reveal><div className="install"><h3><i>2</i>Node.js를 설치해요</h3>
        <p>3번과 4번을 돌리는 데 필요한 무료 프로그램이에요.</p><ol>
        <li><a href="https://nodejs.org/ko" target="_blank" rel="noreferrer noopener">nodejs.org</a>를 열고 <b>LTS</b>라고 적힌 버튼으로 내려받아요.</li>
        <li>내려받은 파일을 열고, 묻는 것은 전부 <b>다음</b>을 눌러 설치해요.</li>
        <li>설치가 끝나면, 위 ‘여는 법’대로 까만 창(터미널)을 <b>새로 하나</b> 열어요. 설치하기 전에 열어 둔 창이 있으면 닫고 새로 열어야 해요.</li>
        <li>아래 글자를 복사해서 까만 창에 붙여넣고 <kbd>Enter</kbd>를 눌러요.<Copy text="node -v" /></li>
        <li><code>v22.11.0</code>처럼 <b>v 다음에 20보다 큰 숫자</b>가 한 줄 나오면 된 거예요. 이 창은 닫지 말고 3번에서 계속 써요.</li>
      </ol></div></Reveal>

      <Reveal><div className="install"><h3><i>3</i>Claude Code를 설치하고 로그인해요</h3>
        <p>Anthropic이 만든 프로그램이에요. <b>Claude 유료 구독</b>이 필요해요. (달그락 대장간은 ChatGPT로도 쓸 수 있지만, 이번 밋업에서는 Claude를 써요.)</p><ol>
        <li>2번에서 쓰던 <b>같은 까만 창</b>에 아래 글자를 붙여넣고 <kbd>Enter</kbd>를 눌러요.<Copy text={CLAUDE_INSTALL} /></li>
        <li>글자가 올라오다가 멈출 때까지 1~2분 기다려요. 맨 아래 줄 끝에 <code>&gt;</code>와 깜빡이는 막대가 다시 보이면 끝난 거예요.</li>
        <li>같은 창에 아래 글자를 붙여넣고 <kbd>Enter</kbd>를 눌러요.<Copy text="claude" /></li>
        <li>브라우저가 열리면 <b>내 Claude 계정</b>으로 로그인하고 <b>허용</b>을 눌러요. 고르는 칸이 나오면 <b>Claude 구독 계정</b> 쪽을 골라요.</li>
        <li>까만 창으로 돌아오면 Claude가 말을 기다리는 화면이 보여요. 로그인된 거예요. <b>이 창은 닫아요</b> (오른쪽 위 <kbd>×</kbd>).</li>
      </ol></div></Reveal>

      <Reveal><div className="install"><h3><i>4</i>연결 프로그램을 한 번 켜 봐요</h3>
        <p>달그락 화면과 내 Claude를 이어 주는 작은 프로그램이에요.</p><ol>
        <li>까만 창을 <b>새로 하나</b> 열어요. 아래 글자를 붙여넣고 <kbd>Enter</kbd>를 눌러요.<Copy text={COMMAND} /></li>
        <li><code>Ok to proceed? (y)</code>라고 나오면 <kbd>y</kbd>를 누르고 <kbd>Enter</kbd>.</li>
        <li>브라우저가 열리면 달그락 대장간에 로그인하고 <b>허용</b>을 눌러요.</li>
        <li>터미널에 <b>“준비됐어요. 모델: claude…”</b>가 나오면 성공이에요.</li>
        <li><b>여기서 까만 창이 멈춘 것처럼 보이는 게 정상이에요.</b> 이 창은 달그락과 Claude를 이어 주느라 계속 일하는 중이라, 다른 글자를 넣어도 받지 않아요. 고장이 아니에요.</li>
        <li>확인이 끝났으니 이 창을 닫아요 (오른쪽 위 <kbd>×</kbd>). 닫으면 연결이 꺼져요. 밋업 날에는 1번만 다시 하면 바로 켜지고, 그때는 창을 <b>켜 둔 채로</b> 써요.</li>
      </ol><p className="prep-note">이 프로그램은 내 컴퓨터의 파일을 읽거나 고치지 않고, 내 Claude 로그인 정보를 달그락 서버로 보내지 않아요. 코드는 공개돼 있어요(<a href="https://github.com/1dyne/dalgrak-helper/blob/main/SECURITY.md" target="_blank" rel="noreferrer noopener">보안 안내</a>). 지우려면 터미널에 <code>{COMMAND} logout</code>.</p></div></Reveal>
      </details>
    </section>

    <section className="cta" style={{ paddingBottom: 60 }}>
      <Reveal kind="pop"><h2>막히면 그대로 오세요</h2><p className="lead" style={{ margin: "0 auto" }}>안 되는 화면을 찍어 <a href={`mailto:${contact}`}>{contact}</a>으로 보내 주시거나, 현장에서 말씀해 주세요. 준비가 안 돼도 밋업은 그대로 즐길 수 있어요.</p></Reveal>
    </section>
    {terminal && <TerminalHelp command={terminal} onClose={() => setTerminal(null)} />}
  </main>;
}
