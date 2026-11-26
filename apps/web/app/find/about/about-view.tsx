"use client";
import { Install, Reveal, SeedKeeper, Shot, StickyCta, useInAppBrowser } from "../../intro-kit";

const CREW: Array<{ id: string; img: string; name: string; color: string; sub?: boolean; decides: string[] }> = [
  { id: "chief", img: "/characters/idle.png", name: "대장 달그락", color: "#9DD2C8", decides: ["무엇부터 만들까", "예산 안에 들어올까", "누가 무엇을 맡을까", "지금 누구 차례일까"] },
  { id: "hwlead", img: "/characters/hwlead/idle.png", name: "하드웨어 달그락", color: "#B7B3D7", decides: ["회로와 몸체가 서로 맞을까", "단자가 구멍과 맞을까", "어떤 순서로 조립할까"] },
  { id: "hw", img: "/characters/hw/idle.png", name: "전자회로 달그락", color: "#9DA2DF", sub: true, decides: ["어떤 보드를 쓸까", "어떤 센서가 맞을까", "전압이 서로 맞을까", "선을 어느 핀에 꽂을까", "전지는 얼마나 갈까"] },
  { id: "me", img: "/characters/me/idle.png", name: "기구설계 달그락", color: "#DCB2D2", sub: true, decides: ["부품이 다 들어갈까", "구멍은 어디에 뚫을까", "나사는 어디에 박을까", "프린터에 들어가는 크기일까"] },
  { id: "sw", img: "/characters/sw/idle.png", name: "소프트웨어 달그락", color: "#AAC8DF", decides: ["보드 안에서 무엇이 돌까", "폰 화면이 필요할까", "보드와 폰이 어떤 말을 주고받을까"] },
  { id: "id", img: "/characters/id/idle.png", name: "제품 디자인 달그락", color: "#F0DFA7", decides: ["어떤 모양일까", "손에 쥐었을 때 편할까", "어떤 색과 재질일까"] }
];

