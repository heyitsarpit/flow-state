import { parts } from "../../fixtures/index.ts";
import { partFixture } from "../parts/reference.ts";
import { type Fixture, UnknownFixture } from "./fixture.ts";
import { Form } from "./form.ts";
import { Issues } from "./issues.ts";
import { Held, Keyed } from "./keyed.ts";
import { Cancel, LateQueue, Latest, Release, Serialize } from "./one-lane.ts";
import { Stamp } from "./stamp.ts";

/**
 * Every real fixture the suite boots, in one list: each part's derived fixture and each hand lab
 * not yet converted to a part. Players hand it to `scenarioOf`, which fails on a name it lacks.
 */
export const registered: ReadonlyArray<Fixture> = [
  ...parts.map(partFixture),
  Serialize,
  Latest,
  Cancel,
  Release,
  LateQueue,
  Keyed,
  Held,
  Issues,
  Stamp,
  Form,
];

/**
 * The {@link registered} fixtures by name.
 */
export const registry = new Map(registered.map((f) => [f.name, f] as const));

/**
 * The registry's fixture named `name`.
 *
 * **Gotchas**
 *
 * - Throws {@link UnknownFixture}, a defect: a script that names no real fixture is the suite's
 *   own error.
 */
export const fixtureNamed = (name: string) => {
  const found = registry.get(name);

  if (found === undefined) throw new UnknownFixture({ name });

  return found;
};
