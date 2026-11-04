"use client";
import { useState } from "react";

// Shown before Google sign-up. The person must tick the box to continue.
// Keep in step with GOOGLE_NOTICE_VERSION in lib/policies.ts.
export default function GoogleNotice({ onEmail, onContinue, onClose }: { onEmail: () => void; onContinue: () => void; onClose: () => void }) {
  const [agreed, setAgreed] = useState(false);
  return <div className="modal-backdrop" onClick={onClose}>
    <section className="profile-modal google-notice" role="dialog" aria-modal="true" aria-labelledby="google-notice-title" onClick={(e) => e.stopPropagation()}>
      <header><h2 id="google-notice-title">구글로 계속하기 전에 확인해주세요</h2><button aria-label="닫기" onClick={onClose}>×</button></header>
      <p>'달그락 대장간'은 가입 방식에 따라 내 기록을 보호하는 방식이 다릅니다. 내 기록에는 아이디어, 설계도, 회로, 3D 목업, 부품·할 일, 파일, 그리고 Claude와 나눈 대화의 요약과 팀 기록이 들어갑니다.</p>

      <h3>이메일로 가입하는 경우</h3>
      <p>내 기록은 <b>내 비밀번호로 잠겨서</b> 저장됩니다. 서버에는 잠긴 상태로만 남기 때문에, 운영자를 포함해 누구도 내 기록을 열어볼 수 없습니다. 단, 비밀번호와 복구 코드를 모두 잃어버리면 운영자도 기록을 되살릴 수 없습니다.</p>

      <h3>구글로 가입하는 경우</h3>
      <p>구글 로그인에는 나만 아는 비밀번호가 없어서, 기록을 여는 열쇠를 <b>서버가 대신 보관</b>합니다. 그래서 다음이 달라집니다.</p>
      <ul>
        <li>운영자는 정책에 따라 내 기록을 열람하지 않습니다. 하지만 기술적으로 열 수 없는 구조는 아닙니다. 운영자가 기록을 열려면 ① 서버 관리 화면(Railway)에 로그인해 ② 서버에 보관된 열쇠를 꺼내고 ③ 저장된 기록 파일을 내려받아 ④ 그 열쇠로 직접 풀어야 합니다. 물론 '달그락 대장간'의 운영자 화면에는 이런 기능이 없습니다.</li>
        <li>서버가 해킹되어 열쇠와 기록 파일이 함께 유출되면, 이메일 가입보다 기록이 노출될 위험이 더 큽니다.</li>
      </ul>

      <h3>구글 로그인의 좋은 점</h3>
      <ul>
        <li>비밀번호를 만들거나 외울 필요 없이 버튼 하나로 로그인할 수 있습니다.</li>
        <li>구글 계정만 있으면 언제든 다시 들어올 수 있습니다. </li>
      </ul>

      <p className="notice-highlight">※ 가입 후 내 계정 화면에서 비밀번호를 설정하면 이메일 가입과 같은 잠금으로 바꿀 수 있습니다.</p>

      <label className="remember-session"><input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />위 내용을 이해했고, 구글로 계속할게요</label>
      <div className="delete-actions">
        <button onClick={onEmail}>이메일로 가입하기</button>
        <button className="primary" disabled={!agreed} onClick={onContinue}>동의하고 구글로 계속</button>
      </div>
    </section>
  </div>;
}
