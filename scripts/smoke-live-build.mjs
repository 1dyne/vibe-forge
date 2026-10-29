const baseUrl = process.argv[2] ?? process.env.APP_BASE_URL ?? "http://localhost:3000";
if (process.env.APP_MODE !== "live") throw new Error("APP_MODE must be live");
if (!process.env.APP_PASSWORD) throw new Error("APP_PASSWORD is required");

const form = new FormData();
form.set("password", process.env.APP_PASSWORD);
const login = await fetch(`${baseUrl}/api/session`, { method: "POST", body: form, redirect: "manual" });
const cookie = login.headers.get("set-cookie")?.split(";", 1)[0];
if (login.status !== 303 || !cookie) throw new Error(`login failed with ${login.status}`);

const listed = await fetch(`${baseUrl}/api/projects`, { headers: { cookie } });
const listBody = await listed.json();
const project = listBody.projects?.[0];
if (!project?.id) throw new Error("create a project before running the live build smoke test");

const built = await fetch(`${baseUrl}/api/projects/${project.id}/build`, {
  method: "POST",
  headers: { cookie, origin: baseUrl, "content-type": "application/json" },
  body: "{}"
});
const body = await built.json();
if (!built.ok || !body.project?.build) throw new Error(`live build failed: ${body.error ?? built.status}`);
const result = body.project.build;
console.log(JSON.stringify({
  ok: true,
  projectId: body.project.id,
  revision: body.project.designRevision,
  buildStatus: result.status,
  checks: result.checks.map((check) => `${check.id}:${check.verdict}`),
  hwEvaluator: result.evaluator.hw.verdict,
  swEvaluator: result.evaluator.sw.verdict,
  artifacts: result.artifacts.map((artifact) => artifact.filename)
}, null, 2));
