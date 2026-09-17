import { defineRule } from "@oxlint/plugins";

import type { ESTree, Scope, SourceCode, Variable } from "@oxlint/plugins";

import { isTestSupportFile } from "../../shared/file-scope.ts";

type RuleOptions = [{ sourceRoots?: string[]; allowedPathFragments?: string[] }];
type Fact =
  | "global"
  | "date"
  | "performance"
  | "date-array"
  | "performance-array"
  | "date-object"
  | "performance-object"
  | "date-now"
  | "performance-now"
  | "truthy"
  | "falsy"
  | "nullish"
  | "non-nullish"
  | `present:${string}`
  | `undefined:${string}`
  | `date-property:${string}`
  | `performance-property:${string}`;
type Facts = Set<Fact>;
type Aliases = Map<Variable, Facts>;
type NodeRecord = Record<string, unknown>;
type IdentifierNode = ESTree.IdentifierName | ESTree.IdentifierReference | ESTree.BindingIdentifier;
type PropertyNode = { type: "Property"; computed: boolean; key: ESTree.Node };
type LiteralNode = { type: "Literal"; value: unknown };

const defaultSourceRoots = ["packages/flow-state-rewrite/src"] as const;
const defaultAllowedPathFragments = ["/src/hosts/"] as const;
const ambientGlobals = new Set(["globalThis", "global", "self", "window"]);
const wrappers = new Set([
  "ParenthesizedExpression",
  "TSAsExpression",
  "TSSatisfiesExpression",
  "TSTypeAssertion",
  "TSNonNullExpression",
  "TSInstantiationExpression",
]);

function normalized(value: string): string {
  return value.replaceAll("\\", "/");
}

function isNode(value: unknown): value is ESTree.Node {
  return typeof value === "object" && value !== null && "type" in value;
}

function record(node: ESTree.Node): NodeRecord {
  return node as unknown as NodeRecord;
}

function resolveVariable(sourceCode: SourceCode, identifier: IdentifierNode): Variable | null {
  let scope: Scope | null = sourceCode.getScope(identifier);
  while (scope !== null) {
    const variable = scope.set.get(identifier.name);
    if (variable !== undefined) return variable;
    scope = scope.upper;
  }
  return null;
}

function unwrap(node: ESTree.Expression): ESTree.Expression {
  let current = node;
  while (wrappers.has(current.type)) {
    current = (current as unknown as { expression: ESTree.Expression }).expression;
  }
  return current;
}

function propertyName(node: ESTree.MemberExpression | PropertyNode): string | null {
  const property = node.type === "Property" ? node.key : node.property;
  if (!node.computed && property.type === "Identifier") return property.name;
  if (node.computed && property.type === "Literal") {
    const literal = property as unknown as LiteralNode;
    if (typeof literal.value === "string" || typeof literal.value === "number") return String(literal.value);
  }
  return null;
}

function variableDeclarator(variable: Variable): ESTree.VariableDeclarator | null {
  const definition = variable.defs.find(
    (candidate) => candidate.type === "Variable" && candidate.node.type === "VariableDeclarator",
  );
  return definition?.type === "Variable" && definition.node.type === "VariableDeclarator"
    ? definition.node
    : null;
}

function emptyFacts(...facts: Fact[]): Facts {
  return new Set(facts);
}

function joinFacts(...sources: Facts[]): Facts {
  const result = new Set<Fact>();
  for (const source of sources) for (const fact of source) result.add(fact);
  return result;
}

function cloneAliases(aliases: Aliases): Aliases {
  return new Map([...aliases].map(([variable, facts]) => [variable, new Set(facts)]));
}

function joinAliases(...states: Aliases[]): Aliases {
  const result: Aliases = new Map();
  for (const state of states) {
    for (const [variable, facts] of state) {
      result.set(variable, joinFacts(result.get(variable) ?? emptyFacts(), facts));
    }
  }
  return result;
}

function definitelyTruthy(facts: Facts): boolean {
  return facts.has("truthy") && !facts.has("falsy");
}

function definitelyFalsy(facts: Facts): boolean {
  return facts.has("falsy") && !facts.has("truthy");
}

function definitelyNullish(facts: Facts): boolean {
  return facts.has("nullish") && !facts.has("non-nullish");
}

function definitelyNonNullish(facts: Facts): boolean {
  return facts.has("non-nullish") && !facts.has("nullish");
}

