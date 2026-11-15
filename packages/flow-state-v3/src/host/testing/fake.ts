import {
  Context,
  Deferred,
  Effect,
  Effectable,
  Exit,
  Layer,
  Option,
  Record,
  Result,
  Schema,
} from "effect";
import type { Fields, InputOf } from "../../contract.ts";
import type { Values } from "../../core/compiled.ts";
import { type Bytes, type Purpose, type Store, StoreRefused } from "../host.ts";
import { type At, scriptFault, WorldWord } from "./steps.ts";

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
 * gone (its page dead, or its commit's deadline passed), so the handler ran and nothing was
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
 * One call an endpoint received: its request, the page it came from, the index of the step during
 * which it arrived (-1 at the first page's boot) and its status.
 */
export type CallEntry<I = Values> = {
  readonly input: I;
  readonly page: number;
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
    request: InputOf<F>,
  ): { readonly truth: T; readonly exit: Exit.Exit<S["Type"], X["Type"]> };
};

/**
 * One control of a fake server: its input fields and how it changes truth.
 */
export type Control<T, F extends Fields> = {
  readonly fields: F;
  apply(truth: T, input: InputOf<F>): T;
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
    request: InputOf<E[K]["request"]>,
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
} & { readonly [K in keyof E]: EndpointHandle<InputOf<E[K]["request"]>> } & {
  readonly [K in keyof C]: (input: InputOf<C[K]["fields"]>) => WorldWord;
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
  drop: (options) =>
    WorldWord.wire({ server, endpoint: name, word: "drop", at: options?.at ?? "request" }),
});

type Held = {
  readonly server: AnyServer;
  readonly endpoint: string;
  readonly index: number;
  readonly page: number;
  // FLOW_STATE_ALLOW_UNKNOWN: a handler's Exit, of its endpoint's own types.
  readonly exit: Option.Option<Exit.Exit<unknown, unknown>>;
  // FLOW_STATE_ALLOW_UNKNOWN: the held call's answer, of its endpoint's own types.
  readonly answer: Deferred.Deferred<unknown, unknown>;
};

type Logged = { readonly server: AnyServer; readonly endpoint: string; readonly entry: CallEntry };

type Pending = { readonly word: "hold" | "drop"; readonly at: At };

/**
 * A run's fake servers: their truth, every call each endpoint received, and the wire words.
 * `alive` says whether a page may still be answered; `step` is the index of the step running.
 */
