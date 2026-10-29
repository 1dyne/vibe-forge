import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

type DayUsage = { settledUsd: number; reservedUsd: number };
type CostLedger = { version: 1; days: Record<string, DayUsage> };
let queue: Promise<unknown> = Promise.resolve();

function ledgerFile() {
  const cwd = process.cwd();
  const workspace = path.basename(cwd) === "web" && path.basename(path.dirname(cwd)) === "apps" ? path.resolve(cwd, "../..") : cwd;
  return path.join(workspace, ".data", "local-cost-ledger.json");
}

async function readLedger(): Promise<CostLedger> {
  try {
    const parsed = JSON.parse(await readFile(ledgerFile(), "utf8")) as CostLedger;
    return parsed.version === 1 && parsed.days ? parsed : { version: 1, days: {} };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, days: {} };
    throw error;
  }
}

async function writeLedger(ledger: CostLedger) {
  const file = ledgerFile();
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(ledger, null, 2), "utf8");
  await rename(temporary, file);
}

export function withLocalCostReservation<T>(maximumUsd: number, dailyLimitUsd: number, operation: () => Promise<{ value: T; actualUsd: number }>): Promise<T> {
  const run = async () => {
    const day = new Date().toISOString().slice(0, 10);
    const ledger = await readLedger();
    const usage = ledger.days[day] ?? { settledUsd: 0, reservedUsd: 0 };
    if (usage.settledUsd + usage.reservedUsd + maximumUsd > dailyLimitUsd) throw new Error("LIVE_DAILY_BUDGET_BLOCKED");
    usage.reservedUsd += maximumUsd;
    ledger.days[day] = usage;
    await writeLedger(ledger);

    try {
      const result = await operation();
      usage.reservedUsd = Math.max(0, usage.reservedUsd - maximumUsd);
      usage.settledUsd += Math.max(0, result.actualUsd);
      await writeLedger(ledger);
      return result.value;
    } catch (error) {
      if (error instanceof Error && error.message === "LIVE_CONTEXT_BUDGET_BLOCKED") {
        // Token counting rejected this request before the paid generation call.
        usage.reservedUsd = Math.max(0, usage.reservedUsd - maximumUsd);
      }
      // A provider may have charged for an interrupted response. Keep the reservation
      // in place for the day so a failure cannot weaken the user's cost ceiling.
      await writeLedger(ledger);
      throw error;
    }
  };
  const next = queue.then(run, run);
  queue = next.then(() => undefined, () => undefined);
  return next;
}
