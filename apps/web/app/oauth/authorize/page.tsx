import { cookies } from "next/headers";
import { getClient } from "../../../lib/oauth";
import { userTokenFrom } from "../../../lib/session";
import { findUserByToken } from "../../../lib/users";
import Consent from "./consent";

export const dynamic = "force-dynamic";
export const metadata = { title: "연결 허용 · 달그락 대장간", robots: { index: false } };

type Params = { response_type?: string; client_id?: string; redirect_uri?: string; code_challenge?: string; code_challenge_method?: string; state?: string };

function Problem({ text }: { text: string }) {
  return <main className="login-shell"><section className="login-card"><h1>달그락 대장간</h1><p className="login-error" role="alert">{text}</p><p className="login-links"><a href="/">대장간으로</a></p></section></main>;
}

// OAuth authorization endpoint: the participant, signed in with their own
// link, allows one app (claude.ai, Claude Code…) to use their 달그락 records.
export default async function AuthorizePage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const client = params.client_id ? await getClient(params.client_id) : null;
  if (!client) return <Problem text="연결을 요청한 앱을 확인할 수 없어요. Claude에서 커넥터 연결을 다시 시작해주세요." />;
  if (!params.redirect_uri || !client.redirectUris.includes(params.redirect_uri)) return <Problem text="돌아갈 주소가 등록된 주소와 달라요. 안전을 위해 연결을 멈췄어요." />;
  if (params.response_type !== "code" || params.code_challenge_method !== "S256" || !/^[A-Za-z0-9_-]{43}$/.test(params.code_challenge ?? "")) return <Problem text="지원하지 않는 연결 방식이에요(PKCE S256 필요)." />;
  const token = userTokenFrom((await cookies()).get("dalgeurak_session")?.value);
  const user = token ? await findUserByToken(token) : null;
  return <main className="login-shell"><section className="login-card join-card">
    <img src="/characters/idle.png" alt="대장 달그락" width="85" height="85" style={{ objectFit: "contain" }} />
    <p className="eyebrow">커넥터 연결</p>
    <h1>달그락 대장간</h1>
    <Consent
      signedInAs={user?.name ?? null}
      clientName={client.name}
      redirectHost={new URL(params.redirect_uri).host}
      request={{ client_id: client.id, redirect_uri: params.redirect_uri, code_challenge: params.code_challenge!, state: params.state ?? "" }}
    />
  </section></main>;
}
