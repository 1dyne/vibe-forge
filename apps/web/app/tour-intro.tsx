// 투어의 첫 장. 화면을 짚기 전에 "여기가 무엇을 하는 곳이고, 하드웨어 개발이 어떤
// 단계를 밟고, 달그락이 그 안에서 어떻게 도는지"를 먼저 말한다. 이 설명 없이 바로
// 사이드바부터 짚으면, 버튼 위치는 알아도 무엇을 하러 왔는지는 모른 채 끝난다.

const PHASES = [
  { no: "01", name: "아이디어", detail: "만들고 싶은 것을 한 줄로. 가진 장비와 해본 일을 알려주면 거기에 맞춰 설계해요." },
  { no: "02", name: "계획", detail: "완성품 형태 → 보드와 부품 → 회로(전압·전류·핀 검사) → 3D 목업까지, 사기 전에 정합니다." },
  { no: "03", name: "대장간", detail: "부품을 주문하고 조립해요. 측정값을 올리면 달그락이 원인을 좁혀줍니다." }
];

export default function TourIntro() {
  return <div className="tour-intro">
    <div className="tour-intro-head">
      <img src="/characters/idle.png" alt="" width={56} height={60} />
      <div>
        <strong>달그락 대장간</strong>
        <p>회로도 코드도 모르는 사람이 머릿속 물건을 실제로 만들어보는 곳이에요. 만든 사람도 비전공자였고, 쓰려고 만든 보조 기기를 AI와 함께 혼자 완성하면서 알게 된 방법을 옮겨둔 것입니다.</p>
      </div>
    </div>

    <h4>하드웨어는 이런 순서로 만들어집니다</h4>
    <ol className="tour-flow">{PHASES.map((phase) => <li key={phase.no}>
      <span className="tour-flow-no">{phase.no}</span>
      <b>{phase.name}</b>
      <small>{phase.detail}</small>
    </li>)}</ol>
    <p className="tour-note">순서를 지키는 이유가 있어요. 형태를 안 정하고 회로부터 짜면 다 만든 뒤에 <b>부품이 케이스에 안 들어갑니다.</b> 되돌리기 가장 비싼 실수예요.</p>

    <h4>달그락은 이렇게 돕습니다</h4>
    <div className="tour-how">
      <div><b>내가 쓰는 AI에서</b><small>이야기하며 설계를 좁혀요</small></div>
      <span className="tour-how-arrow" aria-hidden="true">→</span>
      <div><b>달그락 대장간에</b><small>설계·승인·기록이 남아요</small></div>
    </div>
    <p className="tour-note">분야별 달그락 다섯이 나눠 맡아요. 대장이 순서를 잡고, 하드웨어가 회로를, 소프트웨어가 앱을, 기구설계가 구조를, 제품 디자인이 생김새를 봅니다. <b>사람만 할 수 있는 일</b>(사기·납땜·측정·승인)은 달그락이 대신하지 않아요.</p>
  </div>;
}
