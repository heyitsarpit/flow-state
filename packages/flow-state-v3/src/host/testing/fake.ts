import {
  Context,
  Deferred,
  Effect,
  Effectable,
  Exit,
  Layer,
  Option,
  Random,
  Record,
  Result,
  Schema,
} from "effect";
import type { Fields, StructType } from "../../contract.ts";
import type { Values } from "../../core/compiled.ts";
import { type Bytes, type Purpose, type Store, StoreRefused } from "../host.ts";
import { type At, mainTab, scriptFault, type Tab, WorldWord } from "./steps.ts";

/**
 * A fake call's answer was lost: the port fake maps it to the port's own error.
 */
export class FakeLost extends Schema.TaggedError<FakeLost>()("FakeLost", {}) {}

/**
 * What happened to one call of an endpoint.
 *
 * **Details**
 *
 * `answered`: the handler ran and its Exit was delivered. `held at request`: waiting for
 * `release`, the handler not run. `held at response`: the handler ran, its answer waits for
 * `release`. `dropped at request`: failed `Fake.Lost`, the handler never ran. `dropped at
 * response`: the handler ran and its answer was lost. `handled`: released after its waiter was
 * gone (its tab dead, or its commit's deadline passed), so the handler ran and nothing was
 * delivered.
 */
export type CallStatus =
  | "answered"
  | "held at request"
  | "held at response"
  | "dropped at request"
  | "dropped at response"
  | "handled";

/**
 * One call an endpoint received: its request, the tab it came from, the index of the step during
 * which it arrived (-1 at the tab's first open) and its status.
 */
export type CallEntry<I = Values> = {
  readonly input: I;
  readonly tab: Tab;
  readonly step: number;
  readonly status: CallStatus;
};

/**
 * One endpoint of a fake server: its request fields, its answer's Schemas and its handler.
 */
export type Endpoint<T, F extends Fields, S extends Schema.Top, X extends Schema.Top> = {
  readonly request: F;
  readonly success: S;
  readonly failure: X;
  handle(
    truth: T,
    request: StructType<F>,
  ): { readonly truth: T; readonly exit: Exit.Exit<S["Type"], X["Type"]> };
};

/**
 * One control of a fake server: its input fields and how it changes truth.
 */
export type Control<T, F extends Fields> = {
  readonly fields: F;
  apply(truth: T, input: StructType<F>): T;
};

// FLOW_STATE_ALLOW_UNKNOWN: a server's endpoints each have their own truth and types; the run reads them erased.
type AnyEndpoint = Endpoint<unknown, Fields, Schema.Top, Schema.Top>;

// FLOW_STATE_ALLOW_UNKNOWN: a server's controls each have their own truth and input; the run reads them erased.
type AnyControl = Control<unknown, Fields>;

/**
 * A fake server as the run reads it: its name, its truth's Schema and start, its endpoints and
 * its controls. Its identity is the server's.
 */
export type AnyServer = {
  readonly name: string;
  readonly truth: Schema.Top;
  // FLOW_STATE_ALLOW_UNKNOWN: a value of the server's own truth Schema.
  readonly initial: unknown;
  readonly endpoints: Readonly<Record<string, AnyEndpoint>>;
  readonly controls: Readonly<Record<string, AnyControl>>;
};

/**
 * What a port fake gets from a server: each endpoint as a function from its request to an Effect
 * of its success, failing with its failure or `Fake.Lost`.
 */
export type ServiceOf<E extends Readonly<Record<string, AnyEndpoint>>> = {
  readonly [K in keyof E]: (
    request: StructType<E[K]["request"]>,
  ) => Effect.Effect<E[K]["success"]["Type"], E[K]["failure"]["Type"] | FakeLost>;
};

/**
 * An endpoint's wire words, and what `read(endpoint)` reads.
 */
export type EndpointHandle<I = Values> = {
  readonly "~endpoint": { readonly server: AnyServer; readonly name: string };
  // oxlint-disable-next-line lint-bomb/no-optional-domain-properties -- a phantom type: it carries the type for reads and holds no value
  readonly "~input"?: I;
  // oxlint-disable-next-line lint-bomb/no-optional-domain-properties, lint-bomb/no-nullish-function-contracts -- the Plan's public word: an omitted option takes its default
  readonly hold: (options?: { readonly at?: At }) => WorldWord;
  readonly release: () => WorldWord;
  readonly lose: () => WorldWord;
  // oxlint-disable-next-line lint-bomb/no-optional-domain-properties, lint-bomb/no-nullish-function-contracts -- the Plan's public word: an omitted option takes its default
  readonly drop: (options?: { readonly at?: At }) => WorldWord;
};

