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
 * - `Never`: no answer will ever come; the request stays open.
 * - `Die`: the client's call dies with a defect.
 */
export type Answer = Data.TaggedEnum<{
  Ok: { readonly value: unknown };
  Fail: { readonly tag: string; readonly fields: Readonly<Record<string, unknown>> };
  Lost: {};
  LostButLanded: { readonly value: unknown };
  Never: {};
  Die: { readonly message: string };
}>;

/**
 * Constructors and matchers for {@link Answer}.
 */
export const Answer = Data.taggedEnum<Answer>();

/**
 * Where a request is: open, hanging forever, aborted by its caller, or answered.
 */
export type RequestPhase = Data.TaggedEnum<{
  Open: {};
  Hanging: {};
  Aborted: {};
  Answered: { readonly answer: Answer };
}>;

const RequestPhase = Data.taggedEnum<RequestPhase>();

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
 * A tagged error the fake server answers with.
 */
export class ServerError extends Data.TaggedError("ServerError")<{
  readonly tag: string;
  readonly fields: Readonly<Record<string, unknown>>;
}> {}

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
 * - The log keeps every request across page loads: the server outlives the page.
 * - `landed` lists the requests the server applied, heard or not.
 * - A read (no key) aborted by its caller ends at the server. A write has no signal: it stays
 *   open, and a later answer changes only what the server did.
 * - A failure reaches the caller as its tagged error: `{ _tag, ...fields }`.
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
    Never: () => Effect.never,
    Die: ({ message }) => Effect.die(message),
  });

const landsAtServer = (answer: Answer) =>
  Answer.$is("Ok")(answer) || Answer.$is("LostButLanded")(answer);

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
        r.page === page() &&
        Option.match(where, { onNone: () => true, onSome: (w) => within(r.input, w) }),
    );

  return {
    request: (operation, input, key) =>
      Effect.suspend(() => {
        const seq = log.length;
        log = [
          ...log,
          { seq, operation, input, key, page: page(), at: now(), phase: RequestPhase.Open() },
        ];

        return Effect.callback<unknown, unknown>((resume) => {
          resumes = new Map([...resumes, [seq, resume]]);

          return Option.isNone(key)
            ? Effect.sync(() => {
                forget(seq);
                setPhase(seq, RequestPhase.Aborted());
              })
            : undefined;
        });
      }),
    oldestOpen: (operation, where) => Option.fromUndefinedOr(oldest(operation, where)),
    answer: (held, answer) => {
      if (Answer.$is("Never")(answer)) {
        setPhase(held.seq, RequestPhase.Hanging());

        return;
      }

      setPhase(held.seq, RequestPhase.Answered({ answer }));
      const resume = resumes.get(held.seq);
      forget(held.seq);
      resume?.(outcome(answer));
    },
    requests: () => log,
    landed: () =>
      log.filter((r) =>
        RequestPhase.$match(r.phase, {
          Open: () => false,
          Hanging: () => false,
          Aborted: () => false,
          Answered: ({ answer }) => landsAtServer(answer),
        }),
      ),
    kill: () => {
      resumes = new Map();
    },
  };
};
