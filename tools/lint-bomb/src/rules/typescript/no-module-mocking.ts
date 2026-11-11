import { defineRule } from "@oxlint/plugins";

import { resolveVariable } from "../../shared/scope.ts";

import type { ESTree, SourceCode, Variable } from "@oxlint/plugins";

import { isTestFile } from "../../shared/file-scope.ts";

const moduleMockMethods = new Set(["doMock", "mock", "unstable_mockModule"]);

function unwrapExpression(expression: ESTree.Expression): ESTree.Expression {
  let current = expression;
  while (
    current.type === "ParenthesizedExpression" ||
    current.type === "TSAsExpression" ||
    current.type === "TSSatisfiesExpression" ||
    current.type === "TSTypeAssertion" ||
    current.type === "TSNonNullExpression"
  )
    current = current.expression;
  return current;
}

function propertyName(property: {
  readonly computed: boolean;
  readonly key: ESTree.PropertyKey;
}): string | null {
  if (!property.computed && property.key.type === "Identifier") return property.key.name;
  return property.computed &&
    property.key.type === "Literal" &&
    typeof property.key.value === "string"
    ? property.key.value
    : null;
}

function memberName(member: ESTree.MemberExpression): string | null {
  if (!member.computed && member.property.type === "Identifier") return member.property.name;
  if (
    member.computed &&
    member.property.type === "Literal" &&
    typeof member.property.value === "string"
  ) {
    return member.property.value;
  }
  if (
    member.computed &&
    member.property.type === "TemplateLiteral" &&
    member.property.expressions.length === 0 &&
    member.property.quasis.length === 1
  ) {
    const quasi = member.property.quasis[0];
    return quasi?.value.cooked ?? quasi?.value.raw ?? null;
  }
  return null;
}

function stableInitializer(variable: Variable): ESTree.Expression | null {
  if (
    variable.defs.length !== 1 ||
    variable.references.some((reference) => reference.isWrite() && !reference.init)
  )
    return null;
  const definition = variable.defs[0];
  if (
    definition?.type !== "Variable" ||
    definition.node.type !== "VariableDeclarator" ||
    definition.parent?.type !== "VariableDeclaration" ||
    definition.parent.kind !== "const" ||
    definition.node.id.type !== "Identifier"
  )
    return null;
  return definition.node.init;
}

function importedName(node: ESTree.Node): string | null {
  if (node.type !== "ImportSpecifier") return null;
  return node.imported.type === "Identifier" ? node.imported.name : node.imported.value;
}

function testNamespaceSource(
  sourceCode: SourceCode,
  expression: ESTree.Expression,
  seen: ReadonlySet<Variable> = new Set(),
): string | null {
  expression = unwrapExpression(expression);
  if (expression.type !== "Identifier") return null;
  const variable = resolveVariable(sourceCode, expression);
  if (variable === null || seen.has(variable)) return null;
  for (const definition of variable.defs) {
    if (definition.type !== "ImportBinding" || definition.node.type !== "ImportNamespaceSpecifier")
      continue;
    const source =
      definition.parent?.type === "ImportDeclaration" ? definition.parent.source.value : "";
    if (source === "vitest" || source === "@jest/globals") return source;
  }
  const initializer = stableInitializer(variable);
  return initializer === null
    ? null
    : testNamespaceSource(sourceCode, initializer, new Set([...seen, variable]));
}

function isTestNamespaceImport(
  sourceCode: SourceCode,
  expression: ESTree.Expression,
  member: string,
): boolean {
  const source = testNamespaceSource(sourceCode, expression);
  return (
    (member === "vi" && source === "vitest") || (member === "jest" && source === "@jest/globals")
  );
}

