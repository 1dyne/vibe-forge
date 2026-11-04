import { NextRequest, NextResponse } from "next/server";
import { AccountError, googleSignIn, unlockToken } from "../../../../../lib/account-service";
import { audit } from "../../../../../lib/audit";
import { UNLOCK_COOKIE, clearCookie, origin, setAccountCookie } from "../../../../../lib/auth-http";
import { GOOGLE_COOKIE, finishGoogle, unpackState } from "../../../../../lib/google";
import { signupMode } from "../../../../../lib/policies";
import { publicUrl } from "../../../../../lib/request-security";

const back = (request: NextRequest, path: string) => clearCookie(NextResponse.redirect(publicUrl(request, path), 303), GOOGLE_COOKIE);

export async function GET(request: NextRequest) {
  const state = unpackState(request.cookies.get(GOOGLE_COOKIE)?.value);
  const params = request.nextUrl.searchParams;
  if (!state || params.get("state") !== state.state) return back(request, "/login?error=google_state");
  if (params.get("error") || !params.get("code")) return back(request, "/login?error=google_cancel");
  try {
    const profile = await finishGoogle(origin(request), params.get("code")!, state.verifier);
    const signup = state.intent === "signup" && state.agreed ? { agreed: true, name: state.name, inviteCode: signupMode() === "invite" ? state.inviteCode ?? "" : undefined } : null;
    const result = await googleSignIn(profile, signup);
    if (result.kind === "needs_signup") return back(request, signupMode() === "closed" ? "/login?error=google_noaccount" : "/join?google=consent");
    if (result.kind === "unlock") {
      const response = back(request, `/login?unlock=1&next=${encodeURIComponent(state.next ?? "/")}`);
      response.cookies.set(UNLOCK_COOKIE, await unlockToken(result.userId), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/auth/unlock", maxAge: 600 });
      return response;
    }
    await audit("login", { userId: result.user.id, note: "google" });
    return setAccountCookie(back(request, state.next ?? "/"), result.secret, result.maxAgeMs);
  } catch (error) {
    if (error instanceof AccountError) return back(request, `/login?error=${error.status === 409 ? "google_taken" : error.status === 403 ? "google_signup" : "google"}`);
    console.error("google sign-in failed", error instanceof Error ? error.message : "unknown error");
    return back(request, "/login?error=google");
  }
}
