import { Data, Effect, Option, Predicate } from "effect";

/**
 * How the suite's fake server answers one held request.
 *
 * **Details**
 *
 * - `Ok`: the server did it and the answer arrives.
 * - `Fail`: the server refused it with a tagged error; nothing landed.
 * - `Lost`: the answer never arrives and the server did not do it (the client sees `NoResponse`).
 * - `LostButLanded`: the server did it and the answer was lost (the client sees `NoResponse`).
 * - `FailButLanded`: the server did it and still answered a tagged error (a 500 after the write
 *   landed).
 * - `Never`: no answer will ever come; the request stays open.
 * - `Die`: the client's call dies with a defect.
 */
export type Answer = Data.TaggedEnum<{
  Ok: { readonly value: unknown };
  Fail: { readonly tag: string; readonly fields: Readonly<Record<string, unknown>> };
  Lost: {};
  LostButLanded: { readonly value: unknown };
  FailButLanded: { readonly tag: string; readonly fields: Readonly<Record<string, unknown>> };
  Never: {};
  Die: { readonly message: string };
}>;

/**
 * Constructors and matchers for {@link Answer}.
 */
export const Answer = Data.taggedEnum<Answer>();

/**
 * Where a request is: open, hanging forever, aborted by its caller, orphaned by a page that died
 * with its caller in it, or answered.
 */
export type RequestPhase = Data.TaggedEnum<{
  Open: {};
  Hanging: {};
  Aborted: {};
  Orphaned: {};
  Answered: { readonly answer: Answer };
}>;

/**
 * Constructors and matchers for {@link RequestPhase}.
 */
export const RequestPhase = Data.taggedEnum<RequestPhase>();

/**
 * One request the fake server received, in arrival order.
 *
 * **Details**
 *
 * `key` is the idempotency key the caller sent; a write's commit puts its Attempt id there.
 */
export type Request = {
  readonly seq: number;
  readonly operation: string;
  readonly input: unknown;
  readonly key: Option.Option<string>;
  readonly page: number;
  readonly at: number;
  readonly phase: RequestPhase;
};

/**
 * The fake world's server: every request is held until the suite answers it.
 *
 * **When to use**
 *
 * A fixture's services call `request`; a case finds the oldest open request of an operation
 * with `oldestOpen` and answers it with `answer`.
 *
 * **Details**
 *
 * - The log keeps every request across page loads: the server outlives the page. A kill orphans
 *   every open request of the dead page.
 * - `landed` lists the requests the server applied, heard or not.
 * - A read (no key) aborted by its caller ends at the server. A write has no signal: it stays
 *   open, and a later answer changes only what the server did.
 * - A failure reaches the caller as its tagged error: `{ _tag, ...fields }`.
 * - `answerLate`: the server finally answers a request that was open, hanging or orphaned; only a
 *   caller still alive hears it.
 * - `landLate`: a request answered `Lost` reaches the server after all; nobody hears it.
 * - `uninterruptible`: from now on, calls of that operation cannot be interrupted.
 * - `answerAtOnce`: from now on, calls of that operation are answered as they are made.
 *
 * **Gotchas**
 *
 * - `answer` throws `RequestNotOpen` for a request that is not open; `answerLate` for one that is
 *   already decided.
 */
export type Network = {
  readonly request: (
    operation: string,
    input: unknown,
    key: Option.Option<string>,
  ) => Effect.Effect<unknown, unknown>;
  readonly oldestOpen: (
    operation: string,
    where: Option.Option<Readonly<Record<string, unknown>>>,
  ) => Option.Option<Request>;
  readonly answer: (request: Request, answer: Answer) => void;
  readonly oldestUndecided: (operation: string) => Option.Option<Request>;
  readonly answerLate: (request: Request, answer: Answer) => void;
  readonly oldestLost: (operation: string) => Option.Option<Request>;
  readonly landLate: (request: Request) => void;
  readonly uninterruptible: (operation: string) => void;
  readonly answerAtOnce: (operation: string, answer: Answer) => void;
  readonly requests: () => ReadonlyArray<Request>;
  readonly landed: () => ReadonlyArray<Request>;
  readonly kill: () => void;
};

/**
 * Thrown by a case that answers an operation with nothing open: a scenario bug, never a verdict.
 */
export class NoHeldRequest extends Data.TaggedError("NoHeldRequest")<{
  readonly operation: string;
}> {}

/**
 * Thrown when a request that is not open is answered: a scenario bug, never a verdict.
 */
export class RequestNotOpen extends Data.TaggedError("RequestNotOpen")<{
  readonly seq: number;
  readonly phase: RequestPhase["_tag"];
}> {}

const failureOf = (tag: string, fields: Readonly<Record<string, unknown>>) => ({
  ...fields,
  _tag: tag,
});

const outcome = (answer: Answer) =>
  Answer.$match(answer, {
    Ok: ({ value }) => Effect.succeed(value),
    Fail: ({ tag, fields }) => Effect.fail(failureOf(tag, fields)),
    Lost: () => Effect.fail(failureOf("NoResponse", {})),
    LostButLanded: () => Effect.fail(failureOf("NoResponse", {})),
    FailButLanded: ({ tag, fields }) => Effect.fail(failureOf(tag, fields)),
    Never: () => Effect.never,
    Die: ({ message }) => Effect.die(message),
  });

