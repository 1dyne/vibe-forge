import { NextResponse } from "next/server";
import { fireOg } from "../../../../lib/find/og-render";
import { siteOrigin } from "../../../../lib/find/site";
import { getFire } from "../../../../lib/find/store";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const fire = await getFire((await params).id);
  if (!fire) return NextResponse.json({ error: "not found" }, { status: 404 });
  return fireOg(fire, new URL(await siteOrigin()).host);
}
