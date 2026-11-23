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

// The literal is an event the `send(...)` call takes: the nearest call around it is that `send`. A literal
// inside another call's arguments (a token's payload, `Cart.E.Add({ line: { _tag: "X" } })`) is data.
const insideSend = (node: ESTree.Node) => {
  for (let at = node.parent; at !== undefined && at !== null; at = at.parent)
    if (at.type === "CallExpression") return isSendCall(at);

  return false;
};

// A Flow event is built with its definition's token (`Cart.E.Add({ ... })`), never as a raw `{ _tag }`
// literal. A Story file (`fixtures/<app>/stories`) holds events and nothing else tagged, so any `_tag`
// literal there is one. In machine files (`fixtures/<app>/machines`) and tests (`tests/`) a `_tag` literal
// may be domain data (a palette entry, a tagged error), so only a literal passed to `send(...)` is an event.
// A test that sends a malformed, unknown or internal event on purpose, to prove the refusal, keeps the raw
// literal and says why on the line before: `// oxlint-disable-next-line flow-state/no-raw-event -- reason`.
// Fake servers, adapters and services build tagged errors and values.
export const noRawEventRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description: "Fixtures and tests build Flow events with their definition's tokens, not raw `_tag` literals.",
    },
    messages: {
      raw: "A raw `{ _tag: ... }` literal is a Flow event here. Build it with its definition's token, `Machine.E.Name({ ... })`; a helper that returns tokens is fine. A deliberate malformed send keeps it with `// oxlint-disable-next-line flow-state/no-raw-event -- reason`.",
    },
    schema: [],
  },
  createOnce(context) {
    let inStories = false;
    let inSendOnly = false;

    return {
      before() {
        const rel = relativePath(context.filename);

        inStories = rel !== undefined && /^fixtures\/[^/]+\/stories\//u.test(rel);
        inSendOnly = rel !== undefined && /^(fixtures\/[^/]+\/machines|tests)\//u.test(rel);

        return inStories || inSendOnly;
      },
      ObjectExpression(node: ESTree.ObjectExpression) {
        const tagged = node.properties.some((p) => p.type === "Property" && isTagKey(p));

        if (tagged && (inStories || insideSend(node))) context.report({ node, messageId: "raw" });
      },
    };
  },
});
