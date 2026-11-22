import { NextRequest, NextResponse } from "next/server";
import { getMakerProfile, saveMakerProfile } from "../../../../lib/local-project-store";
import { PersonProfileSchema } from "../../../../lib/profile-schema";
import { clientIp, hit, tooMany } from "../../../../lib/rate-limit";
import { hasValidOrigin } from "../../../../lib/request-security";
import type { MakerProfile } from "../../../../lib/project-types";
import { emptyProfile } from "../../../../lib/workflow";
import { getViewer, ownerIdOf, unauthorized, withViewerVault } from "../../../../lib/viewer";

// 계정에 붙는 제작 프로필(가진 장비, 경험, 자주 가는 메이커스페이스). 프로젝트가 하나도
// 없어도 여기서 정할 수 있어야 한다. 프로젝트 안에서만 고칠 수 있으면 "한 번 정해두고
// 계속 쓴다"가 성립하지 않는다.
const noStore = { "cache-control": "private, no-store" };

async function handleGET(request: NextRequest) {
  const viewer = await getViewer(request);
  if (!viewer) return unauthorized();
  return NextResponse.json({ profile: await getMakerProfile(ownerIdOf(viewer)) }, { headers: noStore });
}

async function handlePUT(request: NextRequest) {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  const viewer = await getViewer(request);
  if (!viewer) return unauthorized();
  const limited = hit("account", clientIp(request));
  if (!limited.ok) return tooMany(limited.retryAfterSec);
  const parsed = PersonProfileSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "제작 프로필을 확인해주세요." }, { status: 400 });
  // 핵심 동작·예산 같은 프로젝트 쪽 값은 애초에 받지 않는다(PersonProfileSchema가 strict).
  const saved = await saveMakerProfile({ ...emptyProfile(), ...parsed.data } as MakerProfile, ownerIdOf(viewer));
  return NextResponse.json({ profile: saved }, { headers: noStore });
}

export const GET = withViewerVault(handleGET);
export const PUT = withViewerVault(handlePUT);
