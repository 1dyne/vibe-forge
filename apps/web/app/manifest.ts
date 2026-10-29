import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "달그락 대장간",
    short_name: "달그락",
    description: "아이디어에서 실물 제작까지 함께 판단하는 제작 에이전트",
    lang: "ko",
    start_url: "/",
    display: "standalone",
    background_color: "#EDEEF0",
    theme_color: "#94D2C9",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
    ]
  };
}
