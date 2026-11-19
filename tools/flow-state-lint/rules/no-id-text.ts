import { defineRule } from "@oxlint/plugins";

import { appliesTo, optionsSchema, propertyName, relativePath } from "./shared.ts";

import type { ESTree } from "@oxlint/plugins";
import type { Options } from "./shared.ts";

// The string methods that read a fact back out of text.
const cuts = new Set([
  "slice",
  "substring",
  "substr",
  "split",
  "indexOf",
  "lastIndexOf",
  "startsWith",
  "endsWith",
  "match",
  "includes",
  "replace",
  "replaceAll",
  "at",
  "charAt",
  "search",
]);

const parsers = new Set(["Number", "parseInt", "parseFloat"]);

const comparisons = new Set(["===", "!==", "==", "!="]);

// A name an id or a key goes by: `id`, `key`, `lane`, `record`, or one ending in `Id` or `Key`.
const isIdName = (name: string) => /^(id|key|lane|record)$/u.test(name) || /[a-z](Id|Key)$/u.test(name);

const unwrap = (node: ESTree.Node): ESTree.Node =>
  node.type === "ParenthesizedExpression" || node.type === "TSNonNullExpression" ? unwrap(node.expression) : node;

// Whether an expression names an id or a key: a variable or a member by such a name.
const isId = (raw: ESTree.Node | null | undefined): boolean => {
  if (raw === null || raw === undefined) return false;

  const node = unwrap(raw);

  return (
    (node.type === "Identifier" && isIdName(node.name)) ||
    (node.type === "MemberExpression" && isIdName(propertyName(node)))
  );
};

// A runtime id is minted and a fact about it is stored beside it, typed. Reading the fact back out of the id's text
// (a slice, a split, a prefix test, a number parse, or rebuilding the text to compare) breaks silently the day the
// mint's format or the key's layout changes, and lets any string pass for an id.
export const noIdTextRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description: "No code reads a fact out of an id's or key's text; store the fact beside the id, typed.",
    },
    messages: {
      text: "`{{what}}` reads a fact out of an id's or key's text. Store the fact beside the id when it is minted, typed, and read that field.",
    },
    schema: optionsSchema,
  },
  createOnce(context) {
    const report = (node: ESTree.Node, what: string) => context.report({ node, messageId: "text", data: { what } });

    return {
      before() {
        const rel = relativePath(context.filename);
        const given: Options = context.options[0] ?? {};

        return rel !== undefined && appliesTo(rel, given);
      },
      CallExpression(node: ESTree.CallExpression) {
        const callee = node.callee;

        if (callee.type === "MemberExpression" && cuts.has(propertyName(callee)) && isId(callee.object))
          report(node, `.${propertyName(callee)}`);

        // `Number(id)`, `parseInt(id)` and `Number.parseInt(id)`.
        const parser =
          callee.type === "Identifier"
            ? callee.name
            : callee.type === "MemberExpression" &&
                callee.object.type === "Identifier" &&
                callee.object.name === "Number"
              ? propertyName(callee)
              : "";

        if (parsers.has(parser) && isId(node.arguments[0])) report(node, `${parser}(…)`);
      },
      // `+id`: a number read out of an id's text.
      UnaryExpression(node: ESTree.UnaryExpression) {
        if (node.operator === "+" && isId(node.argument)) report(node, "+id");
      },
      // `id === \`${own}${text}\``: an id rebuilt from parts to compare is its text read back.
      BinaryExpression(node: ESTree.BinaryExpression) {
        if (!comparisons.has(node.operator)) return;

        const left = unwrap(node.left);
        const right = unwrap(node.right);

        if (
          (isId(left) && right.type === "TemplateLiteral" && right.expressions.length > 0) ||
          (isId(right) && left.type === "TemplateLiteral" && left.expressions.length > 0)
        )
          report(node, "a rebuilt id");
      },
    };
  },
});
