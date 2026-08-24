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
        "This local definite-assignment assertion hides an uninitialized state. Initialize the variable at its declaration or restructure the control flow so TypeScript can prove assignment.",
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
