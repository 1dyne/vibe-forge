import type { Metadata } from "next";
import { COUPON_TEXT, FIND_DESCRIPTION, FIND_TITLE, siteOrigin } from "../../lib/find/site";
import FindFlow from "./find-flow";
import "./fonts";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const origin = await siteOrigin();
  // 카톡 미리보기는 2:1. 이미지 주소가 바뀌어야 카톡 캐시가 갱신되므로 버전을 붙인다.
  const image = `${origin}/find/og.png?v=1`;
  return {
    title: FIND_TITLE,
    description: FIND_DESCRIPTION,
    metadataBase: new URL(origin),
    alternates: { canonical: `${origin}/find` },
    openGraph: { title: "내 도깨비불 찾기", description: FIND_DESCRIPTION, url: `${origin}/find`, siteName: "달그락 대장간", type: "website", locale: "ko_KR", images: [{ url: image, width: 1200, height: 600, alt: "달그락 대장간 도깨비불" }] },
    twitter: { card: "summary_large_image", title: "내 도깨비불 찾기", description: FIND_DESCRIPTION, images: [image] }
  };
}

export default function FindPage() {
  return <FindFlow couponText={COUPON_TEXT} />;
}
