import fs from "node:fs";
import path from "node:path";

const roots = ["packages/agents", "config"];
const modelLike = /\b[A-Z]{2,}[A-Z0-9-]*\d{2,}[A-Z0-9-]*\b/g;
const warnings = [];

function visit(target) {
  if (!fs.existsSync(target)) return;
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    const file = path.join(target, entry.name);
    if (entry.isDirectory()) visit(file);
    else if (/\.(ts|md|ya?ml|txt)$/.test(entry.name)) {
      const content = fs.readFileSync(file, "utf8");
      for (const match of content.matchAll(modelLike)) warnings.push(`${file}:${content.slice(0, match.index).split("\n").length}: ${match[0]}`);
    }
  }
}

for (const root of roots) visit(root);
if (warnings.length) {
  console.warn("Possible hard-coded part/model identifiers (warning only):");
  console.warn(warnings.join("\n"));
} else console.log("No model-number-like prompt tokens found.");
