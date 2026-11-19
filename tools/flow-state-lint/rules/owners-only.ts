import { defineRule } from "@oxlint/plugins";

import { appliesTo, optionsSchema, propertyName, relativePath } from "./shared.ts";

import type { ESTree } from "@oxlint/plugins";
import type { Options } from "./shared.ts";

// What only the host's Owners may do: start or interrupt a fiber, race or time out work, or read a
// Cause or a failed Exit. Every task's Exit is judged once, by the Owner that ran it; a second
// reader is how a cleanup's failure gets misread or lost.
const banned: ReadonlyArray<readonly [object: string, matches: (property: string) => boolean]> = [
  ["Effect", (p) => /^(fork|runFork|race|timeout)/u.test(p)],
  ["FiberMap", () => true],
  ["FiberSet", () => true],
  ["Fiber", (p) => p.startsWith("interrupt")],
  ["Cause", (p) => p.startsWith("has") || p.startsWith("find")],
  ["Exit", (p) => p === "isFailure"],
];

export const ownersOnlyRule = defineRule({
  meta: {
    type: "problem",
    docs: { description: "Only the host's Owners fork, interrupt, race or time out work, or read a Cause." },
    messages: {
      owned:
        "`{{name}}` belongs to the Owners module: fork through an Owner, which judges the task's Exit once and hands you an Ending.",
    },
    schema: optionsSchema,
  },
  createOnce(context) {
    const report = (node: ESTree.Node, name: string) =>
      context.report({ node, messageId: "owned", data: { name } });

    return {
      before() {
        const rel = relativePath(context.filename);
        const given: Options = context.options[0] ?? {};

        return rel !== undefined && appliesTo(rel, given);
      },
      MemberExpression(node: ESTree.MemberExpression) {
        const property = propertyName(node);

        if (property === "interruptUnsafe") return report(node, property);

        if (node.object.type !== "Identifier") return;

        const object = node.object.name;

        if (banned.some(([owner, matches]) => owner === object && matches(property)))
          report(node, `${object}.${property}`);
      },
    };
  },
});
