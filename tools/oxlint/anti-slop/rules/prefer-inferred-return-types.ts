import { defineRule } from "@oxlint/plugins";

import type { ESTree, SourceCode } from "@oxlint/plugins";

import { normalizedFilename } from "../shared/file-scope.ts";

function hasReturnTypeReason(sourceCode: SourceCode, node: ESTree.Node) {
  let current = node;
  const text = sourceCode.getText();
  while (true) {
    const comment = sourceCode.getCommentsBefore(current).at(-1);
    if (comment !== undefined && /^\s*RETURN_TYPE:[ \t]*\S/u.test(comment.value)) {
      const lineStart = text.lastIndexOf("\n", comment.start - 1) + 1;
      const standalone = text.slice(lineStart, comment.start).trim() === "";
      if (standalone && /^[ \t]*\r?\n[ \t]*$/u.test(text.slice(comment.end, current.start))) return true;
    }
    const parent = current.parent;
    if (
      (parent?.type === "VariableDeclarator" && parent.init === current) ||
      (parent?.type === "VariableDeclaration" && parent.declarations.length === 1) ||
      (parent?.type === "ExportNamedDeclaration" && parent.declaration === current) ||
      (parent?.type === "ExportDefaultDeclaration" && parent.declaration === current) ||
      (parent?.type === "Property" && parent.value === current) ||
      (parent?.type === "MethodDefinition" && parent.value === current) ||
      (parent?.type === "PropertyDefinition" && parent.value === current)
    ) {
      current = parent;
    } else {
      return false;
    }
  }
}

export const preferInferredReturnTypesRule = defineRule({
  meta: {
    type: "suggestion",
    docs: { description: "Prefer inferred implementation returns; require a local reason for explicit annotations." },
    messages: {
      infer: "Prefer an inferred return type: repeated annotations add maintenance and can hide precise inference. Remove it if the contract is preserved, or add an adjacent // RETURN_TYPE: comment explaining the required contract or inference limitation. Keep meaningful function names; do not inline or add casts just to avoid this warning.",
    },
  },
  createOnce(context) {
    const check = (node: ESTree.ArrowFunctionExpression | ESTree.Function) => {
      if (!/(?:^|\/)packages\/flow-state-rewrite\/(?:src|test)\//u.test(normalizedFilename(context.filename))) return;
      if (node.body === null || node.returnType === null || node.returnType === undefined) return;
      if (!hasReturnTypeReason(context.sourceCode, node)) context.report({ node: node.returnType, messageId: "infer" });
    };
    return { ArrowFunctionExpression: check, FunctionDeclaration: check, FunctionExpression: check };
  },
});
