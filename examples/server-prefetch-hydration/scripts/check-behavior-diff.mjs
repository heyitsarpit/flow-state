import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const exampleRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const comparisonRoot = path.resolve(exampleRoot, "../basic-cached-posts");

function execute(format, extra = []) {
  return spawnSync(
    "pnpm",
    [
      "exec",
      "flow-state",
      "behavior",
      "diff",
      "--left-project-root",
      exampleRoot,
      "--right-project-root",
      comparisonRoot,
      ...extra,
      "--format",
      format,
    ],
    { cwd: exampleRoot, encoding: "utf8" },
  );
}

function run(format) {
  const result = execute(format);
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `behavior diff exited ${result.status}`);
  }
  return result.stdout;
}

const outputs = {};
for (const format of ["text", "json"]) {
  const first = run(format);
  const second = run(format);
  if (first !== second) throw new Error(`${format} behavior diff output was not deterministic`);
  if (first.trim().length === 0) throw new Error(`${format} behavior diff output was empty`);
  outputs[format] = first;
}

const report = JSON.parse(outputs.json);
for (const appId of [report.app.left, report.app.right]) {
  if (!outputs.text.includes(appId)) throw new Error(`text output omitted app ${appId}`);
}
for (const section of report.summary.changedSections) {
  if (!outputs.text.includes(section)) throw new Error(`text output omitted section ${section}`);
}

const rejected = execute("json", ["--left-gateway", path.join(exampleRoot, "missing.ts")]);
if (rejected.status === 0 || !rejected.stderr.includes("error [invalid-input]")) {
  throw new Error("behavior diff did not return the typed invalid-input failure");
}
