import { headers } from "next/headers";

// 공유 미리보기(og:url, og:image)는 절대 주소여야 한다. 도메인을 바꿔도 따라가도록 요청 호스트로 만든다.
export async function siteOrigin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return process.env.APP_BASE_URL || "http://localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto.split(",")[0]}://${host}`;
}

export const FIND_TITLE = "내 도깨비불 찾기 · 달그락 대장간";
export const FIND_DESCRIPTION = "만들고 싶은 거, 아니면 요즘 귀찮은 거 하나만 줘봐. 장작을 넣어 네 도깨비불을 찾고, 닮은 메이커 프로젝트까지 보여줄게.";
export const COUPON_TEXT = process.env.FIND_COUPON_TEXT?.trim() || null;
