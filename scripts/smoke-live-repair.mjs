const baseUrl = process.argv[2] ?? process.env.APP_BASE_URL ?? "http://localhost:3000";
const form = new FormData();
form.set("password", process.env.APP_PASSWORD ?? "");
const login = await fetch(`${baseUrl}/api/session`, { method: "POST", body: form, redirect: "manual" });
const cookie = login.headers.get("set-cookie")?.split(";", 1)[0];
if (login.status !== 303 || !cookie) throw new Error("login failed");
const list = await (await fetch(`${baseUrl}/api/projects`, { headers: { cookie } })).json();
const project = list.projects?.find((item) => item.build);
if (!project) throw new Error("a project with build artifacts is required");
const response = await fetch(`${baseUrl}/api/projects/${project.id}/repair`, { method: "POST", headers: { cookie, origin: baseUrl, "content-type": "application/json" }, body: "{}" });
const body = await response.json();
if (!response.ok || !body.project?.build) throw new Error(body.error ?? `repair failed ${response.status}`);
const firmware = body.project.build.artifacts.find((item) => item.kind === "firmware")?.content ?? "";
const verification = {
  hasHysteresis: firmware.includes("GRIP_OFF_THRESHOLD"),
  hasCameraPulse: firmware.includes("cameraPulseActive") && firmware.includes("cameraPulseStartedMs"),
  hasAnalogLabel: /const int PIN_[A-Z0-9_]+ = A\d+;/.test(firmware),
  hasMirroredServo: firmware.includes("180 - currentServoAngle"),
  failedChecks: body.project.build.checks.filter((check) => check.verdict === "fail").map((check) => check.id)
};
if (!verification.hasHysteresis || !verification.hasCameraPulse || !verification.hasAnalogLabel || !verification.hasMirroredServo || verification.failedChecks.length) {
  throw new Error(`repair verification failed: ${JSON.stringify(verification)}`);
}
console.log(JSON.stringify({ ok: true, revision: body.project.designRevision, hw: body.project.build.evaluator.hw.verdict, sw: body.project.build.evaluator.sw.verdict, ...verification }, null, 2));
