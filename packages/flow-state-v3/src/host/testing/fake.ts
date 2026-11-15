import { type Context, Deferred, Effect, Exit, Layer, Option } from "effect";
import { type Bytes, type Purpose, type Store, StoreRefused } from "../host.ts";
import type { RuntimeConfig } from "../runtime.ts";
import { scriptFault, Step, type StorageWord, type WireWord } from "./steps.ts";

/**
 * A fake's answers: the service's own methods, each taking that method's arguments and returning
 * an `Exit` of its own success and failure types, synchronously.
 */
export type Handlers<S> = {
  readonly [K in keyof S]: S[K] extends (...args: infer A) => Effect.Effect<infer V, infer E>
    ? (...args: A) => Exit.Exit<V, E>
    : never;
};

/**
 * The `Exit` one call of a service method answers with.
 */
export type AnswerOf<M> = M extends (...args: infer _A) => Effect.Effect<infer V, infer E>
  ? Exit.Exit<V, E>
  : never;

/**
 * One call a fake received.
 *
 * **Details**
 *
 * `status`: `held` waits for a wire word; `landed` reached the server through its handler and was
 * answered, unless its page had died; `responseDropped` reached the server and its answer was
 * lost; `requestDropped` never reached the server; `answered` got a scripted answer and left the
 * server alone.
 */
export type Call = {
  readonly fake: string;
  readonly method: string;
  // FLOW_STATE_ALLOW_UNKNOWN: a call's arguments are its method's own; the run logs every fake's calls.
  readonly args: ReadonlyArray<unknown>;
  readonly page: number;
  readonly status: "held" | "landed" | "responseDropped" | "requestDropped" | "answered";
};

/**
 * One write batch the run's store received.
 *
 * **Details**
 *
 * `status`: `held` waits for `release`; `landed` is in the store; `refused` failed
 * `StoreRefused`; `aborted` was released after its page died, so it never landed.
 */
export type Batch = {
  readonly page: number;
  readonly purpose: Purpose;
  readonly keys: ReadonlyArray<string>;
  readonly acknowledges: ReadonlyArray<string>;
  readonly status: "held" | "landed" | "refused" | "aborted";
};

// FLOW_STATE_ALLOW_UNKNOWN: the run sees every fake's answers, whatever their methods' types.
type AnyExit = Exit.Exit<unknown, unknown>;

/**
 * One call as a fake hands it to the run's wire: its method, its arguments and its handler.
 */
type Arrival = {
  readonly method: string;
  // FLOW_STATE_ALLOW_UNKNOWN: a call's arguments are its method's own.
  readonly args: ReadonlyArray<unknown>;
  readonly land: () => AnyExit;
};

// FLOW_STATE_ALLOW_UNKNOWN: the wire decides when a call answers; the fake typed its answer.
type Line = (arrival: Arrival) => Effect.Effect<unknown, unknown>;

/**
 * What a run needs of any fake: its service's key and, per run, fresh handlers that give one
 * services Layer per page.
 */
export type AnyFake = {
  readonly id: string;
  readonly open: () => (line: Line) => NonNullable<RuntimeConfig["services"]>;
};

/**
 * A fake for one service, with its wire words.
 */
export type FakeServer<S> = AnyFake & {
  readonly hold: (method: keyof S & string) => Step;
  readonly release: (method: keyof S & string) => Step;
  readonly dropRequest: (method: keyof S & string) => Step;
  readonly dropResponse: (method: keyof S & string) => Step;
  readonly answer: <M extends keyof S & string>(method: M, exit: AnswerOf<S[M]>) => Step;
  readonly received: (cut: { readonly received: ReadonlyArray<Call> }) => ReadonlyArray<Call>;
};

// RETURN_TYPE: the service's own shape, which the page's Layer provides.
const serviceOver = <S>(handlers: Handlers<S>, line: Line): S => {
  // SAFETY: Handlers<S> has S's keys, each a function of that method's own arguments.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- each handler is called only with the arguments its own service method received
  const erased = handlers as Readonly<Record<string, (...args: ReadonlyArray<unknown>) => AnyExit>>;

  const methods = Object.entries(erased).map(([method, handler]) => [
    method,
    // FLOW_STATE_ALLOW_UNKNOWN: the arguments the commit passed, of the method's own type.
    (...args: ReadonlyArray<unknown>) => line({ method, args, land: () => handler(...args) }),
  ]);

  // SAFETY: every method of S is answered through its own handler, whose Exit has its own types.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion, lint-bomb/no-object-iteration-result-cast -- a service built key by key from its handlers
  return Object.fromEntries(methods) as S;
};

/**
 * Stands in for the outside world in a Story.
 *
 * **When to use**
 *
 * `Fake.server` once per service a fixture's contracts call: the Story's Runtime gets a Layer of
 * the same service a real app gets over fetch, so the commit's own code runs. `Fake.store` holds
 * or refuses the run's store writes.
 *
 * **Details**
 *
 * `server(Service, () => handlers)`: the factory runs once per run, so state it closes over lasts
 * the whole run, across reloads. A call lands through its handler unless `hold` held it. On the
 * method's oldest held call, `release` lands it and answers, `dropRequest` loses it before the
 * server, `dropResponse` lands it and loses the answer, and `answer(method, exit)` answers with an
 * Exit of that method's own type without running the handler.
 *
 * **Gotchas**
 *
 * - A call that gets no answer waits forever; only the commit's own deadline ends it.
 */
