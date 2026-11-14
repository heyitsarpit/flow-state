/// <reference types="node" />
import { Schema } from "effect";
import { traces } from "../dsl/lifecycle.traces.ts";
import { holds } from "../dsl/trace-judge.ts";

const Kills = Schema.fromJsonString(Schema.Array(Schema.String));

// The fold-mutant runner's child (T61): run in a mutated copy of the package, it prints the names
// of the lifecycle traces that no longer hold, one JSON line.
process.stdout.write(
  `TRACE-KILLS ${Schema.encodeSync(Kills)(traces.filter((t) => !holds(t)).map((t) => t.name))}\n`,
);
