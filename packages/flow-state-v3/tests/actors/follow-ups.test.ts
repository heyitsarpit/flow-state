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
const link = (at: number, upstream: Upstream) => {
  const Link = definition({
    id: `Chain/Link${at}`,
    states: ["ON"],
    events: {},
    internalEvents: { Copy: { n: Schema.Number } },
    memory: { n: Flow.initial(Schema.Number, 0) },
    context: { up: upstream.Provider.select((s) => s.memory.n) },
  });

  return machine(Link, ({ S, E }) => ({
    default: S.ON,
    onContext: [
      { select: ({ context }) => context.up, event: E.Copy.from((n: number) => ({ n })) },
    ],
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

const chain = (() => {
  const pairs: Array<readonly [string, ChainEntry]> = [["head", HeadMachine]];
  const refs: Array<ActorRef> = [];
  let upstream: Above = { provider: Head, ref: actorRef(HeadMachine, "head") };

  for (let at = 1; at <= LINKS; at += 1) {
    const linked = link(at, upstream.provider);
    const ref = actorRef(linked, "link");
    pairs.push([`link${at}`, { machine: linked, context: { up: upstream.ref } }]);
    refs.push(ref);
    upstream = { provider: linked.definition, ref };
  }

  return { entries: Object.fromEntries(pairs), refs };
})();

describe("follow-ups (Actors R13, I20)", () => {
  it("Actors R13, I20: an admitted event's follow-ups run first, at most 64; the 65th is refused with an issue naming the chain", () => {
    const runtime = runtimeSetup({
      app: app({ id: "chain", machines: chain.entries }),
    }).construct();

    Effect.runSync(runtime.ready());
    const seen: Array<Evidence> = [];
    const handles = chain.refs.map((ref) => runtime.ensureActor(ref));
    attachInspector(runtime, (e) => void seen.push(e));
    runtime.ensureActor(actorRef(HeadMachine, "head")).send({ _tag: "Bump" });

    const nOf = (at: number) =>
      Option.map(handles[at - 1]?.getSnapshot() ?? Option.none(), (s) => s.memory["n"]);

    expect(nOf(32)).toEqual(Option.some(1));
    expect(nOf(33)).toEqual(Option.some(0));
    expect(seen.filter((e) => e._tag === "Issue").map((e) => e.code)).toEqual(["InvalidTurn"]);
  });
});
