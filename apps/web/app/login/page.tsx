import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { googleConfigured } from "../../lib/google";
import { signupMode } from "../../lib/policies";
import { viewerFromCookie } from "../../lib/viewer";
import ParticipantLogin from "./participant-login";

export const dynamic = "force-dynamic";

const MESSAGES: Record<string, string> = {
  "1": "운영자 비밀번호가 맞지 않습니다.",
  slow: "시도가 너무 많아요. 15분 뒤 다시 시도해주세요.",
  link: "예전 개인 링크가 올바르지 않거나 사용이 중지됐어요.",
  google: "구글 로그인에 실패했어요. 다시 시도해주세요.",
  google_off: "구글 로그인은 아직 준비 중이에요. 이메일로 로그인해주세요.",
  google_state: "구글 로그인 시간이 지났어요. 다시 시도해주세요.",
  google_cancel: "구글 로그인을 취소했어요.",
  google_noaccount: "가입된 구글 계정이 아니에요.",
  google_taken: "이 이메일은 이메일·비밀번호로 가입돼 있어요. 이메일로 로그인해주세요.",
  google_signup: "지금은 구글로 새로 가입할 수 없어요(정원 또는 초대 코드 확인)."
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; unlock?: string; next?: string; as?: string }> }) {
  const params = await searchParams;
  const next = params.next && /^\/(?!\/)/.test(params.next) ? params.next : "/";
  if (await viewerFromCookie((await cookies()).get("dalgeurak_session")?.value)) redirect(next);
  // 운영자 로그인은 일반 사용자 화면에 보이지 않는다. 운영자만 아는 주소(/login?as=operator)로 열고,
  // 그 주소를 알아도 운영자 비밀번호가 있어야 들어간다.
  const operatorReady = params.as === "operator" && Boolean(process.env.APP_PASSWORD && process.env.SESSION_SECRET);
  return (
    <main className="login-shell">
      <section className="login-card">
        <img src="/characters/idle.png" alt="대장 달그락" width="85" height="85" style={{ objectFit: "contain" }} />
        <p className="eyebrow">나만의 제작 작업 공간</p>
        <h1>달그락 대장간</h1>
        {params.error && MESSAGES[params.error] && <p className="login-error" role="alert">{MESSAGES[params.error]}</p>}
        <ParticipantLogin next={next} google={googleConfigured()} unlock={params.unlock === "1"} canJoin={signupMode() !== "closed"} />
        {operatorReady && <details className="operator-login" open>
          <summary>운영자 로그인</summary>
          <form method="post" action="/api/session">
            <label htmlFor="password">운영자 비밀번호</label>
            <input id="password" name="password" type="password" autoComplete="current-password" required />
            <label className="remember-session"><input type="checkbox" name="remember" />로그인 유지 <small>30일</small></label>
            <button type="submit">운영자로 로그인</button>
          </form>
        </details>}
        <p className="login-links"><a href="/terms">이용약관</a> · <a href="/privacy">개인정보 처리방침</a></p>
      </section>
    </main>
  );
}
