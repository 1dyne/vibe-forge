import { AsyncLocalStorage } from "node:async_hooks";
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

// Participant records are sealed with a key derived from that participant's own
// link token. The server stores only the token's hash, so the key exists only
// while that participant's request is running. The operator's password,
// SESSION_SECRET, the data volume and its backups do not open these records.
export type Vault = { ownerId: string; key: Buffer };

const storage = new AsyncLocalStorage<Vault | null>();

export function vaultFor(token: string, ownerId: string): Vault {
  return { ownerId, key: Buffer.from(hkdfSync("sha256", token, "dalgeurak-vault-v1", `owner:${ownerId}`, 32)) };
}

// Runs the operation with this participant's key. null runs it with no key,
// so nothing from an outer request leaks in.
export function withVault<T>(vault: Vault | null, operation: () => T): T {
  return storage.run(vault, operation);
}

export function currentVault(): Vault | null {
  return storage.getStore() ?? null;
}

export function seal(value: unknown, key: Buffer, label: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(label, "utf8"));
  const body = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return ["v1", ...[iv, cipher.getAuthTag(), body].map((part) => part.toString("base64url"))].join(".");
}

export function open<T>(sealed: string, key: Buffer, label: string): T | null {
  try {
    const [version, iv, tag, body] = sealed.split(".");
    if (version !== "v1") return null;
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
    decipher.setAAD(Buffer.from(label, "utf8"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8")) as T;
  } catch {
    return null;
  }
}
