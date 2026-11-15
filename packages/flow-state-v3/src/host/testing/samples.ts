import { Duration, Formatter, Option, Predicate } from "effect";
import { type ActorId, actorKey } from "../../core/world.ts";
import type { ActorRef } from "../runtime.ts";
import type { AnyServer } from "./fake.ts";
import type { StoryRun } from "./run.ts";
import { scriptFault, Step, WorldWord } from "./steps.ts";
import type { Story } from "./story.ts";

/**
 * A property of a run, as a run rule is: a name and a function from a finished run to its
 * breaches. An empty list means the run keeps it.
 */
export type Property = {
  readonly rule: string;
  readonly breaches: (run: StoryRun) => ReadonlyArray<string>;
};

/**
 * What a generated run draws its steps from: a fixture's app, the steps a person takes, its actors,
 * its fake servers and the control words that make them fail, each with the name the fixture gives
 * it, so a run prints as code to paste into the fixture.
 */
export type Samples = {
  readonly id: string;
  readonly story: Story;
  readonly setup: string;
  readonly fixtures: ReadonlyArray<string>;
  readonly steps: ReadonlyArray<Step>;
  readonly actors: ReadonlyArray<{ readonly name: string; readonly actor: ActorId }>;
  readonly servers: ReadonlyArray<{ readonly name: string; readonly server: AnyServer }>;
  readonly failures: ReadonlyArray<WorldWord>;
  readonly landedFailures: ReadonlyArray<WorldWord>;
  readonly controls: ReadonlyArray<WorldWord>;
  // FLOW_STATE_ALLOW_UNKNOWN: an event a sample sends, of its own definition's type.
  readonly values: ReadonlyArray<{ readonly name: string; readonly value: unknown }>;
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
 * so a printed run reads as the fixture's own code. `steps` chains the steps a person takes, each
 * one sample.
 * `failures` are control words after which the server's next answer is a domain failure;
 * `landedFailures` those after which it applies the write and still fails; `controls` the other
 * control words, such as a heal. `values` names events the fixture's code already holds, which a
 * printed run sends by that name when a sample sends that very value.
 *
 * **Gotchas**
 *
 * - A control word changes the server's truth; it never answers a call itself.
 */
export const samplesOf = (options: {
  readonly id: string;
  readonly story: Story;
  readonly names: { readonly setup: string; readonly fixtures: ReadonlyArray<string> };
  readonly actors: Readonly<Record<string, ActorRef>>;
  readonly servers: Readonly<Record<string, { readonly "~server": AnyServer }>>;
  readonly failures: ReadonlyArray<WorldWord>;
  readonly landedFailures: ReadonlyArray<WorldWord>;
  readonly controls: ReadonlyArray<WorldWord>;
  // FLOW_STATE_ALLOW_UNKNOWN: an event a sample sends, of its own definition's type.
  readonly values: Readonly<Record<string, unknown>>;
  readonly steps: (story: Story) => Story;
}) =>
  ({
    id: options.id,
    story: options.story,
    setup: options.names.setup,
    fixtures: options.names.fixtures,
    steps: options.steps(options.story).steps,
    actors: Object.entries(options.actors).map(([name, ref]) => ({
      name,
      actor: { machine: ref.machine.compiled.id, name: ref.name },
    })),
    servers: Object.entries(options.servers).map(([name, server]) => ({
      name,
      server: server["~server"],
    })),
    failures: options.failures,
    landedFailures: options.landedFailures,
    controls: options.controls,
    values: Object.entries(options.values).map(([name, value]) => ({ name, value })),
  }) satisfies Samples;

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/u;

const keyText = (key: string) => (IDENTIFIER.test(key) ? key : Formatter.formatJson(key));

// FLOW_STATE_ALLOW_UNKNOWN: an event or control input is any plain value of its own Schema.
// RETURN_TYPE: a recursive printer states its result.
const literal = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(literal).join(", ")}]`;

  if (!Predicate.isObject(value)) return Formatter.formatJson(value);
  const entries = Object.entries(value).map(([key, v]) => `${keyText(key)}: ${literal(v)}`);

  return entries.length === 0 ? "{}" : `{ ${entries.join(", ")} }`;
};

const serverName = (samples: Samples, server: AnyServer) =>
  samples.servers.find((s) => s.server === server)?.name ??
  scriptFault(`samples ${samples.id} name no server ${server.name}`);

const actorName = (samples: Samples, actor: ActorId) =>
  samples.actors.find((a) => actorKey(a.actor) === actorKey(actor))?.name ??
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
    storage: ({ word: kind }) => `Fake.storage.${kind}()`,
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
  Step.$match(step, {
    ensure: ({ actor }) => `.ensure(${actorName(samples, actor)})`,
    detach: ({ actor }) => `.detach(${actorName(samples, actor)})`,
    send: ({ actor, event }) =>
      `.send(${actorName(samples, actor)}, ${samples.values.find((v) => v.value === event)?.name ?? literal(event)})`,
    dispose: ({ actor, how }) =>
      `.dispose(${actorName(samples, actor)}${how === "forget" ? ', { how: "forget" }' : ""})`,
    disposeRuntime: () => ".disposeRuntime()",
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
