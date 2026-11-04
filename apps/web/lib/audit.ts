import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

// Who did what to which account, never what anyone made or said. Kept so the
// operator can show participants how their accounts were handled.
export type AuditEvent =
  | "operator_login" | "operator_login_failed"
  | "user_invited" | "user_signed_up" | "user_revoked" | "user_erased_by_operator" | "user_erased_self"
  | "web_ai_changed" | "link_rotated" | "data_exported"
  | "invite_created" | "invite_disabled" | "project_deleted" | "app_connected" | "app_disconnected"
  | "email_verified" | "login" | "login_failed" | "password_reset_requested" | "password_reset" | "password_reset_records_erased"
  | "password_changed" | "password_set" | "lock_upgraded" | "link_converted" | "recovery_code_replaced" | "records_reset";

function auditFile() {
  if (process.env.FORGE_TEST_AUDIT_FILE && process.env.NODE_ENV === "test") return process.env.FORGE_TEST_AUDIT_FILE;
  const cwd = process.cwd();
  const workspace = path.basename(cwd) === "web" && path.basename(path.dirname(cwd)) === "apps" ? path.resolve(cwd, "../..") : cwd;
  return path.join(workspace, ".data", "audit.jsonl");
}

export async function audit(event: AuditEvent, detail: { userId?: string; inviteId?: string; note?: string } = {}): Promise<void> {
  try {
    const file = auditFile();
    await mkdir(path.dirname(file), { recursive: true });
    await appendFile(file, `${JSON.stringify({ at: new Date().toISOString(), event, ...detail })}\n`, { encoding: "utf8", mode: 0o600 });
  } catch {
    // Auditing never blocks the action itself.
  }
}
