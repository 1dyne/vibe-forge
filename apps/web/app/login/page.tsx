import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession } from "../../lib/session";
import { signupMode } from "../../lib/policies";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ setup?: string; error?: string }> }) {
  const params = await searchParams;
  const configured = Boolean(process.env.APP_PASSWORD && process.env.SESSION_SECRET);
  if (configured && await verifySession((await cookies()).get("dalgeurak_session")?.value, process.env.SESSION_SECRET)) redirect("/");
  return (
    <main className="login-shell">
      <section className="login-card">
        <img src="/characters/idle.png" alt="대장 달그락" width="85" height="85" style={{ objectFit: "contain" }} />
        <p className="eyebrow">나만의 제작 작업 공간</p>
        <h1>달그락 대장간</h1>
        <p>{!configured ? "로그인 준비 중이에요. 관리자에게 접근 설정을 확인해주세요." : "아이디어를 이어서 만들어볼까요?\n운영자는 접근 비밀번호로 로그인해주세요."}</p>
        {params.error === "link" ? <p className="login-error" role="alert">개인 링크가 올바르지 않거나 사용이 중지됐어요. 링크를 다시 확인하거나 새로 가입해주세요.</p> : params.error === "slow" ? <p className="login-error" role="alert">시도가 너무 많아요. 15분 뒤 다시 시도해주세요.</p> : params.error ? <p className="login-error" role="alert">비밀번호가 맞지 않습니다. 다시 입력해주세요.</p> : null}
        <p className="login-note">참여자는 비밀번호 없이 <b>내 대시보드 링크</b>로 들어와요.{signupMode() !== "closed" && <> 처음이라면 <a href="/join">가입하기</a>.</>}</p>
        <form method="post" action="/api/session">
          <label htmlFor="password">운영자 비밀번호</label>
          <input id="password" name="password" type="password" autoComplete="current-password" autoFocus required disabled={!configured} />
          <label className="remember-session"><input type="checkbox" name="remember" disabled={!configured} />로그인 유지 <small>30일 · 내 기기에서 사용</small></label>
          <button type="submit" disabled={!configured}>내 대장간에 로그인</button>
        </form>
        <p className="login-links"><a href="/terms">이용약관</a> · <a href="/privacy">개인정보 처리방침</a></p>
      </section>
    </main>
  );
}
