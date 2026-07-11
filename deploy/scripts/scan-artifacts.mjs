import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const version = JSON.parse(readFileSync(resolve("package.json"), "utf8")).version;
const roots = [resolve("apps/web/dist"), resolve("apps/controller/dist"), resolve("apps/agent/dist"), resolve("output", "release", version)];
const prohibited = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "private key"],
  [/e2e administrator password|e2e reader password/i, "E2E credential"],
  [/[A-Za-z]:\\ProjectCode\\StackPilot/i, "local Windows path"],
  [/\/home\/runner\/work\/StackPilot/i, "CI absolute path"],
];
const findings = [];
function visit(path) {
  if (!statSync(path).isDirectory()) {
    const content = readFileSync(path);
    if (content.includes(0)) return;
    const text = content.toString("utf8");
    for (const [pattern, label] of prohibited) if (pattern.test(text)) findings.push(`${label}: ${path}`);
    return;
  }
  for (const name of readdirSync(path)) visit(join(path, name));
}
for (const root of roots) visit(root);
if (findings.length) throw new Error(`发布泄密扫描失败:\n${findings.join("\n")}`);
process.stdout.write("前端与发布制品未发现私钥、E2E 凭据或本地绝对路径。\n");
