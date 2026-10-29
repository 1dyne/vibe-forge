import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession } from "../../lib/session";

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
        <p>{!configured ? "로그인 준비 중이에요. 관리자에게 접근 설정을 확인해주세요." : "아이디어를 이어서 만들어볼까요?\n접근 비밀번호로 로그인해주세요."}</p>
        {params.error ? <p className="login-error" role="alert">비밀번호가 맞지 않습니다. 다시 입력해주세요.</p> : null}
        <form method="post" action="/api/session">
          <label htmlFor="password">접근 비밀번호</label>
          <input id="password" name="password" type="password" autoComplete="current-password" autoFocus required disabled={!configured} />
          <label className="remember-session"><input type="checkbox" name="remember" disabled={!configured} />로그인 유지 <small>30일 · 내 기기에서 사용</small></label>
          <button type="submit" disabled={!configured}>내 대장간에 로그인</button>
        </form>
      </section>
    </main>
  );
}
