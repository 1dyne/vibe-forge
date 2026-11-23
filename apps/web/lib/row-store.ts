import pg from "pg";

// 지금까지 users.json과 local-projects.json은 "통째로 읽고 통째로 다시 쓰는" 파일이었다.
// 한 사람이 대화 한 번 할 때마다 모든 사람의 계정이 다시 쓰이고, 프로젝트 하나를
// 저장할 때마다 모든 프로젝트가 다시 쓰인다. 지금은 참여자가 적어 버티지만,
// 과금 기록처럼 잦은 쓰기가 늘어날수록 그대로 둘 수 없다.
//
// 저장소를 바꾸되 위에 있는 코드는 그대로 두기로 했다. 계정·프로젝트를 다루는 함수
// 스무 개를 다시 쓰면 봉인(암호화) 규칙까지 함께 건드리게 되고, 그건 실제 사용자의
// 기록이 올라가 있는 상태에서 감당할 위험이 아니다. 대신 읽기/쓰기 두 함수만 바꾼다.
//
// 읽을 때 본 모습을 기억해뒀다가, 쓸 때 달라진 행만 쓴다. 그래서 위에서 보기에는
// 여전히 "통째로 읽고 통째로 넘기는" 함수지만, 실제로 데이터베이스에 가는 것은
// 바뀐 한 행뿐이다.
//
// DATABASE_URL_WEB 또는 DATABASE_URL이 있으면 Postgres, 없으면 파일(로컬·테스트).

