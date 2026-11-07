import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { fireLabel, type ReactKind } from "./chips";
import type { FireRecord } from "./store";

// 공유 이미지: 카톡 미리보기용 2:1(1200×600)과 저장·스토리용 9:16(1080×1920).
// 캐릭터는 scripts/build-dokkaebi-sprites.py가 불 색으로 돌려 둔 정지 프레임을 쓴다.

function ogDir() {
  const cwd = process.cwd();
  const workspace = path.basename(cwd) === "web" && path.basename(path.dirname(cwd)) === "apps" ? path.resolve(cwd, "../..") : cwd;
  return path.join(workspace, "apps", "web", "lib", "find", "og");
}

let fontCache: Promise<Array<{ name: string; data: Buffer; weight: 400 | 700; style: "normal" }>> | null = null;
function fonts() {
  fontCache ??= Promise.all([
    readFile(/* turbopackIgnore: true */ path.join(ogDir(), "Jua.ttf")).then((data) => ({ name: "Jua", data, weight: 400 as const, style: "normal" as const })),
    readFile(/* turbopackIgnore: true */ path.join(ogDir(), "IBMPlexSansKR-Regular.woff")).then((data) => ({ name: "Plex", data, weight: 400 as const, style: "normal" as const })),
    readFile(/* turbopackIgnore: true */ path.join(ogDir(), "IBMPlexSansKR-Bold.woff")).then((data) => ({ name: "Plex", data, weight: 700 as const, style: "normal" as const }))
  ]);
  return fontCache;
}

const spriteCache = new Map<string, Promise<string>>();
function dokkaebi(kind: string) {
  const safe = ["light", "sound", "move", "none"].includes(kind) ? kind : "none";
  if (!spriteCache.has(safe)) spriteCache.set(safe, readFile(/* turbopackIgnore: true */ path.join(ogDir(), `dokkaebi-${safe}.png`)).then((b) => `data:image/png;base64,${b.toString("base64")}`));
  return spriteCache.get(safe)!;
}

const INK = "#1E1F24", MUTED = "#62656F", SURFACE = "#F6F5F1", LINE = "#E3E0D7";
const CACHE = { "cache-control": "public, max-age=31536000, immutable" };

const GRADE_BG: Record<string, string> = { 전설: "linear-gradient(135deg, #7A55FF, #C04BD8, #FF8F3F)", 희귀: "", 흔함: "#EEECE5" };
function gradePill(fire: FireRecord, size: number) {
  const grade = fire.card?.grade;
  if (!grade) return null;
  const bg = grade === "희귀" ? fire.color : GRADE_BG[grade];
  return (
    <div style={{ display: "flex", fontFamily: "Jua", fontSize: size, color: grade === "흔함" ? MUTED : "#fff", ...(bg.startsWith("linear") ? { backgroundImage: bg } : { backgroundColor: bg }), borderRadius: size * 0.4, padding: `${size * 0.2}px ${size * 0.55}px`, letterSpacing: 2 }}>{grade}</div>
  );
}

function ownerLabel(fire: FireRecord) {
  const name = fire.nickname && fire.nickname !== "이름 없는 도깨비" ? fire.nickname : "";
  return name ? `${name}의 도깨비불` : "내 도깨비불";
}

function glow(color: string) {
  return `radial-gradient(circle at 50% 50%, ${color}55 0%, ${color}22 38%, #FFFFFF00 68%)`;
}

export async function landingOg(host: string) {
  const img = await dokkaebi("none");
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", background: "#fff", padding: "0 80px", fontFamily: "Plex" }}>
        <div style={{ width: 420, height: 420, display: "flex", alignItems: "center", justifyContent: "center", backgroundImage: glow("#4FB3A6") }}>
          <img src={img} width={340} height={340} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginLeft: 40, flex: 1 }}>
          <div style={{ fontFamily: "Jua", fontSize: 30, color: MUTED }}>달그락 대장간</div>
          <div style={{ fontFamily: "Jua", fontSize: 84, color: INK, lineHeight: 1.15, marginTop: 8 }}>내 도깨비불 찾기</div>
          <div style={{ display: "flex", marginTop: 26, background: SURFACE, border: `2px solid ${LINE}`, borderRadius: "28px 28px 28px 6px", padding: "20px 26px", fontSize: 32, color: INK, lineHeight: 1.45 }}>
            <div style={{ display: "flex", flexDirection: "column" }}><span>만들고 싶은 거, 아니면</span><span>요즘 귀찮은 거 하나만 줘봐.</span></div>
          </div>
          <div style={{ fontSize: 24, color: MUTED, marginTop: 22 }}>{host}</div>
        </div>
      </div>
    ),
    { width: 1200, height: 600, fonts: await fonts(), headers: CACHE }
  );
}

