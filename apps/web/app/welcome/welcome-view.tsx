"use client";
import { useEffect, useState } from "react";
import { Reveal, StickyCta } from "../intro-kit";

export const SEED_KEY = "dalgrak_seed";
type Claimed = { projectId: string; name: string; created: boolean } | null;

const TOWN: Array<{ color: string; title: string; body: string }> = [
  { color: "#9DD2C8", title: "내 대장간", body: "마을에 내 방이 하나 생겨요. 아이디어를 떠올리고 프로젝트를 진행할수록 선반에 초롱이 늘고 방이 넓어져요." },
  { color: "#EDB69A", title: "이웃 구경", body: "다른 사람들이 무엇을 구상하고 있는지 대장간에 놀러 가서 봐요. 마음에 들면 장작을 넣어 응원하고 이웃을 맺어요." },
  { color: "#F0DFA7", title: "소원 등불", body: "“이런 게 있으면 좋겠다”를 등불로 걸어 둬요. 같은 소원을 가진 사람이 모이면 함께 만들 사람을 찾을 수 있어요." },
  { color: "#AAC8DF", title: "연습장", body: "납땜이 처음이라면 3D 작업대에서 먼저 손으로 해 봐요. 실제 부품을 사기 전에 순서를 익혀요." },
  { color: "#DCB2D2", title: "마을 게시판", body: "마을에 새로 생긴 것, 다음에 지을 것을 보고 투표해요. 받은 장작이 많을수록 표가 늘어요." },
  { color: "#B7B3D7", title: "쪽지와 편지함", body: "놀러 온 사람이 남긴 응원이 편지함에 쌓여요. 운영자에게 바라는 것도 여기로 보내요." }
];

export default function WelcomeView() {
  const [claimed, setClaimed] = useState<Claimed>(null);
  const [state, setState] = useState<"checking" | "none" | "done" | "failed">("checking");

  // 온보딩에서 들고 온 아이디어가 있으면 내 프로젝트로 만든다.
  useEffect(() => { void (async () => {
    let seed: string | null = null;
    try { seed = localStorage.getItem(SEED_KEY); } catch { /* 저장소 없이도 된다 */ }
    if (!seed) { setState("none"); return; }
    try {
      const response = await fetch("/api/me/seed", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ seed }) });
      if (response.status === 401) { window.location.assign("/login?next=/welcome"); return; }
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setClaimed(body); setState("done");
      try { localStorage.removeItem(SEED_KEY); } catch { /* 다음에 지워진다 */ }
    } catch { setState("failed"); }
  })(); }, []);

  const startUrl = claimed ? `/?p=${claimed.projectId}` : "/";
  const startLabel = claimed ? "내 아이디어로 시작하기" : "달그락 대장간으로 가기";
  return <main className="intro">
    <section className="hero">
      <Reveal kind="pop"><img src="/characters/idle.png" alt="" width={120} height={120} /></Reveal>
      <Reveal delay={80}><h1>어서 와요!<br />이제 내 대장간이 생겼어요</h1></Reveal>
      <Reveal delay={200}><p>{state === "done" && claimed ? <>아까 스케치한 <b>“{claimed.name}”</b>을 내 프로젝트로 옮겨 놨어요. 대장 달그락이 거기서부터 같이 구체적으로 만들어 가요.</> : state === "failed" ? "아까의 아이디어를 옮겨 오지 못했어요. 대장간에서 다시 한 번 들려주세요." : "대장 달그락에게 만들고 싶은 것을 들려주면 거기서부터 시작해요."}</p></Reveal>
      <Reveal delay={320}><a className="btn-main" href={startUrl}>{startLabel}</a></Reveal>
      <div className="scroll-hint">달그락 마을도 구경해 봐요 ↓</div>
    </section>

    <section>
      <Reveal><span className="tag">두 곳이 있어요</span><h2>만드는 곳과 모이는 곳</h2></Reveal>
      <div className="needs" style={{ marginTop: 0 }}>
        <Reveal kind="left"><div style={{ background: "#e3f2ee", borderStyle: "solid" }}><b>달그락 대장간 · 만드는 곳</b>달그락들과 대화하며 설계하고, 3D로 미리 보고, 파일을 받아 조립해요. 지금 가입한 곳이에요.</div></Reveal>
        <Reveal kind="right"><div style={{ background: "#fdeee3", borderStyle: "solid" }}><b>달그락 마을 · 모이는 곳</b>내 대장간을 꾸미고, 다른 사람의 대장간에 놀러 가고, 소원을 걸어요. 대장간 왼쪽 메뉴의 “달그락 마을”로 언제든 오갈 수 있어요.</div></Reveal>
      </div>
    </section>

    <section>
      <Reveal><span className="tag">달그락 마을에서는</span><h2>이런 걸 할 수 있어요</h2></Reveal>
      <div className="town-grid">{TOWN.map((t, i) => <Reveal as="article" key={t.title} delay={(i % 2) * 110} kind={i % 2 ? "right" : "left"}><b><i style={{ background: t.color }} />{t.title}</b>{t.body}</Reveal>)}</div>
      <Reveal><p style={{ textAlign: "center", marginTop: 26 }}><a className="btn-main" href="/find/home" style={{ background: "#EDB69A" }}>달그락 마을 구경하기</a></p></Reveal>
    </section>

    <section>
      <Reveal><span className="tag">시작하기 전에</span><h2>이것만 알고 가요</h2></Reveal>
      <div className="needs" style={{ marginTop: 0 }}>
        <Reveal><div><b>대화는 컴퓨터에서 해요</b>달그락과 대화하려면 컴퓨터에서 연결 프로그램을 켜야 해요. 대장간 입력창에 “터미널이 뭐예요?”부터 그림으로 알려줘요. 지금 휴대폰이라면 집에 가서 컴퓨터로 이어 하면 돼요. 아이디어는 저장돼 있어요.</div></Reveal>
        <Reveal delay={120}><div><b>내 AI 구독을 써요</b>ChatGPT 요금제나 Claude 구독(Claude Code)으로 달그락들이 일해요. 달그락 대장간이 따로 받는 AI 값은 없어요.</div></Reveal>
      </div>
    </section>

    <section className="cta"><Reveal kind="pop"><h2>그럼, 만들러 가요</h2><a className="btn-main" href={startUrl}>{startLabel}</a></Reveal></section>
    <StickyCta><span>{claimed ? `“${claimed.name}” 이어 만들기` : "대장 달그락이 기다려요"}</span><a className="btn-main" href={startUrl}>{claimed ? "시작하기" : "대장간으로"}</a></StickyCta>
  </main>;
}
