import { defineRule } from "@oxlint/plugins";

import type { ESTree, Scope, SourceCode, Variable } from "@oxlint/plugins";

import { isTestFile } from "../shared/file-scope.ts";

const moduleMockMethods = new Set(["doMock", "mock", "unstable_mockModule"]);

function resolveVariable(
  sourceCode: SourceCode,
  identifier: ESTree.IdentifierReference,
): Variable | null {
  let scope: Scope | null = sourceCode.getScope(identifier);
  while (scope !== null) {
    const variable = scope.set.get(identifier.name);
    if (variable !== undefined) return variable;
    scope = scope.upper;
  }
  return null;
}

function importedName(node: ESTree.Node): string | null {
  if (node.type !== "ImportSpecifier") return null;
  return node.imported.type === "Identifier" ? node.imported.name : node.imported.value;
}

function isTestNamespaceImport(sourceCode: SourceCode, expression: ESTree.IdentifierReference): boolean {
	const variable = resolveVariable(sourceCode, expression);
	return variable !== null && variable.defs.some((definition) => {
		if (definition.type !== "ImportBinding" || definition.node.type !== "ImportNamespaceSpecifier") return false;
		const source = definition.parent?.type === "ImportDeclaration" ? definition.parent.source.value : "";
		return source === "vitest" || source === "@jest/globals";
	});
}

function isTestFrameworkObject(
	sourceCode: SourceCode,
	expression: ESTree.Expression,
): boolean {
	if (expression.type === "MemberExpression" && !expression.computed && expression.property.type === "Identifier" &&
		(expression.property.name === "vi" || expression.property.name === "jest") &&
		expression.object.type === "Identifier" && isTestNamespaceImport(sourceCode, expression.object)) return true;
	if (expression.type !== "Identifier") return false;
  if (
    (expression.name === "vi" || expression.name === "jest") &&
    sourceCode.isGlobalReference(expression)
  ) {
    return true;
  }

  const variable = resolveVariable(sourceCode, expression);
	if (variable === null || variable.defs.length === 0) {
		return expression.name === "vi" || expression.name === "jest";
	}
	return variable.defs.some((definition) => {
		if (definition.type !== "ImportBinding" || definition.parent?.type !== "ImportDeclaration") {
			return false;
		}
		const source = definition.parent.source.value;
		if (definition.node.type === "ImportNamespaceSpecifier") {
			return source === "vitest" || source === "@jest/globals";
		}
		const name = importedName(definition.node);
		return (source === "vitest" && name === "vi") ||
			(source === "@jest/globals" && name === "jest");
  });
}

function moduleMockCall(sourceCode: SourceCode, callee: ESTree.Expression): boolean {
  if (!("property" in callee) || !("object" in callee) || !("computed" in callee)) return false;
  if (!isTestFrameworkObject(sourceCode, callee.object)) return false;
  const property = callee.property;
  const method = callee.computed
    ? property.type === "Literal" &&
      (property.value === "doMock" ||
        property.value === "mock" ||
        property.value === "unstable_mockModule")
      ? property.value
      : null
    : property.type === "Identifier"
      ? property.name
      : null;
  return method !== null && moduleMockMethods.has(method);
}

/** Ban test framework module mocking in favor of real dependency seams. */
export const noModuleMockingRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow Vitest and Jest module mocking; tests must replace dependencies through real interfaces.",
    },
    messages: {
      moduleMock:
        "Replace module mocking with dependency injection through a real interface, service layer, or faithful test implementation.",
    },
  },
  createOnce(context) {
    let testFile = false;

    return {
      Program() {
        testFile = isTestFile(context.filename);
      },
      CallExpression(node) {
        if (!testFile) return;
        if (node.callee.type === "Super" || node.callee.type === "V8IntrinsicExpression") return;
        if (moduleMockCall(context.sourceCode, node.callee)) {
          context.report({ node, messageId: "moduleMock" });
        }
      },
    };
  },
});
