import { defineRule } from "@oxlint/plugins";

import type { ESTree, SourceCode, Variable } from "@oxlint/plugins";

import {
  boundaryOptionsSchema,
  isConfiguredBoundaryFile,
  isTestFile,
} from "../../shared/file-scope.ts";
import type { BoundaryOptions } from "../../shared/file-scope.ts";
import { resolveVariable } from "../../shared/scope.ts";

function normalizedFilename(filename: string): string {
  return filename.replaceAll("\\", "/");
}

function isAllowedBoundary(
  filename: string,
  options: BoundaryOptions | undefined,
  cwd: string,
): boolean {
  const normalized = normalizedFilename(filename);
  return (
    !/\.(?:[cm]?ts|tsx)$/u.test(normalized) ||
    isTestFile(filename) ||
    isConfiguredBoundaryFile(filename, options, cwd)
  );
}

function unwrapExpression(expression: ESTree.Expression): ESTree.Expression {
  let current = expression;
  while (
    current.type === "ParenthesizedExpression" ||
    current.type === "TSAsExpression" ||
    current.type === "TSSatisfiesExpression" ||
    current.type === "TSTypeAssertion" ||
    current.type === "TSNonNullExpression" ||
    current.type === "TSInstantiationExpression"
  ) {
    current = current.expression;
  }
  return current;
}

function staticMemberName(member: ESTree.MemberExpression): string | null {
  if (!member.computed && member.property.type === "Identifier") return member.property.name;
  return member.computed &&
    member.property.type === "Literal" &&
    typeof member.property.value === "string"
    ? member.property.value
    : null;
}

function staticPropertyName(property: ESTree.Node, computed: boolean): string | null {
  if (!computed && property.type === "Identifier") return property.name;
  return property.type === "Literal" && typeof property.value === "string" ? property.value : null;
}

function isGlobalJSON(sourceCode: SourceCode, node: ESTree.IdentifierReference): boolean {
  const variable = resolveVariable(sourceCode, node);
  return variable === null || variable.defs.length === 0;
}

function isParseBindingPattern(node: ESTree.Node, bindingName: string): boolean {
  if (node.type === "Identifier") return node.name === bindingName;
  if (node.type === "AssignmentPattern") return isParseBindingPattern(node.left, bindingName);
  if (node.type !== "ObjectPattern") return false;
  return node.properties.some(
    (property) =>
      property.type === "Property" &&
      staticPropertyName(property.key, property.computed) === "parse" &&
      isParseBindingPattern(property.value, bindingName),
  );
}

function stableAliasDefinition(
  sourceCode: SourceCode,
  node: ESTree.IdentifierReference,
): ESTree.VariableDeclarator | null {
  const variable = resolveVariable(sourceCode, node);
  if (variable === null || variable.defs.length !== 1) return null;
  const definition = variable.defs[0];
  if (
    definition?.type !== "Variable" ||
    definition.node.type !== "VariableDeclarator" ||
    definition.parent?.type !== "VariableDeclaration" ||
    definition.parent.kind !== "const" ||
    variable.references.some((reference) => reference.isWrite() && !reference.init)
  )
    return null;
  return definition.node;
}

function isJsonParseReference(
  sourceCode: SourceCode,
  node: ESTree.Expression,
  seen: ReadonlySet<Variable> = new Set(),
): boolean {
  const value = unwrapExpression(node);
  if (value.type === "MemberExpression") {
    return (
      staticMemberName(value) === "parse" &&
      value.object.type === "Identifier" &&
      value.object.name === "JSON" &&
      isGlobalJSON(sourceCode, value.object)
    );
  }
  if (value.type !== "Identifier") return false;
  const variable = resolveVariable(sourceCode, value);
  if (variable === null || seen.has(variable)) return false;
  const definition = stableAliasDefinition(sourceCode, value);
  if (definition === null || definition.init === null) return false;
  if (definition.id.type === "Identifier") {
    return isJsonParseReference(sourceCode, definition.init, new Set([...seen, variable]));
  }
  const initializer = unwrapExpression(definition.init);
  return (
    definition.id.type === "ObjectPattern" &&
    isParseBindingPattern(definition.id, value.name) &&
    initializer.type === "Identifier" &&
    initializer.name === "JSON" &&
    isGlobalJSON(sourceCode, initializer)
  );
}

function isJsonParse(sourceCode: SourceCode, node: ESTree.Expression): boolean {
  return node.type === "CallExpression" && isJsonParseReference(sourceCode, node.callee);
}

/** Require complete decoding before JSON.parse becomes a domain value. */
export const noShallowJsonDomainCastRule = defineRule({
  meta: {
    schema: boundaryOptionsSchema,
    type: "problem",
    docs: {
      description:
        "Keep raw JSON.parse results at an authorized boundary until Schema decoding admits domain values.",
    },
    messages: {
      jsonParse:
        "This JSON.parse path does not establish an admitted domain value. Define a Schema.fromJsonString codec and reuse Schema.decodeEffect or Schema.decodeResult at the JSON boundary. Reuse a schema-aware adapter when it already owns decoding.",
    },
  },
  createOnce(context) {
    let allowedBoundary = false;

    const report = (node: ESTree.Node) => context.report({ node, messageId: "jsonParse" });

    return {
      Program() {
        allowedBoundary = isAllowedBoundary(
          context.filename,
          context.options[0] as BoundaryOptions | undefined,
          context.cwd,
        );
      },
      TSAsExpression(node: ESTree.TSAsExpression) {
        if (allowedBoundary) return;
        if (isJsonParse(context.sourceCode, node.expression)) report(node);
      },
      TSTypeAssertion(node: ESTree.TSTypeAssertion) {
        if (allowedBoundary) return;
        if (isJsonParse(context.sourceCode, node.expression)) report(node);
      },
      VariableDeclarator(node: ESTree.VariableDeclarator) {
        if (allowedBoundary) return;
        if (node.init !== null && isJsonParse(context.sourceCode, node.init)) report(node.init);
      },
      AssignmentExpression(node: ESTree.AssignmentExpression) {
        if (allowedBoundary) return;
        if (isJsonParse(context.sourceCode, node.right)) report(node.right);
      },
      ArrowFunctionExpression(node: ESTree.ArrowFunctionExpression) {
        if (allowedBoundary || node.body.type === "BlockStatement") return;
        if (isJsonParse(context.sourceCode, node.body)) report(node.body);
      },
      ReturnStatement(node: ESTree.ReturnStatement) {
        if (allowedBoundary) return;
        if (node.argument !== null && isJsonParse(context.sourceCode, node.argument))
          report(node.argument);
      },
    };
  },
});