/**
 * A declared fake server: an Effect of its endpoints for a port fake, with each endpoint's wire
 * words and each control's word as its properties.
 */
export type Server<
  T,
  E extends Readonly<Record<string, AnyEndpoint>>,
  C extends Readonly<Record<string, AnyControl>>,
> = Effect.Effect<ServiceOf<E>, never, FakeWorld> & {
  readonly "~server": AnyServer;
  // oxlint-disable-next-line lint-bomb/no-optional-domain-properties -- a phantom type: it carries the type for reads and holds no value
  readonly "~truth"?: T;
} & { readonly [K in keyof E]: EndpointHandle<StructType<E[K]["request"]>> } & {
  readonly [K in keyof C]: (input: StructType<C[K]["fields"]>) => WorldWord;
};

// FLOW_STATE_ALLOW_UNKNOWN: an endpoint answers with its own types; the world passes them through.
type Erased = (request: Values) => Effect.Effect<unknown, unknown>;

/**
 * The run's fake servers, as a service: every port fake reaches its server through it.
 */
export class FakeWorld extends Context.Service<
  FakeWorld,
  { readonly serve: (server: AnyServer) => Readonly<Record<string, Erased>> }
>()("flow-state/testing/FakeWorld") {}

// RETURN_TYPE: the EndpointHandle contract the Server type names for each endpoint.
const endpointOf = (server: AnyServer, name: string): EndpointHandle => ({
  "~endpoint": { server, name },
  hold: (options) =>
    WorldWord.wire({ server, endpoint: name, word: "hold", at: options?.at ?? "request" }),
  release: () => WorldWord.wire({ server, endpoint: name, word: "release", at: "request" }),
  lose: () => WorldWord.wire({ server, endpoint: name, word: "lose", at: "response" }),
  drop: (options) =>
    WorldWord.wire({ server, endpoint: name, word: "drop", at: options?.at ?? "request" }),
});

type Held = {
  readonly server: AnyServer;
  readonly endpoint: string;
  readonly index: number;
  readonly open: number;
  // FLOW_STATE_ALLOW_UNKNOWN: a handler's Exit, of its endpoint's own types.
  readonly exit: Option.Option<Exit.Exit<unknown, unknown>>;
  // FLOW_STATE_ALLOW_UNKNOWN: the held call's answer, of its endpoint's own types.
  readonly answer: Deferred.Deferred<unknown, unknown>;
};

type Logged = { readonly server: AnyServer; readonly endpoint: string; readonly entry: CallEntry };

type Pending = { readonly word: "hold" | "drop"; readonly at: At; readonly step: number };

/**
 * The fake servers between two steps, as `save` copies them: each server's truth, every call, the
 * wire words still waiting, the held calls, the handler faults, the answers whose waiter is gone,
 * each server's slot number and the network.
 */
export type ServersSaved = {
  // FLOW_STATE_ALLOW_UNKNOWN: each server's truth, of its own Schema.
  readonly truths: ReadonlyMap<AnyServer, unknown>;
  readonly log: ReadonlyArray<Logged>;
  readonly pending: ReadonlyMap<string, ReadonlyArray<Pending>>;
  readonly held: ReadonlyArray<Held>;
  readonly faults: ReadonlyArray<string>;
  // FLOW_STATE_ALLOW_UNKNOWN: held answers whose waiter was interrupted, of their endpoints' own types.
  readonly gone: ReadonlySet<Deferred.Deferred<unknown, unknown>>;
  readonly ids: ReadonlyMap<AnyServer, number>;
  readonly offline: boolean;
};

/**
 * The fake servers before anything reaches them: every server at its `initial`, online.
 */
export const noServers: ServersSaved = {
  truths: new Map(),
  log: [],
  pending: new Map(),
  held: [],
  faults: [],
  gone: new Set(),
  ids: new Map(),
  offline: false,
};

// A copy that shares nothing a later step changes: held calls, log entries and truths are replaced,
// never changed, so only the collections and the waiting words' queues are copied.
const serversOf = (saved: ServersSaved) => ({
  truths: new Map(saved.truths),
  log: [...saved.log],
  pending: new Map(Array.from(saved.pending, ([slot, left]) => [slot, Array.from(left)])),
  held: [...saved.held],
  faults: [...saved.faults],
  gone: new Set(saved.gone),
  ids: new Map(saved.ids),
  offline: saved.offline,
});