function literalFacts(node: LiteralNode): Facts {
  if (node.value === null) return emptyFacts("falsy", "nullish");
  if (typeof node.value === "boolean" || typeof node.value === "number" ||
    typeof node.value === "string" || typeof node.value === "bigint") {
    return emptyFacts(
      node.value ? "truthy" : "falsy",
      "non-nullish",
    );
  }
  return emptyFacts("truthy", "non-nullish");
}

function staticBranch(facts: Facts): "consequent" | "alternate" | null {
  if (definitelyTruthy(facts)) return "consequent";
  if (definitelyFalsy(facts) || definitelyNullish(facts)) return "alternate";
  return null;
}

function isUndefined(sourceCode: SourceCode, node: ESTree.Expression, aliases: Aliases): boolean {
  const value = unwrap(node);
  if (value.type === "UnaryExpression" && value.operator === "void") return true;
  if (value.type !== "Identifier" || value.name !== "undefined") return false;
  const variable = resolveVariable(sourceCode, value);
  return variable === null || variable.defs.length === 0 || definitelyNullish(facts(sourceCode, value, aliases));
}

function propertyFacts(base: Facts, key: string | null): Facts {
  if (key === null) return emptyFacts();
  const result = new Set<Fact>();
  for (const fact of base) {
    if (key === "Date" && (fact === "global" || fact === "date-object")) result.add("date");
    if (key === "performance" && (fact === "global" || fact === "performance-object")) result.add("performance");
    if (/^\d+$/.test(key) && fact === "date-array") result.add("date");
    if (/^\d+$/.test(key) && fact === "performance-array") result.add("performance");
    if (key === "now" && fact === "date") result.add("date-now");
    if (key === "now" && fact === "performance") result.add("performance-now");
    if (fact === `date-property:${key}`) result.add("date");
    if (fact === `performance-property:${key}`) result.add("performance");
  }
  return result.size === 0 ? result : joinFacts(result, emptyFacts("truthy", "non-nullish"));
}

function propertyValues(
  sourceCode: SourceCode,
  source: ESTree.Expression,
  key: string,
  aliases: Aliases,
  seen: Set<Variable> = new Set(),
): ESTree.Expression[] {
  const value = unwrap(source);
  if (value.type === "AssignmentExpression") return propertyValues(sourceCode, value.right, key, aliases, seen);
  if (value.type === "ObjectExpression") {
    const result: ESTree.Expression[] = [];
    for (let index = value.properties.length - 1; index >= 0; index -= 1) {
      const property = value.properties[index];
      if (property?.type === "Property" && propertyName(property) === key) return [property.value];
      if (property?.type === "SpreadElement") result.push(...propertyValues(sourceCode, property.argument, key, aliases, seen));
    }
    return result;
  }
  if (value.type === "ConditionalExpression") {
    const branch = staticBranch(facts(sourceCode, value.test, aliases));
    if (branch === "consequent") return propertyValues(sourceCode, value.consequent, key, aliases, seen);
    if (branch === "alternate") return propertyValues(sourceCode, value.alternate, key, aliases, seen);
    return [
      ...propertyValues(sourceCode, value.consequent, key, aliases, seen),
      ...propertyValues(sourceCode, value.alternate, key, aliases, seen),
    ];
  }
  if (value.type === "LogicalExpression") {
    const leftFacts = facts(sourceCode, value.left, aliases);
    const leftBranch = staticBranch(leftFacts);
    if (value.operator === "&&" && leftBranch === "alternate") return [];
    if (value.operator === "&&" && leftBranch === "consequent") return propertyValues(sourceCode, value.right, key, aliases, seen);
    if (value.operator === "||" && leftBranch === "consequent") return propertyValues(sourceCode, value.left, key, aliases, seen);
    if (value.operator === "||" && leftBranch === "alternate") return propertyValues(sourceCode, value.right, key, aliases, seen);
    return [
      ...propertyValues(sourceCode, value.left, key, aliases, seen),
      ...propertyValues(sourceCode, value.right, key, aliases, seen),
    ];
  }
  if (value.type === "Identifier") {
    const variable = resolveVariable(sourceCode, value);
    if (variable === null || variable.defs.length === 0 || seen.has(variable)) return [];
    if (aliases.has(variable)) return [];
    const declarator = variableDeclarator(variable);
    if (declarator?.init === null || declarator?.init === undefined || declarator.id.type !== "Identifier") return [];
    return propertyValues(sourceCode, declarator.init, key, aliases, new Set(seen).add(variable));
  }
  return [];
}