export async function fireOg(fire: FireRecord, host: string) {
  const img = await dokkaebi(fire.reactKind as ReactKind);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", background: "#fff", padding: "0 80px", fontFamily: "Plex" }}>
        <div style={{ width: 430, height: 430, display: "flex", alignItems: "center", justifyContent: "center", backgroundImage: glow(fire.color) }}>
          <img src={img} width={340} height={340} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginLeft: 36, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <span style={{ fontSize: 30, color: MUTED, letterSpacing: 2, marginRight: 16 }}>{ownerLabel(fire)}</span>
            {gradePill(fire, 30)}
          </div>
          <div style={{ display: "flex", flexDirection: "column", fontFamily: "Jua", fontSize: 72, color: INK, lineHeight: 1.18, marginTop: 6 }}>
            <span>{fire.name.split(" ")[0]}</span>
            <span>{fire.name.split(" ").slice(1).join(" ")}</span>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", marginTop: 14 }}>
            <span style={{ fontSize: 30, color: MUTED }}>화력</span>
            <span style={{ fontFamily: "Jua", fontSize: 64, color: INK, marginLeft: 14 }}>{fire.peak}</span>
            <span style={{ fontSize: 30, color: MUTED, marginLeft: 14 }}>{fireLabel(fire.peak)}</span>
          </div>
          {fire.card && <div style={{ display: "flex", fontSize: 26, color: INK, marginTop: 8 }}>{`“${fire.card.roast.head}”`}</div>}
          <div style={{ display: "flex", marginTop: 20, alignSelf: "flex-start", background: fire.color, borderRadius: 999, padding: "14px 28px", fontFamily: "Jua", fontSize: 34, color: INK }}>너의 도깨비불은?</div>
          <div style={{ fontSize: 22, color: MUTED, marginTop: 18 }}>{`달그락 대장간 · ${host}`}</div>
        </div>
      </div>
    ),
    { width: 1200, height: 600, fonts: await fonts(), headers: CACHE }
  );
}

export async function fireCard(fire: FireRecord, host: string) {
  const img = await dokkaebi(fire.reactKind as ReactKind);
  const [first, ...rest] = fire.name.split(" ");
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", background: "#fff", padding: "120px 90px 90px", fontFamily: "Plex" }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <span style={{ fontSize: 40, color: MUTED, letterSpacing: 4, marginRight: 22 }}>{ownerLabel(fire)}</span>
          {gradePill(fire, 42)}
        </div>
        <div style={{ width: 700, height: 700, marginTop: 30, display: "flex", alignItems: "center", justifyContent: "center", backgroundImage: glow(fire.color) }}>
          <img src={img} width={560} height={560} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", fontFamily: "Jua", fontSize: 104, color: INK, lineHeight: 1.18, marginTop: 20 }}>
          <span>{first}</span>
          <span>{rest.join(" ")}</span>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", marginTop: 30 }}>
          <span style={{ fontSize: 40, color: MUTED }}>화력</span>
          <span style={{ fontFamily: "Jua", fontSize: 110, color: INK, marginLeft: 20 }}>{fire.peak}</span>
          <span style={{ fontSize: 40, color: MUTED, marginLeft: 20 }}>{fireLabel(fire.peak)}</span>
        </div>
        {fire.card ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 34, width: "100%" }}>
            {(fire.card.rarityLine || fire.card.peakLine) && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", background: INK, color: "#fff", borderRadius: 28, padding: "22px 30px", fontSize: 34, width: "100%" }}>
                {fire.card.rarityLine && <span>{fire.card.rarityLine}</span>}
                {fire.card.peakLine && <span style={{ fontWeight: 700, marginTop: 6 }}>{fire.card.peakLine}</span>}
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", background: SURFACE, border: `2px solid ${LINE}`, borderRadius: "10px 40px 40px 40px", padding: "26px 34px", marginTop: 28, width: "100%" }}>
              <span style={{ fontSize: 30, color: MUTED }}>도깨비 한 줄 평</span>
              <span style={{ fontFamily: "Jua", fontSize: 46, color: INK, marginTop: 8 }}>{fire.card.roast.head}</span>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", marginTop: 34, maxWidth: 900 }}>
            {fire.labels.slice(0, 4).map((label) => (
              <div key={label} style={{ display: "flex", fontSize: 36, color: INK, border: `2px solid ${LINE}`, borderRadius: 999, padding: "12px 28px", margin: 8 }}>{label}</div>
            ))}
          </div>
        )}
        <div style={{ flex: 1, display: "flex" }} />
        <div style={{ width: "100%", borderTop: `3px solid ${LINE}`, paddingTop: 34, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontFamily: "Jua", fontSize: 46, color: INK }}>달그락 대장간</span>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
            <span style={{ fontSize: 34, color: INK, fontWeight: 700 }}>너의 도깨비불은?</span>
            <span style={{ fontSize: 30, color: MUTED }}>{`${host}/f/${fire.id}`}</span>
          </div>
        </div>
      </div>
    ),
    { width: 1080, height: 1920, fonts: await fonts(), headers: CACHE }
  );
}

export async function forgeOg(input: { nickname: string; alley: string; plotNo: number; fires: number; color: string; reactKind: string }, host: string) {
  const img = await dokkaebi(input.reactKind as ReactKind);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", background: "#fff", padding: "0 80px", fontFamily: "Plex" }}>
        <div style={{ width: 430, height: 430, display: "flex", alignItems: "center", justifyContent: "center", backgroundImage: glow(input.color) }}>
          <img src={img} width={330} height={330} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginLeft: 36, flex: 1 }}>
          <div style={{ fontSize: 30, color: MUTED }}>{input.alley}</div>
          <div style={{ display: "flex", flexDirection: "column", fontFamily: "Jua", fontSize: 74, color: INK, lineHeight: 1.18, marginTop: 8 }}>
            <span>{`${input.nickname}의`}</span>
            <span>대장간</span>
          </div>
          <div style={{ fontSize: 30, color: MUTED, marginTop: 14 }}>{`도깨비불 ${input.fires}개가 머무는 중`}</div>
          <div style={{ display: "flex", marginTop: 22, alignSelf: "flex-start", background: input.color, borderRadius: 999, padding: "14px 28px", fontFamily: "Jua", fontSize: 34, color: INK }}>놀러 와!</div>
          <div style={{ fontSize: 22, color: MUTED, marginTop: 18 }}>{`달그락 대장간 · ${host}`}</div>
        </div>
      </div>
    ),
    { width: 1200, height: 600, fonts: await fonts(), headers: { "cache-control": "public, max-age=600" } }
  );
}

