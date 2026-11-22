import { defineRule } from "@oxlint/plugins";

import { appliesTo, isTestFile, optionsSchema, propertyName, relativePath } from "./shared.ts";

import type { ESTree } from "@oxlint/plugins";
import type { Options } from "./shared.ts";

// The parts of a callback's input Flow types from the definition.
const DERIVED_PARTS = new Set(["event", "memory"]);

type Pending = { readonly node: ESTree.Node; readonly type: ESTree.Node };

const children = (node: ESTree.Node): ReadonlyArray<ESTree.Node> =>
  Object.entries(node).flatMap(([key, value]: readonly [string, unknown]) =>
    key === "parent"
      ? []
      : (Array.isArray(value) ? value : [value]).filter(
          (v): v is ESTree.Node =>
            typeof v === "object" && v !== null && typeof Reflect.get(v, "type") === "string",
        ),
  );

// The names of the type references a type holds, and whether it reads a value's type (`typeof`).
const scan = (node: ESTree.Node): { readonly query: boolean; readonly names: ReadonlyArray<string> } => {
  const below = children(node).map(scan);
  const own =
    node.type === "TSTypeReference" && node.typeName.type === "Identifier" ? [node.typeName.name] : [];

  return {
    query: node.type === "TSTypeQuery" || below.some((b) => b.query),
    names: [...own, ...below.flatMap((b) => b.names)],
  };
};

// Whether a function sits inside `loose(...)`, the erasure a test uses on purpose.
const insideLoose = (node: ESTree.Node) => {
  for (let at = node.parent; at !== undefined && at !== null; at = at.parent)
    if (at.type === "CallExpression" && at.callee.type === "Identifier" && at.callee.name === "loose")
      return true;

  return false;
};

const isFunction = (node: ESTree.Node | null | undefined) =>
  node?.type === "ArrowFunctionExpression" || node?.type === "FunctionExpression";

const memberName = (member: ESTree.Node) =>
  member.type === "TSPropertySignature" && member.key.type === "Identifier" ? member.key.name : "";

// A callback's hand types where the definition types them: an `event` or `memory` member of a
// destructured parameter's literal type, a `memory` or `event` parameter typed by a literal, and an
// ending mapper's typed parameter (`E.X.from((v: T) => ...)`). A type that reads `typeof` a
// declaration, or names a local alias that does, is derived and allowed. Inside `loose(...)` the
// test erases types on purpose, and a line under `@ts-expect-error` is a refusal a type test
// writes on purpose: neither is reported. It reads user code: fixtures, tests and benches, and the
// tests beside `src`, never the core's own erased signatures.
export const noHandTypedCallbackRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "A callback's event, memory or ending value reads the definition's derived types, never a hand-written copy.",
    },
    messages: {
      hand: "This annotation restates what the definition declares. Drop it, or type the helper from the definition: `typeof D.E.X.Type`, `typeof D.Memory.Type`, `typeof D.M.field.Type`.",
    },
    schema: optionsSchema,
  },
  createOnce(context) {
    let pending: Array<Pending> = [];
    let aliases = new Map<string, ESTree.Node>();

    const check = (fn: ESTree.Node, params: ReadonlyArray<ESTree.Node>, mapper: boolean) => {
      if (insideLoose(fn)) return;

      for (const param of params) {
        const annotation =
          param.type === "ObjectPattern" || param.type === "Identifier"
            ? param.typeAnnotation?.typeAnnotation
            : undefined;

        if (annotation === undefined || annotation === null) continue;

        if (mapper) pending.push({ node: param, type: annotation });
        else if (param.type === "ObjectPattern" && annotation.type === "TSTypeLiteral")
          for (const member of annotation.members) {
            const type =
              member.type === "TSPropertySignature" ? member.typeAnnotation?.typeAnnotation : undefined;

            if (DERIVED_PARTS.has(memberName(member)) && type !== undefined && type !== null)
              pending.push({ node: member, type });
          }
        else if (
          param.type === "Identifier" &&
          DERIVED_PARTS.has(param.name) &&
          annotation.type === "TSTypeLiteral"
        )
          pending.push({ node: param, type: annotation });
      }
    };

    // A type is derived when it reads `typeof`, or every local alias it names is derived.
    const derived = (type: ESTree.Node, seen: ReadonlySet<string>): boolean => {
      const { query, names } = scan(type);

      if (query) return true;

      const local = names.filter((n) => aliases.has(n) && !seen.has(n));

      return (
        local.length > 0 &&
        local.every((n) => {
          const alias = aliases.get(n);

          return alias !== undefined && derived(alias, new Set([...seen, n]));
        })
      );
    };

    return {
      before() {
        const rel = relativePath(context.filename);
        const given: Options = context.options[0] ?? {};

        pending = [];
        aliases = new Map();

        return (
          rel !== undefined &&
          appliesTo(rel, given) &&
          (!rel.startsWith("src/") || isTestFile(rel))
        );
      },
      TSTypeAliasDeclaration(node: ESTree.TSTypeAliasDeclaration) {
        aliases.set(node.id.name, node.typeAnnotation);
      },
      ArrowFunctionExpression(node: ESTree.ArrowFunctionExpression) {
        check(node, node.params, false);
      },
      FunctionExpression(node: ESTree.FunctionExpression) {
        check(node, node.params, false);
      },
      FunctionDeclaration(node: ESTree.FunctionDeclaration) {
        check(node, node.params, false);
      },
      CallExpression(node: ESTree.CallExpression) {
        const first = node.arguments[0];

        if (
          node.callee.type === "MemberExpression" &&
          propertyName(node.callee) === "from" &&
          first !== undefined &&
          isFunction(first) &&
          (first.type === "ArrowFunctionExpression" || first.type === "FunctionExpression")
        )
          check(first, first.params.slice(0, 1), true);
      },
      "Program:exit"() {
        const refused = new Set(
          context.sourceCode
            .getAllComments()
            .filter((comment) => /^\s*@ts-expect-error\b/u.test(comment.value))
            .map((comment) => comment.loc.end.line + 1),
        );

        for (const { node, type } of pending)
          if (!refused.has(node.loc.start.line) && !derived(type, new Set()))
            context.report({ node, messageId: "hand" });
      },
    };
  },
});