function staticArrayLength(
  sourceCode: SourceCode,
  source: ESTree.Expression,
  aliases: Aliases,
  seen: Set<Variable> = new Set(),
): number | null {
  const value = unwrap(source);
  if (value.type === "ArrayExpression") {
    let length = 0;
    for (const element of value.elements) {
      if (element === null || element.type !== "SpreadElement") {
        length += 1;
        continue;
      }
      const spreadLength = staticArrayLength(sourceCode, element.argument, aliases, seen);
      if (spreadLength === null) return null;
      length += spreadLength;
    }
    return length;
  }
  if (value.type === "ConditionalExpression") {
    const branch = staticBranch(facts(sourceCode, value.test, aliases));
    if (branch === "consequent") return staticArrayLength(sourceCode, value.consequent, aliases, seen);
    if (branch === "alternate") return staticArrayLength(sourceCode, value.alternate, aliases, seen);
    const left = staticArrayLength(sourceCode, value.consequent, aliases, seen);
    const right = staticArrayLength(sourceCode, value.alternate, aliases, seen);
    return left !== null && left === right ? left : null;
  }
  if (value.type === "Identifier") {
    const variable = resolveVariable(sourceCode, value);
    if (variable === null || seen.has(variable)) return null;
    const declarator = variableDeclarator(variable);
    if (declarator?.init !== null && declarator?.init !== undefined && declarator.id.type === "Identifier") {
      return staticArrayLength(sourceCode, declarator.init, aliases, new Set(seen).add(variable));
    }
  }
  return null;
}

function arrayElement(
  sourceCode: SourceCode,
  source: ESTree.Expression,
  index: number,
  aliases: Aliases,
  seen: Set<Variable> = new Set(),
): ESTree.Expression | null {
  const value = unwrap(source);
  if (value.type === "ArrayExpression") {
    let offset = 0;
    for (const element of value.elements) {
      if (element === null) {
        if (offset === index) return null;
        offset += 1;
        continue;
      }
      if (element.type !== "SpreadElement") {
        if (offset === index) return element;
        offset += 1;
        continue;
      }
      const length = staticArrayLength(sourceCode, element.argument, aliases, seen);
      if (length === null) return null;
      if (index >= offset && index < offset + length) return arrayElement(sourceCode, element.argument, index - offset, aliases, seen);
      offset += length;
    }
    return null;
  }
  if (value.type === "ConditionalExpression") {
    const branch = staticBranch(facts(sourceCode, value.test, aliases));
    if (branch === "consequent") return arrayElement(sourceCode, value.consequent, index, aliases, seen);
    if (branch === "alternate") return arrayElement(sourceCode, value.alternate, index, aliases, seen);
    return null;
  }
  if (value.type !== "Identifier") return null;
  const variable = resolveVariable(sourceCode, value);
  if (variable === null || seen.has(variable)) return null;
  const declarator = variableDeclarator(variable);
  if (declarator?.init === null || declarator?.init === undefined || declarator.id.type !== "Identifier") return null;
  return arrayElement(sourceCode, declarator.init, index, aliases, new Set(seen).add(variable));
}

function arrayElementFacts(
  sourceCode: SourceCode,
  source: ESTree.Expression,
  index: number,
  aliases: Aliases,
): Facts {
  const element = arrayElement(sourceCode, source, index, aliases);
  if (element !== null) return facts(sourceCode, element, aliases);
  const base = facts(sourceCode, source, aliases);
  return joinFacts(
    base.has("date-array") ? emptyFacts("date") : emptyFacts(),
    base.has("performance-array") ? emptyFacts("performance") : emptyFacts(),
  );
}

function objectRestFacts(source: Facts): Facts {
  return joinFacts(
    source.has("global") || source.has("date-object") ? emptyFacts("global") : emptyFacts(),
    source.has("global") || source.has("performance-object") ? emptyFacts("global") : emptyFacts(),
  );
}

