import { readFile } from "node:fs/promises";
import { db, TABLES, usingPostgres } from "../apps/web/lib/row-store";

// "저장된 자리에 평문이 남지 않는다"를 두 저장 방식 모두에서 같은 말로 확인한다.
// 예전에는 테스트가 .data의 JSON 파일을 직접 읽었는데, 그건 파일 저장 방식에만
// 있는 사실이라 Postgres로 옮기자마자 파일이 없다며 깨졌다. 확인하고 싶은 것은
// "파일에 없다"가 아니라 "어디에 저장하든 평문으로 남지 않는다"이다.

async function tableText(): Promise<string> {
  const pool = await db();
  const parts = await Promise.all(TABLES.map(async (table) => JSON.stringify((await pool.query(`SELECT id, data FROM ${table}`)).rows)));
  return parts.join("\n");
}

const fileText = async (files: string[]) => (await Promise.all(files.map((file) => readFile(file, "utf8").catch(() => "")))).join("\n");

/** 앱이 지금 쓰고 있는 자리. 파일 모드면 그 파일들, Postgres면 테이블. */
export async function activeStore(files: string[]): Promise<string> {
  return usingPostgres() ? tableText() : fileText(files);
}

/** 쓰고 있는 자리 + 넘겨준 파일 전부. 아직 파일로 남는 것(auth.json)까지 함께 볼 때. */
export async function allAtRest(files: string[]): Promise<string> {
  const text = await fileText(files);
  return usingPostgres() ? `${text}\n${await tableText()}` : text;
}
