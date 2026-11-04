// Round 11 (D207): the hand fixtures' spelling, made `Compiled` before a Runtime sees it. A hand fixture wrote some closures bare (an op's `commit`); a compiler
// never does, so the Runtime's seal no longer takes them, and this suite-side step slots them under the path of their own place. Typed output passes unchanged.
// Round 12: it also completes what the seal now requires and a compiler always writes (D213-D216): each op's `services` (a hand commit closes over the fake,
// so none) and `inputFields` (unknown for a closure key: the hand op keeps its `key` closure, F2, and the seal takes it only from an op with no `keyFields`);
// the memory's `fields` (F11's open record has none), and identity `restore` and `encode` where the hand memory had none, which is what the Runtime's
// removed fallback did; and `events`, inferred from the handlers and the endings, as `flow check` inferred them before.
// Review M1: both branches stay, since both are reached. The domain branch by REV4-H2, REV4-H4, REV5-H1 and SEARCH-ODD-ALL; the stream branch by the
// `listen.load` search, which boots the hand Desk/Tickets (round 12, run: cut, that search threw `SealUnknownClosure: Desk/Tickets streams.changes.key`;
// the census counts scenarios only, which is why the review saw none). Their paths are pinned by `checks/front-check.ts`.
import type { Compiled, Fragment, Memory, Node } from "./fixtures/compiled.ts";

type AnyFn = (...a: never[]) => unknown;
const slot = (definition: string, path: string, f: unknown) => (typeof f === "function" ? { run: f as AnyFn, at: { definition, path } } : f);
const each = <A>(o: Readonly<Record<string, A>> | undefined, f: (k: string, a: A) => unknown) =>
  o === undefined ? undefined : Object.fromEntries(Object.entries(o).map(([k, a]) => [k, f(k, a)]));
const STREAM = ["key", "backoff", "subscribe", "reconnectWhile", "pageRetryWhile", "catchUp"] as const;
const streamPath = (n: string) => (n === "reconnectWhile" ? "reconnect.while" : n === "pageRetryWhile" ? "page.while" : n);
const memoryOf = (definition: string, m: Memory): Memory => ({
  ...m,
  fields: m.fields ?? {},
  restore: m.restore ?? { run: (stored: object) => stored, at: { definition, path: "memory.restore" } },
  encode: m.encode ?? { run: (memory: object) => memory, at: { definition, path: "memory.encode" } },
});
const handled = (nodes: Readonly<Record<string, Node>>): string[] => Object.values(nodes).flatMap((n) => Object.keys(n.on));
const sent = (nodes: Readonly<Record<string, Node>>): string[] => Object.values(nodes).flatMap((n) => n.schedules.map((s) => s.send));
const eventsOf = (c: Compiled): NonNullable<Compiled["events"]> => {
  const mapped = new Set(
    Object.values(c.ops).flatMap((o) => {
      const u = o.outcomes.unknown;
      return [
        ...(o.outcomes.success ? [o.outcomes.success.event] : []),
        ...Object.values(o.outcomes.failure).map((m) => m.event),
        ...(u ? ("byReason" in u ? Object.values(u.byReason).map((m) => m.event) : [u.event]) : []),
      ];
    }),
  );
  const frags: readonly Fragment[] = Object.values(c.fragments ?? {});
  const internal = new Set([...mapped, ...sent(c.nodes), ...frags.flatMap((f) => sent(f.nodes))]);
  const all = new Set([...handled(c.nodes), ...frags.flatMap((f) => handled(f.nodes))]);
  return { external: [...all].filter((e) => !internal.has(e)).sort(), internal: [...internal].sort() };
};
export const legacySlots = (c: Compiled): Compiled => {
  const id = c.id;
  const ops = each(c.ops, (k, op) => ({
    ...op,
    ...(typeof op.commit === "function" ? { commit: slot(id, `operations.${k}.commit`, op.commit) } : {}),
    services: op.services ?? [],
  }));
  const fragments = each(c.fragments, (k, f) => ({ ...f, memory: memoryOf(k, f.memory) }));
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
  return {
    ...c,
    ...(domain ? { domain: domain as never } : {}),
    ...(streams ? { streams: streams as never } : {}),
    ops: ops as Compiled["ops"],
    memory: memoryOf(id, c.memory),
    ...(fragments ? { fragments: fragments as Compiled["fragments"] } : {}),
    events: c.events ?? eventsOf(c),
  };
};