function facts(
  sourceCode: SourceCode,
  node: ESTree.Expression,
  aliases: Aliases,
  seen: Set<Variable> = new Set(),
): Facts {
  const value = unwrap(node);
  if (value.type === "AssignmentExpression") return facts(sourceCode, value.right, aliases, seen);
  if (value.type === "Identifier") {
    const variable = resolveVariable(sourceCode, value);
    if (variable !== null) {
      const alias = aliases.get(variable);
      if (alias !== undefined) return new Set(alias);
      if (seen.has(variable)) return emptyFacts();
      const declarator = variableDeclarator(variable);
      if (declarator?.init !== null && declarator?.init !== undefined) {
        const nextSeen = new Set(seen).add(variable);
        if (declarator.id.type === "Identifier") return facts(sourceCode, declarator.init, aliases, nextSeen);
        return bindingFacts(sourceCode, declarator.id, declarator.init, value.name, aliases, nextSeen);
      }
      return emptyFacts();
    }
    if (value.name === "Date") return emptyFacts("date", "truthy", "non-nullish");
    if (value.name === "performance") return emptyFacts("performance", "truthy", "non-nullish");
    if (ambientGlobals.has(value.name)) return emptyFacts("global", "truthy", "non-nullish");
    if (value.name === "undefined") return emptyFacts("falsy", "nullish");
    return emptyFacts();
  }
  if (value.type === "Literal") return literalFacts(value);
  if (value.type === "ArrayExpression") {
    const result = emptyFacts("truthy", "non-nullish");
    for (const element of value.elements) {
      if (element === null) continue;
      const child = facts(sourceCode, element.type === "SpreadElement" ? element.argument : element, aliases, seen);
      if (child.has("date") || child.has("date-array")) result.add("date-array");
      if (child.has("performance") || child.has("performance-array")) result.add("performance-array");
    }
    return result;
  }
  if (value.type === "ObjectExpression") {
    const result = emptyFacts("truthy", "non-nullish");
    for (const property of value.properties) {
      if (property.type === "SpreadElement") {
        const child = facts(sourceCode, property.argument, aliases, seen);
        if (child.has("global") || child.has("date-object")) result.add("date-object");
        if (child.has("global") || child.has("performance-object")) result.add("performance-object");
        if (child.has("global")) {
          result.add("present:Date");
          result.add("present:performance");
        }
        for (const fact of child) {
          if (fact.startsWith("present:") || fact.startsWith("undefined:") ||
            fact.startsWith("date-property:") || fact.startsWith("performance-property:")) result.add(fact);
        }
        continue;
      }
      const key = propertyName(property);
      const child = facts(sourceCode, property.value, aliases, seen);
      if (key !== null) {
        result.add(`present:${key}`);
        if (child.has("nullish")) result.add(`undefined:${key}`);
        if (child.has("date")) result.add(`date-property:${key}`);
        if (child.has("performance")) result.add(`performance-property:${key}`);
      }
      if (key === "Date" && child.has("date")) result.add("date-object");
      if (key === "performance" && child.has("performance")) result.add("performance-object");
    }
    return result;
  }
  if (value.type === "ConditionalExpression") {
    const branch = staticBranch(facts(sourceCode, value.test, aliases, seen));
    if (branch === "consequent") return facts(sourceCode, value.consequent, aliases, seen);
    if (branch === "alternate") return facts(sourceCode, value.alternate, aliases, seen);
    return joinFacts(facts(sourceCode, value.consequent, aliases, seen), facts(sourceCode, value.alternate, aliases, seen));
  }
  if (value.type === "LogicalExpression") {
    const left = facts(sourceCode, value.left, aliases, seen);
    const branch = staticBranch(left);
    if (value.operator === "&&" && branch === "alternate") return left;
    if (value.operator === "&&" && branch === "consequent") return facts(sourceCode, value.right, aliases, seen);
    if (value.operator === "||" && branch === "consequent") return left;
    if (value.operator === "||" && branch === "alternate") return facts(sourceCode, value.right, aliases, seen);
    if (value.operator === "??" && definitelyNullish(left)) return facts(sourceCode, value.right, aliases, seen);
    if (value.operator === "??" && definitelyNonNullish(left)) return left;
    return joinFacts(left, facts(sourceCode, value.right, aliases, seen));
  }
  if (value.type === "SequenceExpression") {
    const last = value.expressions.at(-1);
    return last === undefined ? emptyFacts() : facts(sourceCode, last, aliases, seen);
  }
  if (value.type === "AwaitExpression" || value.type === "YieldExpression") {
    return value.argument === null ? emptyFacts() : facts(sourceCode, value.argument, aliases, seen);
  }
  if (value.type === "MemberExpression") return propertyFacts(facts(sourceCode, value.object, aliases, seen), propertyName(value));
  if (value.type === "FunctionExpression" || value.type === "ArrowFunctionExpression" || value.type === "ClassExpression" || value.type === "NewExpression") return emptyFacts("truthy", "non-nullish");
  if (value.type === "TemplateLiteral") return emptyFacts("truthy", "non-nullish");
  return emptyFacts();
}

