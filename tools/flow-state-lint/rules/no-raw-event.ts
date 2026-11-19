import { defineRule } from "@oxlint/plugins";

import { propertyName, relativePath } from "./shared.ts";

import type { ESTree } from "@oxlint/plugins";

const isTagKey = (node: ESTree.Property) =>
  !node.computed &&
  ((node.key.type === "Identifier" && node.key.name === "_tag") ||
    (node.key.type === "Literal" && node.key.value === "_tag"));

// `send(...)` and `story.send(...)`: the calls that take a Flow event.
const isSendCall = (node: ESTree.Node) =>
  node.type === "CallExpression" &&
  (node.callee.type === "Identifier"
    ? node.callee.name === "send"
    : node.callee.type === "MemberExpression" && propertyName(node.callee) === "send");

const insideSend = (node: ESTree.Node) => {
  for (let at = node.parent; at !== undefined && at !== null; at = at.parent)
    if (isSendCall(at)) return true;

  return false;
};

// In fixtures, a Flow event is built with its definition's token (`Cart.E.Add({ ... })`), never as a raw
// `{ _tag }` literal. A Story file (`fixtures/<app>/stories`) holds events and nothing else tagged, so
// any `_tag` literal there is one. A machine file (`fixtures/<app>/machines`) also holds domain data
// with a `_tag` (a palette entry), so only a literal inside a `send(...)` call is an event. Fake servers,
// adapters and services build tagged errors and values, and tests send malformed events on purpose.
export const noRawEventRule = defineRule({
  meta: {
    type: "problem",
    docs: { description: "Fixtures build Flow events with their definition's tokens, not raw `_tag` literals." },
    messages: {
      raw: "A raw `{ _tag: ... }` literal is a Flow event here. Build it with its definition's token, `Machine.E.Name({ ... })`; a helper that returns tokens is fine.",
    },
    schema: [],
  },
  createOnce(context) {
    let inStories = false;
    let inMachines = false;

    return {
      before() {
        const rel = relativePath(context.filename);

        inStories = rel !== undefined && /^fixtures\/[^/]+\/stories\//u.test(rel);
        inMachines = rel !== undefined && /^fixtures\/[^/]+\/machines\//u.test(rel);

        return inStories || inMachines;
      },
      ObjectExpression(node: ESTree.ObjectExpression) {
        const tagged = node.properties.some((p) => p.type === "Property" && isTagKey(p));

        if (tagged && (inStories || insideSend(node))) context.report({ node, messageId: "raw" });
      },
    };
  },
});
