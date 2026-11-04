// Round 13, the story prototype: the design's public Story API (machine-design 2.10, rules 61-66), on the round 13 runtime and the harness's fake world.
// A Story is an inert plan (2.10.1): a subject, its options and steps, each step in its data form. Constructing one starts nothing; each chained step
// returns a new plan, so a prefix never changes (rule 66). `run()` is the one execution boundary: a fresh Runtime, the world built first, every step
// applied and then settled (rule 61), a cut after every step (rule 64), and checkpoints that name cuts. Checks are the test's (rule 63).
// Every difference from 2.10 is in `../api-changes.md`.
import { Option, Schema } from "effect";
import { makeHarness } from "../../conformance/drive.ts";
import type { Compiled } from "../../conformance/fixtures/compiled.ts";
import type { ActorRef, Answer, Fixture, Harness, Row } from "../../conformance/harness.ts";
import { definition, Flow, machine } from "../../conformance/compile/index.ts";
import { fixture } from "../../conformance/typed/lab.ts";
import type { Api } from "../../conformance/fake-world.ts";
import { port } from "../adapter.ts";
import { isWorldStep, type AnyServer, type ControlStep, type Endpoint, type Response, type WireStep, type WorldStep } from "./fake.ts";

// ── Events. The compile prototype's `E.X` is a token, not a constructor, so a Story makes its sends from the subject's `Compiled.events` (round 13, M3):
// each a constructor checked at once against the event's payload Schemas by their type side. Only events sendable from outside are given (rule 47):
// a machine's `events`, a fragment's `events` and `hostEvents`.
export type Event = { readonly tag: string; readonly payload: Readonly<Record<string, unknown>> };
export type Events = Readonly<Record<string, (payload?: Readonly<Record<string, unknown>>) => Event>>;
const eventsOf = (names: readonly string[], payloads: Readonly<Record<string, Readonly<Record<string, unknown>>>>, owner: string): Events =>
  Object.fromEntries(
    names.map((tag) => {
      const fields = payloads[tag] ?? {};
      const make = Schema.Struct(fields as Readonly<Record<string, Schema.Top>>) as unknown as { makeOption: (p: unknown) => Option.Option<unknown> };
      return [
        tag,
        (payload: Readonly<Record<string, unknown>> = {}): Event => {
          if (Option.isNone(make.makeOption(payload))) throw new Error(`StoryInvalidEvent: ${owner} ${tag} ${JSON.stringify(payload)} does not fit its payload`);
          return { tag, payload };
        },
      ];
    }),
  );

// ── The plan, as data.
export type Duration = number | `${number} ${"millis" | "seconds" | "minutes"}`;
export type Address = { readonly schedule?: string };
export type Step =
  | { readonly send: readonly [Event] }
  | { readonly world: readonly WorldStep[] }
  | { readonly advance: number | { readonly next: Address } }
  | { readonly reload: "main" }
  | { readonly enter: readonly [unknown?] }
  | { readonly leave: Readonly<Record<string, never>> }
  | { readonly guards: Readonly<Record<string, true | string>> }
  | { readonly checkpoint: readonly [string] };
type Subject =
  | { readonly kind: "machine"; readonly fixture: Fixture; readonly compiled: Compiled; readonly input?: unknown }
  | { readonly kind: "fragment"; readonly fragment: FragmentLike; readonly fixture: Fixture; readonly compiled: Compiled; readonly instance: string; readonly ports: StandIn };
export type Options = { readonly id: string; readonly input?: unknown; readonly world?: readonly WorldStep[]; readonly fakes?: readonly AnyServer[] };
const ms = (d: Duration): number => {
  if (typeof d === "number") return d;
  const [n, u] = d.split(" ") as [string, string];
  return Number(n) * (u === "minutes" ? 60_000 : u === "seconds" ? 1000 : 1);
};

