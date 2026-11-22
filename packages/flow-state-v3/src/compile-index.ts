import { Option } from "effect";
import type { Level, Node } from "./core/compiled.ts";
import type { Walked } from "./compile-body.ts";

/**
 * The fields of a machine's states derived once, when it is built, so no hot path scans for them:
 * each node's `chain`, `depth` and `leaf`, the machine's `initial` leaf, and the tags the root or
 * some state handles.
 *
 * **When to use**
 *
 * Once, on a walked body, in the one construction step; the only writer of these fields.
 *
 * **Details**
 *
 * One pass down the nodes, whose parents come first, for `chain` and `depth`, and one pass up, whose
 * children come first, for `leaf`. O(N·d) memory for the chains, O(N + H) time otherwise.
 */
export const indexOf = (walked: Walked) => {
  const chains = new Map<string, ReadonlyArray<string>>();

  for (const node of walked.nodes) {
    const above = Option.match(node.parent, {
      onNone: () => [],
      onSome: (parent) => chains.get(parent) ?? [],
    });

    chains.set(node.path, [...above, node.path]);
  }

  const leaves = new Map<string, string>();

  for (const node of walked.nodes.toReversed())
    leaves.set(
      node.path,
      Option.match(node.default, {
        onNone: () => node.path,
        onSome: (child) => leaves.get(child) ?? child,
      }),
    );

  const states = new Map<string, Node>(
    walked.nodes.map((node) => {
      const chain = chains.get(node.path) ?? [node.path];

      return [
        node.path,
        { ...node, chain, depth: chain.length, leaf: leaves.get(node.path) ?? node.path },
      ];
    }),
  );

  const levels: ReadonlyArray<Level> = [walked.root, ...walked.nodes.map((n) => n.on)];

  return {
    states,
    initial: leaves.get(walked.initial) ?? walked.initial,
    handledTags: new Set(levels.flatMap((level) => [...level.keys()])),
  };
};
