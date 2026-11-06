import { landingOg } from "../../../lib/find/og-render";
import { siteOrigin } from "../../../lib/find/site";

export async function GET() {
  return landingOg(new URL(await siteOrigin()).host);
}
