import { printValue } from "../print.ts";
import { Duration, Formatter, Option, Predicate } from "effect";
import { type ActorId, actorKey, sameActor, type Wiring } from "../../core/world.ts";
import { overridesBy } from "../wiring.ts";
import { actorIdOf, type ActorRef } from "../runtime.ts";
import type { AnyDefinition, EventOf } from "../../definition.ts";
import type { AnyServer } from "./fake.ts";
import type { StoryRun } from "./run.ts";
import { scriptFault, Step, StepData, type StepOf, WorldWord } from "./steps.ts";
import type { Story } from "./story.ts";

/**
 * A property of a run, as a run rule is: a name and a function from a finished run of the app's
 * definitions `Ds` to its breaches. An empty list means the run keeps it.
 */
export type Property<R extends string = string, Ds extends AnyDefinition = AnyDefinition> = {
  readonly rule: R;
  readonly breaches: (run: StoryRun<never, Ds>) => ReadonlyArray<string>;
};

// An event of any of the app's definitions.
type EventIn<Ds extends AnyDefinition> = Ds extends AnyDefinition ? EventOf<Ds> : never;

/**
 * What a generated run draws its steps from: a fixture's app, the steps a person takes, its actors,
 * its fake servers and the control words that make them fail, each with the name the fixture gives
 * it, so a run prints as code to paste into the fixture.
 */
export type Samples<Ds extends AnyDefinition = AnyDefinition> = {
  readonly id: string;
  readonly story: Story<never, Ds>;
  readonly setup: string;
  readonly fixtures: ReadonlyArray<string>;
  readonly steps: ReadonlyArray<StepOf<Ds>>;
  readonly actors: ReadonlyArray<{
    readonly name: string;
    readonly actor: ActorId;
    readonly context: Wiring;
  }>;
  readonly servers: ReadonlyArray<{ readonly name: string; readonly server: AnyServer }>;
  readonly failures: ReadonlyArray<WorldWord>;
  readonly landedFailures: ReadonlyArray<WorldWord>;
  readonly controls: ReadonlyArray<WorldWord>;
  readonly values: ReadonlyArray<{ readonly name: string; readonly value: EventIn<Ds> }>;
};

/**
 * Declares a fixture's samples for generated runs.
 *
 * **When to use**
 *
 * Once per fixture, beside its Stories, so `propertyTest`, the pair sweep and the fixture's stress
 * Story draw from what a person, the fake servers and their controls can do.
 *
 * **Details**
 *
 * `story` is the fixture's app over its fakes, with no steps; `names` are the names its code gives
 * that Story's setup and fixtures, and `actors` and `servers` are keyed by the names it gives them,
 * so a printed run reads as the fixture's own code; an actor is ensured with the providers its ref
 * gives, as the printed `.ensure(ref)` is. `steps` chains the steps a person takes, each one sample.
 * `failures` are control words after which the server's next answer is a domain failure;
 * `landedFailures` those after which it applies the write and still fails; `controls` the other
 * control words, such as a heal. `values` names events the fixture's code already holds, which a
 * printed run sends by that name when a sample sends that very value.
 *
 * **Gotchas**
 *
 * - A control word changes the server's truth; it never answers a call itself.
 */
// RETURN_TYPE: the exported Samples contract, by the Story's app.
export const samplesOf = <Ds extends AnyDefinition>(options: {
  readonly id: string;
  readonly story: Story<never, Ds>;
  readonly names: { readonly setup: string; readonly fixtures: ReadonlyArray<string> };
  readonly actors: Readonly<Record<string, ActorRef<Ds>>>;
  readonly servers: Readonly<Record<string, { readonly "~server": AnyServer }>>;
  readonly failures: ReadonlyArray<WorldWord>;
  readonly landedFailures: ReadonlyArray<WorldWord>;
  readonly controls: ReadonlyArray<WorldWord>;
  readonly values: Readonly<Record<string, EventIn<Ds>>>;
  readonly steps: (story: Story<never, Ds>) => Story<string, Ds>;
}): Samples<Ds> => ({
  id: options.id,
  story: options.story,
  setup: options.names.setup,
  fixtures: options.names.fixtures,
  steps: options.steps(options.story).steps,
  actors: Object.entries(options.actors).map(([name, ref]) => ({
    name,
    actor: actorIdOf(ref),
    context: overridesBy(ref, (_slot, p) => actorIdOf(p)),
  })),
  servers: Object.entries(options.servers).map(([name, server]) => ({
    name,
    server: server["~server"],
  })),
  failures: options.failures,
  landedFailures: options.landedFailures,
  controls: options.controls,
  values: Object.entries(options.values).map(([name, value]) => ({ name, value })),
});

