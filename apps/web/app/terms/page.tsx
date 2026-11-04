import { OPERATOR_CONTACT, TERMS_VERSION } from "../../lib/policies";

export const metadata = { title: "이용약관 · 달그락 대장간" };

// Draft for review before opening sign-ups to the public.
export default function TermsPage() {
  return <main className="policy-shell"><article className="policy-card">
    <p className="eyebrow">시행일 {TERMS_VERSION} · 초안</p>
    <h1>이용약관</h1>
    <h2>1. 서비스</h2>
    <p>달그락 대장간은 참여자가 자신의 Claude와 함께 하드웨어 제작 아이디어를 설계도, 회로, 3D 목업, 부품 목록, 할 일로 정리하도록 돕는 무료 실험 서비스입니다.</p>
    <h2>2. 계정과 개인 링크</h2>
    <ul>
      <li>개인 링크(커넥터 주소, 대시보드 링크)는 비밀번호와 같습니다. 다른 사람에게 공유하지 마세요.</li>
      <li>기록은 개인 링크로만 열리게 암호화되므로, 링크를 잃어버리면 운영자도 복구할 수 없습니다.</li>
      <li>링크가 노출되었다면 즉시 내 계정에서 재발급해주세요.</li>
    </ul>
    <h2>3. 안전과 책임</h2>
    <ul>
      <li>AI가 만든 회로, 코드, 부품 정보, 가격은 틀릴 수 있습니다. 확인되지 않은 항목은 ‘확인 필요’로 표시됩니다.</li>
      <li>전원, 배터리, 발열, 모터, 사람 몸에 닿는 장치는 반드시 직접 측정하고 안전 기준을 확인한 뒤 사용하세요. 의료·안전 장비 용도로 쓰지 마세요.</li>
      <li>가격·재고는 검색 시점 기준이며 구매 전 판매처에서 확인해야 합니다.</li>
      <li>서비스는 무료 베타로 제공되며, 고의 또는 중대한 과실이 없는 한 제작 결과로 인한 손해에 책임지지 않습니다.</li>
    </ul>
    <h2>4. 금지 행위</h2>
    <p>다른 사람의 링크 사용, 서비스에 과도한 요청 보내기, 무기·불법 감청 장치 등 법령을 위반하는 장치 설계, 타인의 개인정보 기록을 금지합니다. 위반 시 계정을 중지할 수 있습니다.</p>
    <h2>5. 서비스 변경과 종료</h2>
    <p>운영자는 서비스를 바꾸거나 종료할 수 있으며, 종료 30일 전에 대시보드에 알리고 참여자가 기록을 내려받을 수 있게 합니다.</p>
    <h2>6. 탈퇴</h2>
    <p>참여자는 언제든 내 계정에서 탈퇴할 수 있고, 탈퇴하면 계정과 기록이 즉시 삭제됩니다.</p>
    <h2>7. 문의</h2>
    <p><a href={`mailto:${OPERATOR_CONTACT()}`}>{OPERATOR_CONTACT()}</a></p>
    <p><a href="/">← 돌아가기</a></p>
  </article></main>;
}
