import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { viewerFromCookie } from "../../lib/viewer";

export const dynamic = "force-dynamic";

// ── MEETUP: 밋업 참가자가 여는 주소. 밋업이 끝나면 지운다 ──
// 가입한 사람은 시연용 '사만다 재고 저울' 프로젝트로, 아직 가입하지 않은 사람은 가입 화면으로 보낸다.
// 가입을 마치면 다시 여기로 돌아와 프로젝트가 생긴다.
export default async function Meetup() {
  const viewer = await viewerFromCookie((await cookies()).get("dalgeurak_session")?.value);
  redirect(viewer ? "/api/meetup/start" : "/join?next=/meetup");
}
