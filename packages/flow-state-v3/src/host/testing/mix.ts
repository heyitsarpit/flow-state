import { Option } from "effect";
import { type App, machineOf, type RuntimeConfig } from "../runtime.ts";
import { TraceRecord } from "../trace.ts";
import type { StoryRun, Subject } from "./run.ts";
import type { Samples } from "./samples.ts";
import { scriptFault } from "./steps.ts";
import { storyOf, SubjectId } from "./story.ts";
import { compiledOf } from "../../compiled-of.ts";

const repeated = (values: ReadonlyArray<string>) =>
  values.filter((v, n) => values.indexOf(v) !== n);

const once = (what: string, values: ReadonlyArray<string>) => {
  const twice = repeated(values);

  if (twice.length > 0)
    scriptFault(`the fixtures of a mix share ${what} ${[...new Set(twice)].join(", ")}`);
};

const machinesOf = (part: Samples) =>
  Object.values(part.story[SubjectId].config.app.machines).map((m) => compiledOf(machineOf(m)).id);

// The persistence every part that has one sets: a mix runs one Runtime, so they must agree.
const persistenceOf = (configs: ReadonlyArray<RuntimeConfig>) => {
  const set = configs.flatMap((c) => (c.persistence === undefined ? [] : [c.persistence]));
  const intervals = new Set(set.map((p) => p.captureMs));

  if (intervals.size > 1) scriptFault("the fixtures of a mix set different capture intervals");

  return set[0];
};

// RETURN_TYPE: the Runtime's configuration, whose optional fields stay absent when no part sets them.
const configOf = (id: string, parts: ReadonlyArray<Samples>): RuntimeConfig => {
  const configs = parts.map((p) => p.story[SubjectId].config);

  const app: App = {
    id,
    machines: Object.fromEntries(
      parts.flatMap((p, n) =>
        Object.entries(configs[n]?.app.machines ?? {}).map(([key, m]) => [`${p.id}.${key}`, m]),
      ),
    ),
  };

  const scopes = configs.flatMap((c) => (c.scope === undefined ? [] : [c.scope]));
  const persistence = persistenceOf(configs);

  const scoped: RuntimeConfig = scopes.length === 0 ? { app } : { app, scope: scopes.join("+") };

  return persistence === undefined ? scoped : { ...scoped, persistence };
};

/**
 * Several fixtures' samples as one: one app holding every fixture's machines, every fixture's fakes
 * over one store, network and clock, and every step, actor, server and control word. One part is
 * itself.
 *
 * **Gotchas**
 *
 * - Two parts with one machine id, one server or one server name, or with different capture
 *   intervals, are a script fault: a mix shares what a page shares, never a machine or a server's
 *   truth.
 */
// RETURN_TYPE: the Samples contract a generated run draws from, whichever branch builds it.
export const mixOf = (parts: ReadonlyArray<Samples>): Samples => {
  const [first] = parts;

  if (first === undefined) return scriptFault("a mix has no fixtures");

  if (parts.length === 1) return first;

  once(
    "the fixture",
    parts.map((p) => p.id),
  );
  once("the machine", parts.flatMap(machinesOf));
  once(
    "the server",
    parts.flatMap((p) => p.servers.map((s) => s.server.name)),
  );

  const id = parts.map((p) => p.id).join("+");
  const subjects = parts.map((p) => p.story[SubjectId]);

  const subject: Subject = {
    config: configOf(id, parts),
    fixtures: subjects.flatMap((s) => s.fixtures),
    world: subjects.flatMap((s) => s.world),
  };

  return {
    id,
    story: storyOf(subject, `${id}/samples`),
    setup: parts.map((p) => p.setup).join(", "),
    fixtures: parts.flatMap((p) => p.fixtures),
    steps: parts.flatMap((p) => p.steps),
    actors: parts.flatMap((p) => p.actors),
    servers: parts.flatMap((p) => p.servers),
    failures: parts.flatMap((p) => p.failures),
    landedFailures: parts.flatMap((p) => p.landedFailures),
    controls: parts.flatMap((p) => p.controls),
    values: parts.flatMap((p) => p.values),
  };
};

/**
 * How many of a run's steps touched two or more of a mix's fixtures: a step whose evidence, calls
 * or write batches name machines or servers of two fixtures. Fixtures share nothing but the store,
 * the network, the clock and the tab, so such a step met through one of them.
 */
export const sharedOf = (run: StoryRun, parts: ReadonlyArray<Samples>) => {
  const machines = parts.flatMap((p) => machinesOf(p).map((m) => [m, p.id] as const));
  const servers = new Map(parts.flatMap((p) => p.servers.map((s) => [s.server.name, p.id])));
  const byMachine = new Map(machines);

  const keyOwner = (key: string) => {
    const rest = key.slice(key.indexOf("/") + 1);

    return Option.toArray(
      Option.fromUndefinedOr(machines.find(([m]) => rest.startsWith(`${m}/`))?.[1]),
    );
  };

  const ownersOf = (record: TraceRecord) =>
    TraceRecord.$match(record, {
      Step: () => [],
      Request: ({ server }) => Option.toArray(Option.fromUndefinedOr(servers.get(server))),
      Write: ({ keys }) => keys.flatMap(keyOwner),
      Runtime: ({ evidence }) =>
        "actor" in evidence
          ? Option.toArray(Option.fromUndefinedOr(byMachine.get(evidence.actor.machine)))
          : [],
      // An Owner's task names its key, never the fixture that forked it.
      Task: () => [],
      Report: () => [],
    });

  const touched = new Map<number, Set<string>>();
  let step = -1;

  for (const { record } of run.trace.events) {
    if (record._tag === "Step") step = record.index;
    const owners = step < 0 ? [] : ownersOf(record);

    if (owners.length > 0) touched.set(step, new Set([...(touched.get(step) ?? []), ...owners]));
  }

  return [...touched.values()].filter((owners) => owners.size >= 2).length;
};