export class Story<C extends string = never> {
  private constructor(
    readonly subject: Subject,
    readonly options: Options,
    readonly steps: readonly Step[],
  ) {}
  static machine(f: Fixture, options: Options) {
    const api = new Proxy({}, { get: () => () => undefined }) as Api;
    return new Story({ kind: "machine", fixture: f, compiled: f.make(api), ...(options.input === undefined ? {} : { input: options.input }) }, options, []);
  }
  // 2.10.12: a fragment alone runs in a stand-in host Flow builds from the fragment's declaration alone (rule 66, W30).
  static fragment(frag: FragmentLike, options: Options) {
    const host = standIn(frag);
    return new Story({ kind: "fragment", fragment: frag, ...host }, options, []);
  }
  // What a test sends: the subject's outside events, checked by their payload Schemas.
  get E(): Events {
    const s = this.subject;
    if (s.kind === "machine") return eventsOf(s.compiled.events?.external ?? [], s.compiled.events?.payloads ?? {}, s.compiled.id);
    const f = s.fragment.compiled;
    return eventsOf([...f.events.external, ...(f.events.host ?? [])], f.events.payloads, f.id);
  }
  get id() {
    return this.options.id;
  }
  get kind() {
    return this.subject.kind;
  }
  private with<D extends string = C>(...more: Step[]): Story<D> {
    return new Story<D>(this.subject, this.options, [...this.steps, ...more]);
  }
  send(...events: Event[]): Story<C> {
    return this.with(...events.map((e): Step => ({ send: [e] })));
  }
  world(...controls: WorldStep[]): Story<C> {
    return this.with({ world: controls });
  }
  advance(d: Duration | { readonly next: Address }): Story<C> {
    return this.with({ advance: typeof d === "object" ? d : ms(d) });
  }
  reload(tab: "main" = "main"): Story<C> {
    if (this.subject.kind !== "machine") throw new Error("StoryInvalidCommand: reload on a fragment Story");
    return this.with({ reload: tab });
  }
  enter(input?: unknown): Story<C> {
    if (this.subject.kind !== "fragment") throw new Error("StoryInvalidCommand: enter on a machine Story");
    return this.with({ enter: input === undefined ? [] : [input] });
  }
  leave(): Story<C> {
    if (this.subject.kind !== "fragment") throw new Error("StoryInvalidCommand: leave on a machine Story");
    return this.with({ leave: {} });
  }
  guards(answers: Readonly<Record<string, true | string>>): Story<C> {
    if (this.subject.kind !== "fragment") throw new Error("StoryInvalidCommand: guards on a machine Story");
    for (const k of Object.keys(answers)) if (!(k in this.subject.fragment.compiled.ports.guards)) throw new Error(`StoryInvalidCommand: no guard port ${k}`);
    return this.with({ guards: answers });
  }
  // 2.10.6: `end` is reserved; a duplicate name is refused (a type error in the design).
  checkpoint<N extends string>(name: N extends "end" ? never : N): Story<C | N> {
    if ((name as string) === "end" || this.steps.some((s) => "checkpoint" in s && s.checkpoint[0] === name)) throw new Error(`StoryInvalidCommand: checkpoint ${name}`);
    return this.with<C | N>({ checkpoint: [name] });
  }
  // Every fake server the plan names, in the `world` option or a step: what `flow story describe` prints, and what `run()` builds.
  get fakes(): readonly AnyServer[] {
    const named = new Set<string>();
    for (const w of [...(this.options.world ?? []), ...this.steps.flatMap((s) => ("world" in s ? s.world : []))]) named.add("wire" in w ? w.wire.server : w.control.server);
    const all = this.options.fakes ?? [];
    for (const n of named) if (!all.some((f) => f.name === n)) throw new Error(`StoryFakeError: ${this.id} names a server ${n} it is not given`);
    return all;
  }
  run(): StoryRun<C> {
    return execute(this) as StoryRun<C>;
  }
}