// FLOW_STATE_ALLOW_UNKNOWN: an event or control input is any plain value of its own Schema.
const literal = (value: unknown) => printValue(value, "literal");

const serverName = (samples: Samples, server: AnyServer) =>
  samples.servers.find((s) => s.server === server)?.name ??
  scriptFault(`samples ${samples.id} name no server ${server.name}`);

const actorName = (samples: Samples, actor: ActorId) =>
  samples.actors.find((a) => sameActor(a.actor, actor))?.name ??
  scriptFault(`samples ${samples.id} name no actor ${actorKey(actor)}`);

const printWord = (samples: Samples, word: WorldWord) =>
  WorldWord.$match(word, {
    control: ({ server, control, input }) =>
      `${serverName(samples, server)}.${control}(${literal(input)})`,
    wire: ({ server, endpoint, word: kind, at }) => {
      const where =
        (kind === "hold" || kind === "drop") && at === "response" ? '{ at: "response" }' : "";

      return `${serverName(samples, server)}.${endpoint}.${kind}(${where})`;
    },
    cleanup: ({ server, endpoint, outcome }) =>
      `${serverName(samples, server)}.${endpoint}.cleanup(${literal(outcome)})`,
    storage: ({ word: kind }) => `Fake.storage.${kind}()`,
    stored: ({ key, text }) => `Fake.storage.put(${literal(key)}, ${literal(text)})`,
    network: ({ word: kind }) => `Fake.network.${kind}()`,
  });

const durationText = (duration: Duration.Input) =>
  Formatter.formatJson(
    Predicate.isString(duration)
      ? duration
      : `${Duration.toMillis(Duration.fromInputUnsafe(duration))} millis`,
  );

const reloadOptions = (reattach: boolean, heldWrites: "abort" | "land") => {
  const options = [
    reattach ? Option.none() : Option.some("reattach: false"),
    heldWrites === "land" ? Option.some('heldWrites: "land"') : Option.none(),
  ].flatMap((o) => Option.toArray(o));

  return options.length === 0 ? "" : `{ ${options.join(", ")} }`;
};

const printStep = (samples: Samples, step: Step) =>
  StepData.$match(step, {
    ensure: ({ actor }) => `.ensure(${actorName(samples, actor)})`,
    detach: ({ actor }) => `.detach(${actorName(samples, actor)})`,
    send: ({ actor, event }) =>
      `.send(${actorName(samples, actor)}, ${samples.values.find((v) => v.value === event)?.name ?? literal(event)})`,
    dispose: ({ actor, how }) =>
      `.dispose(${actorName(samples, actor)}${how === "forget" ? ', { how: "forget" }' : ""})`,
    disposeRuntime: ({ forget }) =>
      forget ? ".disposeRuntime({ forget: true })" : ".disposeRuntime()",
    world: ({ words }) => `.world(${words.map((w) => printWord(samples, w)).join(", ")})`,
    advance: ({ duration }) => `.advance(${durationText(duration)})`,
    reload: ({ reattach, heldWrites }) => `.reload(${reloadOptions(reattach, heldWrites)})`,
    checkpoint: ({ name }) => `.checkpoint(${Formatter.formatJson(name)})`,
  });

/**
 * Prints steps as a chained `Story.app(...)` expression over a fixture's samples, to paste into the
 * fixture as ordinary Story code.
 *
 * **Gotchas**
 *
 * - A step on an actor or server the samples do not name is a script fault.
 */
export const print = (samples: Samples, id: string, steps: ReadonlyArray<Step>) =>
  [
    `Story.app(${samples.setup}, { id: ${Formatter.formatJson(id)}, fixtures: [${samples.fixtures.join(", ")}] })`,
    ...steps.map((step) => `  ${printStep(samples, step)}`),
  ].join("\n");

/**
 * Prints the steps of a run of several fixtures in one Runtime, each by the name its fixture gives
 * it, under a comment line that names each fixture's setup and fakes: a Story holds one setup, so a
 * mix prints as steps to read, not code to paste.
 */
export const printMix = (
  parts: ReadonlyArray<Samples>,
  mixed: Samples,
  id: string,
  steps: ReadonlyArray<Step>,
) =>
  [
    `// ${Formatter.formatJson(id)}: one Runtime over ${parts.map((p) => `${p.setup} with [${p.fixtures.join(", ")}]`).join(", ")}`,
    ...steps.map((step) => `  ${printStep(mixed, step)}`),
  ].join("\n");
