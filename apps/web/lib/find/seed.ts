import { createHmac, timingSafeEqual } from "node:crypto";
import type { MakerKind } from "./classify";

// 온보딩에서 스케치한 아이디어를 가입한 뒤의 대장간으로 들고 가는 쪽지.
// 온보딩 주소와 대장간 주소가 달라도(쿠키가 따로여도) 이어지도록, 서버가 서명한 글자로 넘긴다.
// 들어 있는 것: 아이디어, 달그락 종류, 받아 적은 한 줄, (있으면) 도깨비불과 대장간.
export type Seed = { idea: string; kind: MakerKind; sentence: string; fireId: string | null; fireName: string | null; forgeId: string | null; at: number };

const key = () => process.env.SESSION_SECRET || "dev-only-seed-secret";
const sign = (body: string) => createHmac("sha256", key()).update(`find-seed:${body}`).digest("base64url");
const WEEK = 7 * 24 * 60 * 60 * 1000;

export function makeSeed(seed: Omit<Seed, "at">, now = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ ...seed, idea: seed.idea.slice(0, 300), sentence: seed.sentence.slice(0, 300), at: now })).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function readSeed(token: string | null | undefined, now = Date.now()): Seed | null {
  if (!token || token.length > 4000) return null;
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const expected = Buffer.from(sign(body)); const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const seed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Seed;
    if (typeof seed.idea !== "string" || !seed.idea.trim() || typeof seed.at !== "number" || now - seed.at > WEEK) return null;
    return seed;
  } catch { return null; }
}
