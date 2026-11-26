"use client";
import type { ReactNode } from "react";

// ── MEETUP: 2026-11-28 밋업 시연 전용 (lib/meetup.ts 참고). 밋업이 끝나면 지운다 ──
// 시연용 프로젝트의 방마다 맨 위에 붙는 안내 카드와, 로그인 없이 여는 '셈 사용설명서'(/find/sam)의 내용.
//  · 대장 방: 오늘의 순서
//  · 전자회로 달그락 방: 펌웨어 올리기 (원래 회로와 펌웨어를 맡는 달그락)
//  · 소프트웨어 달그락 방: 재고 측정기 '셈' 소개와 사용설명서
// 값의 출처: 1dyne/sam-stock-audit-mate 의 README.md, firmware/README.md, SAM_SPEC.md §2~3.

export const SAM_APP_URL = "https://1dyne.github.io/sam-stock-audit-mate/";
export const SAM_REPO_URL = "https://github.com/1dyne/sam-stock-audit-mate";
const FW_URL = `${SAM_REPO_URL}/tree/main/firmware/sam_scale`;

const CSS = `
.msam{border:2px solid var(--ink,#232323);border-radius:18px;background:#fffdf6;box-shadow:4px 4px 0 var(--ink,#232323);padding:18px 20px;margin:4px 0 18px;color:#232323;font-size:15.5px;line-height:1.62}
.msam h3{margin:0 0 4px;font-size:1.4em;line-height:1.25}
.msam h4{margin:18px 0 6px;font-size:1.08em}
.msam p{margin:0 0 8px}
.msam .kick{display:inline-block;border:1.5px solid #232323;border-radius:999px;background:#94d2c9;padding:1px 10px;font-weight:800;font-size:.78em;margin-bottom:8px}
.msam ol,.msam ul{margin:0 0 8px;padding-left:1.3em}
.msam li{margin:2px 0}
.msam code{background:#f1ead9;border-radius:5px;padding:1px 5px;font-size:.92em}
.msam table{border-collapse:collapse;width:100%;margin:6px 0 10px;font-size:.95em}
.msam th,.msam td{border:1.5px solid #232323;padding:5px 8px;text-align:left;vertical-align:top}
.msam th{background:#f1ead9;white-space:nowrap}
.msam .cast{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px;margin:10px 0}
.msam .who{display:flex;gap:12px;align-items:center;border:1.5px solid #232323;border-radius:14px;background:#fff;padding:10px 12px}
.msam .who img{width:76px;height:76px;object-fit:contain;flex:none}
.msam .who b{display:block;font-size:1.08em}
.msam .btns{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0 2px}
.msam .btns a,.msam .btns button{border:2px solid #232323;border-radius:999px;background:#fff;color:#232323;font-weight:800;padding:6px 14px;text-decoration:none;box-shadow:2px 2px 0 #232323;cursor:pointer;font-size:.95em}
.msam .btns a.main{background:#ff8a5c}
.msam .two{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:12px}
.msam .box{border:1.5px solid #232323;border-radius:14px;background:#fff;padding:10px 14px}
.msam .box h4{margin-top:0}
.msam .steps{list-style:none;padding:0;margin:8px 0 0;display:grid;gap:7px}
.msam .steps li{display:grid;grid-template-columns:2em 1fr auto;gap:8px;align-items:center;border:1.5px solid #232323;border-radius:12px;background:#fff;padding:7px 10px}
.msam .steps i{font-style:normal;font-weight:800;background:#232323;color:#fff;border-radius:50%;width:1.7em;height:1.7em;display:grid;place-items:center;font-size:.85em}
.msam .steps small{display:block;color:#5d574c}
.msam .steps button{border:1.5px solid #232323;border-radius:999px;background:#ffe9a8;font-weight:700;padding:2px 10px;cursor:pointer;white-space:nowrap}
.msam .note{color:#6f6a61;font-size:.88em}
`;
const Card = ({ kick, title, children }: { kick: string; title: string; children: ReactNode }) => (
  <section className="msam"><style>{CSS}</style><span className="kick">{kick}</span><h3>{title}</h3>{children}</section>
);