function bindingFacts(
  sourceCode: SourceCode,
  pattern: ESTree.Node,
  source: ESTree.Expression,
  name: string,
  aliases: Aliases,
  seen: Set<Variable>,
): Facts {
  if (pattern.type === "Identifier") return pattern.name === name ? facts(sourceCode, source, aliases, seen) : emptyFacts();
  if (pattern.type === "AssignmentPattern") {
    const base = bindingFacts(sourceCode, pattern.left, source, name, aliases, seen);
    return joinFacts(base, isUndefined(sourceCode, source, aliases) ? facts(sourceCode, pattern.right, aliases, seen) : emptyFacts());
  }
  if (pattern.type === "ArrayPattern") {
    for (const [index, element] of pattern.elements.entries()) {
      if (element === null) continue;
      const result = bindingFacts(sourceCode, element, arrayElement(sourceCode, source, index, aliases) ?? source, name, aliases, seen);
      if (result.size > 0) return result;
    }
    return emptyFacts();
  }
  if (pattern.type === "ObjectPattern") {
    for (const property of pattern.properties) {
      if (property.type !== "Property") continue;
      const result = bindingFacts(
        sourceCode,
        property.value,
        propertyValues(sourceCode, source, propertyName(property) ?? "", aliases, seen)[0] ?? source,
        name,
        aliases,
        seen,
      );
      if (result.size > 0) return result;
    }
  }
  return emptyFacts();
}

function updateTarget(
  sourceCode: SourceCode,
  target: ESTree.Node,
  base: Facts,
  aliases: Aliases,
  source: ESTree.Expression | null,
): void {
  if (target.type === "Identifier") {
    const variable = resolveVariable(sourceCode, target);
    if (variable !== null) aliases.set(variable, new Set(base));
    return;
  }
  if (target.type === "AssignmentPattern") {
    const defaultFacts = source === null || isUndefined(sourceCode, source, aliases)
      ? facts(sourceCode, target.right, aliases)
      : emptyFacts();
    updateTarget(sourceCode, target.left, joinFacts(base, defaultFacts), aliases, source);
    return;
  }
  if (target.type === "RestElement") {
    updateTarget(sourceCode, target.argument, base, aliases, source);
    return;
  }
  if (target.type === "ArrayPattern") {
    for (const [index, element] of target.elements.entries()) {
      if (element === null) continue;
      const elementSource = source === null ? null : arrayElement(sourceCode, source, index, aliases);
      const elementFacts = source === null ? emptyFacts() : arrayElementFacts(sourceCode, source, index, aliases);
      const restFacts = element.type === "RestElement"
        ? joinFacts(
          elementFacts.has("date") ? emptyFacts("date-array") : emptyFacts(),
          elementFacts.has("performance") ? emptyFacts("performance-array") : emptyFacts(),
        )
        : elementFacts;
      updateTarget(sourceCode, element, restFacts, aliases, elementSource);
    }
    return;
  }
  if (target.type !== "ObjectPattern") return;
  for (const property of target.properties) {
    if (property.type !== "Property") {
      updateTarget(sourceCode, property.argument, objectRestFacts(base), aliases, source);
      continue;
    }
    const key = propertyName(property);
    const values = source === null || key === null ? [] : propertyValues(sourceCode, source, key, aliases);
    const propertyBase = joinFacts(propertyFacts(base, key), ...values.map((value) => facts(sourceCode, value, aliases)));
    const present = key !== null && base.has(`present:${key}`);
    const maybeUndefined = key !== null && base.has(`undefined:${key}`);
    updateTarget(sourceCode, property.value, propertyBase, aliases, values[0] ?? (present && !maybeUndefined ? source : null));
  }
}

type AnalysisContext = { sourceCode: SourceCode; report: (node: ESTree.Node) => void };
type FunctionLike = {
  params: readonly ESTree.Node[];
  body: ESTree.Node | null;
};

function collectBreakStates(
  context: AnalysisContext,
  node: ESTree.Statement | ESTree.BlockStatement,
  aliases: Aliases,
): Aliases[] {
  if (node.type === "BreakStatement") return [aliases];
  if (node.type === "BlockStatement") {
    let state = aliases;
    const breaks: Aliases[] = [];
    for (const statement of node.body) {
      breaks.push(...collectBreakStates(context, statement, state));
      state = visitNode(context, statement, state);
    }
    return breaks;
  }
  if (node.type === "IfStatement") {
    const afterTest = visitExpression(context, node.test, aliases);
    const branch = staticBranch(facts(context.sourceCode, node.test, afterTest));
    if (branch === "consequent") return collectBreakStates(context, node.consequent, afterTest);
    if (branch === "alternate") return node.alternate === null ? [] : collectBreakStates(context, node.alternate, afterTest);
    return [
      ...collectBreakStates(context, node.consequent, cloneAliases(afterTest)),
      ...(node.alternate === null ? [] : collectBreakStates(context, node.alternate, cloneAliases(afterTest))),
    ];
  }
  if (node.type === "WhileStatement" || node.type === "DoWhileStatement" || node.type === "ForStatement" || node.type === "ForInStatement" || node.type === "ForOfStatement") return [];
  if (node.type === "TryStatement") {
    return [
      ...collectBreakStates(context, node.block, cloneAliases(aliases)),
      ...(node.handler === null ? [] : collectBreakStates(context, node.handler.body, cloneAliases(aliases))),
    ];
  }
  return [];
}

