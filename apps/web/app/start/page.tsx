import type { Metadata } from "next";
import StartFlow from "./start-flow";
import "./start.css";

const title = "달그락, 이거 만들 수 있어?";
const description = "만들고 싶은 걸 한 줄로 적으면, 소프트웨어인지 하드웨어인지 알려주고 응용할 오픈소스 메이커 프로젝트를 일치율과 함께 찾아드려요.";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_BASE_URL || "http://localhost:3000"),
  title: `${title} · 달그락 대장간`,
  description,
  openGraph: { title, description, type: "website", locale: "ko_KR", images: [{ url: "/demo/poster.png" }] },
  twitter: { card: "summary_large_image", title, description, images: ["/demo/poster.png"] }
};

export default function StartPage() {
  return <StartFlow />;
}
