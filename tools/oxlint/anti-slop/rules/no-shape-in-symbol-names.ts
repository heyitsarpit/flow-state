import { defineRule } from "@oxlint/plugins";
import type { ESTree } from "@oxlint/plugins";

const FORBIDDEN_SYMBOL_NAME = "shape";

function containsForbiddenSymbolName(name: string): boolean {
  return name.toLowerCase().includes(FORBIDDEN_SYMBOL_NAME);
}

function isDeclarationIdentifier(node: ESTree.Node): boolean {
  const parent = node.parent;
	if (parent === null) return false;
  return (
    (parent.type === "VariableDeclarator" && parent.id === node) ||
    ((parent.type === "FunctionDeclaration" || parent.type === "ClassDeclaration") && parent.id === node) ||
    ((parent.type === "FunctionExpression" || parent.type === "ClassExpression") && parent.id === node) ||
    (parent.type === "TSTypeAliasDeclaration" && parent.id === node) ||
    (parent.type === "TSInterfaceDeclaration" && parent.id === node) ||
    (parent.type === "TSEnumDeclaration" && parent.id === node) ||
    (parent.type === "PropertyDefinition" && parent.key === node) ||
    (parent.type === "MethodDefinition" && parent.key === node) ||
    (parent.type === "ImportSpecifier" && parent.local === node) ||
    (parent.type === "ImportDefaultSpecifier" && parent.local === node) ||
    (parent.type === "ImportNamespaceSpecifier" && parent.local === node)
  );
}

/** Ban the case-insensitive substring "shape" in declared symbol names. */
export const noForbiddenTermInSymbolNamesRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        'Disallow the case-insensitive substring "shape" in JavaScript, TypeScript, private, and JSX symbol names.',
    },
    messages: {
      forbiddenSymbolName:
        'Rename symbol "{{name}}" for its domain role; "shape" describes structure rather than ownership.',
    },
  },
  createOnce(context) {
    const reportForbiddenSymbolName = (node: ESTree.Node & { name: string }) => {
      if (!isDeclarationIdentifier(node)) return;
      if (!containsForbiddenSymbolName(node.name)) return;
      context.report({
        node,
        messageId: "forbiddenSymbolName",
        data: { name: node.name },
      });
    };

    return {
      Identifier: reportForbiddenSymbolName,
      PrivateIdentifier: reportForbiddenSymbolName,
      JSXIdentifier: reportForbiddenSymbolName,
    };
  },
});
