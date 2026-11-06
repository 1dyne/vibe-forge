// Starts the watcher that tells a person when a request sent to a coding
// agent got no response by its due time (see lib/notify.ts).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startDeadlineWatch } = await import("./lib/notify");
    startDeadlineWatch();
  }
}
