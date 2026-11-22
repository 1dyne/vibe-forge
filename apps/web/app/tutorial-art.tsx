import type { ReactNode } from "react";

// 튜토리얼 그림. 아이콘과 같은 먹선(굵기 1.7, 둥근 끝)으로 그려 캐릭터와 한 몸으로 보이게 한다.
// 움직임은 꾸밈이 아니라 설명이다. 순서가 있는 것은 순서대로 나타나고, 흐름이 있는 것은
// 선이 그려지고, 조심할 것은 한 번 뛴다. 계속 움직이는 것은 두지 않는다 — 읽는 걸 방해한다.
// 움직임을 줄이기로 한 사람에게는 styles.css의 전역 reduce 규칙이 전부 끈다.

function Scene({ children }: { children: ReactNode }) {
  return <svg viewBox="0 0 220 120" className="tutorial-art" role="img" aria-hidden="true" focusable="false"
    fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">{children}</svg>;
}
// delay 단계로 순서대로 등장시킨다.
const In = ({ at, children }: { at: number; children: ReactNode }) => <g className="art-in" style={{ animationDelay: `${at * 0.22}s` }}>{children}</g>;

// 2. 체크리스트 — 가진 장비와 경험을 먼저 적는다
export const ArtChecklist = () => <Scene>
  <In at={0}><path d="M62 18h96v84H62z" /><path d="M96 18v-7h28v7" /></In>
  {[0, 1, 2].map((i) => <In key={i} at={1 + i}>
    <path d={`M78 ${40 + i * 20}l6 6 11-13`} className="art-check" />
    <path d={`M106 ${42 + i * 20}h38`} />
  </In>)}
</Scene>;

// 3. 완성품 형태 — 크기가 먼저 정해져야 부품이 들어간다
export const ArtForm = () => <Scene>
  <In at={0}><path d="M70 36h80v56H70z" /><path d="M70 36l16-14h80l-16 14M150 92l16-14V22" /></In>
  <In at={1}><path d="M70 104h80" className="art-dim" /><path d="M70 100v8M150 100v8" /></In>
  <In at={2}><path d="M172 36v56" className="art-dim" /><path d="M168 36h8M168 92h8" /></In>
</Scene>;

// 4. 설계도 — 입력과 출력을 정하고 보드를 고른다
export const ArtPlan = () => <Scene>
  <In at={0}><path d="M86 38h48v44H86z" /><path d="M94 38v-6M110 38v-6M126 38v-6M94 82v6M110 82v6M126 82v6" /></In>
  <In at={1}><path d="M22 60h52" className="art-flow" /><path d="M66 54l8 6-8 6" /><path d="M22 48v24" /></In>
  <In at={2}><path d="M146 60h52" className="art-flow" /><path d="M190 54l8 6-8 6" /><path d="M198 48v24" /></In>
</Scene>;

// 5. 회로와 규칙 검사 — 전압·전류·핀 충돌을 기계가 먼저 잡는다
export const ArtCircuit = () => <Scene>
  <In at={0}><path d="M40 30h60v34H40z" /><path d="M120 56h60v34h-60z" /></In>
  <In at={1}><path d="M100 47h20v26" className="art-flow" /></In>
  <In at={2}><g className="art-alert"><path d="M158 18a12 12 0 1 1 0 24 12 12 0 0 1 0-24Z" /><path d="M158 25v8M158 36.5v.5" /></g></In>
</Scene>;

// 6. 3D 목업 — 등록한 프린터로 낼 수 있는 크기 안에 두는지
export const ArtMockup = () => <Scene>
  <In at={0}><path d="M58 100V22h104v78" /><path d="M58 42h104" /></In>
  <In at={1}><path d="M110 42v10M103 52h14l-7 10z" /></In>
  <In at={2}><path d="M92 66h36v24H92z" className="art-check" /><path d="M72 96h76" /></In>
</Scene>;

// 7. 대장간 — 내가 할 일과 달그락이 할 일이 나뉜다
export const ArtWorkshop = () => <Scene>
  <In at={0}><path d="M26 54h62v52H26z" /><path d="M26 72h62" /></In>
  {[0, 1].map((i) => <In key={i} at={1 + i}>
    <path d={`M${104 + 0}  ${44 + i * 32}h90`} />
    <path d={`M104 ${56 + i * 32}h58`} className="art-dim" />
    {i === 0 ? <path d="M196 40l5 5 9-11" className="art-check" /> : <path d="M197 73l12 12M209 73l-12 12" className="art-cross" />}
  </In>)}
</Scene>;

// 8. 시작 — 첫 아이디어를 적는다
export const ArtStart = () => <Scene>
  <In at={0}><path d="M48 34h124v58H48z" /></In>
  <In at={1}><path d="M64 52h66" className="art-dim" /><path d="M64 68h40" className="art-dim" /></In>
  <In at={2}><path d="M150 76l22-22 8 8-22 22-11 3z" /></In>
</Scene>;

// 0. 구조 — 대화는 내 AI에서, 승인과 기록은 달그락에서
export const ArtFlow = () => <Scene>
  <In at={0}><path d="M22 40h62v44H22z" /><path d="M34 56h38M34 68h24" className="art-dim" /></In>
  <In at={1}><path d="M92 62h36" className="art-flow" /><path d="M120 56l8 6-8 6" /></In>
  <In at={2}><path d="M136 40h62v44h-62z" /><path d="M150 62l7 7 16-18" className="art-check" /></In>
</Scene>;
