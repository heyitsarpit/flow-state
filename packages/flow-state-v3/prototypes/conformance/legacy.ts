// Round 11 (D207): the hand fixtures' spelling, made `Compiled` before a Runtime sees it. A hand fixture wrote some closures bare (an op's `commit`, a domain's
// and a stream's functions); a compiler never does, so the Runtime's seal no longer takes them, and this suite-side step slots them, each under the path of
// its own place. It touches only those known places: a function anywhere else stays bare, and the seal refuses it (D77, `SealUnknownClosure`).
// Typed output passes through unchanged: it has no bare function.
import type { Compiled } from "./fixtures/compiled.ts";

type AnyFn = (...a: never[]) => unknown;
const slot = (definition: string, path: string, f: unknown) => (typeof f === "function" ? { run: f as AnyFn, at: { definition, path } } : f);
const each = <A>(o: Readonly<Record<string, A>> | undefined, f: (k: string, a: A) => unknown) =>
  o === undefined ? undefined : Object.fromEntries(Object.entries(o).map(([k, a]) => [k, f(k, a)]));
const STREAM = ["key", "backoff", "subscribe", "reconnectWhile", "pageRetryWhile", "catchUp"] as const;
const streamPath = (n: string) => (n === "reconnectWhile" ? "reconnect.while" : n === "pageRetryWhile" ? "page.while" : n);
export const legacySlots = (c: Compiled): Compiled => {
  const id = c.id;
  const ops = each(c.ops, (k, op) => (typeof op.commit === "function" ? { ...op, commit: slot(id, `operations.${k}.commit`, op.commit) } : op));
  const d = c.domain as Record<string, unknown> | undefined;
  const domain = d && {
    ...d,
    writes: each(d["writes"] as Record<string, Record<string, unknown>>, (k, w) => ({ ...w, ...(w["confirms"] ? { confirms: slot(id, `domain.writes.${k}.confirms`, w["confirms"]) } : {}) })),
    reads: each(d["reads"] as Record<string, unknown>, (k, f) => slot(id, `domain.reads.${k}`, f)),
    ...(d["listens"] ? { listens: each(d["listens"] as Record<string, unknown>, (k, f) => slot(id, `domain.listens.${k}`, f)) } : {}),
    repair: slot(id, "domain.repair", d["repair"]),
    ...(d["version"] ? { version: slot(id, "domain.version", d["version"]) } : {}),
    ...(typeof d["versionOrder"] === "function" ? { versionOrder: slot(id, "domain.versionOrder", d["versionOrder"]) } : {}),
  };
  const streams = each(c.streams as Record<string, Record<string, unknown>> | undefined, (k, s) => ({
    ...s,
    ...Object.fromEntries(STREAM.filter((n) => s[n] !== undefined).map((n) => [n, slot(id, `streams.${k}.${streamPath(n)}`, s[n])])),
  }));
  return { ...c, ops: ops as Compiled["ops"], ...(domain ? { domain: domain as never } : {}), ...(streams ? { streams: streams as never } : {}) };
};
