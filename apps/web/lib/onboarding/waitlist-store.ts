import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export const EXPERIENCE = ["first_time", "tried_board", "soldered"] as const;
export const WANT_FIRST = ["circuit", "parts_cost", "case_3d", "assembly", "firmware"] as const;
export const BUDGET = ["under_50k", "50k_150k", "over_150k", "unknown"] as const;

export type WaitlistInput = {
  email: string;
  experience: (typeof EXPERIENCE)[number] | null;
  wantFirst: Array<(typeof WANT_FIRST)[number]>;
  budget: (typeof BUDGET)[number] | null;
  shareIdea: boolean;
  idea: string | null;
  ideaKind: string | null;
  topMatch: { repo: string; matchPercent: number } | null;
  marketingConsent: boolean;
  ref: string | null;
};

export type WaitlistEntry = Omit<WaitlistInput, "ref" | "shareIdea"> & {
  id: string;
  code: string;
  referredBy: string | null;
  privacyConsentAt: string;
  marketingConsentAt: string | null;
  createdAt: string;
};

type WaitlistFile = { version: 1; entries: WaitlistEntry[] };
let queue: Promise<unknown> = Promise.resolve();

// 친구 1명이 가입할 때마다 앞당겨지는 칸 수
export const REFERRAL_BOOST = 3;

function dataFile() {
  if (process.env.WAITLIST_TEST_DATA_FILE && process.env.NODE_ENV === "test") return process.env.WAITLIST_TEST_DATA_FILE;
  const cwd = process.cwd();
  const workspace = path.basename(cwd) === "web" && path.basename(path.dirname(cwd)) === "apps" ? path.resolve(cwd, "../..") : cwd;
  return path.join(workspace, ".data", "waitlist.json");
}

async function read(): Promise<WaitlistFile> {
  try {
    const parsed = JSON.parse(await readFile(/* turbopackIgnore: true */ dataFile(), "utf8")) as WaitlistFile;
    if (parsed.version !== 1 || !Array.isArray(parsed.entries)) throw new Error("대기자 명단 형식을 읽을 수 없습니다.");
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, entries: [] };
    throw error;
  }
}

async function write(data: WaitlistFile) {
  const file = dataFile();
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(data, null, 2), "utf8");
  await rename(temporary, file);
}

function serialized<T>(operation: () => Promise<T>): Promise<T> {
  const next = queue.then(operation, operation);
  queue = next.then(() => undefined, () => undefined);
  return next;
}

function newCode(existing: Set<string>) {
  for (;;) {
    const code = randomBytes(5).toString("base64url").replace(/[-_]/g, "").slice(0, 6).toUpperCase();
    if (code.length === 6 && !existing.has(code)) return code;
  }
}

export type WaitlistStanding = { code: string; position: number; total: number; referrals: number; alreadyJoined: boolean };

function standing(entries: WaitlistEntry[], entry: WaitlistEntry, alreadyJoined: boolean): WaitlistStanding {
  const referrals = new Map<string, number>();
  for (const e of entries) if (e.referredBy) referrals.set(e.referredBy, (referrals.get(e.referredBy) ?? 0) + 1);
  const ranked = entries
    .map((e, index) => ({ e, key: index - REFERRAL_BOOST * (referrals.get(e.code) ?? 0), index }))
    .sort((a, b) => a.key - b.key || a.index - b.index);
  return { code: entry.code, position: ranked.findIndex((r) => r.e.id === entry.id) + 1, total: entries.length, referrals: referrals.get(entry.code) ?? 0, alreadyJoined };
}

export function joinWaitlist(input: WaitlistInput): Promise<WaitlistStanding> {
  return serialized(async () => {
    const data = await read();
    const email = input.email.trim().toLowerCase();
    const existing = data.entries.find((e) => e.email === email);
    if (existing) return standing(data.entries, existing, true);

    const codes = new Set(data.entries.map((e) => e.code));
    const now = new Date().toISOString();
    const entry: WaitlistEntry = {
      id: createHash("sha256").update(email + now).digest("hex").slice(0, 16),
      email,
      code: newCode(codes),
      referredBy: input.ref && codes.has(input.ref) ? input.ref : null,
      experience: input.experience,
      wantFirst: input.wantFirst,
      budget: input.budget,
      // 아이디어는 사용자가 함께 보내기로 동의했을 때만 남긴다.
      idea: input.shareIdea ? input.idea : null,
      ideaKind: input.shareIdea ? input.ideaKind : null,
      topMatch: input.shareIdea ? input.topMatch : null,
      marketingConsent: input.marketingConsent,
      privacyConsentAt: now,
      marketingConsentAt: input.marketingConsent ? now : null,
      createdAt: now
    };
    data.entries.push(entry);
    await write(data);
    return standing(data.entries, entry, false);
  });
}

export function waitlistCount(): Promise<number> {
  return serialized(async () => (await read()).entries.length);
}