/**
 * A run's fake servers: their truth, every call each endpoint received, and the wire words.
 * `alive` says whether a tab's open may still be answered; `step` is the index of the step
 * running; `arrived` hears each call's log index as it arrives; `from` is where they start.
 */
export const makeWorld = (
  alive: (open: number) => boolean,
  step: () => number,
  arrived: (index: number) => void,
  from: ServersSaved = noServers,
) => {
  const { truths, log, pending, held, faults, gone, ids } = serversOf(from);
  let { offline } = from;

  const slot = (server: AnyServer, endpoint: string) => {
    if (!ids.has(server)) ids.set(server, ids.size);

    return `${ids.get(server)}.${endpoint}`;
  };

  const truthOf = (server: AnyServer) => (truths.has(server) ? truths.get(server) : server.initial);

  const mark = (index: number, status: CallStatus) => {
    const at = log[index];

    if (at !== undefined) log[index] = { ...at, entry: { ...at.entry, status } };
  };

  const handled = (server: AnyServer, endpoint: string, input: Values) =>
    Option.flatMap(Option.fromUndefinedOr(server.endpoints[endpoint]), (it) =>
      Result.match(
        Result.try(() => it.handle(truthOf(server), input)),
        {
          onFailure: () => {
            faults.push(`${server.name}.${endpoint}'s handler threw`);

            return Option.none();
          },
          onSuccess: (out) => {
            truths.set(server, out.truth);

            return Option.some(out.exit);
          },
        },
      ),
    );

  const wait = (entry: Held) => {
    held.push(entry);

    return Deferred.await(entry.answer).pipe(
      Effect.onInterrupt(() => Effect.sync(() => void gone.add(entry.answer))),
    );
  };

  const call =
    // RETURN_TYPE: the erased endpoint the world serves; the Server type restores its own types.
    (open: number, server: AnyServer, endpoint: string): Erased =>
      (input) =>
        Effect.suspend(() => {
          // A dead tab's fibers never run again, so this is unreachable; it reaches no server.
          if (!alive(open)) return Effect.never;
          const next = offline ? undefined : pending.get(slot(server, endpoint))?.shift();

          const index =
            log.push({
              server,
              endpoint,
              entry: { input, tab: mainTab(open), step: step(), status: "answered" },
            }) - 1;

          arrived(index);

          // Offline, a call never reaches its server: it is lost at request, words untouched.
          if (offline) {
            mark(index, "dropped at request");

            return Effect.fail(new FakeLost());
          }

          const hold = (exit: Held["exit"]) =>
            wait({
              server,
              endpoint,
              index,
              open,
              exit,
              answer: Deferred.makeUnsafe(),
            });

          if (next === undefined)
            return Option.getOrElse(handled(server, endpoint, input), () => Effect.never);

          if (next.word === "hold" && next.at === "request") {
            mark(index, "held at request");

            return hold(Option.none());
          }

          if (next.word === "hold") {
            mark(index, "held at response");

            return hold(handled(server, endpoint, input));
          }

          if (next.at === "response") {
            handled(server, endpoint, input);
            mark(index, "dropped at response");
          } else mark(index, "dropped at request");

          return Effect.fail(new FakeLost());
        });

  const release = (server: AnyServer, endpoint: string, lost: boolean) => {
    const at = held.findIndex((h) => h.server === server && h.endpoint === endpoint);
    const entry = held[at] ?? scriptFault(`nothing held at ${server.name}.${endpoint}`);
    held.splice(at, 1);
    const exit = Option.isSome(entry.exit) ? entry.exit : handled(server, endpoint, input(entry));

    if (Option.isSome(exit) && alive(entry.open) && !gone.has(entry.answer)) {
      mark(entry.index, lost ? "dropped at response" : "answered");
      Deferred.doneUnsafe(entry.answer, lost ? Exit.fail(new FakeLost()) : exit.value);
    } else mark(entry.index, "handled");
  };

  const input = (entry: Held) => log[entry.index]?.entry.input ?? {};

  const control = (server: AnyServer, name: string, value: Values) =>
    Option.match(Option.fromUndefinedOr(server.controls[name]), {
      onNone: () => scriptFault(`${server.name} has no control ${name}`),
      onSome: (it) =>
        Result.match(
          Result.try(() => it.apply(truthOf(server), value)),
          {
            onFailure: () => scriptFault(`${server.name}.${name} threw`),
            onSuccess: (truth) => void truths.set(server, truth),
          },
        ),
    });

  return {
    save: () => serversOf({ truths, log, pending, held, faults, gone, ids, offline }),
    service: (open: number) =>
      FakeWorld.of({
        serve: (server) =>
          Object.fromEntries(
            Object.keys(server.endpoints).map((endpoint) => [
              endpoint,
              call(open, server, endpoint),
            ]),
          ),
      }),
    word: (word: WorldWord) =>
      WorldWord.$match(word, {
        control: ({ server, control: name, input: value }) => control(server, name, value),
        wire: ({ server, endpoint, word: kind, at }) => {
          if (kind === "release" || kind === "lose")
            return release(server, endpoint, kind === "lose");
          const key = slot(server, endpoint);
          pending.set(key, [...(pending.get(key) ?? []), { word: kind, at, step: step() }]);
        },
        storage: () => scriptFault("a storage word reached the fake servers"),
        stored: () => scriptFault("a storage word reached the fake servers"),
        network: ({ word: kind }) => {
          offline = kind === "offline";
        },
      }),
    truthOf,
    calls: (server: AnyServer, endpoint: string) =>
      log.filter((l) => l.server === server && l.endpoint === endpoint).map((l) => l.entry),
    log: () => [...log],
    truths: () => new Map(truths),
    faults: () => [...faults],
    unused: () =>
      [...pending].flatMap(([key, left]) =>
        left.map((p) => `${p.word} at ${p.at} on ${key} never used`),
      ),
    unusedAt: () => [...pending.values()].flatMap((left) => left.map((p) => p.step)),
    held: () =>
      held.map((h) => ({
        server: h.server,
        endpoint: h.endpoint,
        input: log[h.index]?.entry.input ?? {},
      })),
  };
};