function isTestFrameworkObject(
  sourceCode: SourceCode,
  expression: ESTree.Expression,
  seen: ReadonlySet<Variable> = new Set(),
): boolean {
  expression = unwrapExpression(expression);
  const namespaceMember = expression.type === "MemberExpression" ? memberName(expression) : null;
  if (
    expression.type === "MemberExpression" &&
    (namespaceMember === "vi" || namespaceMember === "jest") &&
    expression.object.type === "Identifier" &&
    isTestNamespaceImport(sourceCode, expression.object, namespaceMember)
  )
    return true;
  if (expression.type !== "Identifier") return false;
  if (
    (expression.name === "vi" || expression.name === "jest") &&
    sourceCode.isGlobalReference(expression)
  )
    return true;
  const variable = resolveVariable(sourceCode, expression);
  if (variable === null || seen.has(variable)) return false;
  if (
    variable.defs.some((definition) => {
      if (definition.type !== "ImportBinding" || definition.parent?.type !== "ImportDeclaration") {
        return false;
      }
      const source = definition.parent.source.value;
      if (definition.node.type === "ImportNamespaceSpecifier") {
        return source === "vitest" || source === "@jest/globals";
      }
      const name = importedName(definition.node);
      return (
        (source === "vitest" && name === "vi") || (source === "@jest/globals" && name === "jest")
      );
    })
  )
    return true;
  const initializer = stableInitializer(variable);
  if (
    initializer !== null &&
    isTestFrameworkObject(sourceCode, initializer, new Set([...seen, variable]))
  )
    return true;
  const definition = variable.defs.length === 1 ? variable.defs[0] : null;
  if (
    definition?.type === "Variable" &&
    definition.node.type === "VariableDeclarator" &&
    definition.parent?.type === "VariableDeclaration" &&
    definition.parent.kind === "const" &&
    definition.node.id.type === "ObjectPattern" &&
    definition.node.init !== null
  ) {
    for (const property of definition.node.id.properties) {
      if (
        property.type === "Property" &&
        property.value.type === "Identifier" &&
        property.value.name === expression.name &&
        ((propertyName(property) === "vi" &&
          testNamespaceSource(sourceCode, definition.node.init) === "vitest") ||
          (propertyName(property) === "jest" &&
            testNamespaceSource(sourceCode, definition.node.init) === "@jest/globals"))
      )
        return true;
    }
  }
  return false;
}

function moduleMockFunction(
  sourceCode: SourceCode,
  expression: ESTree.Expression,
  seen: ReadonlySet<Variable> = new Set(),
): boolean {
  expression = unwrapExpression(expression);
  if (expression.type === "MemberExpression") {
    const method = memberName(expression);
    return (
      method !== null &&
      moduleMockMethods.has(method) &&
      isTestFrameworkObject(sourceCode, expression.object)
    );
  }
  if (expression.type !== "Identifier") return false;
  const variable = resolveVariable(sourceCode, expression);
  if (variable === null || seen.has(variable)) return false;
  const initializer = stableInitializer(variable);
  if (
    initializer !== null &&
    moduleMockFunction(sourceCode, initializer, new Set([...seen, variable]))
  )
    return true;
  const definition = variable.defs.length === 1 ? variable.defs[0] : null;
  if (
    definition?.type !== "Variable" ||
    definition.node.type !== "VariableDeclarator" ||
    definition.parent?.type !== "VariableDeclaration" ||
    definition.parent.kind !== "const"
  )
    return false;
  const declarator = definition.node;
  if (declarator.id.type !== "ObjectPattern" || declarator.init === null) return false;
  const initValue = declarator.init;
  return declarator.id.properties.some(
    (property) =>
      property.type === "Property" &&
      property.value.type === "Identifier" &&
      property.value.name === expression.name &&
      moduleMockMethods.has(propertyName(property) ?? "") &&
      isTestFrameworkObject(sourceCode, initValue, new Set([...seen, variable])),
  );
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
        "Provide an alternative implementation of a named external dependency through its real contract. For Effect Services, supply an alternative Layer; exercise the unchanged consumer and real internal owners. Keep test state fresh unless sharing is intentional, and do not invent interfaces solely to mock internal functions.",
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
        if (moduleMockFunction(context.sourceCode, node.callee)) {
          context.report({ node, messageId: "moduleMock" });
        }
      },
    };
  },
});
