import { EXIT, MACHINE_ERRNOS, MARK, outcomeOfCore, resourceErrno } from "./core.ts";
import type { Pool, Runner } from "./runner.ts";
import type { Snapshot } from "./snapshot.ts";
import type { Item } from "./verdict.ts";

export type Scope = {
  readonly runner: (top: Pool) => Runner;
  readonly snapshot: (sources: readonly string[], context?: readonly string[]) => Snapshot;
};
export { MACHINE_ERRNOS };

export const thrownItem = (e: unknown, name = "threw"): Item => {
  const message = e instanceof Error ? (e.stack ?? e.message).split("\n").slice(0, 4).join(" | ") : String(e);
  const code = resourceErrno(e);
  return code !== undefined ? { kind: "machine", name: name === "threw" ? code : name, outcome: "unknown", why: `the machine (${code}): ${message}` } : { kind: "threw", name, outcome: "fail", why: message };
};

export const checkItems = (name: string, bad: readonly string[]): readonly Item[] =>
  bad.length === 0 ? [{ kind: "check", name, outcome: "pass", why: "" }] : bad.map((b) => ({ kind: "check", name, outcome: "fail", why: b }));

const flushed = (s: NodeJS.WriteStream, text: string) => new Promise<void>((resolve) => s.write(text, () => resolve()));
const COPY = /\/[^\s"'(]*?(?:\/flow-snap-[A-Za-z0-9]+)+\/(?:c-\d+-\d+|pristine)/g;

export const stated = async (gate: string, body: (scope: Scope) => Promise<readonly Item[]>): Promise<never> => {
  const run = process.env["FLOW_RUN"] ?? "top";
  let runner: { pool: Pool; r: Runner } | undefined;
  const snaps: Snapshot[] = [];
  let finished = false;
  const tidy = async () => {
    const r = runner;
    runner = undefined;
    if (r) await r.r.close();
    const { dropSnapshot } = await import("./snapshot.ts");
    for (const s of snaps.splice(0)) dropSnapshot(s);
  };
  const normalise = (items: readonly Item[]): readonly Item[] => JSON.parse(JSON.stringify(items).replace(COPY, "<copy>")) as readonly Item[];
  const write = async (items: readonly Item[]): Promise<never> => {
    finished = true;
    const v = { gate, run, items: normalise(items) };
    await flushed(process.stderr, "");
    await flushed(process.stdout, "");
    await flushed(process.stdout, `\n${MARK}${JSON.stringify(v)}\n`);
    process.exit(EXIT[outcomeOfCore(v.items)]);
  };
  const interrupted = (signal: string) => async () => {
    if (finished) return;
    finished = true;
    try {
      await tidy();
    } catch {}
    await write([{ kind: "machine", name: "interrupted", outcome: "unknown", why: `interrupted by ${signal}` }]);
  };
  for (const s of ["SIGINT", "SIGTERM", "SIGHUP"] as const) process.on(s, interrupted(s));
  let items: readonly Item[];
  try {
    const { makeRunner } = await import("./runner.ts");
    const { snapshot } = await import("./snapshot.ts");
    const { inheritedPool, isAlone, isTop } = await import("./spawn.ts");
    const live: Scope = {
      runner: (top) => {
        if (runner) {
          if (JSON.stringify(runner.pool) !== JSON.stringify(top)) throw new Error("defect: one runner per process, asked again with another pool");
          return runner.r;
        }
        const inherited = inheritedPool();
        const base = isTop() || inherited === null ? top : { ...top, slots: inherited.slots, mb: inherited.mb, budgetS: null };
        const pool = isAlone() ? { ...base, slots: 1 } : base;
        runner = { pool: top, r: makeRunner(pool) };
        return runner.r;
      },
      snapshot: (sources, context) => {
        const s = snapshot(sources, context);
        snaps.push(s);
        process.env["FLOW_SCRATCH"] ??= s.root;
        return s;
      },
    };
    items = await body(live);
  } catch (e) {
    items = [thrownItem(e)];
  }
  try {
    await tidy();
  } catch (e) {
    items = [...items, thrownItem(e)];
  }
  if (finished) return new Promise<never>(() => {});
  return write(items);
};
