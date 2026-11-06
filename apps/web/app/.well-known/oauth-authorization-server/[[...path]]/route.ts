import { NextRequest } from "next/server";
import { authorizationServerMetadata, preflight } from "../../../../lib/oauth-metadata";

export function GET(request: NextRequest) { return authorizationServerMetadata(request); }
export const OPTIONS = preflight;
