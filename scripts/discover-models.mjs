const openaiKey = process.env.OPENAI_API_KEY;
const anthropicKey = process.env.ANTHROPIC_API_KEY;

async function getJson(url, headers) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`${new URL(url).hostname}: HTTP ${response.status}`);
  return response.json();
}

const report = { openai: { ok: false, models: [], error: null }, anthropic: { ok: false, models: [], error: null } };

if (openaiKey) {
  try {
    const body = await getJson("https://api.openai.com/v1/models", { Authorization: `Bearer ${openaiKey}` });
    report.openai.ok = true;
    report.openai.models = body.data.map((item) => item.id).filter((id) => /^(gpt|o\d|computer-use)/.test(id)).sort();
  } catch (error) { report.openai.error = error instanceof Error ? error.message : String(error); }
} else report.openai.error = "key missing";

if (anthropicKey) {
  try {
    const body = await getJson("https://api.anthropic.com/v1/models?limit=1000", { "x-api-key": anthropicKey, "anthropic-version": "2023-06-01" });
    report.anthropic.ok = true;
    report.anthropic.models = body.data.map((item) => item.id).sort();
  } catch (error) { report.anthropic.error = error instanceof Error ? error.message : String(error); }
} else report.anthropic.error = "key missing";

console.log(JSON.stringify(report, null, 2));
if (!report.openai.ok || !report.anthropic.ok) process.exitCode = 1;
