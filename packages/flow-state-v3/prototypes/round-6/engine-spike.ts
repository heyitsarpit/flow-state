// A small sync engine behind the module seam, as the check D81 asks for. Not a product: the question is what core it needs. A server-issued
// cookie orders snapshots; a poke is atomic; a write is confirmed by `lmid` in the snapshot that carries its effect, so "confirmed" and
// "visible in the base" cannot disagree; pending writes past the LMID replay on top. Prior art: codebases/mono/packages/zero-client/src/
// client/zero-poke-handler.ts:301-375, replicache/src/sync/pull.ts:221-287. No `judge`: a cookie compare is all the order it needs. It
// shares no code with `entities.ts`, and no core file names it.
import { own } from "./gate.ts";
import type { Cx, Ended, Module, Told } from "./seam.ts";
import type { Predicted } from "../conformance/fixtures/compiled.ts";

type Pending = {
  readonly attempt: string;
  readonly predicted: readonly Predicted[];
  readonly done: boolean;
};
export type EngineSlice = {
  readonly cookie: number;
  readonly base: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  readonly pending: readonly Pending[]; // in mint order: replayed on top
};
export type Poke = {
  readonly _tag: "Poke";
  readonly base: number; // the cookie this applies on
  readonly cookie: number;
  readonly lmid: readonly string[]; // attempts this snapshot's effect includes
  readonly rows: ReadonlyArray<{ ref: string; fields?: Record<string, unknown>; removed?: true }>;
};
const empty: EngineSlice = { cookie: 0, base: {}, pending: [] };
const overlay = (s: EngineSlice, ref: string) => {
  let data: any = own(s.base, ref);
  let predicted = false;
  for (const e of s.pending)
    for (const p of e.predicted) {
      if (p.ref !== ref) continue;
      predicted = true;
      data = p.remove ? undefined : data === undefined ? undefined : { ...data, ...p.patch };
    }
  return data === undefined && !predicted
    ? undefined
    : { data, predicted, uncertain: false, unconfirmed: [] };
};
const onPoke = (s: EngineSlice, p: Poke, machine: string, cx: Cx): EngineSlice => {
  if (p.cookie <= s.cookie) {
    cx.note("Stale", { of: "poke" }); // a replay: it changes nothing
    return s;
  }
  if (p.base !== s.cookie) {
    // A hole: Replicache refuses a response on another base. Ask again.
    cx.note("PokeGap", { have: s.cookie, base: p.base });
    cx.command({ k: "pull", machine, have: s.cookie });
    return s;
  }
  const base = { ...s.base };
  for (const r of p.rows) {
    if (r.removed) delete base[r.ref];
    else base[r.ref] = r.fields ?? {};
  }
  // One step, so one publication: the effect and its confirmation land together.
  const pending = s.pending.filter((e) => !p.lmid.includes(e.attempt));
  cx.visible();
  return { cookie: p.cookie, base, pending };
};
export const engine: Module<EngineSlice> = {
  id: "engine",
  rank: 20,
  store: true,
  init: () => empty,
  prepare(_s, w, cx) {
    const write = cx.machine(w.machine).domain?.writes[w.op];
    if (!write) return undefined;
    return { predicted: cx.user(write.predicts, [w.input], () => []) };
  },
  start(s, w, prepared) {
    const p = prepared as { predicted: readonly Predicted[] } | undefined;
    if (!p) return { s, ok: true };
    return {
      s: {
        ...s,
        pending: [...s.pending, { attempt: w.attempt, predicted: p.predicted, done: false }],
      },
      ok: true,
    };
  },
  // `blocks: false`: no D3. The server orders; two writes to a record may both be out, and rebase is the replay above.
  blocks: () => false,
  ended(s, e: Ended, cx) {
    const how = e.how;
    cx.visible();
    if (
      how === "superseded" ||
      how === "released" ||
      (how !== "superseded" && how !== "released" && how.ch === "failure")
    )
      return { ...s, pending: s.pending.filter((x) => x.attempt !== e.attempt) };
    return {
      ...s,
      pending: s.pending.map((x) => (x.attempt === e.attempt ? { ...x, done: true } : x)),
    }; // success or unknown: until the LMID says
  },
  told(s, fact: Told, cx) {
    if (fact.k === "pushed") {
      const v = fact.value as Poke;
      return v?._tag === "Poke" ? onPoke(s, v, fact.machine, cx) : s;
    }
    if (fact.k === "gap") cx.note("EngineGap", { op: fact.op });
    return s;
  },
  input(s, payload, cx) {
    const p = payload as { k: "pulled"; machine: string; poke?: Poke };
    return p.k === "pulled" && p.poke ? onPoke(s, p.poke, p.machine, cx) : s;
  },
  read: (s, ref) => overlay(s, ref),
  exec(cmd, io) {
    const c = cmd as { k: "pull"; machine: string; have: number };
    const eff = (io.machine(c.machine).domain as any).repair.run(`pull|${c.have}`);
    io.fork(`pull:${c.have}`, eff, (exit) =>
      io.input({
        k: "pulled",
        machine: c.machine,
        ...(exit.t === "ok" ? { poke: exit.value } : {}),
      }),
    );
  },
};