export const makeWorld = (alive: (page: number) => boolean, step: () => number) => {
  // FLOW_STATE_ALLOW_UNKNOWN: each server's truth, of its own Schema.
  const truths = new Map<AnyServer, unknown>();
  const log: Array<Logged> = [];
  const pending = new Map<string, Array<Pending>>();
  const held: Array<Held> = [];
  const faults: Array<string> = [];
  // FLOW_STATE_ALLOW_UNKNOWN: held answers whose waiter was interrupted, of their endpoints' own types.
  const gone = new Set<Deferred.Deferred<unknown, unknown>>();
  const ids = new Map<AnyServer, number>();

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
    (page: number, server: AnyServer, endpoint: string): Erased =>
      (input) =>
        Effect.suspend(() => {
          // A dead page's fibers never run again, so this is unreachable; it reaches no server.
          if (!alive(page)) return Effect.never;
          const next = pending.get(slot(server, endpoint))?.shift();

          const index =
            log.push({
              server,
              endpoint,
              entry: { input, page, step: step(), status: "answered" },
            }) - 1;

          const hold = (exit: Held["exit"]) =>
            wait({
              server,
              endpoint,
              index,
              page,
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

  const release = (server: AnyServer, endpoint: string) => {
    const at = held.findIndex((h) => h.server === server && h.endpoint === endpoint);
    const entry = held[at] ?? scriptFault(`nothing held at ${server.name}.${endpoint}`);
    held.splice(at, 1);
    const exit = Option.isSome(entry.exit) ? entry.exit : handled(server, endpoint, input(entry));

    if (Option.isSome(exit) && alive(entry.page) && !gone.has(entry.answer)) {
      mark(entry.index, "answered");
      Deferred.doneUnsafe(entry.answer, exit.value);
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
    service: (page: number) =>
      FakeWorld.of({
        serve: (server) =>
          Object.fromEntries(
            Object.keys(server.endpoints).map((endpoint) => [
              endpoint,
              call(page, server, endpoint),
            ]),
          ),
      }),
    word: (word: WorldWord) =>
      WorldWord.$match(word, {
        control: ({ server, control: name, input: value }) => control(server, name, value),
        wire: ({ server, endpoint, word: kind, at }) => {
          if (kind === "release") return release(server, endpoint);
          const key = slot(server, endpoint);
          pending.set(key, [...(pending.get(key) ?? []), { word: kind, at }]);
        },
        storage: () => scriptFault("a storage word reached the fake servers"),
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
  };
};

/**
 * One write batch the run's store received.
 *
 * **Details**
 *
 * `status`: `held` waits for `Fake.storage.release()`; `landed` is in the store; `refused` failed
 * `StoreRefused`; `aborted` was released after its page died, so it never landed.
 */
export type Batch = {
  readonly page: number;
  readonly purpose: Purpose;
  readonly keys: ReadonlyArray<string>;
  readonly acknowledges: ReadonlyArray<string>;
  readonly status: "held" | "landed" | "refused" | "aborted";
};

type Out = {
  readonly batch: Batch;
  readonly writes: ReadonlyArray<Bytes>;
  readonly answer: Deferred.Deferred<void, StoreRefused>;
};

/**
 * The run's durable store: its records, the batches it received, and the storage words.
 */
export const makeStore = (alive: (page: number) => boolean) => {
  const data = new Map<string, string>();
  const next: Array<"hold" | "refuse"> = [];
  const batches: Array<Out> = [];

  const apply = (writes: ReadonlyArray<Bytes>) => {
    for (const w of writes)
      Option.match(w.value, {
        onNone: () => data.delete(w.key),
        onSome: (value) => data.set(w.key, value),
      });
  };

  const mark = (out: Out, status: Batch["status"]) => {
    batches[batches.indexOf(out)] = { ...out, batch: { ...out.batch, status } };
  };

  return {
    data: () => new Map(data),
    batches: () => batches.map((b) => b.batch),
    // RETURN_TYPE: the Store contract a page's Host carries.
    at: (page: number): Store => ({
      load: Effect.sync(() => new Map(data)),
      write: (writes, purpose, acknowledges) =>
        Effect.suspend(() => {
          // A dead page's fibers never run again, so this is unreachable; it writes nothing.
          if (!alive(page)) return Effect.never;
          const word = next.shift();
          const answer = Deferred.makeUnsafe<void, StoreRefused>();
          const batch = { page, purpose, keys: writes.map((w) => w.key), acknowledges };

          if (word === "hold") {
            batches.push({ batch: { ...batch, status: "held" }, writes, answer });

            return Deferred.await(answer);
          }

          if (word === "refuse") {
            batches.push({ batch: { ...batch, status: "refused" }, writes, answer });

            return Effect.fail(new StoreRefused({}));
          }

          apply(writes);
          batches.push({ batch: { ...batch, status: "landed" }, writes, answer });

          return Effect.void;
        }),
    }),
    word: (word: "hold" | "refuse" | "release") => {
      if (word !== "release") return void next.push(word);

      const out =
        batches.find((b) => b.batch.status === "held") ?? scriptFault("nothing held at the store");

      // A dead page's held write aborts, as a closed page's IndexedDB transaction does.
      if (!alive(out.batch.page)) return mark(out, "aborted");
      apply(out.writes);
      mark(out, "landed");
      Deferred.doneUnsafe(out.answer, Exit.void);
    },
    unused: () => next.map((word) => `storage ${word} never used`),
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
 * an endpoint's next call (`hold`, `drop`) or its oldest held call (`release`); they decide
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
      request: InputOf<F>,
    ) => { readonly truth: T; readonly exit: Exit.Exit<S["Type"], X["Type"]> };
  }): Endpoint<T, F, S, X> => config,
  // RETURN_TYPE: the Control contract keeps its input type.
  control: <T, const F extends Fields>(
    fields: F,
    apply: (truth: T, input: InputOf<F>) => T,
  ): Control<T, F> => ({ fields, apply }),
  /**
   * The run's fake servers as a Layer, each server at its `initial`: for a port fake outside a
   * Story.
   */
  world: Layer.sync(FakeWorld, () =>
    makeWorld(
      () => true,
      () => 0,
    ).service(0),
  ),
  Lost: FakeLost,
  storage: {
    hold: () => WorldWord.storage({ word: "hold" }),
    refuse: () => WorldWord.storage({ word: "refuse" }),
    release: () => WorldWord.storage({ word: "release" }),
  },
};