/**
 * One write batch the run's store received.
 *
 * **Details**
 *
 * `status`: `held` waits for `Fake.storage.release()`; `landed` is in the store; `refused` failed
 * `StoreRefused`; `aborted` was released after its tab died, so it never landed. `step` is the
 * index of the step that issued it; `answered` is the index of the step whose end first saw it
 * landed, refused or aborted, and `None` while it is held.
 */
export type Batch = {
  readonly tab: Tab;
  readonly purpose: Purpose;
  readonly keys: ReadonlyArray<string>;
  readonly acknowledges: ReadonlyArray<string>;
  readonly status: "held" | "landed" | "refused" | "aborted";
  readonly step: number;
  readonly answered: Option.Option<number>;
};

const issuedAs = { hold: "held", refuse: "refused" } as const;

type Out = {
  readonly batch: Batch;
  readonly writes: ReadonlyArray<Bytes>;
  readonly answer: Deferred.Deferred<void, StoreRefused>;
};

/**
 * The store between two steps, as `save` copies it: its records, the storage words still armed,
 * the refused loads still waiting, and every batch it received with its writes.
 */
export type StoreSaved = {
  readonly data: ReadonlyMap<string, string>;
  readonly next: ReadonlyArray<{ readonly word: "hold" | "refuse"; readonly step: number }>;
  readonly loads: ReadonlyArray<{ readonly step: number }>;
  readonly batches: ReadonlyArray<Out>;
};

/**
 * The store before anything is written: no records, words or batches.
 */
export const noStore: StoreSaved = { data: new Map(), next: [], loads: [], batches: [] };

// Batches are replaced, never changed, so only the collections are copied.
const storeOf = (saved: StoreSaved) => ({
  data: new Map(saved.data),
  next: [...saved.next],
  loads: [...saved.loads],
  batches: [...saved.batches],
});

/**
 * The run's durable store: its records, the batches it received, and the storage words. `issued`
 * hears each batch's index as it is issued; `step` is the index of the step running; a `seed`
 * shuffles the order each open loads the records in; `from` is where it starts.
 */