// ── The stand-in host (2.10.12): a trait on a node with `resetOn` the subject, a subroutine on a state. Placement from the declaration alone.
export type FragmentLike = {
  readonly id: string;
  readonly kind: "trait" | "subroutine";
  readonly compiled: { readonly id: string; readonly kind: "trait" | "subroutine"; readonly events: { readonly external: readonly string[]; readonly host?: readonly string[]; readonly internal: readonly string[]; readonly payloads: Readonly<Record<string, Readonly<Record<string, unknown>>>> }; readonly ports: { readonly exits: Readonly<Record<string, unknown>>; readonly callbacks: Readonly<Record<string, unknown>>; readonly guards: Readonly<Record<string, unknown>> } };
};
type StandIn = { answers: Record<string, true | string>; input: unknown };
const standIn = (frag: FragmentLike): { fixture: Fixture; compiled: Compiled; instance: string; ports: StandIn } => {
  const ports: StandIn = { answers: {}, input: undefined };
  const f = frag.compiled;
  const isSub = f.kind === "subroutine";
  const fill = {
    ...(isSub ? { input: () => ports.input } : {}),
    guards: Object.fromEntries(Object.keys(f.ports.guards).map((g) => [g, () => (ports.answers[g] === undefined || ports.answers[g] === true ? true : { deny: ports.answers[g] })])),
    callbacks: Object.fromEntries(Object.keys(f.ports.callbacks).map((c) => [c, {}])),
    ...(isSub ? { exits: Object.fromEntries(Object.keys(f.ports.exits).map((x) => [x, { target: { node: "OUT" } }])) } : {}),
  };
  const id = `Story/${f.id}`;
  const d = definition({
    id,
    states: isSub ? (["OUT", { IN: frag }] as never) : ([{ IN: Flow.state({ traits: { subject: frag } as never }) }, "OUT"] as never),
    events: { StoryEnter: {}, StoryLeave: {} },
    internalEvents: {},
    memory: {},
    operations: () => ({}),
  });
  const typed = machine(d as never, ({ S }: { S: Record<string, unknown> }) => ({
    default: S["OUT"],
    on: { StoryEnter: { target: S["IN"] }, StoryLeave: { target: S["OUT"] } },
    ...(isSub ? { states: { IN: fill } } : { states: { IN: { traits: { subject: fill } } } }),
  }) as never) as never;
  const fx = fixture(typed);
  const api = new Proxy({}, { get: () => () => undefined }) as Api;
  const compiled = fx.make(api);
  const node = compiled.nodes["IN"]!;
  const instance = (isSub ? node.subroutine?.name : node.placements?.[0]?.name) ?? "subject";
  return { fixture: fx, compiled, instance, ports };
};

