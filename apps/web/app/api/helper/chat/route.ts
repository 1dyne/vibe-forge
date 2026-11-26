import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { MAX_IMAGES, MAX_IMAGE_CHARS, RelayError, enqueueJob, helperStatus } from "../../../../lib/helper-relay";
import { getProject, mutateProject } from "../../../../lib/local-project-store";
import { hit } from "../../../../lib/rate-limit";
import { hasValidOrigin } from "../../../../lib/request-security";
import { canAccess, getViewer, notFound, unauthorized, withViewerVault } from "../../../../lib/viewer";

export const dynamic = "force-dynamic";

const Body = z.object({ projectId: z.string().uuid().nullish(), text: z.string().trim().min(1).max(4000), channel: z.enum(["main", "chief", "hwlead", "hw", "sw", "me", "id"]).default("main"), model: z.string().min(1).max(80).nullish(), images: z.array(z.object({ name: z.string().max(120).default("사진"), dataUrl: z.string().max(MAX_IMAGE_CHARS).regex(/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/) }).strict()).max(MAX_IMAGES).optional(), retry: z.boolean().optional() }).strict();

// 화면(휴대폰이든 PC든)에서 한 말을 그 사람 컴퓨터의 연결 앱에게 넘긴다.
// AI 호출은 연결 앱이 그 사람의 ChatGPT 요금제로 하므로 여기서는 비용을 세지 않는다.
async function handlePOST(request: NextRequest) {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  const viewer = await getViewer(request);
  if (!viewer) return unauthorized();
  if (viewer.kind !== "user") return NextResponse.json({ error: "연결 앱 대화는 참여자 계정에서 쓸 수 있어요." }, { status: 403 });
  if (!hit("mcp", `helper-chat:${viewer.user.id}`).ok) return NextResponse.json({ error: "요청이 너무 많아요. 잠시 후 다시 시도해주세요." }, { status: 429 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "메시지는 4,000자 이내, 사진은 3장까지 보낼 수 있어요." }, { status: 400 });
  const input = parsed.data;
  if (!helperStatus(viewer.user.id).online) return NextResponse.json({ error: "컴퓨터의 달그락 연결 앱이 꺼져 있어요. 연결 앱을 켜면 여기서 바로 대화할 수 있어요.", code: "offline" }, { status: 409 });
  let project = input.projectId ? await getProject(input.projectId) : null;
  if (input.projectId && (!project || !canAccess(viewer, project))) return notFound();
  const images = (input.images ?? []).map((image) => ({ name: image.name ?? "사진", dataUrl: image.dataUrl as string }));
  try {
    // 말을 먼저 기록하고 넘긴다. 연결 앱은 일을 받을 때 기록을 함께 읽는다.
    // 다시 보내기: 방금 기록한 같은 말이 끝자락에 있으면 한 번 더 적지 않는다.
    // 맨 끝만 보면 안 된다. 답이 기록된 뒤에 받기만 끊긴 경우에는 그 답이 맨 끝이고, 내 말은 그 앞에 있다.
    const recorded = (text: string) => !!input.retry && project!.messages.filter((m) => (m.channel ?? "main") === input.channel).slice(-4).some((m) => m.role === "user" && m.text === text);
    if (project && !recorded(images.length ? `${input.text}\n\n(사진 ${images.length}장을 함께 보냈어요)` : input.text)) project = await mutateProject(project.id, (p) => { p.messages.push({ id: randomUUID(), role: "user", channel: input.channel, text: images.length ? `${input.text}\n\n(사진 ${images.length}장을 함께 보냈어요)` : input.text, createdAt: new Date().toISOString() }); });
    const job = enqueueJob({ userId: viewer.user.id, projectId: project?.id ?? null, channel: input.channel, text: input.text, model: input.model ?? null, images });
    return NextResponse.json({ jobId: job.id, project });
  } catch (error) {
    if (error instanceof RelayError) return NextResponse.json({ error: error.message, code: error.code }, { status: 409 });
    throw error;
  }
}

export const POST = withViewerVault(handlePOST);
