const baseUrl = process.argv[2] ?? process.env.APP_BASE_URL ?? "http://localhost:3000";
if (!process.env.APP_PASSWORD) throw new Error("APP_PASSWORD is required for the authenticated smoke test");

const form = new FormData();
form.set("password", process.env.APP_PASSWORD);
const login = await fetch(`${baseUrl}/api/session`, { method: "POST", body: form, redirect: "manual" });
if (login.status !== 303) throw new Error(`login failed with ${login.status}`);
const cookie = login.headers.get("set-cookie")?.split(";", 1)[0];
if (!cookie) throw new Error("login did not return a session cookie");

const headers = { cookie, origin: baseUrl, "content-type": "application/json" };
const createdResponse = await fetch(`${baseUrl}/api/projects`, {
  method: "POST",
  headers,
  body: JSON.stringify({ idea: "연기 테스트용 작은 상태 표시 장치" })
});
const createdBody = await createdResponse.json();
if (!createdResponse.ok || !createdBody.project?.id) throw new Error(`project creation failed: ${createdBody.error ?? createdResponse.status}`);

const updatedResponse = await fetch(`${baseUrl}/api/projects/${createdBody.project.id}/messages`, {
  method: "POST",
  headers,
  body: JSON.stringify({ text: "USB 전원을 사용하고 실내 책상 위에 둘 거야." })
});
const updatedBody = await updatedResponse.json();
if (!updatedResponse.ok || updatedBody.project?.designRevision !== 2) throw new Error(`project update failed: ${updatedBody.error ?? updatedResponse.status}`);

const listResponse = await fetch(`${baseUrl}/api/projects`, { headers: { cookie } });
const listBody = await listResponse.json();
if (!listResponse.ok || !listBody.projects?.some((project) => project.id === createdBody.project.id)) throw new Error("persisted project was not returned");

console.log(JSON.stringify({ ok: true, mode: createdBody.call.mode, projectCreated: true, revisionAfterReply: updatedBody.project.designRevision, persisted: true }));