export const Fake = {
  // RETURN_TYPE: the FakeServer contract keeps the service's method names and Exit types.
  server: <I, S>(service: Context.Key<I, S>, handlers: () => Handlers<S>): FakeServer<S> => {
    const wire = (word: WireWord) => (method: keyof S & string) =>
      Step.Wire({ fake: service.key, method, word });

    return {
      id: service.key,
      open: () => {
        const answering = handlers();

        return (line) => Layer.succeed(service, serviceOver(answering, line));
      },
      hold: wire("hold"),
      release: wire("release"),
      dropRequest: wire("dropRequest"),
      dropResponse: wire("dropResponse"),
      answer: (method, exit) => Step.Answer({ fake: service.key, method, exit }),
      received: (cut) => cut.received.filter((call) => call.fake === service.key),
    };
  },
  store: {
    hold: () => Step.Storage({ word: "hold" }),
    refuse: () => Step.Storage({ word: "refuse" }),
    release: () => Step.Storage({ word: "release" }),
  },
};

type Pending = {
  readonly call: Call;
  readonly land: () => AnyExit;
  // FLOW_STATE_ALLOW_UNKNOWN: a held call's answer, of its method's own type.
  readonly answer: Deferred.Deferred<unknown, unknown>;
};

/**
 * The run's wire: every call any fake received, the holds, and the wire words.
 */
export const makeWire = (fakes: ReadonlyArray<AnyFake>, alive: (page: number) => boolean) => {
  const ids = fakes.map((fake) => fake.id);
  const twice = ids.find((id, i) => ids.indexOf(id) !== i);

  if (twice !== undefined) scriptFault(`two fakes of ${twice}`);

  const opened = fakes.map((fake) => ({ id: fake.id, layerOf: fake.open() }));
  const calls: Array<Pending> = [];
  const holds = new Map<string, number>();
  const slot = (fake: string, method: string) => `${fake}.${method}`;

  const line =
    // RETURN_TYPE: the Line a fake's service methods call.
    (page: number, fake: string): Line =>
      ({ method, args, land }) =>
        Effect.suspend(() => {
          // A dead page's fibers never run again, so this is unreachable; it reaches no fake.
          if (!alive(page)) return Effect.never;
          const left = holds.get(slot(fake, method)) ?? 0;
          // FLOW_STATE_ALLOW_UNKNOWN: the answer of the method's own type.
          const answer = Deferred.makeUnsafe<unknown, unknown>();

          if (left > 0) {
            holds.set(slot(fake, method), left - 1);
            calls.push({ call: { fake, method, args, page, status: "held" }, land, answer });

            return Deferred.await(answer);
          }

          calls.push({ call: { fake, method, args, page, status: "landed" }, land, answer });

          return land();
        });

  const oldestHeld = (fake: string, method: string) =>
    calls.find(
      (c) => c.call.fake === fake && c.call.method === method && c.call.status === "held",
    ) ?? scriptFault(`nothing held for ${slot(fake, method)}`);

  const settle = (pending: Pending, status: Call["status"], answer: Option.Option<AnyExit>) => {
    calls[calls.indexOf(pending)] = { ...pending, call: { ...pending.call, status } };

    // An answer to a dead page goes nowhere.
    if (Option.isSome(answer) && alive(pending.call.page))
      Deferred.doneUnsafe(pending.answer, answer.value);
  };

  return {
    received: () => calls.map((c) => c.call),
    layer: (page: number) =>
      Layer.mergeAll(Layer.empty, ...opened.map((o) => o.layerOf(line(page, o.id)))),
    word: (fake: string, method: string, word: WireWord) => {
      if (word === "hold")
        return void holds.set(slot(fake, method), (holds.get(slot(fake, method)) ?? 0) + 1);

      const pending = oldestHeld(fake, method);

      if (word === "dropRequest") return settle(pending, "requestDropped", Option.none());
      const landed = pending.land();

      if (word === "release") return settle(pending, "landed", Option.some(landed));

      return settle(pending, "responseDropped", Option.none());
    },
    answer: (fake: string, method: string, exit: AnyExit) =>
      settle(oldestHeld(fake, method), "answered", Option.some(exit)),
    unused: () => [...holds].flatMap(([at, left]) => (left > 0 ? [`hold ${at} never used`] : [])),
  };
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
  const next: Array<Exclude<StorageWord, "release">> = [];
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
          const keys = writes.map((w) => w.key);
          const batch = { page, purpose, keys, acknowledges };

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
    word: (word: StorageWord) => {
      if (word !== "release") return void next.push(word);

      const out =
        batches.find((b) => b.batch.status === "held") ?? scriptFault("no store write held");

      // A dead page's held write aborts, as a closed page's IndexedDB transaction does.
      if (!alive(out.batch.page)) return mark(out, "aborted");
      apply(out.writes);
      mark(out, "landed");
      Deferred.doneUnsafe(out.answer, Exit.void);
    },
    unused: () => next.map((word) => `store ${word} never used`),
  };
};
