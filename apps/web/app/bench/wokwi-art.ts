import wokwiSizes from "../../lib/parts/wokwi-pins.json";
import { findCard } from "../../lib/parts/catalog";

// 부품 카드에 Wokwi 태그가 있으면, 2D 부품 그림(@wokwi/elements, MIT)과 같은 SVG를 캔버스로 그려
// 3D 부품의 윗면 무늬로 쓴다. 2D 기판과 같은 mm 좌표라 핀 위치와 그대로 맞는다.
// 브라우저에서만 돈다. 실패하면 null (3D는 절차적 무늬로 대신한다).

type Size = { widthMm: number; heightMm: number };
const SIZES = wokwiSizes as Record<string, Size>;
const cache = new Map<string, Promise<HTMLCanvasElement | null>>();

/** wokwi 태그(예: "wokwi-arduino-uno")의 실제 크기 (mm). 모르면 null */
export function wokwiSize(tag: string): Size | null {
  return SIZES[tag.replace(/^wokwi-/, "")] ?? null;
}

/** 부품 카드의 Wokwi 태그. 없으면 undefined */
export function wokwiTagOf(catalogId?: string): string | undefined {
  const card = catalogId ? findCard(catalogId) : null;
  return card?.renderer.type === "wokwi" ? card.renderer.ref : undefined;
}

/** 상표 로고는 3D에 쓰지 않는다 (UNO 그림의 무한대 로고와 글자). 일반 "UNO" 표기는 둔다 */
function stripLogos(svg: SVGSVGElement) {
  for (const p of svg.querySelectorAll("path")) { const st = p.getAttribute("style") ?? ""; if (/stroke-width:\s*(1\.03|0\.56)\b/.test(st) && /fill:\s*none/.test(st)) p.remove(); }
  for (const t of svg.querySelectorAll("text")) if (/^\s*ARDUINO\s*$/i.test(t.textContent ?? "")) t.remove();
}

function lengthOf(v: string | null): number | null {
  if (!v) return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

async function render(tag: string, pxmm: number): Promise<HTMLCanvasElement | null> {
  const size = wokwiSize(tag);
  if (!size) return null;
  await import("@wokwi/elements");
  await customElements.whenDefined(tag);
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-10000px;top:0;width:0;height:0;overflow:hidden;pointer-events:none";
  const el = document.createElement(tag) as HTMLElement & { updateComplete?: Promise<unknown> };
  host.appendChild(el); document.body.appendChild(host);
  try {
    await el.updateComplete;
    const svg = el.shadowRoot?.querySelector("svg");
    if (!svg) { console.warn("wokwi art: no svg", tag); return null; }
    const c = svg.cloneNode(true) as SVGSVGElement;
    if (!c.getAttribute("viewBox")) {
      const w = lengthOf(svg.getAttribute("width")), h = lengthOf(svg.getAttribute("height"));
      if (!w || !h) return null;
      c.setAttribute("viewBox", `0 0 ${w} ${h}`);
    }
    c.setAttribute("preserveAspectRatio", "none");
    stripLogos(c);
    const scale = Math.min(pxmm, 2048 / size.widthMm, 2048 / size.heightMm);
    const W = Math.round(size.widthMm * scale), H = Math.round(size.heightMm * scale);
    c.setAttribute("width", String(W)); c.setAttribute("height", String(H));
    // 그림자 루트의 CSS (글자 크기 등)를 SVG 안에 넣는다
    const styles = (customElements.get(tag) as unknown as { styles?: { cssText?: string } | Array<{ cssText?: string }> } | undefined)?.styles;
    const css = (Array.isArray(styles) ? styles : styles ? [styles] : []).map((s) => s.cssText ?? "").join("\n");
    if (css) { const st = document.createElementNS("http://www.w3.org/2000/svg", "style"); st.textContent = css; c.insertBefore(st, c.firstChild); }
    const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(c));
    const img = new Image();
    img.src = url;
    await img.decode();
    const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    cv.getContext("2d")!.drawImage(img, 0, 0, W, H);
    return cv;
  } finally {
    host.remove();
  }
}

/** 태그별로 한 번만 그린다. 그리기가 8초를 넘거나 실패하면 null */
export function wokwiArt(tag: string, pxmm = 16): Promise<HTMLCanvasElement | null> {
  const key = `${tag}@${pxmm}`;
  let p = cache.get(key);
  if (!p) {
    // 모듈 불러오기는 기다리고(처음 한 번), 그리기만 시간 제한을 둔다
    p = import("@wokwi/elements")
      .then(() => Promise.race([render(tag, pxmm), new Promise<null>((r) => setTimeout(() => r(null), 8000))]))
      .catch((e) => { console.warn("wokwi art", tag, e); return null; });
    cache.set(key, p);
  }
  return p;
}
