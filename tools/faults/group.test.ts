// No process the faults runner starts outlives it: a command whose time is up, and a run stopped by
// SIGINT, SIGTERM or SIGHUP, leave none of the command's processes behind.
//
//   node --experimental-strip-types tools/faults/group.test.ts
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { runGrouped, stopOnSignals } from "./group.ts";

// A command that starts two sleepers, prints their pids, and waits on them, as vitest waits on its
// workers.
const tree = ["-c", "sleep 30 & echo $!; sleep 30 & echo $!; wait"];
const options = { cwd: import.meta.dirname, env: process.env, maxBuffer: 1024 * 1024 };

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);

    return true;
  } catch {
    return false;
  }
};

const pause = (ms: number) => new Promise((done) => setTimeout(done, ms));
const pidsOf = (out: string) => out.split("\n").filter((line) => /^\d+$/u.test(line)).map(Number);

if (process.argv[2] === "driver") {
  // The stop path: a run that started the tree and is then stopped by a signal.
  stopOnSignals(() => undefined);
  void runGrouped("sh", tree, { ...options, timeoutMs: 60_000 });
  // Keeps the driver alive until the test's signal stops it.
  setInterval(() => undefined, 1000);
} else {
  // The timeout path.
  const ended = await runGrouped("sh", tree, { ...options, timeoutMs: 500 });
  const pids = pidsOf(ended.out);

  await pause(300);
  assert.equal(ended.timedOut, true);
  assert.deepEqual(pids.filter(alive), [], "a timed-out command left processes running");

  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
    const driver = spawn(process.execPath, ["--experimental-strip-types", import.meta.filename, "driver"], { stdio: "ignore" });

    await pause(1000);
    const listed = spawn("pgrep", ["-P", String(driver.pid)]);
    const shells = await new Promise<string>((done) => {
      let out = "";
      listed.stdout.on("data", (chunk) => (out += String(chunk)));
      listed.on("close", () => done(out));
    });
    const sleepers = await Promise.all(
      pidsOf(shells).map(
        (shell) =>
          new Promise<Array<number>>((done) => {
            const kids = spawn("pgrep", ["-P", String(shell)]);
            let out = "";
            kids.stdout.on("data", (chunk) => (out += String(chunk)));
            kids.on("close", () => done(pidsOf(out)));
          }),
      ),
    );
    const started = [...pidsOf(shells), ...sleepers.flat()];

    assert.ok(started.length >= 3, `the driver started its command (${signal})`);
    driver.kill(signal);
    await new Promise((done) => driver.on("exit", done));
    await pause(300);
    assert.deepEqual(started.filter(alive), [], `a run stopped by ${signal} left processes running`);
  }

  console.log("group: no process outlives a timeout or a stop");
}