function ambientCall(sourceCode: SourceCode, node: ESTree.CallExpression, aliases: Aliases): boolean {
  if (node.callee.type === "Super") return false;
  const calleeFacts = facts(sourceCode, node.callee, aliases);
  if (calleeFacts.has("date") || calleeFacts.has("performance") || calleeFacts.has("date-now") || calleeFacts.has("performance-now")) return true;
  return node.callee.type === "MemberExpression" &&
    ["call", "apply", "bind"].includes(propertyName(node.callee) ?? "") &&
    facts(sourceCode, node.callee.object, aliases).has("date");
}

function visitNode(context: AnalysisContext, node: ESTree.Node, aliases: Aliases, reportMember = true): Aliases {
  switch (node.type) {
    case "Program": return visitStatements(context, node.body, aliases);
    case "VariableDeclaration": return visitVariableDeclaration(context, node, aliases);
    case "ExpressionStatement": return visitExpression(context, node.expression, aliases, reportMember);
    case "FunctionDeclaration": visitFunction(context, node, aliases); return aliases;
    case "ClassDeclaration": return visitClass(context, node, aliases);
    case "BlockStatement": return visitStatements(context, node.body, aliases);
    case "IfStatement": {
      const afterTest = visitExpression(context, node.test, aliases);
      const branch = staticBranch(facts(context.sourceCode, node.test, afterTest));
      if (branch === "consequent") return visitNode(context, node.consequent, cloneAliases(afterTest));
      if (branch === "alternate") return node.alternate === null ? afterTest : visitNode(context, node.alternate, cloneAliases(afterTest));
      return joinAliases(
        visitNode(context, node.consequent, cloneAliases(afterTest)),
        node.alternate === null ? afterTest : visitNode(context, node.alternate, cloneAliases(afterTest)),
      );
    }
    case "WhileStatement": {
      const afterTest = visitExpression(context, node.test, aliases);
      const bodyState = cloneAliases(afterTest);
      return joinAliases(afterTest, visitNode(context, node.body, bodyState), ...collectBreakStates(context, node.body, cloneAliases(afterTest)));
    }
    case "DoWhileStatement": {
      const bodyState = cloneAliases(aliases);
      const body = visitNode(context, node.body, bodyState);
      return joinAliases(body, visitExpression(context, node.test, body), ...collectBreakStates(context, node.body, cloneAliases(aliases)));
    }
    case "ForStatement": {
      let before = aliases;
      if (node.init !== null) before = node.init.type === "VariableDeclaration"
        ? visitVariableDeclaration(context, node.init, before)
        : visitExpression(context, node.init, before);
      if (node.test !== null) before = visitExpression(context, node.test, before);
      const bodyState = cloneAliases(before);
      let body = visitNode(context, node.body, bodyState);
      if (node.update !== null) body = visitExpression(context, node.update, body);
      return joinAliases(before, body, ...collectBreakStates(context, node.body, cloneAliases(before)));
    }
    case "ForInStatement":
    case "ForOfStatement": {
      const right = visitExpression(context, node.right, aliases);
      const iteration = node.left.type === "VariableDeclaration"
        ? visitVariableDeclaration(context, node.left, cloneAliases(right))
        : visitExpression(context, node.left as ESTree.Expression, cloneAliases(right));
      return joinAliases(right, visitNode(context, node.body, iteration));
    }
    case "SwitchStatement": return visitSwitch(context, node, aliases);
    case "TryStatement": {
      const tried = visitNode(context, node.block, cloneAliases(aliases));
      const caught = node.handler === null ? aliases : visitNode(context, node.handler.body, cloneAliases(aliases));
      const joined = joinAliases(tried, caught);
      return node.finalizer === null ? joined : visitNode(context, node.finalizer, joined);
    }
    case "ReturnStatement":
    case "ThrowStatement": return node.argument === null ? aliases : visitExpression(context, node.argument, aliases);
    case "ExportNamedDeclaration": return node.declaration === null ? aliases : visitNode(context, node.declaration, aliases);
    case "ExportDefaultDeclaration": return visitNode(context, node.declaration, aliases);
    case "LabeledStatement": return visitNode(context, node.body, aliases);
    default: return visitExpression(context, node as ESTree.Expression, aliases, reportMember);
  }
}