/** 대장 방: 오늘 어떤 순서로 가는지 */
export function MeetupOrder({ onRoom, rooms }: { onRoom?: (room: "main" | "hw" | "sw") => void; rooms: boolean }) {
  const go = (room: "hw" | "sw", label: string) => (rooms && onRoom ? <button type="button" onClick={() => onRoom(room)}>{label} →</button> : <span />);
  return (
    <Card kick="오늘의 순서" title="사만다를 같이 만들어요">
      <p>설계도는 이미 정해져 있어요. 오늘은 그대로 끝까지 만들고, 떠오른 아이디어는 적어만 둬요. 다 만든 뒤 <b>완성 🎉</b>을 누르면 대장 달그락이 아이디어마다 편지로 답해요.</p>
      <ol className="steps">
        <li><i>1</i><div><b>아이디어 더하기</b><small>이 방에 한 줄씩 적어요. 설계는 바뀌지 않아요.</small></div><span /></li>
        <li><i>2</i><div><b>부품 조립</b><small>회로 승인 → 3D 승인 → 대장간 입장 뒤, 작업대의 조립 가이드에서 3D 작업대를 열어요.</small></div><span /></li>
        <li><i>3</i><div><b>펌웨어</b><small>보드 안에서 도는 프로그램. 전자회로 달그락이 맡아요.</small></div>{go("hw", "전자회로 방")}</li>
        <li><i>4</i><div><b>소프트웨어: 셈</b><small>휴대폰에서 개수를 세어 주는 앱. 소프트웨어 달그락이 소개해요.</small></div>{go("sw", "소프트웨어 방")}</li>
        <li><i>5</i><div><b>실제로 재 보기</b><small>셈 앱에서 빈 통 → 10개 → 전부 순서로 올려요.</small></div><span /></li>
        <li><i>6</i><div><b>QA와 편지</b><small>작업대의 테스트 6개를 훑고, 이 방에서 완성 🎉을 눌러요.</small></div><span /></li>
      </ol>
    </Card>
  );
}

/** 전자회로 달그락 방: 이번 보드에 실제로 들어간 펌웨어와 Arduino IDE로 올리는 법 */
export function SamFirmware() {
  return (
    <Card kick="전자회로 달그락 · 펌웨어" title="펌웨어 올리기 (Arduino IDE)">
      <p>펌웨어는 보드 안에서 도는 프로그램이에요. 달그락 대장간에서는 회로를 그린 <b>전자회로 달그락</b>이 펌웨어도 같이 맡아요. 핀을 정한 쪽이 그 핀을 읽는 코드를 쓰는 게 가장 덜 틀리기 때문이에요. 오늘 보드에는 미리 올려 뒀고, 아래는 그때 쓴 설정 그대로예요.</p>
      <h4>이번 보드에 들어간 것</h4>
      <table><tbody>
        <tr><th>펌웨어</th><td>sam_scale <b>0.2.0</b> · 따로 깔 라이브러리 없음</td></tr>
        <tr><th>HX711 핀</th><td>DT = <b>G6</b>, SCK = <b>G5</b>, GND 대용 = <b>G7</b> (펌웨어가 G7을 LOW로 붙들어 둬요)</td></tr>
        <tr><th>내장 부품</th><td>버튼 G41 · RGB LED G35</td></tr>
        <tr><th>연결</th><td>블루투스 이름 <code>dalgrak-scale-번호</code> · 기본은 안드로이드용, 버튼 세 번이면 아이폰용(키보드)</td></tr>
      </tbody></table>
      <div className="btns"><a className="main" href={FW_URL} target="_blank" rel="noreferrer">펌웨어 코드 보기 (GitHub)</a><a href={`${SAM_REPO_URL}/archive/refs/heads/main.zip`}>전체 내려받기 (ZIP)</a></div>
      <h4>올리는 순서</h4>
      <ol>
        <li>Arduino IDE의 보드 매니저에서 <b>esp32 by Espressif Systems</b> 3.3.x를 설치해요.</li>
        <li>내려받은 폴더의 <code>firmware/sam_scale/sam_scale.ino</code>를 열어요.</li>
        <li><b>도구</b> 메뉴를 아래처럼 맞춰요.</li>
      </ol>
      <table><tbody>
        <tr><th>보드</th><td><b>M5AtomS3</b> (이름이 비슷한 M5Atom은 다른 보드예요)</td></tr>
        <tr><th>USB CDC On Boot</th><td><b>Enabled</b> · 꺼져 있으면 시리얼 모니터에 아무것도 안 나와요</td></tr>
        <tr><th>Partition Scheme</th><td><b>8M with spiffs (3MB APP/1.5MB SPIFFS)</b> · 기본값에는 안 들어가요</td></tr>
        <tr><th>PSRAM</th><td>Disabled · 켜면 LED 핀(G35)을 가져가서 불이 안 켜져요</td></tr>
      </tbody></table>
      <ol start={4}>
        <li>USB-C를 꽂고 포트를 고른 뒤 <b>업로드</b>를 눌러요. 안 올라가면 옆면 리셋을 LED가 초록이 될 때까지 2초 누르고 다시 올려요.</li>
        <li>LED가 <b>파랑</b>으로 켜지면 펌웨어가 도는 거예요. <b>빨강</b>으로 멈추면 HX711이 대답이 없는 거라, 꽂은 자리를 다시 봐요.</li>
        <li>시리얼 모니터(115200)에서 <code>cal 1000</code>을 치고, 안내대로 비운 뒤 1kg을 올리면 g 단위가 맞춰져요.</li>
      </ol>
      <p className="note">펌웨어만 다시 올려도 보정값은 지워지지 않아요. 그래서 고칠 것이 생기면 USB로 새 펌웨어만 올리면 돼요.</p>
    </Card>
  );
}

