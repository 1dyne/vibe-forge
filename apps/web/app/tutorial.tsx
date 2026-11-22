"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AGENTS } from "../lib/workflow";
import type { AgentId } from "../lib/project-types";
import { ArtChecklist, ArtCircuit, ArtFlow, ArtForm, ArtMockup, ArtPlan, ArtStart, ArtWorkshop } from "./tutorial-art";

// 처음 들어오면 무엇부터 해야 할지 알 수 없다는 말을 듣고 만들었다. 달그락 소개가 아니라
// "아이디어에서 실물까지 실제로 어떤 단계를 밟고, 하드웨어 설계에 무엇이 필요한지"를
// 순서대로 보여준다. 읽기만 하지 않고 1장에서 이름 표기를 그 자리에서 고르게 한다.

const AGENT_ORDER: AgentId[] = ["chief", "hw", "sw", "me", "id"];

function Team({ short }: { short: boolean }) {
  return <div className="tutorial-team">{AGENT_ORDER.map((agent, index) => (
    <div key={agent} className="art-in" style={{ animationDelay: `${index * 0.12}s` }}>
      <span className={`avatar avatar-${agent}`}><img src="/characters/idle.png" alt="" /><b>{AGENTS[agent].short}</b></span>
      <strong>{short ? AGENTS[agent].short : AGENTS[agent].name}</strong>
      <small>{AGENTS[agent].title}</small>
    </div>))}</div>;
}

type Step = { key: string; eyebrow: string; title: string; body: ReactNode; art: ReactNode };

function steps(short: boolean, setShort: (value: boolean) => void): Step[] {
  return [
    { key: "flow", eyebrow: "달그락 대장간이란", title: "생각을 손에 잡히게", art: <ArtFlow />,
      body: <>
        <p>만들고 싶은 물건을 말하면, 분야별 달그락이 설계를 함께 짜고 실제로 만들 수 있는 데까지 데려갑니다. 전공자가 아니어도 됩니다.</p>
        <p><b>대화는 내가 쓰는 AI에서</b> 하고, <b>설계와 승인, 기록은 여기에</b> 남습니다. 그래서 대화가 길어져도 결정한 것은 흩어지지 않아요.</p>
      </> },
    { key: "team", eyebrow: "1 / 함께 만들 팀", title: "다섯 달그락이 나눠 맡아요", art: <Team short={short} />,
      body: <>
        <p>한 명이 다 하지 않습니다. 분야가 다르면 보는 것이 달라서, 서로 빠뜨린 것을 잡아줍니다. 색이 다르니 지금 누가 말하는지 바로 보여요.</p>
        <div className="tutorial-choice">
          <span>이름을 어떻게 볼까요?</span>
          <button className={short ? "" : "on"} onClick={() => setShort(false)}>하드웨어 달그락</button>
          <button className={short ? "on" : ""} onClick={() => setShort(true)}>HW</button>
          <small>HW·SW·ME·ID는 하드웨어·소프트웨어·기구설계·제품 디자인의 약어예요. 나중에 설정에서 바꿀 수 있어요.</small>
        </div>
      </> },
    { key: "checklist", eyebrow: "2 / 설계 전", title: "가진 것과 해본 것을 먼저 알려주세요", art: <ArtChecklist />,
      body: <>
        <p>멀티미터가 있는지, 납땜을 해봤는지, 3D 프린터를 쓸 수 있는지, 예산이 얼마인지를 <b>설계 전에</b> 묻습니다.</p>
        <p>설명의 깊이와 고를 부품이 여기서 갈리기 때문입니다. 납땜을 안 해봤다면 납땜이 필요 없는 부품으로, 프린터가 없다면 기성 케이스로 방향이 바뀝니다.</p>
      </> },
    { key: "form", eyebrow: "3 / 계획", title: "회로보다 형태가 먼저입니다", art: <ArtForm />,
      body: <>
        <p>어디에 두는 물건인지, 손에 쥐는지 벽에 붙이는지부터 정합니다. 그러면 완성품 미리보기가 만들어지고 크기가 생깁니다.</p>
        <p>크기를 모른 채 회로부터 짜면, 다 만들고 나서 <b>부품이 케이스에 안 들어가는</b> 일이 생깁니다. 되돌리기 가장 비싼 실수입니다.</p>
      </> },
    { key: "plan", eyebrow: "4 / 계획", title: "무엇을 감지하고 무엇으로 알릴지", art: <ArtPlan />,
      body: <>
        <p>입력(감지할 것)과 출력(반응할 것)을 정하면 보드가 정해집니다. 무선이 필요한지도 여기서 갈려요.</p>
        <p>그다음 <b>사기 전에 확인할 것</b>을 목록으로 만듭니다. 전압이 맞는지, 핀이 남는지, 그 부품이 지금 구할 수 있는지 — 주문 전에 확인해야 돈이 안 날아갑니다.</p>
      </> },
    { key: "circuit", eyebrow: "5 / 계획", title: "회로는 기계가 먼저 검사합니다", art: <ArtCircuit />,
      body: <>
        <p>3.3V 부품에 5V를 바로 물리지 않았는지, 전류 합이 보드가 줄 수 있는 양을 넘지 않는지, 같은 핀을 두 부품이 쓰지 않는지를 규칙으로 걸러냅니다.</p>
        <p>꼭 고쳐야 할 것이 있으면 <b>빨갛게</b> 표시되고 넘어갈 수 없습니다. 사람은 방향만 승인하면 됩니다.</p>
      </> },
    { key: "mockup", eyebrow: "6 / 계획", title: "출력할 수 있는 크기인지 봅니다", art: <ArtMockup />,
      body: <>
        <p>3D 목업을 돌려보며 실제 모양을 확인합니다. 자주 가는 메이커스페이스를 등록해두면 <b>그 프린터로 낼 수 있는 크기</b> 안에서 설계합니다.</p>
        <p>여기까지 승인하면 부품 목록과 할 일이 만들어집니다.</p>
      </> },
    { key: "workshop", eyebrow: "7 / 대장간", title: "내가 할 일과 달그락이 할 일", art: <ArtWorkshop />,
      body: <>
        <p>부품을 사고, 납땜하고, 측정하는 것은 사람만 할 수 있습니다. 달그락은 그 결과를 받아 다음을 계산합니다.</p>
        <p>권하는 확인을 <b>✓ 확인만</b> 하고 넘어가도 되고, <b>✗ 건너뛰기</b>로 아예 넘어가도 됩니다. 건너뛴 것은 지워지지 않고 남아, 나중에 문제가 생기면 거기부터 되짚습니다.</p>
      </> },
    { key: "start", eyebrow: "8 / 이제", title: "만들고 싶은 것을 한 줄로", art: <ArtStart />,
      body: <>
        <p>다 정해지지 않아도 괜찮습니다. “책상이 어두우면 알려주는 것” 정도면 충분해요. 나머지는 대장 달그락이 물어보며 같이 좁힙니다.</p>
        <p>이 안내는 <b>내 설정 → 사용법 다시 보기</b>에서 언제든 다시 볼 수 있어요.</p>
      </> }
  ];
}