export default function AboutView({ joinUrl, seed, token, contact }: { joinUrl: string; token: string | null; contact: string; seed: { idea: string; name: string; color: string } | null }) {
  const inApp = useInAppBrowser();
  const cta = seed ? "가입하고 내 아이디어 이어 만들기" : "달그락 대장간 가입하기";
  return <main className="intro">
    {seed && <SeedKeeper seed={token} />}
    <section className="hero">
      {seed && <Reveal kind="pop"><div className="seed"><i style={{ background: seed.color }} /><span>{seed.name}이 맡을 아이디어 · “{seed.idea}”</span></div></Reveal>}
      <Reveal delay={80}><h1>말로 설명한 아이디어를<br />내 손에 잡히는 물건으로</h1></Reveal>
      <Reveal delay={200}><p>달그락 대장간은 회로도 코드도 모르는 사람이 AI와 함께 하드웨어를 만드는 곳이에요. 만들 것을 3D로 미리 보고, 내 아이디어에 맞는 설계도와 부품 도면을 받아, 조립은 내 손으로 해요.</p></Reveal>
      <Reveal delay={320}><a className="btn-main" href={joinUrl}>{cta}</a></Reveal>
      <div className="scroll-hint">아래로 내려 보세요 ↓</div>
    </section>

    <section>
      <Reveal><span className="tag">이렇게 돼요</span><h2>세 걸음이면 조립대 앞이에요</h2></Reveal>
      <div className="three">
        <Reveal as="article" delay={0}><span>1</span><b>말로 들려줘요</b>만들고 싶은 것, 아니면 요즘 귀찮은 것. 달그락이 물어보며 같이 정해요.</Reveal>
        <Reveal as="article" delay={120}><span>2</span><b>미리 보고 받아요</b>완성된 모습을 3D로 돌려 보고, 부품 목록·회로·출력 파일·조립 순서를 받아요.</Reveal>
        <Reveal as="article" delay={240}><span>3</span><b>내 손으로 만들어요</b>부품을 사고, 출력하고, 꽂고, 재요. 막히면 사진을 찍어 물어봐요.</Reveal>
      </div>
    </section>

    <section>
      <div className="split">
        <div className="text"><Reveal kind="left"><span className="tag">3D로 미리 보기</span><h2>뽑기 전에<br />맞는지부터 봐요</h2><p className="lead">실제 부품 치수로 하우징 안에 넣어 보고, 서로 부딪히는지 틈은 충분한지를 숫자로 검사해요. “검사 27 / 27 통과”가 뜨면 그 모양 그대로 출력 파일이 나와요.</p></Reveal></div>
        <Shot src="/find/shots/mockup-panel.png" alt="달그락 대장간의 정밀 목업 화면. 하우징과 부품이 3D로 보이고 검사 27/27 통과라고 표시돼 있다" caption="실제 달그락 대장간 화면 · 3D 목업과 겹침 검사" kind="right" />
      </div>
    </section>

    <section>
      <div className="split flip">
        <div className="text"><Reveal kind="right"><span className="tag">지금 누구 차례</span><h2>내가 할 일만<br />나에게 와요</h2><p className="lead">달그락들이 각자 대장간에서 일하다가, 내가 정하거나 재거나 사야 하는 것만 “내 차례”로 모아 줘요. 택배가 늦어지면 그것도 계획에 넣어요.</p></Reveal></div>
        <Shot src="/find/shots/board-panel.png" alt="달그락 대장간의 작업대 화면. 달그락마다 하고 있는 일과 내 차례가 보인다" caption="실제 달그락 대장간 화면 · 작업대" kind="left" />
      </div>
    </section>

    <section>
      <Reveal><span className="tag">왜 어렵냐면</span><h2>바이브 코딩은 고치고 다시 돌리면 되지만,<br />바이브 메이킹은 그럴 수가 없어요</h2>
        <p className="lead">물건 하나에는 서로 얽힌 결정이 아주 많아요. 그래서 달그락 대장간에서는 달그락들이 분야를 나눠 맡아요.</p></Reveal>
      <div className="crew">
        {CREW.map((c, i) => <Reveal key={c.id} kind={i % 2 ? "right" : "left"} className={`who${c.sub ? " sub" : ""}`}>
          <img src={c.img} alt="" />
          <div><b style={{ background: c.color }}>{c.name}</b><ul>{c.decides.map((d) => <li key={d}>{d}</li>)}</ul></div>
        </Reveal>)}
        <Reveal kind="pop" className="who me">
          <img src="/characters/idle.png" alt="" style={{ visibility: "hidden" }} />
          <div><b style={{ background: "#EDB69A" }}>그리고 나</b><ul>{["부품 주문하기", "택배 기다리기", "3D 출력하기", "꽂고 조이기", "재서 알려주기", "안 맞으면 다시"].map((d) => <li key={d}>{d}</li>)}</ul></div>
        </Reveal>
      </div>
      <Reveal><p className="count">결정이 <b>스무 가지가 넘고</b>, 그중 하나가 바뀌면 다른 것도 따라 바뀌어요.<br />그리고 <b>사람이 움직여야</b> 다음으로 넘어가요.</p></Reveal>
    </section>

    <section>
      <Reveal><span className="tag">그냥 AI와 대화하면</span><h2>이런 데서 막혀요</h2></Reveal>
      <div className="versus">
        <Reveal><div><p><small>그냥 AI와 대화하면</small>대화가 길어지면 앞에서 정한 것을 잊어요. 새 대화로 넘기면 흐름이 끊겨요.</p><p><small>달그락 대장간에서는</small>설계도·회로·부품이 프로젝트에 차곡차곡 쌓여요. 어디까지 왔는지 늘 보여요.</p></div></Reveal>
        <Reveal delay={100}><div><p><small>그냥 AI와 대화하면</small>부품을 샀는지, 출력했는지, 택배가 왔는지 AI는 몰라요.</p><p><small>달그락 대장간에서는</small>누구 차례인지와 현실의 상태를 작업대가 들고 있어요. 기다리는 동안 할 수 있는 일을 알려줘요.</p></div></Reveal>
        <Reveal delay={200}><div><p><small>그냥 AI와 대화하면</small>그럴듯한 답이 실제로 맞는지 알 길이 없어요. 사고 나서야 안 맞는 걸 알아요.</p><p><small>달그락 대장간에서는</small>전압, 치수, 겹침을 숫자로 검사해요. 통과하지 못한 설계는 넘어가지 않아요.</p></div></Reveal>
      </div>
    </section>

    <section>
      <div className="split">
        <div className="text"><Reveal kind="left"><span className="tag">받는 것</span><h2>따라 만들 수 있는<br />파일이 나와요</h2><p className="lead">구멍까지 뚫린 출력용 파일, 어디서 무엇을 살지 적힌 부품 목록, 기판 위에 하나씩 꽂는 조립 순서. 출력해서 안 맞으면 재서 알려주세요. 고쳐서 다시 줘요.</p></Reveal></div>
        <Shot src="/find/shots/print-panel.png" alt="달그락 대장간의 출력용 파일 화면" caption="실제 달그락 대장간 화면 · 출력용 파일" kind="right" />
      </div>
    </section>

    <section>
      <Reveal kind="pop"><div className="maker-note">
        <div className="smith"><img src="/find/smith.webp" alt="마스크를 쓰고 납땜하는 대장장이 1dyne 그림" /><div><b>대장장이 1dyne</b><small>달그락 대장간과 달그락 마을을 만들고 지키는 사람</small></div></div>
        <p>AI와 대화하면서 처음으로 하드웨어를 만든 문과생 메이커예요. 그때 가장 힘들었던 건 회로가 아니라 <b>“지금 뭘 해야 하는지”</b>였어요. 그래서 그 길을 그대로 옮겨 달그락 대장간을 만들었어요.</p>
        <p className="contact">궁금한 것, 막히는 것, 같이 해보고 싶은 것은 <a href={`mailto:${contact}`}>{contact}</a> 으로 보내 주세요.</p>
      </div></Reveal>
      <div className="needs">
        <Reveal><div><b>내가 쓰는 AI 구독 그대로</b>ChatGPT나 Claude 구독이 필요해요. 달그락 대장간은 AI 값을 따로 받지 않고, 내 구독으로 달그락들이 일해요.</div></Reveal>
        <Reveal delay={120}><div><b>대화는 컴퓨터에서</b>달그락과의 대화는 컴퓨터에서 작은 연결 프로그램을 켜고 해요. 휴대폰에서는 진행 상황 보기, 승인, 기록을 할 수 있어요.</div></Reveal>
      </div>
    </section>

    <section>
      <Reveal><span className="tag">홈 화면에 두기</span><h2>앱처럼 꺼내 써요</h2><p className="lead">부품이 도착했을 때, 출력이 끝났을 때 바로 열어 기록할 수 있게 홈 화면에 올려 둘 수 있어요. 가입한 뒤에 해도 돼요.</p></Reveal>
      <Reveal kind="pop"><Install /></Reveal>
    </section>

    <section className="cta">
      <Reveal kind="pop"><h2>{seed ? <>방금 그 아이디어,<br />이어서 만들어 봐요</> : <>첫 물건을<br />만들어 봐요</>}</h2>
        {inApp && <p className="lead" style={{ margin: "0 auto 18px" }}>지금 {inApp} 안에서 보고 있어요. 구글 가입은 여기서 막혀 있어서, 오른쪽 위 메뉴에서 <b>다른 브라우저로 열기</b>(크롬·사파리)를 누른 뒤 가입해 주세요.</p>}
        <a className="btn-main" href={joinUrl}>{cta}</a><br /><span className="btn-sub">구글 계정으로 10초면 돼요. 가입하면 달그락 마을도 열려요.</span></Reveal>
    </section>
    <StickyCta><span>{seed ? `“${seed.idea.slice(0, 22)}${seed.idea.length > 22 ? "…" : ""}” 이어 만들기` : "회로도 코드도 몰라도 돼요"}</span><a className="btn-main" href={joinUrl}>가입하기</a></StickyCta>
  </main>;
}
