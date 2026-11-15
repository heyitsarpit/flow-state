import { Data, Match, Schema } from "effect";
import type { Case } from "./case.ts";
import type { Fixture } from "./fixture.ts";
import { Answer, RequestPhase } from "./world/network.ts";

const failed = { tag: Schema.String, fields: Schema.Record(Schema.String, Schema.Json) };

const ScriptAnswer = Schema.Union([
  Schema.TaggedStruct("ok", { value: Schema.Json }),
  Schema.TaggedStruct("lost", {}),
  Schema.TaggedStruct("fail", failed),
  Schema.TaggedStruct("lostButLanded", { value: Schema.Json }),
  Schema.TaggedStruct("failButLanded", failed),
  Schema.TaggedStruct("never", {}),
]);

const by = Schema.optionalKey(Schema.Number);

/**
 * One step of a script, as data. `by` names the actor a step drives by its place in `actors`;
 * with none, the script's own actor. An `answer` or `answerLater` step with no open request to
 * take is skipped.
 */
export const Step = Schema.Union([
  Schema.TaggedStruct("ensure", { by }),
  Schema.TaggedStruct("send", { event: Schema.String, payload: Schema.Json, by }),
  Schema.TaggedStruct("ack", {}),
  Schema.TaggedStruct("refuse", {}),
  Schema.TaggedStruct("answer", { operation: Schema.String, answer: ScriptAnswer }),
  Schema.TaggedStruct("answerLater", {
    operation: Schema.String,
    answer: ScriptAnswer,
    skip: Schema.Number,
  }),
  Schema.TaggedStruct("advance", { ms: Schema.Number }),
  Schema.TaggedStruct("reload", {}),
  Schema.TaggedStruct("release", { by }),
  Schema.TaggedStruct("dispose", { by }),
  Schema.TaggedStruct("forget", { by }),
  Schema.TaggedStruct("disposeRuntime", {}),
]);

/**
 * A script: one actor of one fixture (by its part's name) driven by its steps, and the other
 * actors its steps name by `by`.
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

/**
 * A script named a fixture the list does not hold.
 */
export class UnknownFixture extends Data.TaggedError("UnknownFixture")<{ readonly name: string }> {}

const answerOf = (answer: typeof ScriptAnswer.Type) =>
  Match.valueTags(answer, {
    ok: ({ value }) => Answer.Ok({ value }),
    lost: () => Answer.Lost(),
    fail: ({ tag, fields }) => Answer.Fail({ tag, fields }),
    lostButLanded: ({ value }) => Answer.LostButLanded({ value }),
    failButLanded: ({ tag, fields }) => Answer.FailButLanded({ tag, fields }),
    never: () => Answer.Never(),
  });

/**
 * A script as a case: the fixtures it boots and the run `play` takes.
 */
export const scenarioOf = (script: Script, fixtures: ReadonlyArray<Fixture>) => {
  const named = [{ fixture: script.fixture, actor: script.actor }, ...(script.actors ?? [])];

  const actors = named.map(({ fixture, actor }) => {
    const found = fixtures.find((f) => f.part.name === fixture);

    if (found === undefined) throw new UnknownFixture({ name: fixture });

    return { machine: found.machine, id: actor };
  });

  const run = (c: Case) => {
    const open = (operation: string) =>
      c.requests(operation).filter((r) => RequestPhase.$is("Open")(r.phase)).length;

    for (const step of script.steps) {
      const at = "by" in step ? (step.by ?? -1) : -1;
      const actor = actors[at + 1] ?? actors[0];

      if (actor !== undefined)
        Match.valueTags(step, {
          ensure: () => c.ensure(actor),
          send: ({ event, payload }) => c.send([{ actor, event, payload }]),
          ack: () => c.ack(),
          refuse: () => c.answerStorage("refuse"),
          answer: ({ operation, answer }) => {
            if (open(operation) > 0) c.answer(operation, answerOf(answer));
          },
          answerLater: ({ operation, answer, skip }) => {
            if (open(operation) > skip) c.answerOpen(operation, skip, answerOf(answer));
          },
          advance: ({ ms }) => c.advance(ms),
          reload: () => c.reload(),
          release: () => c.release(actor, "story"),
          dispose: () => c.dispose(actor),
          forget: () => c.forget(actor),
          disposeRuntime: () => c.disposeRuntime(),
        });
    }
  };

  return { fixtures: fixtures.filter((f) => named.some((n) => n.fixture === f.part.name)), run };
};
