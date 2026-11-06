import { NextRequest, NextResponse } from "next/server";
import { audit } from "../../../../lib/audit";
import { exportOwnerData } from "../../../../lib/local-project-store";
import { getViewer, unauthorized, withViewerVault } from "../../../../lib/viewer";
import { publicProject } from "../../../../lib/workspaces";

// The participant's own records as one JSON file (data portability).
async function handleGET(request: NextRequest) {
  const viewer = await getViewer(request);
  if (!viewer || viewer.kind !== "user") return unauthorized();
  const exported = await exportOwnerData(viewer.user.id);
  // The routine token is a credential, not a record: leave it out of the file.
  const data = { ...exported, projects: exported.projects.map(publicProject) };
  await audit("data_exported", { userId: viewer.user.id });
  const body = JSON.stringify({ exportedAt: new Date().toISOString(), account: { name: viewer.user.name, createdAt: viewer.user.createdAt, consent: viewer.user.consent ?? null }, ...data }, null, 2);
  return new NextResponse(body, { headers: { "content-type": "application/json; charset=utf-8", "content-disposition": 'attachment; filename="dalgeurak-my-data.json"', "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
}

export const GET = withViewerVault(handleGET);