export default function Tutorial({ shortNames, onToggleShortNames, onClose }: {
  shortNames: boolean; onToggleShortNames: (value: boolean) => void; onClose: () => void;
}) {
  const [at, setAt] = useState(0);
  const panel = useRef<HTMLElement>(null);
  const list = steps(shortNames, onToggleShortNames);
  const step = list[at];
  const last = at === list.length - 1;

  useEffect(() => { panel.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setAt(i => Math.min(list.length - 1, i + 1));
      if (e.key === "ArrowLeft") setAt(i => Math.max(0, i - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [list.length, onClose]);

  return <div className="modal-backdrop tutorial-backdrop">
    <section ref={panel} tabIndex={-1} className="tutorial" role="dialog" aria-modal="true" aria-label="달그락 대장간 사용법">
      <header>
        <span className="eyebrow">{step.eyebrow}</span>
        <button className="tutorial-skip" onClick={onClose}>건너뛰기</button>
      </header>
      {/* key를 바꿔 장이 넘어갈 때마다 그림이 처음부터 다시 그려지게 한다. */}
      <div className="tutorial-stage" key={step.key}>{step.art}</div>
      <h2>{step.title}</h2>
      <div className="tutorial-body" key={`${step.key}-body`}>{step.body}</div>
      <footer>
        <ol className="tutorial-dots">{list.map((item, index) => <li key={item.key}>
          <button aria-label={`${index + 1}장`} aria-current={index === at ? "step" : undefined}
            className={index === at ? "on" : index < at ? "done" : ""} onClick={() => setAt(index)} />
        </li>)}</ol>
        <div className="tutorial-nav">
          {at > 0 && <button onClick={() => setAt(at - 1)}>이전</button>}
          <button className="primary" onClick={() => last ? onClose() : setAt(at + 1)}>{last ? "시작하기" : "다음"}</button>
        </div>
      </footer>
    </section>
  </div>;
}
