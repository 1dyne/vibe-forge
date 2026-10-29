import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";

const checks = [];
const present = (name) => Boolean(process.env[name]?.trim());
const positive = (name) => Number(process.env[name]) > 0;

checks.push({ name: "Node", status: Number(process.versions.node.split(".")[0]) >= 22 ? "ok" : "blocked", detail: process.versions.node });
checks.push({ name: "OpenAI key", status: present("OPENAI_API_KEY") ? "ok" : "pending", detail: present("OPENAI_API_KEY") ? "configured (redacted)" : "missing" });
checks.push({ name: "Anthropic key", status: present("ANTHROPIC_API_KEY") ? "ok" : "pending", detail: present("ANTHROPIC_API_KEY") ? "configured (redacted)" : "missing" });
checks.push({ name: "App authentication", status: present("APP_PASSWORD") && present("SESSION_SECRET") ? "ok" : "pending", detail: "APP_PASSWORD and SESSION_SECRET are both required" });
checks.push({ name: "Paid-call budget", status: positive("LLM_COST_LIMIT_PER_TURN_USD") && positive("LLM_COST_LIMIT_PER_DAY_USD") ? "ok" : "blocked", detail: "0 or missing keeps live calls disabled" });
checks.push({ name: "Database", status: present("DATABASE_URL_WORKER") || present("POSTGRES_PASSWORD") ? "ok" : "pending", detail: "remote worker URL or local password required" });
checks.push({ name: "Part search", status: process.env.SEARCH_PROVIDER && process.env.SEARCH_PROVIDER !== "disabled" ? "ok" : "pending", detail: "user links and configured vendor checks remain available without a general search provider" });
const anthropicModels = ["ANTHROPIC_MODEL_SMALL", "ANTHROPIC_MODEL_LARGE", "ANTHROPIC_MODEL_CODE"].map((name) => process.env[name] ?? "");
checks.push({ name: "Claude model policy", status: anthropicModels.some((model) => /haiku/i.test(model)) ? "blocked" : "ok", detail: "active Claude profiles must use Sonnet or Opus" });

const configPath = path.resolve("config/models.yaml");
const config = YAML.parse(fs.readFileSync(configPath, "utf8"));
for (const [profile, mapping] of Object.entries(config.profiles)) {
  const ready = present(mapping.primary.model_env) && present(mapping.fallback.model_env);
  checks.push({ name: `Model profile: ${profile}`, status: ready ? "ok" : "pending", detail: ready ? "both model IDs configured" : "model IDs are not resolved yet" });
}

console.table(checks);
const blocking = checks.filter((check) => check.status === "blocked");
console.log(blocking.length ? `Live mode blocked by ${blocking.length} check(s).` : "No hard live-mode blockers found.");
process.exitCode = blocking.length ? 2 : 0;
