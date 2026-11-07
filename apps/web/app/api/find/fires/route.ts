import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ChipSchema, IdeaSchema } from "../../../../lib/find/api-schema";
import { FIRE, REACT_FIRE, ROOTS, compose, fireName, reactKind, type Chip } from "../../../../lib/find/chips";
import { assessMaturity } from "../../../../lib/find/maturity";
import { buildCard, comboKey } from "../../../../lib/find/card";
import { cleanNickname } from "../../../../lib/find/nickname";
import { newOwnerToken, ownerTokenFrom, OWNER_COOKIE, setOwnerCookie } from "../../../../lib/find/owner";
import { alleyName, plotLine } from "../../../../lib/find/village";
import { ensureForge, hashToken } from "../../../../lib/find/village-store";
import { matchProjects, uniqueToIdea } from "../../../../lib/find/projects";
import { fireRarity, newId, saveFire } from "../../../../lib/find/store";
import { allow, clientKey } from "../../../../lib/find/rate-limit";
import { hasValidOrigin } from "../../../../lib/request-security";

const Body = z.object({
  idea: IdeaSchema,
  picked: z.array(ChipSchema).min(1).max(24),
  peak: z.number().min(0).max(FIRE.max),
  nickname: z.string().max(40).optional()
}).strict();

// "이 불로 할래!" — 고른 장작으로 문장·이름·닮은 프로젝트를 만들고 공유 링크(/f/:id)를 발급한다.
export async function POST(request: NextRequest) {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  if (!allow("find-fire", clientKey(request), 20)) return NextResponse.json({ error: "잠깐 쉬었다 다시 해줘." }, { status: 429 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "장작을 하나 이상 넣어줘." }, { status: 400 });
  const { idea, peak } = parsed.data;
  const chips = new Map<string, Chip>();
  for (const c of parsed.data.picked) chips.set(c.id, c as Chip);
  const ids = [...chips.keys()];
  const find = (id: string) => chips.get(id);
  const kind = reactKind(ids, find);
  const matches = matchProjects(ids, find);
  const key = comboKey(ids);
  let rarity = { total: 0, sameCombo: 0, higherPeak: 0 };
  try {
    rarity = await fireRarity(key, Math.round(peak));
  } catch (error) {
    console.error("find rarity failed", error instanceof Error ? error.message : "unknown");
  }
  const card = buildCard([...chips.values()], Math.round(peak), rarity, matches);
  const nickname = cleanNickname(parsed.data.nickname);
  // 이 기기의 대장간: 처음이면 장작과 맞는 골목의 다음 빈 터에 짓고, 있으면 선반에 불을 하나 더 얹는다
  const existingToken = ownerTokenFrom(request.cookies.get(OWNER_COOKIE)?.value);
  const token = existingToken ?? newOwnerToken();
  let forge: Awaited<ReturnType<typeof ensureForge>> | null = null;
  try {
    forge = await ensureForge(hashToken(token), nickname, ids);
  } catch (error) {
    console.error("find forge failed", error instanceof Error ? error.message : "unknown");
  }
  const fire = {
    id: newId(),
    idea,
    sentence: compose(ids, find),
    picked: ids,
    labels: ids.map((id) => chips.get(id)!.label),
    peak: Math.round(peak),
    color: REACT_FIRE[kind],
    reactKind: kind,
    name: fireName(ids, find),
    matches: matches.map((m) => ({ id: m.id, match: m.match })),
    comboKey: key,
    card,
    nickname,
    forgeId: forge?.forge.id ?? null,
    createdAt: new Date().toISOString()
  };
  try {
    await saveFire(fire);
  } catch (error) {
    console.error("find fire save failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "불을 저장하지 못했어. 잠시 후 다시 해줘." }, { status: 500 });
  }
  const unique = uniqueToIdea(ids, find, matches);
  const followIds = new Set(ids.filter((id) => !ROOTS.some((r) => r.id === id)));
  const maturity = assessMaturity([...chips.values()], followIds, matches, unique);
  const f = forge?.forge;
  const forgeSummary = f ? {
    id: f.id, isNew: forge!.isNew, alley: alleyName(f.theme, f.alleySeq), plotNo: f.plotNo,
    line: forge!.isNew ? plotLine(f.theme, f.alleySeq, f.plotNo, forge!.left) : `${alleyName(f.theme)}에 있는 네 대장간`
  } : null;
  const response = NextResponse.json({ fire, matches, unique, maturity, forge: forgeSummary }, { status: 201 });
  if (!existingToken && f) setOwnerCookie(response, token);
  return response;
}
