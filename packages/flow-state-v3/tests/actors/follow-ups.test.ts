import { Effect, Option, Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { attachInspector, type Evidence } from "../../src/host/inspect.ts";
import {
  type ActorRef,
  actorRef,
  app,
  definition,
  Flow,
  machine,
  runtimeSetup,
} from "../../src/index.ts";

const Head = definition({
  id: "Chain/Head",
  states: ["ON"],
  events: { Bump: {} },
  memory: { n: Flow.initial(Schema.Number, 0) },
});

const HeadMachine = machine(Head, ({ S }) => ({
  default: S.ON,
  on: { Bump: { updateMemory: ({ memory }) => ({ n: memory.n + 1 }) } },
}));

type Upstream = Pick<typeof Head, "Provider">;

// One link of a context chain: it selects its upstream's n, and its onContext event copies it, so
// each link adds two follow-ups to the event that started the chain: its context update and its
// event.
const link = (at: number, upstream: Upstream, copies: number) => {
  const Link = definition({
    id: `Chain/Link${at}`,
    states: ["ON"],
    events: {},
    internalEvents: { Copy: { n: Schema.Number } },
    memory: { n: Flow.initial(Schema.Number, 0) },
    context: { up: upstream.Provider.select(Schema.Number, (s) => s.memory.n) },
  });

  return machine(Link, ({ S, E }) => ({
    default: S.ON,
    onContext: Array.from({ length: copies }, () => ({
      select: ({ context }: { readonly context: { readonly up: number } }) => context.up,
      event: E.Copy.from((n: number) => ({ n })),
    })),
    on: { Copy: { updateMemory: ({ event }) => ({ n: event.n }) } },
  }));
};

const LINKS = 34;

// An app entry of the chain: the head, or a link wired to its upstream.
type ChainEntry =
  | typeof HeadMachine
  | { readonly machine: ReturnType<typeof link>; readonly context: Record<string, ActorRef> };

// The actor a link selects from: its provider definition and its ref.
type Above = { readonly provider: Upstream; readonly ref: ActorRef };

// A chain whose first link enqueues `firstCopies` events per change and every other link one.
const chainOf = (firstCopies: number) => {
  const pairs: Array<readonly [string, ChainEntry]> = [["head", HeadMachine]];
  const refs: Array<ActorRef> = [];
  let upstream: Above = { provider: Head, ref: actorRef(HeadMachine, "head") };

  for (let at = 1; at <= LINKS; at += 1) {
    const linked = link(at, upstream.provider, at === 1 ? firstCopies : 1);
    const ref = actorRef(linked, "link");
    pairs.push([`link${at}`, { machine: linked, context: { up: upstream.ref } }]);
    refs.push(ref);
    upstream = { provider: linked.definition, ref };
  }

  return { entries: Object.fromEntries(pairs), refs };
};

// Each link of a context chain adds its context update and its onContext events as follow-ups of
// the head's bump: a chain of 34 links adds 68 or, with two events at the first link, 69.
const settledChain = (firstCopies: number) => {
  const built = chainOf(firstCopies);

  const runtime = runtimeSetup({
    app: app({ id: `chain-${firstCopies}`, machines: built.entries }),
  }).construct();

  Effect.runSync(runtime.ready());
  const seen: Array<Evidence> = [];
  const handles = built.refs.map((ref) => runtime.ensureActor(ref));
  attachInspector(runtime, (e) => void seen.push(e));
  runtime.ensureActor(actorRef(HeadMachine, "head")).send(Head.E.Bump());

  return {
    values: handles.map((h) => Option.map(h.getSnapshot(), (s) => s.memory["n"])),
    issues: seen.filter((e) => e._tag === "Issue"),
  };
};

describe("follow-ups (Actors R13, I20)", () => {
  it("Actors R13: context updates and onContext events never count toward the 64 follow-ups, so a 34-link chain reaches every link with no issue", () => {
    const { values, issues } = settledChain(1);

    expect(values).toEqual(values.map(() => Option.some(1)));
    expect(issues).toEqual([]);
  });

  it("Actors R13, R14: a chain whose first link adds two events per change also reaches every link, and nothing is dropped", () => {
    const { values, issues } = settledChain(2);

    expect(values).toEqual(values.map(() => Option.some(1)));
    expect(issues).toEqual([]);
  });
});
