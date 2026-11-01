// Small helpers for hand-written compiled data. Paths name where the real machine has the closure.
import { Effect } from "effect";
import type {
  Alternative,
  Mapped,
  Member,
  Node,
  ScheduleSpec,
  Slot,
  TokenGuard,
} from "./compiled.ts";
import { Outcome } from "./compiled.ts";

export type AltSpec = {
  target?: string;
  tokens?: readonly TokenGuard[];
  guards?: ReadonlyArray<(g: any) => any>;
  patch?: (u: any) => object;
  members?: (path: string) => readonly Member[];
  raises?: Alternative["raises"];
  notify?: Alternative["notify"];
  exit?: Alternative["exit"];
  history?: true;
  followUps?: ReadonlyArray<(a: any) => { tag: string; payload: any }>;
};
export const fixtureOf = (D: string) => {
  const slot = <F>(path: string, run: F): Slot<F> => ({ run, at: { definition: D, path } });
  const alts = (base: string, specs: readonly AltSpec[]): readonly Alternative[] =>
    specs.map((s, i) => {
      const path = `${base}[${i}]`;
      return {
        target: s.target ?? "self",
        at: { definition: D, path },
        tokens: s.tokens ?? [],
        guards: (s.guards ?? []).map((g, j) => slot(`${path}.guard[${j}]`, g)),
        ...(s.patch ? { patch: slot(`${path}.updateMemory`, s.patch) } : {}),
        members: s.members ? s.members(path) : [],
        ...(s.raises ? { raises: s.raises } : {}),
        ...(s.notify ? { notify: s.notify } : {}),
        ...(s.exit ? { exit: s.exit } : {}),
        ...(s.history ? { history: s.history } : {}),
        ...(s.followUps
          ? { followUps: s.followUps.map((f, j) => slot(`${path}.followUp[${j}]`, f)) }
          : {}),
      };
    });
  const on = (base: string, t: Record<string, readonly AltSpec[]>) =>
    Object.fromEntries(
      Object.entries(t).map(([k, v]) => [k, alts(base ? `${base}.on.${k}` : `on.${k}`, v)]),
    );
  const node = (
    id: string,
    table: Record<string, readonly AltSpec[]> = {},
    schedules: readonly ScheduleSpec[] = [],
    _noParent?: undefined,
  ): Node => ({
    id,
    ...(id === "root" ? {} : { parent: "root" }),
    on: on(id === "root" ? "" : `states.${id}`, table),
    schedules,
  });
  const commit =
    (op: string, f: (a: any) => unknown) =>
    (p: string): readonly Member[] => [{ op, verb: "commit", input: slot(`${p}.actions[0]`, f) }];
  const lookup =
    (op: string, f: (a: any) => unknown) =>
    (p: string): readonly Member[] => [{ op, verb: "lookup", input: slot(`${p}.actions[0]`, f) }];
  const member =
    (op: string, verb: "retry" | "cancel", key?: (a: any) => unknown) =>
    (p: string): readonly Member[] => [
      { op, verb, ...(key ? { key: slot(`${p}.actions[0].key`, key) } : {}) },
    ];
  const mapped = (
    op: string,
    name: string,
    event: string,
    f?: (v: any, c: any) => any,
  ): Mapped => ({
    event,
    ...(f ? { from: slot(`operations.${op}.${name}`, f) } : {}),
  });
  const memory = (f: (i: any) => object) => ({ initial: slot("memory.initial", f) });
  const key = (op: string, f: (i: any) => unknown) => slot(`operations.${op}.key`, f);
  return { slot, alts, on, node, commit, lookup, member, mapped, memory, key };
};
export const unknownWhenLost = <A, E extends { readonly _tag: string }>(
  write: Effect.Effect<A, E>,
): Effect.Effect<A, unknown> =>
  write.pipe(
    Effect.catch((e): Effect.Effect<never, unknown> =>
      e._tag === "NoResponse" || e._tag === "ServerError" ? Outcome.unknown(e) : Effect.fail(e),
    ),
  );
