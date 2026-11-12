import { defineRule, eslintCompatPlugin } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

// A Spec or Plan rule id written into a comment: the Spec owns its ids and tests cite them, so
// production comments never do (Epic constraint: no plan or invariant ids in code).
const SPEC_ID =
  /\b(?:Actors|WriteLanes|WriteAhead|Turn|Reads|Restore|Compile|Codec|Diagnostics|StaticCli|Inspection|Runtime|Operations|Conformance)\s+[RIOQTCV]\d+\b/u;

const noSpecIdsRule = defineRule({
  meta: {
    type: "suggestion",
    docs: { description: "No Spec or Plan rule ids in production comments." },
    messages: {
      specId:
        "Comment cites the rule id `{{id}}`. The Spec owns its ids and tests cite them; say what the code guarantees instead.",
    },
    schema: [],
  },
  createOnce(context) {
    return {
      "Program:exit"(_node: ESTree.Program) {
        for (const comment of context.sourceCode.getAllComments()) {
          const found = SPEC_ID.exec(comment.value);

          if (found !== null)
            context.report({ loc: comment.loc, messageId: "specId", data: { id: found[0] } });
        }
      },
    };
  },
});

const flowStateLintPlugin = eslintCompatPlugin({
  meta: { name: "flow-state" },
  rules: { "no-spec-ids": noSpecIdsRule },
});

export default flowStateLintPlugin;