function visitSwitch(context: AnalysisContext, node: ESTree.SwitchStatement, aliases: Aliases): Aliases {
  const afterDiscriminant = visitExpression(context, node.discriminant, aliases);
  let fallthrough: Aliases | null = null;
  const exits: Aliases[] = node.cases.some((branch) => branch.test === null) ? [] : [afterDiscriminant];
  for (const branch of node.cases) {
    const entry = joinAliases(afterDiscriminant, ...(fallthrough === null ? [] : [fallthrough]));
    const afterTest = branch.test === null ? entry : visitExpression(context, branch.test, cloneAliases(entry));
    const result = visitStatements(context, branch.consequent, cloneAliases(afterTest));
    if (branch.consequent.some((statement) => statement.type === "BreakStatement")) {
      exits.push(result);
      fallthrough = null;
    } else {
      fallthrough = result;
    }
  }
  if (fallthrough !== null) exits.push(fallthrough);
  return joinAliases(...exits);
}

function visitStatements(
  context: AnalysisContext,
  statements: readonly (ESTree.Statement | ESTree.ModuleDeclaration)[],
  aliases: Aliases,
): Aliases {
  let state = aliases;
  for (const statement of statements) {
    if (statement.type === "ImportDeclaration" || statement.type === "ExportAllDeclaration") continue;
    state = visitNode(context, statement, state);
  }
  return state;
}

function visitVariableDeclaration(context: AnalysisContext, node: ESTree.VariableDeclaration, aliases: Aliases): Aliases {
  let state = aliases;
  for (const declarator of node.declarations) {
    if (declarator.init !== null) state = visitExpression(context, declarator.init, state);
    updateTarget(
      context.sourceCode,
      declarator.id,
      declarator.init === null ? emptyFacts() : facts(context.sourceCode, declarator.init, state),
      state,
      declarator.init,
    );
  }
  return state;
}

function visitFunction(context: AnalysisContext, node: FunctionLike, aliases: Aliases): void {
  let state = cloneAliases(aliases);
  for (const parameter of node.params) {
    if (parameter.type !== "AssignmentPattern") continue;
    state = visitExpression(context, parameter.right, state);
    updateTarget(context.sourceCode, parameter.left, facts(context.sourceCode, parameter.right, state), state, parameter.right);
  }
  if (node.body === null) return;
  if (node.body.type === "BlockStatement") visitStatements(context, node.body.body, state);
  else visitExpression(context, node.body as ESTree.Expression, state);
}

function visitClass(context: AnalysisContext, node: ESTree.Class, aliases: Aliases): Aliases {
  let state = node.superClass === null ? cloneAliases(aliases) : visitExpression(context, node.superClass, cloneAliases(aliases));
  for (const element of node.body.body) {
    if (element.type === "StaticBlock") {
      state = visitStatements(context, element.body, state);
      continue;
    }
    if (element.type === "MethodDefinition" || element.type === "TSAbstractMethodDefinition") {
      if (element.computed) state = visitExpression(context, element.key as ESTree.Expression, state);
      visitFunction(context, element.value, state);
      continue;
    }
    if ("value" in element && element.value !== null) {
      if (element.computed) state = visitExpression(context, element.key as ESTree.Expression, state);
      state = visitExpression(context, element.value, state);
    }
  }
  return state;
}