export type Row = { id: string; data: unknown };

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS forge_users (id text PRIMARY KEY, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS forge_invites (id text PRIMARY KEY, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS forge_projects (id text PRIMARY KEY, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS forge_profiles (id text PRIMARY KEY, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS forge_meta (id text PRIMARY KEY, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
`;

export const TABLES = ["forge_users", "forge_invites", "forge_projects", "forge_profiles", "forge_meta"] as const;
export type Table = (typeof TABLES)[number];

// 저장소를 고르는 자리. 기본은 지금까지와 같은 파일이고, FORGE_STORE=postgres를
// 켤 때만 Postgres로 간다.
//
// DATABASE_URL이 있으면 자동으로 넘어가게 두지 않은 이유: 그 변수는 이미 /find가
// 쓰고 있어서 운영 서비스에 설정돼 있다. 자동으로 했으면 이 코드를 배포하는 순간
// 사람들의 계정과 프로젝트가 저장되는 자리가 함께 바뀌었을 것이다. 그러면 무언가
// 잘못됐을 때 코드 때문인지 저장소 때문인지 가릴 수 없다. 배포와 이사를 떼어놓고,
// 배포가 멀쩡한 걸 본 뒤에 변수 하나로 옮긴다. 되돌리는 것도 변수 하나다.
export function databaseUrl(): string {
  if (process.env.NODE_ENV === "test") return process.env.FORGE_TEST_DATABASE_URL?.trim() || "";
  if (process.env.FORGE_STORE !== "postgres") return "";
  return process.env.DATABASE_URL_WEB?.trim() || process.env.DATABASE_URL?.trim() || "";
}

export const usingPostgres = () => Boolean(databaseUrl());

let pool: pg.Pool | null = null;
let ready: Promise<void> | null = null;

export async function db(): Promise<pg.Pool> {
  const url = databaseUrl();
  if (!url) throw new Error("DATABASE_URL이 없습니다.");
  pool ??= new pg.Pool({ connectionString: url, max: 5, ssl: /sslmode=require/.test(url) ? { rejectUnauthorized: false } : undefined });
  ready ??= pool.query(SCHEMA).then(() => undefined).catch((error) => { ready = null; throw error; });
  await ready;
  return pool;
}

/** 테스트와 종료 때 연결을 닫는다. */
export async function endPool() {
  await pool?.end().catch(() => {});
  pool = null;
  ready = null;
}

export async function readRows(table: Table): Promise<Row[]> {
  const { rows } = await (await db()).query(`SELECT id, data FROM ${table}`);
  return rows.map((row) => ({ id: row.id as string, data: row.data }));
}

// 비교는 키 순서를 가리지 않아야 한다. Postgres는 jsonb를 넣을 때 키 순서를 제 식대로
// 정규화하는데(짧은 키부터), 우리가 저장할 객체는 코드에 적은 순서를 그대로 따른다.
// 그냥 JSON.stringify로 견주면 내용이 같아도 글자가 달라서, 객체를 다시 만들어 넣는
// 행(봉인된 프로젝트의 {id, ownerId, updatedAt, sealed})은 늘 "바뀐 것"으로 보인다.
// 그러면 행 단위로 쓰는 뜻이 없어진다.
export function canonical(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).filter((key) => record[key] !== undefined).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
}

/** 읽을 때 본 모습. 이것과 다른 행만 쓴다. */
export const snapshotOf = (rows: Row[]): Map<string, string> => new Map(rows.map((row) => [row.id, canonical(row.data)]));

// 바뀐 행만 쓰고, 사라진 행만 지운다. 한 트랜잭션으로 묶어 중간에 끊겨도
// 반만 반영되는 일이 없게 한다.
export async function writeRows(table: Table, next: Row[], before: Map<string, string>): Promise<Map<string, string>> {
  const after = snapshotOf(next);
  const changed = next.filter((row) => before.get(row.id) !== after.get(row.id));
  const removed = [...before.keys()].filter((id) => !after.has(id));
  if (!changed.length && !removed.length) return after;

  const client = await (await db()).connect();
  try {
    await client.query("BEGIN");
    for (const row of changed) {
      await client.query(
        `INSERT INTO ${table} (id, data, updated_at) VALUES ($1, $2, now())
         ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
        [row.id, JSON.stringify(row.data)]
      );
    }
    if (removed.length) await client.query(`DELETE FROM ${table} WHERE id = ANY($1::text[])`, [removed]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
  return after;
}

// 볼륨의 JSON 파일에 있던 기록을 처음 한 번만 옮긴다. 이미 행이 있으면 아무것도
// 하지 않는다. 파일은 지우지 않는다 — 옮긴 뒤에도 되돌아갈 자리가 있어야 한다.
// key에는 어느 파일에서 가져오는지를 담는다. 운영에서는 볼륨 경로가 고정이라
// 늘 같은 키지만, 파일이 다르면 다른 가져오기로 본다. 다시 가져오더라도 이미
// 있는 행은 건드리지 않으므로(DO NOTHING) 덮어쓸 위험은 없다.
export async function importOnce(key: string, load: () => Promise<Array<{ table: Table; rows: Row[] }>>): Promise<"imported" | "skipped"> {
  const client = await (await db()).connect();
  try {
    // 같은 순간에 두 프로세스가 올라와도 한 번만 옮긴다.
    await client.query("SELECT pg_advisory_lock(hashtext($1))", [`forge_import:${key}`]);
    const done = await client.query("SELECT 1 FROM forge_meta WHERE id = $1", [`import:${key}`]);
    if (done.rowCount) return "skipped";

    const groups = await load();
    await client.query("BEGIN");
    for (const group of groups) {
      for (const row of group.rows) {
        // 이미 있는 행은 건드리지 않는다. 옮기는 중에 들어온 새 기록을 덮으면 안 된다.
        await client.query(`INSERT INTO ${group.table} (id, data) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING`, [row.id, JSON.stringify(row.data)]);
      }
    }
    const counts = Object.fromEntries(groups.map((group) => [group.table, group.rows.length]));
    await client.query("INSERT INTO forge_meta (id, data) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING",
      [`import:${key}`, JSON.stringify({ at: new Date().toISOString(), counts })]);
    await client.query("COMMIT");
    // 운영에서 이사가 무엇을 옮겼는지 눈으로 확인할 수 있어야 한다. 0건이면 파일을
    // 못 찾았다는 뜻이고, 그건 조용히 지나가면 안 되는 일이다.
    console.log(`[forge-store] ${key} 이사 완료:`, JSON.stringify(counts));
    return "imported";
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtext($1))", [`forge_import:${key}`]).catch(() => {});
    client.release();
  }
}
