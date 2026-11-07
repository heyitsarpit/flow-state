import type { Pool, Runner } from "./runner.ts";
import type { Snapshot } from "./snapshot.ts";
import type { Item } from "./verdict.ts";

export type Scope = {
  readonly runner: (top: Pool) => Runner;
  readonly snapshot: (sources: readonly string[], context?: readonly string[]) => Snapshot;
};
export const MACHINE_ERRNOS: readonly string[] = ["EMFILE", "ENFILE", "ENOSPC", "EAGAIN", "ENOMEM", "EBUSY"];

const MARK = "VERDICT ";
const EXIT = { pass: 0, fail: 1, unknown: 2 } as const;

const outcomeOf = (items: readonly Item[]): keyof typeof EXIT => {
  const s = items.filter((i): i is Extract<Item, { outcome: unknown }> => "outcome" in i);
  if (s.length === 0 || s.some((i) => i.outcome === "fail")) return "fail";
  return s.some((i) => i.outcome === "unknown") ? "unknown" : "pass";
};

const thrown = (e: unknown): Item => {
  const code = (e as { code?: unknown } | null)?.code;
  const message = e instanceof Error ? (e.stack ?? e.message).split("\n").slice(0, 4).join(" | ") : String(e);
  return typeof code === "string" && MACHINE_ERRNOS.includes(code)
    ? { kind: "machine", name: code, outcome: "unknown", why: `the machine: ${message}` }
    : { kind: "threw", name: "threw", outcome: "fail", why: message };
};

export const checkItems = (name: string, bad: readonly string[]): readonly Item[] =>
  bad.length === 0 ? [{ kind: "check", name, outcome: "pass", why: "" }] : bad.map((b) => ({ kind: "check", name, outcome: "fail", why: b }));

const flushed =(s: NodeJS.WriteStream, text: string) => new Promise<void>((resolve) => s.write(text, () => resolve()));
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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
  const roots: string[] = [];
  const normalise = (items: readonly Item[]): readonly Item[] => {
    if (roots.length === 0) return items;
    const re = new RegExp(roots.map((r) => `${escape(r)}/[^/\\s"]+`).join("|"), "g");
    return JSON.parse(JSON.stringify(items).replace(re, "<copy>")) as readonly Item[];
  };
  const write = async (items: readonly Item[]): Promise<never> => {
    finished = true;
    const v = { gate, run, items: normalise(items) };
    await flushed(process.stderr, "");
    await flushed(process.stdout, "");
    await flushed(process.stdout, `${MARK}${JSON.stringify(v)}\n`);
    process.exit(EXIT[outcomeOf(v.items)]);
  };
  const interrupted = (signal: string) => async () => {
    if (finished) return;
    try {
      await tidy();
    } catch {}
    await write([{ kind: "machine", name: "interrupted", outcome: "unknown", why: `interrupted by ${signal}` }]);
  };
  process.on("SIGINT", interrupted("SIGINT"));
  process.on("SIGTERM", interrupted("SIGTERM"));
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
        roots.push(s.root);
        return s;
      },
    };
    items = await body(live);
  } catch (e) {
    items = [thrown(e)];
  }
  try {
    await tidy();
  } catch (e) {
    items = [...items, thrown(e)];
  }
  return write(items);
};
