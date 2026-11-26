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