export const makeStore = (
  alive: (open: number) => boolean,
  issued: (index: number) => void,
  step: () => number,
  seed: Option.Option<number>,
  from: StoreSaved = noStore,
) => {
  const { data, next, loads, batches } = storeOf(from);

  const apply = (writes: ReadonlyArray<Bytes>) => {
    for (const w of writes)
      Option.match(w.value, {
        onNone: () => data.delete(w.key),
        onSome: (value) => data.set(w.key, value),
      });
  };

  const mark = (out: Out, status: Batch["status"]) => {
    batches[batches.indexOf(out)] = {
      ...out,
      batch: { ...out.batch, status, answered: Option.some(step()) },
    };
  };

  return {
    save: () => storeOf({ data, next, loads, batches }),
    data: () => new Map(data),
    batches: () => batches.map((b) => b.batch),
    // RETURN_TYPE: the Store contract a tab's Host carries.
    at: (open: number): Store => ({
      load: Effect.suspend(() =>
        loads.shift() === undefined
          ? Option.match(seed, {
              onNone: () => Effect.sync(() => new Map(data)),
              onSome: (given) =>
                Effect.suspend(() => Random.shuffle([...data])).pipe(
                  Effect.map((entries) => new Map(entries)),
                  Random.withSeed(`${given}:${open}`),
                ),
            })
          : Effect.fail(new StoreRefused({})),
      ),
      write: (writes, purpose, acknowledges) =>
        Effect.suspend(() => {
          // A dead tab's fibers never run again, so this is unreachable; it writes nothing.
          if (!alive(open)) return Effect.never;
          const word = next.shift()?.word;
          const answer = Deferred.makeUnsafe<void, StoreRefused>();

          const status = word === undefined ? "landed" : issuedAs[word];
          const at = step();

          const batch: Batch = {
            tab: mainTab(open),
            purpose,
            keys: writes.map((w) => w.key),
            acknowledges,
            status,
            step: at,
            answered: status === "held" ? Option.none() : Option.some(at),
          };

          if (status === "landed") apply(writes);
          issued(batches.push({ batch, writes, answer }) - 1);

          if (status === "held") return Deferred.await(answer);

          return status === "refused" ? Effect.fail(new StoreRefused({})) : Effect.void;
        }),
    }),
    put: (key: string, text: string) => void data.set(key, text),
    word: (word: "hold" | "refuse" | "release" | "refuseHeld" | "refuseLoad") => {
      if (word === "refuseLoad") return void loads.push({ step: step() });

      if (word === "hold" || word === "refuse") return void next.push({ word, step: step() });

      const out =
        batches.find((b) => b.batch.status === "held") ?? scriptFault("nothing held at the store");

      if (word === "refuseHeld") {
        mark(out, "refused");
        Deferred.doneUnsafe(out.answer, Exit.fail(new StoreRefused({})));

        return;
      }

      apply(out.writes);
      mark(out, "landed");
      Deferred.doneUnsafe(out.answer, Exit.void);
    },
    abortHeld: (open: number) => {
      for (const out of batches.filter(
        (b) => b.batch.status === "held" && b.batch.tab.open === open,
      ))
        mark(out, "aborted");
    },
    landHeld: (open: number) => {
      for (const out of batches.filter(
        (b) => b.batch.status === "held" && b.batch.tab.open === open,
      )) {
        apply(out.writes);
        mark(out, "landed");
      }
    },
    unused: () => [
      ...next.map(({ word }) => `storage ${word} never used`),
      ...loads.map(() => "storage refuseLoad never used"),
    ],
    unusedAt: () => [...next.map((p) => p.step), ...loads.map((p) => p.step)],
    heldWrites: () =>
      batches.flatMap((b) => (b.batch.status === "held" ? [b.batch.acknowledges] : [])),
  };
};

/**
 * A declared fake server as a value: an Effectable of its served endpoints, carrying its
 * declaration for the run.
 */
class FakeServer<A> extends Effectable.Class<A, never, FakeWorld> {
  readonly "~server": AnyServer;
  readonly #served: Effect.Effect<A, never, FakeWorld>;

  constructor(server: AnyServer, served: Effect.Effect<A, never, FakeWorld>) {
    super();
    this["~server"] = server;
    this.#served = served;
  }

  asEffect() {
    return this.#served;
  }
}

