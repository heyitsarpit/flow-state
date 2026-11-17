import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { Option } from "effect";
import { HISTORY } from "./history.ts";
import { worktreeAt } from "./worktree.ts";

// Records past commits' numbers: each commit is checked out clean and detached in a scratch
// folder, today's bench is copied over its own, and `run.ts --record --backfill` runs there with
// the given concerns, writing rows to this tree's history; then the worktree is removed.
//
// `backfill.ts <commit...> [--concern C]... [--only P] [--scratch DIR]`. A bench whose Story or
// module the commit does not have fails there and is left out, so it records only the benches it
// shares; its rows are marked `backfill`. A refused recording (a busy machine) stops the backfill with exit 2.
const { values, positionals: commits } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  options: {
    scratch: { type: "string", default: tmpdir() },
    concern: { type: "string", multiple: true, default: [] },
    only: { type: "string" },
    history: { type: "string", default: HISTORY },
    runs: { type: "string" },
    workers: { type: "string" },
  },
});

const passed = [...values.concern];

if (values.only !== undefined) passed.push("--only", values.only);

if (values.runs !== undefined) passed.push("--runs", values.runs);

if (values.workers !== undefined) passed.push("--workers", values.workers);

const failed: Array<string> = [];
const partial: Array<string> = [];
const refused = { any: false };

for (const commit of commits) {
  const tree = worktreeAt(commit, values.scratch);

  if (Option.isNone(tree)) {
    failed.push(`${commit}: no worktree`);
    continue;
  }

  const done = spawnSync(
    process.execPath,
    [
      join(tree.value.package, "bench", "run.ts"),
      "--record",
      "--backfill",
      "--history",
      values.history,
      ...passed,
    ],
    { cwd: tree.value.package, stdio: ["ignore", "inherit", "inherit"], timeout: 60 * 60 * 1000 },
  );

  tree.value.remove();

  if (done.status === 1) partial.push(`${commit}: some benches are not at this commit`);
  else if (done.status !== 0) {
    failed.push(`${commit}: run.ts exited ${done.status ?? done.signal ?? "?"}`);
    refused.any = done.status === 2;
    break;
  }
}

for (const p of partial) process.stdout.write(`${p}\n`);

for (const f of failed) process.stderr.write(`${f}\n`);

// Exit 2, as run.ts does, when a busy machine refused the recording, so a caller can wait and retry.
if (refused.any) process.exitCode = 2;
else process.exitCode = failed.length === 0 ? 0 : 1;