/** 소프트웨어 달그락 방과 /find/sam: 재고 측정기 '셈' 소개와 사용설명서 */
export function SamStory({ standalone = false }: { standalone?: boolean }) {
  return (
    <Card kick={standalone ? "재고 측정기" : "소프트웨어 달그락 · 다 만들었어요"} title="셈(SAM), 돌멩이로 세던 그 일">
      <p>사람이 처음 수를 셀 때 쓴 건 <b>돌멩이</b>였대요. 하나에 하나씩 옮겨 놓으며 셌어요. &lsquo;계산&rsquo;을 뜻하는 영어 calculate도 조약돌(calculus)에서 온 말이에요. 그래서 재고를 같이 세어 주는 둘은 돌멩이예요.</p>
      <div className="cast">
        <div className="who"><img src="/find/meetup/sem.webp" alt="삼각형 돌멩이 셈" /><div><b>셈 · 새뮤엘</b>삼각형 돌멩이. 앱 안에서 무엇을 어떻게 셀지 묻고 안내해요. 사진으로 셀 때 개수를 잡아 주는 것도 셈이에요.</div></div>
        <div className="who"><img src="/find/meetup/sam-green.webp" alt="네모난 돌멩이 사만다" /><div><b>사만다</b>네모난 돌멩이 모양 저울. 오늘 만든 바로 그 기계예요. 화면 속 사만다의 눈 색이 저울의 LED 색과 같아요.</div></div>
      </div>
      <div className="btns"><a className="main" href={SAM_APP_URL} target="_blank" rel="noreferrer">셈 앱 열기</a><a href={SAM_REPO_URL} target="_blank" rel="noreferrer">GitHub에서 받기 (MIT)</a>{!standalone && <a href="/find/sam" target="_blank" rel="noreferrer">이 설명서만 따로 열기</a>}</div>

      <h4>무엇을 하는 앱인가요</h4>
      <p>많아서 세기 힘든 재고를 같이 세요. 가입이 없고, 기록은 <b>내 휴대폰에만</b> 남아요.</p>
      <table><tbody>
        <tr><th>무게로</th><td>나사·너트·비즈처럼 작고 많은 것. <b>사만다</b>에 올려요.</td></tr>
        <tr><th>사진으로</th><td>펼쳐 놓을 수 있는 낱개. 휴대폰 안에서만 계산해요.</td></tr>
        <tr><th>박스로</th><td>쌓아 둔 상자. 박스 수 × 한 박스에 든 개수.</td></tr>
        <tr><th>직접</th><td>큰 물건은 그냥 세서 적어요.</td></tr>
      </tbody></table>

      <h4>휴대폰에 설치하기</h4>
      <div className="two">
        <div className="box"><h4>아이폰</h4><ol><li><b>Safari</b>로 셈 앱 주소를 열어요.</li><li>아래 가운데 <b>공유</b> 버튼을 눌러요.</li><li><b>홈 화면에 추가</b>를 골라요.</li></ol><p className="note">아이폰은 웹 블루투스가 안 돼서, 사만다를 키보드처럼 연결해요.</p></div>
        <div className="box"><h4>안드로이드</h4><ol><li><b>Chrome</b>으로 셈 앱 주소를 열어요.</li><li>오른쪽 위 <b>⋮</b> 메뉴를 눌러요.</li><li><b>홈 화면에 추가</b>(또는 앱 설치)를 골라요.</li></ol><p className="note">안드로이드는 블루투스로 바로 이어져서 무게가 실시간으로 흘러요.</p></div>
      </div>

      <h4>사만다 연결하기</h4>
      <table><tbody>
        <tr><th>안드로이드</th><td>앱에서 <b>사만다 찾기</b> → <code>dalgrak-scale-번호</code>를 골라요.</td></tr>
        <tr><th>아이폰</th><td>사만다 버튼을 <b>세 번</b> 눌러 눈이 보라색이 되면, 설정 › 블루투스에서 연결하고 앱에서 <b>키보드로 연결했어요</b>를 눌러요. 무게가 멈췄을 때 버튼을 한 번 누르면 그 값이 들어가요.</td></tr>
        <tr><th>사만다가 없을 때</th><td>다른 저울의 숫자를 직접 넣거나 <b>연습용 저울</b>로 흐름만 해 봐요.</td></tr>
      </tbody></table>

      <h4>실제로 세어 보기</h4>
      <ol>
        <li>앱을 열고 <b>무엇을 세나요?</b>에서 내 재고의 생김새를 골라요.</li>
        <li>세는 곳과 품목을 만들어요. 품목은 엑셀·CSV로 불러와도 돼요.</li>
        <li><b>세기</b>에서 품목을 고르고, <b>빈 통 → 10개 → 전부</b> 순서로 사만다에 올려요.</li>
        <li>화면에 개수와 <b>± 몇 개</b>(오차)가 같이 나와요. 샘플을 늘리면 오차가 줄어요.</li>
      </ol>
      <p>개수 = (올린 무게 − 통 무게) ÷ 개당 무게, 개당 무게 = 샘플 무게 ÷ 샘플 개수예요. 결과는 엑셀·CSV·JSON으로 내보내요.</p>

      <h4>사만다의 버튼과 눈 색</h4>
      <div className="two">
        <div className="box"><table><tbody>
          <tr><th>한 번</th><td>영점 (아이폰 연결 중에는 무게 입력)</td></tr>
          <tr><th>세 번</th><td>연결 방식 바꾸기</td></tr>
          <tr><th>길게 3초</th><td>보정</td></tr>
        </tbody></table></div>
        <div className="box"><table><tbody>
          <tr><th>초록</th><td>무게가 멈췄어요. 읽어도 돼요.</td></tr>
          <tr><th>노랑</th><td>아직 흔들려요.</td></tr>
          <tr><th>보라</th><td>아이폰용 키보드 연결</td></tr>
          <tr><th>빨강 고정</th><td>저울 오류. 꽂은 자리를 봐요.</td></tr>
        </tbody></table></div>
      </div>
      <p className="note">오픈소스(MIT)라서 저장소를 내 GitHub로 복사해 마음대로 고칠 수 있어요. 앱은 빌드 없이 web 폴더 그대로 돌아요.</p>
    </Card>
  );
}
