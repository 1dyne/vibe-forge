import assert from "node:assert/strict";
import { createSign, generateKeyPairSync } from "node:crypto";
import { mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

process.env.DALGRAK_HELPER_HOME = mkdtempSync(join(tmpdir(), "dalgrak-helper-"));
const { verifyIdToken, ISSUER } = await import("../src/openai-auth.mjs");
const { challengeOf } = await import("../src/loopback.mjs");
const store = await import("../src/store.mjs");

const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwks = [{ ...publicKey.export({ format: "jwk" }), kid: "k1", alg: "RS256" }];
const b64 = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
function token(payload, key = privateKey) {
  const head = `${b64({ alg: "RS256", kid: "k1" })}.${b64(payload)}`;
  return `${head}.${createSign("RSA-SHA256").update(head).sign(key).toString("base64url")}`;
}
const good = { iss: ISSUER, aud: "oaiapp_1", sub: "u1", email: "a@example.com", nonce: "n1", exp: Math.floor(Date.now() / 1000) + 600 };

test("올바른 확인서는 통과한다", async () => {
  assert.equal((await verifyIdToken(token(good), { clientId: "oaiapp_1", nonce: "n1", jwks })).sub, "u1");
});
test("서명·발급자·대상·nonce·만료가 다르면 거절한다", async () => {
  const other = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey;
  const cases = [token(good, other), token({ ...good, iss: "https://evil.example" }), token({ ...good, aud: "someone_else" }), token({ ...good, nonce: "n2" }), token({ ...good, exp: 1 })];
  for (const bad of cases) await assert.rejects(verifyIdToken(bad, { clientId: "oaiapp_1", nonce: "n1", jwks }), { code: "id_token_invalid" });
});
test("PKCE 챌린지는 RFC 7636 예시와 같다", () => {
  assert.equal(challengeOf("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
});
test("호스트 ID는 한 번 만들어 계속 쓰고, 파일은 본인만 읽는다", { skip: process.platform === "win32" }, () => {
  const first = store.hostId();
  assert.match(first, /^urn:uuid:[0-9a-f-]{36}$/);
  assert.equal(store.hostId(), first);
  store.write("openai.json", { access_token: "secret" });
  assert.equal(statSync(join(store.configDir(), "openai.json")).mode & 0o777, 0o600);
});
