import { NextRequest } from "next/server";
import { authorizationServerMetadata, preflight } from "../../../lib/oauth-metadata";

// Some clients look here before the OAuth path; the same metadata answers.
export function GET(request: NextRequest) { return authorizationServerMetadata(request); }
export const OPTIONS = preflight;