const landsAtServer = (answer: Answer) =>
  Answer.$is("Ok")(answer) ||
  Answer.$is("LostButLanded")(answer) ||
  Answer.$is("FailButLanded")(answer);

const within = (input: unknown, where: Readonly<Record<string, unknown>>) =>
  Object.entries(where).every(
    ([k, v]) =>
      Predicate.isObjectKeyword(input) &&
      Object.entries(input).some(([ik, iv]) => ik === k && iv === v),
  );

/**
 * Builds a server with no requests.
 *
 * **Details**
 *
 * `now` and `page` are the clock's time and the page's generation, read at each request.
 */
// RETURN_TYPE: The exported Network contract; it types the request and answer parameters for the runtime.
export const makeNetwork = (now: () => number, page: () => number): Network => {
  let log: ReadonlyArray<Request> = [];
  let resumes: ReadonlyMap<number, (effect: Effect.Effect<unknown, unknown>) => void> = new Map();
  let steadfast: ReadonlySet<string> = new Set();
  let atOnce: ReadonlyMap<string, Answer> = new Map();

  const phaseOf = (request: Request) => log[request.seq]?.phase ?? request.phase;

  const refuse = (request: Request) => () => {
    throw new RequestNotOpen({ seq: request.seq, phase: phaseOf(request)._tag });
  };

  const setPhase = (seq: number, phase: RequestPhase) => {
    log = log.map((r) => (r.seq === seq ? { ...r, phase } : r));
  };

  const forget = (seq: number) => {
    const next = new Map(resumes);
    next.delete(seq);
    resumes = next;
  };

  const oldest = (operation: string, where: Option.Option<Readonly<Record<string, unknown>>>) =>
    log.find(
      (r) =>
        r.operation === operation &&
        RequestPhase.$is("Open")(r.phase) &&
        Option.match(where, { onNone: () => true, onSome: (w) => within(r.input, w) }),
    );

  const reply = (held: Request, answer: Answer) => {
    if (Answer.$is("Never")(answer)) {
      setPhase(held.seq, RequestPhase.Hanging());

      return;
    }

    setPhase(held.seq, RequestPhase.Answered({ answer }));
    const resume = resumes.get(held.seq);
    forget(held.seq);

    if (resume !== undefined) resume(outcome(answer));
  };

  const call = (operation: string, input: unknown, key: Option.Option<string>) =>
    Effect.suspend(() => {
      const seq = log.length;
      const given = atOnce.get(operation);

      const phase =
        given === undefined ? RequestPhase.Open() : RequestPhase.Answered({ answer: given });

      log = [...log, { seq, operation, input, key, page: page(), at: now(), phase }];

      if (given !== undefined) return outcome(given);

      return Effect.callback<unknown, unknown>((resume) => {
        resumes = new Map([...resumes, [seq, resume]]);

        return Option.isNone(key)
          ? Effect.sync(() => {
              forget(seq);
              setPhase(seq, RequestPhase.Aborted());
            })
          : undefined;
      });
    });

  const undecided = (r: Request) =>
    RequestPhase.$is("Open")(r.phase) ||
    RequestPhase.$is("Hanging")(r.phase) ||
    RequestPhase.$is("Orphaned")(r.phase);

  const lost = (r: Request) =>
    RequestPhase.$is("Answered")(r.phase) && Answer.$is("Lost")(r.phase.answer);

  return {
    request: (operation, input, key) => {
      const sent = call(operation, input, key);

      return steadfast.has(operation) ? Effect.uninterruptible(sent) : sent;
    },
    oldestOpen: (operation, where) => Option.fromUndefinedOr(oldest(operation, where)),
    answer: (request, answer) =>
      RequestPhase.$match(phaseOf(request), {
        Open: () => reply(request, answer),
        Hanging: refuse(request),
        Aborted: refuse(request),
        Orphaned: refuse(request),
        Answered: refuse(request),
      }),
    oldestUndecided: (operation) =>
      Option.fromUndefinedOr(log.find((r) => r.operation === operation && undecided(r))),
    answerLate: (request, answer) =>
      RequestPhase.$match(phaseOf(request), {
        Open: () => reply(request, answer),
        Hanging: () => reply(request, answer),
        Orphaned: () => reply(request, answer),
        Aborted: refuse(request),
        Answered: refuse(request),
      }),
    oldestLost: (operation) =>
      Option.fromUndefinedOr(log.find((r) => r.operation === operation && lost(r))),
    landLate: (request) => {
      if (!lost(log[request.seq] ?? request)) refuse(request)();
      setPhase(
        request.seq,
        RequestPhase.Answered({ answer: Answer.LostButLanded({ value: null }) }),
      );
    },
    uninterruptible: (operation) => {
      steadfast = new Set([...steadfast, operation]);
    },
    answerAtOnce: (operation, answer) => {
      atOnce = new Map([...atOnce, [operation, answer]]);
    },
    requests: () => log,
    landed: () =>
      log.filter((r) =>
        RequestPhase.$match(r.phase, {
          Open: () => false,
          Hanging: () => false,
          Aborted: () => false,
          Orphaned: () => false,
          Answered: ({ answer }) => landsAtServer(answer),
        }),
      ),
    kill: () => {
      resumes = new Map();
      log = log.map((r) =>
        RequestPhase.$is("Open")(r.phase) ? { ...r, phase: RequestPhase.Orphaned() } : r,
      );
    },
  };
};
