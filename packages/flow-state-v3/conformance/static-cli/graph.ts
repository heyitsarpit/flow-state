import { Option, Result, Schema } from "effect";
import type { Graphed } from "../dsl/oracle.ts";
import type { CliRun, Surface } from "../surface.ts";

const Edge = Schema.Struct({
  definition: Schema.String,
  at: Schema.String,
  from: Schema.String,
  event: Schema.String,
  target: Schema.String,
  status: Schema.String,
});

/**
 * The part of `flow graph --json`'s result the suite reads: the machine and its edges, each with
 * its name, its source node, event, target and status (StaticCli R5).
 */
export const GraphJson = Schema.fromJsonString(
  Schema.Struct({
    command: Schema.Literal("graph"),
    machine: Schema.String,
    edges: Schema.Array(Edge),
  }),
);

/**
 * The decoded {@link GraphJson}.
 */
export type GraphJson = typeof GraphJson.Type;

/**
 * The graph a CLI run printed, when it exited 0 with one readable graph document on stdout.
 */
export const graphIn = (run: CliRun) =>
  run.code === 0
    ? Result.getSuccess(Schema.decodeUnknownResult(GraphJson)(run.stdout.trimEnd()))
    : Option.none<GraphJson>();

/**
 * What `flow graph <fixture> --json` names for one fixture, as the runtime cases record it; `None`
 * when the CLI cannot select the fixture or prints no readable graph.
 *
 * **Gotchas**
 *
 * - A fixture with no graph has its turns unjudged by the graph gate: the round-14 CLI selects
 *   only its own targets, among the suite's fixtures `pay`.
 */
export const graphedOf = (surface: Surface, fixture: string) =>
  Option.map(
    graphIn(surface.cli(["graph", fixture, "--json"])),
    (graph) =>
      ({
        machine: graph.machine,
        edges: graph.edges.map((e) => ({ definition: e.definition, at: e.at })),
      }) satisfies Graphed,
  );
