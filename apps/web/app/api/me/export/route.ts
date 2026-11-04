import { NextRequest, NextResponse } from "next/server";
import { audit } from "../../../../lib/audit";
import { exportOwnerData } from "../../../../lib/local-project-store";
import { getViewer, unauthorized, withViewerVault } from "../../../../lib/viewer";

// The participant's own records as one JSON file (data portability).
async function handleGET(request: NextRequest) {
  const viewer = await getViewer(request);
  if (!viewer || viewer.kind !== "user") return unauthorized();
  const data = await exportOwnerData(viewer.user.id);
  await audit("data_exported", { userId: viewer.user.id });
  const body = JSON.stringify({ exportedAt: new Date().toISOString(), account: { name: viewer.user.name, createdAt: viewer.user.createdAt, consent: viewer.user.consent ?? null }, ...data }, null, 2);
  return new NextResponse(body, { headers: { "content-type": "application/json; charset=utf-8", "content-disposition": 'attachment; filename="dalgeurak-my-data.json"', "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
}

export const GET = withViewerVault(handleGET);
