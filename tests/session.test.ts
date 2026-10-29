import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "../apps/web/app/api/session/route";
import { signSession, verifySession } from "../apps/web/lib/session";
import { proxy } from "../apps/web/proxy";

beforeEach(() => { vi.stubEnv("APP_PASSWORD", "test-password"); vi.stubEnv("SESSION_SECRET", "test-secret-used-only-for-tests"); });
afterEach(() => { vi.unstubAllEnvs(); });
function login(fields: Record<string, string>, origin = "http://localhost:3000") {
  const form = new FormData(); for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return POST(new NextRequest("http://localhost:3000/api/session", { method: "POST", headers: { origin }, body: form }));
}
describe("private workspace login", () => {
  it("rejects incorrect passwords and cross-site session changes", async () => {
    const bad = await login({ password: "incorrect" });
    expect(bad.headers.get("location")).toContain("/login?error=1");
    expect(bad.cookies.has("dalgeurak_session")).toBe(false);
    expect((await login({ password: "test-password" }, "https://other.example")).status).toBe(403);
    expect((await login({ intent: "logout" }, "https://other.example")).status).toBe(403);
  });
  it("issues an HttpOnly session and optionally remembers this device for 30 days", async () => {
    const regularStart = Date.now();
    const regular = (await login({ password: "test-password" })).cookies.get("dalgeurak_session")!;
    const regularEnd = Date.now();
    expect(await verifySession(regular.value, process.env.SESSION_SECRET)).toBe(true);
    const regularExpiry = Number(regular.value.split(".")[0]);
    expect(regularExpiry).toBeGreaterThanOrEqual(regularStart + 12 * 3600_000);
    expect(regularExpiry).toBeLessThanOrEqual(regularEnd + 12 * 3600_000);
    const rememberStart = Date.now();
    const remembered = await login({ password: "test-password", remember: "on" });
    const rememberEnd = Date.now();
    expect(remembered.headers.get("set-cookie")).toContain("HttpOnly");
    const rememberExpiry = Number(remembered.cookies.get("dalgeurak_session")!.value.split(".")[0]);
    expect(rememberExpiry).toBeGreaterThanOrEqual(rememberStart + 30 * 24 * 3600_000);
    expect(rememberExpiry).toBeLessThanOrEqual(rememberEnd + 30 * 24 * 3600_000);
  });
  it("clears login cookies on logout", async () => {
    const response = await login({ intent: "logout" });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain("/login");
    expect(response.cookies.get("dalgeurak_session")?.value).toBe("");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
  it("blocks expired/tampered tokens and returns JSON 401 for protected files", async () => {
    const expired = await signSession(Date.now() - 1, process.env.SESSION_SECRET!);
    expect(await verifySession(expired, process.env.SESSION_SECRET)).toBe(false);
    const token = await signSession(Date.now() + 10000, process.env.SESSION_SECRET!);
    expect(await verifySession(`${token}x`, process.env.SESSION_SECRET)).toBe(false);
    expect((await proxy(new NextRequest("http://localhost:3000/api/projects/test/workbench/file"))).status).toBe(401);
    expect((await proxy(new NextRequest("http://localhost:3000/"))).headers.get("location")).toContain("/login");
    expect((await proxy(new NextRequest("http://localhost:3000/api/projects", { headers: { cookie: `dalgeurak_session=${token}` } }))).status).toBe(200);
  });
  it("sets Secure cookies in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect((await login({ password: "test-password" })).headers.get("set-cookie")).toContain("Secure");
  });
});
