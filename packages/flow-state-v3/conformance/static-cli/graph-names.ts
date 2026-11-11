import { Fact, type Graphed, oracle, violation } from "../dsl/oracle.ts";
import { Observation } from "../port.ts";

const nameOf = (definition: string, at: string) => `${definition} ${at}`;

type Names = ReadonlyMap<string, ReadonlySet<string>>;

const namesOf = (graphs: ReadonlyArray<Graphed>) =>
  new Map(graphs.map((g) => [g.machine, new Set(g.edges.map((e) => nameOf(e.definition, e.at)))]));

const unnamedIn = (names: Names, fact: Fact) => {
  if (!Fact.$is("Reported")(fact) || !Observation.$is("Turn")(fact.observation)) return [];
  const turn = fact.observation;
  const graph = names.get(turn.actor.machine);

  if (graph === undefined) return [];

  return turn.parts
    .filter((p) => !graph.has(nameOf(p.definition, p.at)))
    .map((p) =>
      violation(
        `StaticCli I2: ${turn.actor.machine} ran ${nameOf(p.definition, p.at)} on ${turn.event}, an alternative flow graph names no edge for`,
      ),
    );
};

/**
 * The graph gate (StaticCli I2): every alternative a turn record names is an edge `flow graph`
 * printed for that machine, by the same definition and place.
 *
 * **Details**
 *
 * - The graphs are suite facts, read from the CLI before the case's first boot; the turns are the
 *   runtime's own reports, so the two subjects are held to one name.
 * - A machine the CLI printed no graph for is not judged; its turns name nothing to compare.
 * - Only names are judged: an edge's source node and target are the turn record's own claim.
 */
export const graphNames = oracle<Names>({
  name: "graph-names",
  guarantee: ["StaticCli I2"],
  start: (_reference, graphs) => namesOf(graphs),
  step: (names, step) => [names, step.flatMap((fact) => unnamedIn(names, fact))],
});
