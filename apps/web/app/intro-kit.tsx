"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

/** 화면에 들어오면 부드럽게 나타난다. kind로 방향을, delay로 차례를 준다 */
export function Reveal({ children, kind = "", delay = 0, as: Tag = "div", className = "" }: { children: ReactNode; kind?: "" | "left" | "right" | "pop"; delay?: number; as?: "div" | "article" | "figure" | "li"; className?: string }) {
  const ref = useRef<HTMLElement | null>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    if (typeof IntersectionObserver === "undefined") { setSeen(true); return; }
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect(); } }, { threshold: 0.16, rootMargin: "0px 0px -6% 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const Any = Tag as "div";
  return <Any ref={ref as never} className={`rv ${kind} ${seen ? "in" : ""} ${className}`} style={{ ["--d" as string]: `${delay}ms` }}>{children}</Any>;
}

export function Shot({ src, alt, caption, kind }: { src: string; alt: string; caption: string; kind?: "left" | "right" | "pop" }) {
  return <Reveal as="figure" kind={kind ?? "pop"} className="shot"><img src={src} alt={alt} loading="lazy" /><figcaption>{caption}</figcaption></Reveal>;
}

/** 첫 화면을 지나면 아래에 붙어 따라오는 버튼 */
export function StickyCta({ children }: { children: ReactNode }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const on = () => setShow(window.scrollY > window.innerHeight * 0.7);
    on(); window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return <div className={`sticky-cta ${show ? "show" : ""}`}>{children}</div>;
}

export type DeviceOs = "ios" | "android" | "desktop";
export function useDeviceOs(): DeviceOs {
  const [os, setOs] = useState<DeviceOs>("desktop");
  useEffect(() => { const ua = navigator.userAgent; setOs(/iPhone|iPad|iPod/i.test(ua) ? "ios" : /Android/i.test(ua) ? "android" : "desktop"); }, []);
  return os;
}
/** 카카오톡·인스타그램 같은 앱 속 브라우저. 여기서는 구글 로그인이 막힌다 */
export function useInAppBrowser(): string | null {
  const [app, setApp] = useState<string | null>(null);
  useEffect(() => { const ua = navigator.userAgent; setApp(/KAKAOTALK/i.test(ua) ? "카카오톡" : /Instagram/i.test(ua) ? "인스타그램" : /NAVER\(inapp/i.test(ua) ? "네이버 앱" : /FBAN|FBAV/i.test(ua) ? "페이스북" : /Line\//i.test(ua) ? "라인" : null); }, []);
  return app;
}

/** 온보딩에서 들고 온 아이디어 쪽지(?seed=)를 가입이 끝날 때까지 이 브라우저에 맡겨 둔다 */
export function SeedKeeper({ seed }: { seed?: string | null }) {
  useEffect(() => { try { const value = seed ?? new URLSearchParams(window.location.search).get("seed"); if (value) localStorage.setItem("dalgrak_seed", value); } catch { /* 없어도 가입은 된다 */ } }, [seed]);
  return null;
}

/** 홈 화면에 추가하는 법. 지금 기기에 맞는 탭이 먼저 열린다 */
export function Install() {
  const os = useDeviceOs();
  const [tab, setTab] = useState<DeviceOs>(os);
  useEffect(() => setTab(os), [os]);
  return <div className="install">
    <div className="os-tabs" role="tablist">{(["ios", "android", "desktop"] as DeviceOs[]).map((t) => <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>{t === "ios" ? "아이폰" : t === "android" ? "안드로이드" : "컴퓨터"}</button>)}</div>
    {tab === "ios" && <ol><li><b>사파리</b>로 dalgrak.app을 열어요. (다른 앱 안에서 열렸다면 사파리로 다시 열어요.)</li><li>아래 가운데의 <kbd>공유</kbd> 버튼(네모에서 화살표가 올라가는 모양)을 눌러요.</li><li>목록을 내려 <kbd>홈 화면에 추가</kbd>를 누르고 <kbd>추가</kbd>를 눌러요.</li><li>홈 화면의 달그락 아이콘으로 앱처럼 열려요.</li></ol>}
    {tab === "android" && <ol><li><b>크롬</b>으로 dalgrak.app을 열어요.</li><li>오른쪽 위 <kbd>⋮</kbd>를 누르고 <kbd>홈 화면에 추가</kbd> 또는 <kbd>앱 설치</kbd>를 눌러요.</li><li><kbd>설치</kbd>를 누르면 홈 화면에 달그락 아이콘이 생겨요.</li></ol>}
    {tab === "desktop" && <ol><li>크롬이나 엣지로 dalgrak.app을 열어요.</li><li>주소창 오른쪽의 <kbd>설치</kbd> 아이콘(모니터에 화살표)을 눌러요.</li><li>달그락과 대화하려면 여기서 연결 프로그램도 켜요. 대장간 입력창에 켜는 방법이 그림과 함께 나와요.</li></ol>}
    <p style={{ margin: "12px 0 0", fontSize: 14, color: "#4d4840" }}>앱스토어에서 받는 앱이 아니라, 웹을 홈 화면에 올려 두는 방식이에요. 설치해도 저장 공간을 거의 쓰지 않아요.</p>
  </div>;
}