// ── A run's record. A cut is captured at each step's end; reads answer from it after the run (2.10.6).
// `aborted`: the client gave it up before any answer (a `latest` superseding it, a cancel); the server never acted on it in this fake.
export type Request = { readonly seq: number; readonly input: unknown; readonly via: { readonly attempts: readonly string[] }; readonly phase: "held" | "answered" | "dropped" | "orphan" | "open" | "aborted" };
type Cut = {
  readonly index: number;
  readonly command: Step | { readonly start: true };
  readonly now: number;
  readonly state: string | undefined;
  readonly memory: unknown;
  readonly step: number; // the plan's step index; -1 for the start
  readonly rows: Readonly<Record<string, Row | undefined>>;
  readonly lanes: Readonly<Record<string, Readonly<Record<string, Row>>>>; // op -> key (JSON) -> its non-idle row
  readonly truth: Readonly<Record<string, unknown>>;
  readonly requests: Readonly<Record<string, readonly Request[]>>;
  readonly evidence: number; // the evidence position at the cut (`seq`)
  readonly issues: number;
  readonly frames: number;
};
export type Record_ = Readonly<Record<string, unknown>> & { readonly kind: string; readonly seq: number };
export class Checkpoint {
  constructor(
    private readonly run: StoryRunData,
    readonly cut: Cut,
  ) {}
  get state() {
    if (this.cut.state === undefined) throw new Error("SubjectAbsent");
    return this.cut.state;
  }
  get memory(): any {
    if (this.cut.state === undefined) throw new Error("SubjectAbsent");
    return this.cut.memory;
  }
  get now() {
    return this.cut.now;
  }
  get seq() {
    return this.cut.evidence;
  }
  // `s.operations.<op>`: the row as a view reads it, total (2.7.5).
  get operations(): Readonly<Record<string, Row | undefined>> {
    return this.cut.rows;
  }
  // 2.10.6's `lane`: for tests, `undefined` when nothing is there, so a settled lane reads as gone. With no key, the one lane of `op`, or `AmbiguousRead`.
  lane(op: string, key?: Readonly<Record<string, unknown>>): Row | undefined {
    const rows = this.cut.lanes[op] ?? {};
    if (key !== undefined) return Object.entries(rows).find(([k]) => k === JSON.stringify(Object.fromEntries(Object.keys(JSON.parse(k) as object).map((f) => [f, key[f]]))))?.[1];
    const all = Object.values(rows);
    if (all.length > 1) throw new Error(`AmbiguousRead: ${all.length} lanes of ${op}; give a key`);
    return all[0];
  }
  read(x?: AnyServer | Endpoint): unknown {
    if (x === undefined) return this.cut.state === undefined ? undefined : { state: this.cut.state, memory: this.cut.memory };
    if ("kind" in x && x.kind === "server") return this.cut.truth[x.name];
    const e = x as Endpoint;
    return this.cut.requests[`${e.server}.${e.name}`] ?? [];
  }
  records(kind: string, filter: Readonly<Record<string, unknown>> = {}): readonly Record_[] {
    return this.run.records.filter((r) => r.seq < this.cut.evidence && r.kind === kind && Object.entries(filter).every(([k, v]) => r[k] === v));
  }
  // The Attempt's id: mints in order, `n` from 0.
  attempt(op: string, o: { readonly n?: number } = {}): string | undefined {
    const mints = this.records("mint", { op });
    if (o.n === undefined && mints.length > 1) throw new Error(`AmbiguousRead: ${mints.length} Attempts of ${op}; give n`);
    return mints[o.n ?? 0]?.["attempt"] as string | undefined;
  }
  get issues() {
    return this.run.issues.slice(0, this.cut.issues);
  }
}
type StoryRunData = { readonly records: readonly Record_[]; readonly issues: ReadonlyArray<{ readonly code: string }> };
export type StoryRun<C extends string> = {
  readonly id: string;
  readonly checkpoints: { readonly [K in C]: Checkpoint };
  readonly end: Checkpoint;
  readonly cuts: readonly Cut[]; // internal in the design (for the player and `flow trace`); exposed here for the CLI
  readonly evidence: readonly Record_[];
  readonly issues: ReadonlyArray<{ readonly code: string; readonly origin?: string }>;
  readonly requests: ReadonlyArray<{ readonly endpoint: string; readonly seq: number; readonly step: number; readonly input: unknown; readonly attempt?: string; readonly phase: Request["phase"] }>;
};