function visitExpression(context: AnalysisContext, node: ESTree.Expression, aliases: Aliases, reportMember = true): Aliases {
  const value = unwrap(node);
  if (value !== node) return visitExpression(context, value, aliases, reportMember);
  if (value.type === "AssignmentExpression") {
    const afterLeft = visitExpression(context, value.left as ESTree.Expression, aliases);
    const state = visitExpression(context, value.right, afterLeft);
    updateTarget(context.sourceCode, value.left, facts(context.sourceCode, value.right, state), state, value.right);
    return state;
  }
  if (value.type === "SequenceExpression") {
    let state = aliases;
    for (const expression of value.expressions) state = visitExpression(context, expression, state);
    return state;
  }
  if (value.type === "ConditionalExpression") {
    const afterTest = visitExpression(context, value.test, aliases);
    const branch = staticBranch(facts(context.sourceCode, value.test, afterTest));
    if (branch === "consequent") return visitExpression(context, value.consequent, afterTest);
    if (branch === "alternate") return visitExpression(context, value.alternate, afterTest);
    return joinAliases(
      visitExpression(context, value.consequent, cloneAliases(afterTest)),
      visitExpression(context, value.alternate, cloneAliases(afterTest)),
    );
  }
  if (value.type === "LogicalExpression") {
    const afterLeft = visitExpression(context, value.left, aliases);
    const leftFacts = facts(context.sourceCode, value.left, afterLeft);
    const branch = staticBranch(leftFacts);
    if ((value.operator === "&&" && branch === "alternate") || (value.operator === "||" && branch === "consequent") || (value.operator === "??" && definitelyNonNullish(leftFacts))) return afterLeft;
    if ((value.operator === "&&" && branch === "consequent") || (value.operator === "||" && branch === "alternate") || (value.operator === "??" && definitelyNullish(leftFacts))) return visitExpression(context, value.right, afterLeft);
    return joinAliases(afterLeft, visitExpression(context, value.right, cloneAliases(afterLeft)));
  }
  if (value.type === "CallExpression") {
    const ambient = ambientCall(context.sourceCode, value, aliases);
    if (ambient) context.report(value.callee);
    let state = visitExpression(context, value.callee as ESTree.Expression, aliases, !ambient);
    for (const argument of value.arguments) state = visitExpression(context, argument.type === "SpreadElement" ? argument.argument : argument, state);
    return state;
  }
  if (value.type === "NewExpression") {
    if (value.callee.type !== "Super" && facts(context.sourceCode, value.callee, aliases).has("date")) context.report(value);
    let state = value.callee.type === "Super" ? aliases : visitExpression(context, value.callee, aliases);
    for (const argument of value.arguments) state = visitExpression(context, argument.type === "SpreadElement" ? argument.argument : argument, state);
    return state;
  }
  if (value.type === "MemberExpression") {
    if (reportMember) {
      const memberFacts = facts(context.sourceCode, value, aliases);
      if (memberFacts.has("date-now") || memberFacts.has("performance-now")) context.report(value);
    }
    let state = visitExpression(context, value.object, aliases);
    return value.computed ? visitExpression(context, value.property as ESTree.Expression, state) : state;
  }
  if (value.type === "FunctionExpression" || value.type === "ArrowFunctionExpression") {
    visitFunction(context, value, aliases);
    return aliases;
  }
  if (value.type === "ClassExpression") return visitClass(context, value, aliases);
  visitChildren(context, value, cloneAliases(aliases));
  return aliases;
}

function visitChildren(context: AnalysisContext, node: ESTree.Node, aliases: Aliases): Aliases {
  let state = aliases;
  for (const key of context.sourceCode.visitorKeys[node.type] ?? []) {
    const child = record(node)[key];
    if (isNode(child)) state = visitNode(context, child, state);
    else if (Array.isArray(child)) for (const item of child) if (isNode(item)) state = visitNode(context, item, state);
  }
  return state;
}

/** Require domain time reads to use the supplied Effect Clock. */
export const noDomainWallClockRule = defineRule({
  meta: {
    type: "problem",
    docs: { description: "Disallow ambient wall-clock reads and Date construction in runtime domain source." },
    messages: { wallClock: "Use the supplied Effect Clock at the host boundary instead of reading ambient wall time in domain code." },
    schema: [{
      type: "object",
      properties: {
        sourceRoots: { type: "array", items: { type: "string" } },
        allowedPathFragments: { type: "array", items: { type: "string" } },
      },
      additionalProperties: false,
    }],
    defaultOptions: [{ sourceRoots: [...defaultSourceRoots], allowedPathFragments: [...defaultAllowedPathFragments] }],
  },
  createOnce(context) {
    return {
      Program(node: ESTree.Program) {
        const option = context.options?.[0] as RuleOptions[0] | undefined;
        const roots = option?.sourceRoots ?? [...defaultSourceRoots];
        const allowed = option?.allowedPathFragments ?? [...defaultAllowedPathFragments];
        const filename = normalized(context.filename);
        const enabled = roots.some((root) => filename.includes(`/${normalized(root)}/`)) &&
          !isTestSupportFile(context.filename) && !allowed.some((fragment) => filename.includes(fragment));
        if (enabled) visitNode({
          sourceCode: context.sourceCode,
          report: (reportedNode) => context.report({ node: reportedNode, messageId: "wallClock" }),
        }, node, new Map());
      },
    };
  },
});
