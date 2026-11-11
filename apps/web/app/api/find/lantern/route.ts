import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createLantern, forgeLanterns, getLantern, groupKeyOf, lanternAllowance, lanternTextProblem, markDone, publicLanternGroups, removeLantern, setMaker, TARGET_MAX, WISH_MAX } from "../../../../lib/find/lantern";
import { ownerHashFromRequest } from "../../../../lib/find/owner";
import { allow, clientKey } from "../../../../lib/find/rate-limit";
import { hasValidOrigin } from "../../../../lib/request-security";
import { forgeFires, forgeForOwner } from "../../../../lib/find/village-store";

async function me(request: NextRequest) {
  const hash = ownerHashFromRequest(request);
  return hash ? forgeForOwner(hash) : null;
}

/** 마을의 소원 줄들 + (내 대장간이 있으면) 내 등불과 남은 개수 */
export async function GET(request: NextRequest) {
  const forge = await me(request);
  const groups = await publicLanternGroups(forge?.id ?? null);
  if (!forge) return NextResponse.json({ groups, mine: null }, { headers: { "cache-control": "no-store" } });
  const [mine, fires] = await Promise.all([forgeLanterns(forge.id), forgeFires(forge.id)]);
  return NextResponse.json({ groups, mine: { lanterns: mine, allowance: lanternAllowance(fires.length) } }, { headers: { "cache-control": "no-store" } });
}

const Create = z.object({
  fireId: z.string().regex(/^[A-Za-z0-9_-]{4,40}$/),
  target: z.string().max(40),
  wish: z.string().max(80),
  hideTarget: z.boolean().optional(),
  private: z.boolean().optional(),
  shareCard: z.boolean().optional()
}).strict();

/** 등불 걸기: 내 도깨비불 하나에 '누구를 위해 · 기원 한 줄' */
export async function POST(request: NextRequest) {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  if (!allow("find-lantern", clientKey(request), 10)) return NextResponse.json({ error: "잠깐 쉬었다 해줘." }, { status: 429 });
  const forge = await me(request);
  if (!forge) return NextResponse.json({ error: "need_forge", message: "너만의 도깨비불부터 찾아야 등불을 걸 수 있어." }, { status: 403 });
  const parsed = Create.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const b = parsed.data;
  const problem = lanternTextProblem(b.target!, TARGET_MAX, "누구를 위해") ?? lanternTextProblem(b.wish!, WISH_MAX, "기원 한 줄");
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  const [fires, mine] = await Promise.all([forgeFires(forge.id), forgeLanterns(forge.id)]);
  const fire = fires.find((f) => f.id === b.fireId);
  if (!fire) return NextResponse.json({ error: "내 대장간 도깨비불에만 등불을 걸 수 있어." }, { status: 400 });
  if (mine.length >= lanternAllowance(fires.length)) return NextResponse.json({ error: "등불을 다 걸었어. 새 도깨비불을 찾으면 하나 더 걸 수 있어." }, { status: 400 });
  const lantern = await createLantern({
    forgeId: forge.id, fireId: fire.id, target: b.target!.trim(), wish: b.wish!.trim(),
    hideTarget: Boolean(b.hideTarget), private: Boolean(b.private), shareCard: Boolean(b.shareCard), groupKey: groupKeyOf(fire.picked)
  });
  return NextResponse.json({ lantern }, { status: 201 });
}

const Patch = z.object({ id: z.string().regex(/^[A-Za-z0-9_-]{4,20}$/), action: z.enum(["done", "remove", "make", "unmake"]) }).strict();

/** 내 등불: 이뤄졌어(호수에 띄우기)·내리기 / 남의 등불: 만들어볼게·그만두기 */
export async function PATCH(request: NextRequest) {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  if (!allow("find-lantern-patch", clientKey(request), 30)) return NextResponse.json({ error: "잠깐 쉬었다 해줘." }, { status: 429 });
  const forge = await me(request);
  if (!forge) return NextResponse.json({ error: "need_forge", message: "너만의 도깨비불부터 찾아야 해." }, { status: 403 });
  const parsed = Patch.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const lantern = await getLantern(parsed.data.id!);
  if (!lantern) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { action } = parsed.data;
  const own = lantern.forgeId === forge.id;
  if ((action === "done" || action === "remove") && !own) return NextResponse.json({ error: "내 등불만 바꿀 수 있어." }, { status: 403 });
  if ((action === "make" || action === "unmake") && own) return NextResponse.json({ error: "내 등불은 내가 이미 만드는 중이야." }, { status: 400 });
  if (action === "done") await markDone(lantern.id);
  if (action === "remove") await removeLantern(lantern.id);
  if (action === "make" || action === "unmake") await setMaker(lantern.id, forge.id, action === "make");
  return NextResponse.json({ ok: true, groups: await publicLanternGroups(forge.id) });
}