// ── The executor. One harness per run, booted on the round 13 runtime; the world's answers are given by the fakes' handlers between the runtime's own
// settles, until nothing is left that the world would do without a step (rule 61's "finish", for this harness).
type Entry = { endpoint: string; server: AnyServer; route: string; seq: number; step: number; input: unknown; attempt?: string; phase: Request["phase"]; boot: number };
const execute = (story: Story<string>): StoryRun<string> => {
  const s = story.subject;
  const servers = new Map(story.fakes.map((f) => [f.name, f]));
  const truth = new Map<string, unknown>([...servers].map(([k, f]) => [k, f.def.initial]));
  const routes = new Map<string, { server: AnyServer; endpoint: string }>();
  for (const f of servers.values()) for (const [name, c] of Object.entries(f.def.endpoints)) routes.set(c.route ?? name, { server: f, endpoint: name });
  const rules = new Map<string, { hold: boolean; drops: Array<{ at: "request" | "response" }> }>();
  const rule = (k: string) => rules.get(k) ?? (rules.set(k, { hold: false, drops: [] }), rules.get(k)!);
  const h: Harness = makeHarness(port)();
  h.start({ machines: [s.fixture], seed: 1 });
  const A: ActorRef = { actor: s.compiled.id, id: "story" };
  const entries: Entry[] = [];
  let boot = 0;
  let stepNo = -1;
  let enterInput: unknown;
  const controls = (w: ControlStep) => {
    const f = servers.get(w.control.server);
    const c = f?.def.controls?.[w.control.name];
    if (!f || !c) throw new Error(`StoryFakeError: no control ${w.control.server}.${w.control.name}`);
    truth.set(f.name, c.apply(truth.get(f.name), w.control.params).truth);
  };
  const answerOf = (r: Response): Answer => ("ok" in r ? { ok: r.ok } : { fail: { ...r.fail, tag: r.fail._tag } });
  const handle = (e: Entry) => {
    const c = e.server.def.endpoints[e.endpoint]!;
    let out;
    try {
      out = c.handle(truth.get(e.server.name), e.input, e.attempt ? { idempotencyKey: e.attempt } : {});
    } catch (x) {
      throw new Error(`StoryFakeError: ${e.server.name}.${e.endpoint} threw: ${String(x)}`); // a broken fake is a broken run (rule 62)
    }
    if (out.truth !== undefined) truth.set(e.server.name, out.truth);
    return out.response;
  };
  // Answer one request, by its op and input, oldest first: the fake world answers in arrival order per op, which is why a later request of a held route waits.
  // Whether it is still there to answer: the client may have given it up (a `latest` superseding it, a cancel), and then there is nothing to deliver.
  const stillOpen = (e: Entry) =>
    e.boot < boot || h.read.outside().open.some((o) => o.op === e.route && o.key === e.attempt && JSON.stringify(o.input) === JSON.stringify(e.input));
  const deliver = (e: Entry, a: Answer) => {
    const where = typeof e.input === "object" && e.input !== null ? Object.fromEntries(Object.entries(e.input as Record<string, unknown>).filter(([, v]) => v === null || typeof v !== "object")) : undefined;
    if (e.boot < boot) h.do({ fault: { lateAnswer: [e.route, a] } }); // the network kept it; the answer goes nowhere (2.10.10)
    else h.do({ answer: e.route, with: a, ...(where ? { where } : {}) });
  };
  const settleWorld = () => {
    for (let guard = 0; guard < 10_000; guard++) {
      // New arrivals: every request the runtime sent since the last look.
      const reqs = h.read.requests();
      for (let i = entries.length; i < reqs.length; i++) {
        const r = reqs[i]!;
        const to = routes.get(r.op);
        if (!to) throw new Error(`StoryFakeError: a request to ${r.op}, which no fake of ${story.id} serves`);
        entries.push({ endpoint: to.endpoint, server: to.server, route: r.op, seq: i, step: stepNo, input: r.input, ...(r.idempotencyKey ? { attempt: r.idempotencyKey } : {}), phase: "open", boot });
      }
      for (const e of entries) if ((e.phase === "open" || e.phase === "held") && e.boot === boot && !stillOpen(e)) e.phase = "aborted";
      const next = entries.find((e) => e.phase === "open" && !reqs[e.seq]!.answered);
      if (next) {
        const k = `${next.server.name}.${next.endpoint}`;
        const r = rule(k);
        const olderHeld = entries.some((e) => e.route === next.route && e.seq < next.seq && e.phase === "held");
        if (r.hold || olderHeld) next.phase = "held";
        else if (r.drops.length) {
          const d = r.drops.shift()!;
          next.phase = "dropped";
          if (d.at === "request") deliver(next, { lost: true });
          else {
            const resp = handle(next);
            deliver(next, "ok" in resp ? { lostButLanded: resp.ok } : { lost: true });
          }
        } else {
          next.phase = next.boot < boot ? "orphan" : "answered";
          deliver(next, answerOf(handle(next)));
        }
        continue;
      }
      const st = h.read.outside().storage.filter((x) => !x.hung);
      if (st.length) {
        h.do({ storage: "ack" });
        continue;
      }
      return;
    }
    throw new Error(`StoryTurnLimit: ${story.id} step ${stepNo}: the world did not settle`);
  };
  const wire = (w: WireStep) => {
    const k = `${w.wire.server}.${w.wire.endpoint}`;
    const r = rule(k);
    if (w.wire.word === "hold") r.hold = true;
    else if (w.wire.word === "drop") for (let i = 0; i < (w.wire.times ?? 1); i++) r.drops.push({ at: w.wire.at ?? "request" });
    else {
      const held = entries.filter((e) => `${e.server.name}.${e.endpoint}` === k && e.phase === "held");
      if (!held.length && !r.hold) throw new Error(`StoryInvalidCommand: NothingHeld at ${k}`);
      r.hold = false;
      for (const e of held) e.phase = "open";
    }
  };
  const apply = (w: WorldStep) => (isWorldStep(w) && "wire" in w ? wire(w) : controls(w as ControlStep));
  const now = () => h.read.now();
  const advanceBy = (d: number) => {
    const target = now() + d;
    for (let guard = 0; guard < 100_000; guard++) {
      const due = h.read.outside().timers.filter((t) => t > now() && t <= target).sort((a, b) => a - b)[0];
      const to = due ?? target;
      h.do({ advance: to - now() });
      settleWorld();
      if (now() >= target) return;
    }
    throw new Error(`StoryTurnLimit: ${story.id} step ${stepNo}: advance fired too many deadlines`);
  };
  // Every non-idle lane of each write, by key. The harness's reads have no lane listing (Inspection's, 2.10.7), so the keys asked about are those the run
  // could have made: every request's input and every sent event's payload, picked by the op's key fields, and the subject's memory. Stated.
  const lanesNow = (): Cut["lanes"] => {
    const out: Record<string, Readonly<Record<string, Row>>> = {};
    for (const [op, o] of Object.entries(s.compiled.ops)) {
      if (o.kind !== "write") continue;
      const keyOf = (src: unknown) => Object.fromEntries((o.keyFields ?? []).map((f) => [f, (src as Record<string, unknown> | undefined)?.[f]]));
      const sources = [...entries.filter((e) => e.route === op || e.endpoint === op).map((e) => e.input), ...sentPayloads, s.kind === "machine" ? h.read.memory(A) : undefined];
      const rows: Record<string, Row> = {};
      for (const src of sources) {
        const key = keyOf(src);
        const k = JSON.stringify(key);
        if (k in rows) continue;
        const row = h.read.row(A, op, key);
        if (row && (row.pending || row.uncertain || row.waiting || row.outstanding > 0)) rows[k] = row;
      }
      out[op] = rows;
    }
    return out;
  };
  const sentPayloads: unknown[] = [];
  const verdicts: Record_[] = [];
  const cuts: Cut[] = [];
  const cut = (command: Cut["command"]) => {
    const inner = s.kind === "fragment" ? h.read.inner(A, [s.instance]) : undefined;
    const state = s.kind === "machine" ? h.read.state(A) : inner?.state;
    const memory = s.kind === "machine" ? h.read.memory(A) : inner?.memory;
    const lanes = lanesNow();
    const rows: Record<string, Row | undefined> = {};
    const idle = { pending: false, uncertain: false, waiting: false, retryCount: 0, outstanding: 0 };
    for (const op of Object.keys(s.compiled.ops)) rows[op] = Object.values(lanes[op] ?? {})[0] ?? idle;
    const requests: Record<string, Request[]> = {};
    for (const e of entries) (requests[`${e.server.name}.${e.endpoint}`] ??= []).push({ seq: e.seq, input: e.input, via: { attempts: e.attempt ? [e.attempt] : [] }, phase: e.phase });
    cuts.push({
      index: cuts.length,
      step: stepNo,
      command,
      now: now(),
      state,
      memory: structuredClone(memory),
      rows,
      lanes,
      truth: Object.fromEntries([...truth].map(([k, v]) => [k, structuredClone(v)])),
      requests,
      evidence: h.read.evidence().length,
      issues: h.read.issues().length,
      frames: h.read.frames().length,
    });
  };
  // The start (2.10.1): the world first, then the subject.
  for (const w of story.options.world ?? []) apply(w);
  if (s.kind === "machine") h.do({ ensure: A, ...(s.input === undefined ? {} : { input: s.input }) });
  else h.do({ ensure: A });
  settleWorld();
  cut({ start: true });
  const named = new Map<string, Cut>();
  story.steps.forEach((st, i) => {
    stepNo = i;
    if ("checkpoint" in st) {
      named.set(st.checkpoint[0], cuts.at(-1)!);
      return;
    }
    if ("send" in st) {
      const e = st.send[0];
      sentPayloads.push(e.payload);
      const from = h.read.evidence().length;
      h.do({ send: A, event: e.tag, payload: e.payload, ...(s.kind === "fragment" ? { to: [s.instance] } : {}) });
      // 2.10.6's `verdict`, one per send: the Runtime's first word on this event in this step (`turn`, `Denied` or `Unhandled`).
      const ev = h.read.evidence();
      for (let i = from; i < ev.length; i++) {
        const r = ev[i]!;
        if (r["event"] !== e.tag || !["turn", "Denied", "Unhandled"].includes(r["kind"])) continue;
        verdicts.push({ kind: "verdict", seq: i, event: e.tag, result: r["kind"] === "turn" ? { _tag: "Allowed" } : r["kind"] === "Denied" ? { _tag: "Denied", reasons: r["reasons"] } : { _tag: "Unhandled" } });
        break;
      }
    } else if ("world" in st) for (const w of st.world) apply(w);
    else if ("advance" in st) {
      if (typeof st.advance === "number") {
        if (!Number.isFinite(st.advance) || st.advance < 0) throw new Error(`InvalidDuration: ${st.advance}`);
        advanceBy(st.advance);
      } else {
        const name = st.advance.next.schedule;
        const t = h.read.quiet().waits.filter((w) => w.kind === "timer" && (w as { key: string }).key.endsWith(`/${name}`)).map((w) => (w as { at: number }).at).sort((a, b) => a - b)[0];
        if (t === undefined) throw new Error(`StoryInvalidCommand: NoDeadline for schedule ${name}`);
        advanceBy(t - now());
      }
    } else if ("reload" in st) {
      boot++;
      h.do({ reload: true });
    } else if ("enter" in st && s.kind === "fragment") {
      enterInput = st.enter[0];
      s.ports.input = enterInput;
      h.do({ send: A, event: "StoryEnter", payload: {} });
    } else if ("leave" in st) h.do({ send: A, event: "StoryLeave", payload: {} });
    else if ("guards" in st && s.kind === "fragment") Object.assign(s.ports.answers, st.guards);
    settleWorld();
    cut(st);
  });
  // A held request at the end is the Story's own business (rule 61's finish is not built: there is no host work in this harness to wait for).
  const evidence = h.read.evidence().map((r, seq) => ({ ...r, seq }) as Record_);
  const data: StoryRunData = { records: [...evidence, ...verdicts].sort((a, b) => a.seq - b.seq || (a.kind === "verdict" ? -1 : 1)), issues: h.read.issues() };
  const end = new Checkpoint(data, cuts.at(-1)!);
  return {
    id: story.id,
    checkpoints: Object.fromEntries([...named].map(([k, c]) => [k, new Checkpoint(data, c)])) as never,
    end,
    cuts,
    evidence,
    issues: h.read.issues(),
    requests: entries.map((e) => ({ endpoint: `${e.server.name}.${e.endpoint}`, seq: e.seq, step: e.step, input: e.input, ...(e.attempt ? { attempt: e.attempt } : {}), phase: e.phase })),
  };
};
export const isStory = (x: unknown): x is Story<string> => x instanceof Story;
export type { Endpoint, WireStep, ControlStep };