/**
 * Stands in for the world outside the app in a Story.
 *
 * **When to use**
 *
 * `Fake.server` once per outside system, with its truth, endpoints (`Fake.call`) and controls
 * (`Fake.control`); a port fake is a plain `Layer.effect` of the app's own service over it, given
 * to `Story.app` as a fixture. `Fake.storage` holds or refuses the run's store writes. `Fake.world`
 * runs a port fake outside a Story, as a contract test does.
 *
 * **Details**
 *
 * A handler is pure and synchronous: `handle(truth, request)` returns the next truth and an Exit of
 * the endpoint's own Schemas (`failure: Schema.Never` for none). Truth lives in the run and lasts across reloads. Wire words act on
 * an endpoint's next call (`hold`, `drop`) or its oldest held call (`release`, or `lose`, which
 * runs the handler as release does and loses its answer); they decide
 * delivery, never the answer, which is always a handler's. A call no word acts on is answered at
 * once.
 *
 * **Gotchas**
 *
 * - A held call never released is never answered; only the commit's own deadline ends it.
 * - An endpoint or control named like a member of an Effectable (`pipe`, `asEffect`, `toJSON`,
 *   `toString`) shadows it.
 */
export const Fake = {
  // RETURN_TYPE: the Server contract keeps its truth, endpoints and controls.
  server: <
    T,
    const E extends Readonly<Record<string, Endpoint<T, Fields, Schema.Top, Schema.Top>>>,
    const C extends Readonly<Record<string, Control<T, Fields>>> = Record<never, never>,
  >(
    name: string,
    config: {
      readonly truth: Schema.Codec<T, unknown>;
      readonly initial: NoInfer<T>;
      readonly endpoints: E;
      // oxlint-disable-next-line lint-bomb/no-optional-domain-properties -- the Plan's public word: an omitted option takes its default
      readonly controls?: C;
    },
  ): Server<T, E, C> => {
    const server: AnyServer = {
      name,
      truth: config.truth,
      initial: config.initial,
      endpoints: config.endpoints,
      controls: config.controls ?? {},
    };

    const endpoints = Record.map(config.endpoints, (_, it) => endpointOf(server, it));

    const controls = Record.map(
      server.controls,
      (_, it) => (input: Values) => WorldWord.control({ server, control: it, input }),
    );

    // SAFETY: the world serves each endpoint by its name, through that endpoint's own handler, whose Exit has its own Schemas' types.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a service built key by key from the server's endpoints
    const served = Effect.map(FakeWorld, (world) => world.serve(server) as ServiceOf<E>);

    // SAFETY: each endpoint's handle carries its own request type only as a phantom, and each control's word takes that control's own input.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the handles and words built from the declaration, under their own names
    return Object.assign(new FakeServer(server, served), endpoints, controls) as Server<T, E, C>;
  },
  // RETURN_TYPE: the Endpoint contract keeps its request, success and failure types.
  call: <T, const F extends Fields, S extends Schema.Top, X extends Schema.Top>(config: {
    readonly request: F;
    readonly success: S;
    readonly failure: X;
    readonly handle: (
      truth: T,
      request: StructType<F>,
    ) => { readonly truth: T; readonly exit: Exit.Exit<S["Type"], X["Type"]> };
  }): Endpoint<T, F, S, X> => config,
  // RETURN_TYPE: the Control contract keeps its input type.
  control: <T, const F extends Fields>(
    fields: F,
    apply: (truth: T, input: StructType<F>) => T,
  ): Control<T, F> => ({ fields, apply }),
  /**
   * The run's fake servers as a Layer, each server at its `initial`: for a port fake outside a
   * Story.
   */
  world: Layer.sync(FakeWorld, () =>
    makeWorld(
      () => true,
      () => 0,
      () => undefined,
    ).service(0),
  ),
  Lost: FakeLost,
  storage: {
    hold: () => WorldWord.storage({ word: "hold" }),
    refuse: () => WorldWord.storage({ word: "refuse" }),
    release: () => WorldWord.storage({ word: "release" }),
    /**
     * The oldest held write fails StoreRefused and lands nothing, as a store that took a write
     * and then refused it does (a transaction aborted on quota).
     */
    refuseHeld: () => WorldWord.storage({ word: "refuseHeld" }),
    /**
     * The next open's load fails, as a store that cannot be read does.
     */
    refuseLoad: () => WorldWord.storage({ word: "refuseLoad" }),
    /**
     * Writes text under a key of the store at once, as another release or a damaged disk would
     * leave it; the next open loads it.
     */
    put: (key: string, text: string) => WorldWord.stored({ key, text }),
  },
  /**
   * The network as a whole: offline, every call is lost at request and reaches no server, and
   * waiting wire words wait for the network to come back online.
   */
  network: {
    offline: () => WorldWord.network({ word: "offline" }),
    online: () => WorldWord.network({ word: "online" }),
  },
};
