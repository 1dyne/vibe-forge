const baseUrl = process.argv[2] ?? process.env.APP_BASE_URL ?? "http://localhost:3000";
const form = new FormData();
form.set("password", process.env.APP_PASSWORD ?? "");
const login = await fetch(`${baseUrl}/api/session`, { method: "POST", body: form, redirect: "manual" });
const cookie = login.headers.get("set-cookie")?.split(";", 1)[0];
if (login.status !== 303 || !cookie) throw new Error("login failed");

const listResponse = await fetch(`${baseUrl}/api/projects`, { headers: { cookie } });
const list = await listResponse.json();
if (!listResponse.ok) throw new Error(`project list failed: ${listResponse.status}`);
const project = list.projects?.find((item) => item.build);
if (!project?.build) throw new Error("a built project is required");

const downloads = [];
for (const artifact of project.build.artifacts) {
  const response = await fetch(`${baseUrl}/api/projects/${project.id}/artifacts/${artifact.id}`, { headers: { cookie } });
  const content = await response.text();
  if (!response.ok || !content.length) throw new Error(`artifact download failed: ${artifact.filename}`);
  downloads.push({ filename: artifact.filename, bytes: Buffer.byteLength(content), contentType: response.headers.get("content-type") });
}

console.log(JSON.stringify({
  ok: true,
  projectId: project.id,
  revision: project.designRevision,
  status: project.build.status,
  checks: project.build.checks.map((check) => `${check.id}:${check.verdict}`),
  evaluator: { hw: project.build.evaluator.hw.verdict, sw: project.build.evaluator.sw.verdict },
  downloads
}, null, 2));
