import { getMeta, listMail, setMeta, updateMail, type MailKind, type MailRecord, type MailStatus } from "./village-store";

// 달그락 우체통 ↔ 노션 '달그락 우체통' 데이터베이스.
// 1) 편지가 오면 노션에 페이지를 만든다(실패하면 notion_synced=false로 남기고 다음 동기화 때 다시).
// 2) 다인이 노션에서 상태·답장을 바꾸면, 10분에 한 번(누가 마을에 들어올 때) 앱 DB로 가져온다.
// 토큰은 서버에서만 쓴다. 없으면 노션 연동만 건너뛰고 앱 DB에는 그대로 쌓인다.

const API = "https://api.notion.com/v1";
const VERSION = "2025-09-03";
const KIND_NAME: Record<MailKind, string> = { feature: "기능 제안", bug: "이상해요", decor: "꾸미기 아이디어", chat: "그냥 한마디" };
const STATUS_FROM_NOTION: Record<string, MailStatus> = { "새 편지": "new", "읽는 중": "reading", "반영 예정": "planned", "반영 완료": "done", "보류": "wontdo" };
const PULL_EVERY_MS = 10 * 60 * 1000;

function config() {
  const token = process.env.NOTION_TOKEN?.trim();
  const dataSource = process.env.NOTION_MAILBOX_DS_ID?.trim() || "979627f3-46da-4900-90dc-0047eb96fce3";
  return token ? { token, dataSource } : null;
}

export const notionEnabled = () => Boolean(config());

async function call(path: string, body: unknown) {
  const cfg = config()!;
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${cfg.token}`, "notion-version": VERSION, "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000)
  });
  if (!res.ok) throw new Error(`notion ${path} ${res.status}`);
  return res.json() as Promise<Record<string, unknown>>;
}

const text = (s: string) => ({ rich_text: [{ type: "text", text: { content: s.slice(0, 1900) } }] });

export async function pushMail(mail: MailRecord): Promise<boolean> {
  const cfg = config();
  if (!cfg) return false;
  try {
    const page = await call("/pages", {
      parent: { type: "data_source_id", data_source_id: cfg.dataSource },
      properties: {
        제목: { title: [{ type: "text", text: { content: mail.body.replace(/\s+/g, " ").slice(0, 30) || "(빈 편지)" } }] },
        종류: { select: { name: KIND_NAME[mail.kind] } },
        내용: text(mail.body),
        "대장간 ID": text(mail.forgeId ?? ""),
        화면: text(mail.context.screen ?? ""),
        기기: text(mail.context.device ?? ""),
        "앱 편지 ID": text(mail.id)
      }
    });
    await updateMail(mail.id, { notionPageId: String(page.id), notionSynced: true });
    return true;
  } catch (error) {
    console.error("notion push failed", error instanceof Error ? error.message : "unknown");
    return false;
  }
}

function plain(prop: unknown): string {
  const p = prop as { rich_text?: Array<{ plain_text?: string }>; status?: { name?: string } } | undefined;
  if (p?.status) return p.status.name ?? "";
  return (p?.rich_text ?? []).map((t) => t.plain_text ?? "").join("");
}

/** 못 보낸 편지는 다시 보내고, 노션에서 바뀐 상태·답장을 가져온다. 10분에 한 번만 실제로 돈다. */
export async function syncMailbox(force = false): Promise<{ pushed: number; pulled: number } | null> {
  if (!notionEnabled()) return null;
  const last = await getMeta("notion_pulled_at");
  if (!force && last && Date.now() - Date.parse(last) < PULL_EVERY_MS) return null;
  const startedAt = new Date().toISOString();
  await setMeta("notion_pulled_at", startedAt);
  let pushed = 0, pulled = 0;
  for (const m of (await listMail()).filter((x) => !x.notionSynced).slice(0, 20)) if (await pushMail(m)) pushed++;
  try {
    const filter = last ? { timestamp: "last_edited_time", last_edited_time: { on_or_after: last } } : undefined;
    const result = await call(`/data_sources/${config()!.dataSource}/query`, filter ? { filter, page_size: 100 } : { page_size: 100 });
    const byId = new Map((await listMail()).map((m) => [m.id, m]));
    for (const page of (result.results as Array<{ properties: Record<string, unknown> }>) ?? []) {
      const appId = plain(page.properties["앱 편지 ID"]);
      const mail = byId.get(appId);
      if (!mail) continue;
      const status = STATUS_FROM_NOTION[plain(page.properties["상태"])] ?? mail.status;
      const reply = plain(page.properties["답장"]).trim() || null;
      if (status !== mail.status || reply !== mail.reply) {
        await updateMail(mail.id, { status, reply, ...(reply !== mail.reply ? { replySeen: false } : {}) });
        pulled++;
      }
    }
  } catch (error) {
    console.error("notion pull failed", error instanceof Error ? error.message : "unknown");
  }
  return { pushed, pulled };
}
