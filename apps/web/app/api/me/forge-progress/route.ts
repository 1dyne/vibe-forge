import { NextRequest, NextResponse } from "next/server";
import { forgeForUser, setMeta } from "../../../../lib/find/village-store";
import { progressOf } from "../../../../lib/find/progress";
import { listProjects } from "../../../../lib/local-project-store";
import { hasValidOrigin } from "../../../../lib/request-security";
import { getViewer, unauthorized, withViewerVault } from "../../../../lib/viewer";

export const dynamic = "force-dynamic";

// 대장간에서 프로젝트를 진행한 만큼 마을의 내 방이 자란다.
// 프로젝트는 본인만 열 수 있게 잠겨 있으므로, 마을에는 숫자만 내보낸다(이름·내용은 나가지 않는다).
async function handlePOST(request: NextRequest) {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  const viewer = await getViewer(request);
  if (!viewer) return unauthorized();
  if (viewer.kind !== "user") return NextResponse.json({ linked: false });
  const forge = await forgeForUser(viewer.user.id);
  if (!forge) return NextResponse.json({ linked: false });
  const progress = progressOf(await listProjects(viewer.user.id));
  await setMeta(`forge_progress:${forge.id}`, JSON.stringify(progress));
  return NextResponse.json({ linked: true, forgeId: forge.id, progress });
}

export const POST = withViewerVault(handlePOST);
