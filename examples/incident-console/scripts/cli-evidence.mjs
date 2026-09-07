import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
const projectRoot = resolve(import.meta.dirname, "..");
const cli = resolve(projectRoot, "node_modules", ".bin", "flow-state");
const temporary = await mkdtemp(resolve(tmpdir(), "incident-console-cli-"));

const invoke = async (args) =>
  exec(cli, args, {
    cwd: projectRoot,
    env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
  });

const deterministic = async (args) => {
  const first = await invoke(args);
  const second = await invoke(args);
  assert.equal(second.stdout, first.stdout);
  assert.equal(second.stderr, first.stderr);
};

try {
  await deterministic(["story", "list", "--project-root", projectRoot, "--format", "text"]);
  await deterministic(["story", "list", "--project-root", projectRoot, "--format", "json"]);

  const trace = resolve(temporary, "queue-trace.json");
  await invoke([
    "story",
    "run",
    "queue",
    "--project-root",
    projectRoot,
    "--check",
    "--pending-work",
    "--format",
    "json",
    "--save-trace",
    trace,
  ]);
  await deterministic(["trace", "summarize", trace, "--format", "text"]);
  await deterministic(["trace", "summarize", trace, "--format", "json"]);

  const firstContract = resolve(temporary, "behavior-a.json");
  const secondContract = resolve(temporary, "behavior-b.json");
  await invoke(["behavior", "build", "--project-root", projectRoot, "--output", firstContract]);
  await invoke(["behavior", "build", "--project-root", projectRoot, "--output", secondContract]);
  assert.equal(await readFile(secondContract, "utf8"), await readFile(firstContract, "utf8"));

  await assert.rejects(
    invoke(["story", "run", "impossible", "--project-root", projectRoot, "--format", "json"]),
    (error) =>
      error.code !== 0 && /invalid-input.*Unknown story/s.test(`${error.stdout}${error.stderr}`),
  );

  const invalidGateway = resolve(temporary, "invalid-gateway.mjs");
  await writeFile(invalidGateway, "export const BehaviorGateway = null;\n", "utf8");
  await assert.rejects(
    invoke([
      "story",
      "list",
      "--project-root",
      projectRoot,
      "--gateway",
      invalidGateway,
      "--format",
      "json",
    ]),
    (error) =>
      error.code !== 0 &&
      /error \[(?:invalid-input|unsupported-environment)\]/s.test(`${error.stdout}${error.stderr}`),
  );

  process.stdout.write("incident-console CLI evidence is deterministic and fail-closed\n");
} finally {
  await rm(temporary, { recursive: true, force: true });
}

