import { serverLockAvailable } from "../../lib/account-service";
import { googleConfigured } from "../../lib/google";
import { signupMode } from "../../lib/policies";
import JoinForm from "./join-form";

export const dynamic = "force-dynamic";

export default async function JoinPage({ searchParams }: { searchParams: Promise<{ google?: string }> }) {
  const mode = signupMode();
  const params = await searchParams;
  return (
    <main className="login-shell">
      <section className="login-card join-card">
        <img src="/characters/idle.png" alt="대장 달그락" width="85" height="85" style={{ objectFit: "contain" }} />
        <p className="eyebrow">바이브 포저 가입</p>
        <h1>달그락 대장간</h1>
        {mode === "closed"
          ? <p>지금은 가입을 받지 않아요. 운영자에게 문의해주세요.</p>
          : <JoinForm needsCode={mode === "invite"} serverLock={serverLockAvailable()} google={googleConfigured()} askGoogleConsent={params.google === "consent"} />}
        <p className="login-links"><a href="/terms">이용약관</a> · <a href="/privacy">개인정보 처리방침</a> · 이미 계정이 있나요? <a href="/login">로그인</a></p>
      </section>
    </main>
  );
}
