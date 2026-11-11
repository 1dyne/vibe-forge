import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ownerHashFromRequest } from "../../../../lib/find/owner";
import { answeredOn, questionOfDay, saveAnswer } from "../../../../lib/find/question";
import { allow, clientKey } from "../../../../lib/find/rate-limit";
import { hasValidOrigin } from "../../../../lib/request-security";
import { forgeFires, forgeForOwner } from "../../../../lib/find/village-store";
import { houseStage } from "../../../../lib/find/village";

// 도깨비의 질문은 주인만: 하루 한 번, 화덕 앞에서
async function owner(request: NextRequest) { const h = ownerHashFromRequest(request); return h ? forgeForOwner(h) : null; }
const noStore = { "cache-control": "no-store" };

export async function GET(request: NextRequest) {
  const forge = await owner(request);
  if (!forge) return NextResponse.json({ error: "내 대장간에서만 볼 수 있어." }, { status: 403 });
  if (await answeredOn(forge.id)) return NextResponse.json({ question: null, answered: true }, { headers: noStore });
  return NextResponse.json({ question: questionOfDay(await forgeFires(forge.id)), answered: false }, { headers: noStore });
}

const Answer = z.object({ fireId: z.string().regex(/^[A-Za-z0-9_-]{4,40}$/), chipId: z.string().regex(/^[a-z0-9_]{2,30}$/) }).strict();
export async function POST(request: NextRequest) {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  if (!allow("find-question", clientKey(request), 20)) return NextResponse.json({ error: "잠깐 쉬었다 해줘." }, { status: 429 });
  const forge = await owner(request);
  if (!forge) return NextResponse.json({ error: "내 대장간에서만 답할 수 있어." }, { status: 403 });
  const parsed = Answer.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const fires = await forgeFires(forge.id);
  const q = questionOfDay(fires);
  // 오늘 받은 질문의 선택지만 받는다
  if (!q || q.fireId !== parsed.data.fireId || !q.options.some((o) => o.id === parsed.data.chipId)) return NextResponse.json({ error: "오늘의 질문이 바뀌었어. 다시 열어줘." }, { status: 409 });
  const fire = fires.find((f) => f.id === q.fireId)!;
  const before = houseStage(fires.flatMap((f) => f.picked));
  const grown = await saveAnswer(forge.id, fire, parsed.data.chipId!);
  if (!grown) return NextResponse.json({ error: "오늘은 이미 답했어. 내일 또 물어볼게." }, { status: 409 });
  const after = houseStage(fires.map((f) => (f.id === grown.id ? grown : f)).flatMap((f) => f.picked));
  return NextResponse.json({ fire: { id: grown.id, sentence: grown.sentence, labels: grown.labels, peak: grown.peak }, stageUp: after > before ? after : null });
}
