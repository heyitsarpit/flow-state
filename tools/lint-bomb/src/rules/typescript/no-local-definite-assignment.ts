import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

/** Disallow definite-assignment assertions on local variable declarations. */
export const noLocalDefiniteAssignmentRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description: "Disallow definite-assignment assertions on local variable declarations.",
    },
    messages: {
      localDefiniteAssignment:
        "This assertion suppresses TypeScript's definite-assignment proof for the local variable; it does not establish whether runtime initialization is safe. Initialize the variable at its declaration or restructure control flow so TypeScript can prove assignment.",
    },
  },
  createOnce(context) {
    return {
      VariableDeclarator(node: ESTree.VariableDeclarator) {
        if (node.definite === true) {
          context.report({ node: node.id, messageId: "localDefiniteAssignment" });
        }
      },
    };
  },
});
