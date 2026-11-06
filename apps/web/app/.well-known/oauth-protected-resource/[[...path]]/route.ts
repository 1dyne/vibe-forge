import { NextRequest } from "next/server";
import { preflight, protectedResourceMetadata } from "../../../../lib/oauth-metadata";

export function GET(request: NextRequest) { return protectedResourceMetadata(request); }
export const OPTIONS = preflight;
