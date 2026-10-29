import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const { Client } = pg;

function migrationUrl() {
  if (process.env.DATABASE_URL_MIGRATIONS?.trim()) return process.env.DATABASE_URL_MIGRATIONS.trim();
  const password = process.env.POSTGRES_PASSWORD?.trim();
  if (!password) throw new Error("DATABASE_URL_MIGRATIONS 또는 POSTGRES_PASSWORD를 설정해주세요.");
  const user = process.env.POSTGRES_USER?.trim() || "dalgeurak";
  const database = process.env.POSTGRES_DB?.trim() || "dalgeurak_daejanggan";
  const host = process.env.POSTGRES_HOST?.trim() || "localhost";
  const port = process.env.POSTGRES_PORT?.trim() || "5432";
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${encodeURIComponent(database)}`;
}

const directory = path.resolve("packages/db/migrations");
const filenames = (await readdir(directory)).filter((name) => /^\d+.*\.sql$/.test(name)).sort();
if (!filenames.length) throw new Error("적용할 migration 파일이 없습니다.");

const client = new Client({ connectionString: migrationUrl() });
await client.connect();

try {
  await client.query("SELECT pg_advisory_lock(hashtext($1))", ["dalgeurak_schema_migrations"]);
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  for (const filename of filenames) {
    const sql = await readFile(path.join(directory, filename), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    const applied = await client.query("SELECT checksum FROM schema_migrations WHERE version = $1", [filename]);

    if (applied.rowCount) {
      if (applied.rows[0].checksum !== checksum) throw new Error(`이미 적용된 migration이 변경되었습니다: ${filename}`);
      console.log(`skip ${filename}`);
      continue;
    }

    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations(version, checksum) VALUES ($1, $2)", [filename, checksum]);
      await client.query("COMMIT");
      console.log(`applied ${filename}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
} finally {
  try {
    await client.query("SELECT pg_advisory_unlock(hashtext($1))", ["dalgeurak_schema_migrations"]);
  } finally {
    await client.end();
  }
}
