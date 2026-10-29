const intervalMs = 15_000;

if (!process.env.DATABASE_URL_WORKER && !process.env.POSTGRES_PASSWORD) {
  console.error("Worker configuration is incomplete: configure DATABASE_URL_WORKER or the local Postgres settings.");
  process.exitCode = 1;
} else {
  console.log("달그락 대장간 worker skeleton started. Job leasing is implemented after the Postgres migration is available.");
  setInterval(() => undefined, intervalMs);
}
