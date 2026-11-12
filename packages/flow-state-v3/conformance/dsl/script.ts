import { Match, Option, Schema } from "effect";
import type { Fixture } from "../fixtures/fixture.ts";
import type { ActorRef } from "../port.ts";
import { Answer, RequestPhase } from "../world/network.ts";
import type { Case, Scenario } from "./case.ts";
import { Address } from "./facts.ts";

/**
 * A server answer a script gives, as data: `ok` with its value, `lost` (no response), or `fail`
 * with a tag and fields.
 */
export const ScriptAnswer = Schema.Union([
  Schema.TaggedStruct("ok", { value: Schema.Json }),
  Schema.TaggedStruct("lost", {}),
  Schema.TaggedStruct("fail", {
    tag: Schema.String,
    fields: Schema.Record(Schema.String, Schema.Json),
  }),
]);

/**
 * One step of a script: what the suite drives, as data (Conformance R15, T32).
 *
 * **Details**
 *
 * - `ensure` attaches the script's actor; `send` sends it an event with a payload.
 * - `ack` lands every held store batch, `refuse` refuses them (WriteAhead R13's refusal);
 *   `answer` answers the oldest open request of an operation, and is skipped when none is open.
 * - `advance` moves the clock; `reload` kills the page and boots again.
 * - `release` ends the actor's story use; `dispose` and `forget` remove its record (Actors R20,
 *   R21); `disposeRuntime` starts the Runtime's disposal (Actors R22).
 * - `by` on a step that drives an actor names it by its place in the script's `actors`; with none
 *   the step drives the script's own actor.
 *
 * **Gotchas**
 *
 * - Labels are computed when the step plays, by the fixture's own functions, never stored here,
 *   so a shrunk or replayed script carries none that could go stale.
 */
const by = Schema.optionalKey(Schema.Number);

export const Step = Schema.Union([
  Schema.TaggedStruct("ensure", { by }),
  Schema.TaggedStruct("send", { event: Schema.String, payload: Schema.Json, by }),
  Schema.TaggedStruct("ack", {}),
  Schema.TaggedStruct("refuse", {}),
  Schema.TaggedStruct("answer", { operation: Schema.String, answer: ScriptAnswer }),
  Schema.TaggedStruct("advance", { ms: Schema.Number }),
  Schema.TaggedStruct("reload", {}),
  Schema.TaggedStruct("release", { by }),
  Schema.TaggedStruct("dispose", { by }),
  Schema.TaggedStruct("forget", { by }),
  Schema.TaggedStruct("disposeRuntime", {}),
]);

/**
 * The decoded {@link Step}.
 */
export type Step = typeof Step.Type;

/**
 * A script: one actor of one fixture, driven by its steps, named by where it came from (a seeded
 * run, the exhaustive search, or a shrunk regression). `actors` lists the actors its steps name by
 * `by`, of one fixture or several (the app mix, Conformance R15).
 */
export const Script = Schema.Struct({
  id: Schema.String,
  fixture: Schema.String,
  actor: Schema.String,
  actors: Schema.optionalKey(
    Schema.Array(Schema.Struct({ fixture: Schema.String, actor: Schema.String })),
  ),
  steps: Schema.Array(Step),
});

/**
 * The decoded {@link Script}.
 */
export type Script = typeof Script.Type;

const answerOf = (answer: typeof ScriptAnswer.Type) =>
  Match.valueTags(answer, {
    ok: ({ value }) => Answer.Ok({ value }),
    lost: () => Answer.Lost(),
    fail: ({ tag, fields }) => Answer.Fail({ tag, fields }),
  });

const open = (c: Case, operation: string) =>
  c.requests(operation).some((r) => RequestPhase.$is("Open")(r.phase));

const played = (c: Case, actorOf: (by: Option.Option<number>) => ActorRef, step: Step) => {
  const actor = actorOf(Option.fromUndefinedOr("by" in step ? step.by : undefined));

  return Match.valueTags(step, {
    ensure: () => c.ensure(actor, Option.none()),
    send: ({ event, payload }) => c.send([{ actor: actor, event, payload, to: Address.Root() }]),
    ack: () => c.ack(),
    refuse: () => c.answerStorage("refuse"),
    answer: ({ operation, answer }) => {
      if (open(c, operation)) c.answer(operation, answerOf(answer));
    },
    advance: ({ ms }) => c.advance(ms),
    reload: () => c.reload(),
    release: () => c.release(actor, "story"),
    dispose: () => c.dispose(actor),
    forget: () => c.forget(actor),
    disposeRuntime: () => c.disposeRuntime(),
  });
};

/**
 * Whether a script's `answer` step finds an open request of its operation when it plays: one that
 * does not is skipped.
 */
export const answers = (c: Case, step: Step) => step._tag !== "answer" || open(c, step.operation);

/**
 * The player: a script as a {@link Scenario} the suite's runner plays like a hand case, judged by
 * the oracles alone (a generated run carries no case expectations, advisor Q5). `skipped` hears
 * each `answer` step that found no open request.
 */
// RETURN_TYPE: the runner's Scenario contract.
export const scenarioOf = (
  script: Script,
  fixtures: ReadonlyArray<Fixture>,
  skipped: () => void = () => undefined,
): Scenario => {
  const named = [{ fixture: script.fixture, actor: script.actor }, ...(script.actors ?? [])];

  const machineOf = (fixture: string) =>
    fixtures.find((f) => f.name === fixture)?.machine ?? fixture;

  const own = { machine: machineOf(script.fixture), id: script.actor };

  const listed = (script.actors ?? []).map((a) => ({ machine: machineOf(a.fixture), id: a.actor }));

  return {
    id: script.id,
    cites: [],
    fixtures: fixtures.filter((f) => named.some((n) => n.fixture === f.name)),
    run: (c) => {
      const actorAt = (at: Option.Option<number>) =>
        Option.getOrElse(
          Option.flatMap(at, (i) => Option.fromUndefinedOr(listed[i])),
          () => own,
        );

      for (const step of script.steps) {
        if (!answers(c, step)) skipped();
        played(c, actorAt, step);
      }
    },
  };
};
