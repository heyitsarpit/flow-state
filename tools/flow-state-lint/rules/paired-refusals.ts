import { defineRule } from "@oxlint/plugins";

import { propertyName, relativePath } from "./shared.ts";

import type { ESTree } from "@oxlint/plugins";

// Where the rule applies: the type tests, `*.test-d.ts` files and every file under `tests/types/`.
const isTypeTest = (rel: string) => rel.endsWith(".test-d.ts") || rel.startsWith("tests/types/");

// A text with the forms that read one path written one way: `a?.b`, `a!.b`, `a["b"]` and `a[0]` all
// read `a.b` or `a.0`; spaces dropped around punctuation, so words stay apart.
const normal = (text: string) =>
  text
    .replaceAll(/\s+/gu, " ")
    .replaceAll(/ ?([.?![\](){}<>,:;=|&]) ?/gu, "$1")
    .replaceAll("?.", ".")
    .replaceAll(/!(?=[.[)])/gu, "")
    .replaceAll(/\[(["'`])([^"'`\]]*)\1\]/gu, ".$2")
    .replaceAll(/\[(\d+)\]/gu, ".$1");

// The object a refused member read reads from: `s.memory["nmae"]` is a read of `s.memory`.
const objectOf = (node: ESTree.MemberExpression, text: (node: ESTree.Node) => string) => text(node.object);

// The parameter an object literal fills: the key of the property it is the value of. A property
// of a call's own argument names its parameter by its key alone.
const containerOf = (node: ESTree.Node, text: (node: ESTree.Node) => string): ReadonlyArray<string> => {
  const object = node.parent;
  const holder = object?.type === "ObjectExpression" ? object.parent : undefined;

  if (holder?.type === "Property") return [holder.key.type === "Identifier" ? holder.key.name : text(holder.key)];

  return [];
};

// The name a declaration binds what holds a node to, when one does: `const right = machine(…)`.
const bindingOf = (node: ESTree.Node, text: (node: ESTree.Node) => string): ReadonlyArray<string> => {
  for (let at: ESTree.Node | null | undefined = node; at !== null && at !== undefined; at = at.parent)
    if (at.type === "VariableDeclarator") return [text(at.id)];

  return [];
};

// What a refused line passes a wrong value to, as the text a positive must assert on: a call's
// callee (the first call of a chain), the object of a member read, a comparison's left side, a
// property's key or the parameter the property's object fills; an argument or an array element by
// the call or the binding that holds it.
const subjectsOf = (node: ESTree.Node, text: (node: ESTree.Node) => string): ReadonlyArray<string> => {
  switch (node.type) {
    case "ExpressionStatement":
      return subjectsOf(node.expression, text);
    case "UnaryExpression":
    case "AwaitExpression":
      return subjectsOf(node.argument, text);
    case "ParenthesizedExpression":
    case "ChainExpression":
    case "TSNonNullExpression":
    case "TSAsExpression":
    case "TSSatisfiesExpression":
      return subjectsOf(node.expression, text);
    case "BinaryExpression":
      return node.left.type === "MemberExpression" ? [text(node.left)] : subjectsOf(node.left, text);
    case "LogicalExpression":
      return subjectsOf(node.left, text);
    case "AssignmentExpression":
      return subjectsOf(node.left, text);
    case "CallExpression":
    case "NewExpression": {
      const callee = node.callee;

      if (callee.type === "MemberExpression" && (callee.object.type === "CallExpression" || callee.object.type === "ChainExpression"))
        return subjectsOf(callee.object, text);

      return [text(callee).replace(/<.*>$/su, "")];
    }
    case "MemberExpression":
      return [objectOf(node, text)];
    case "Identifier":
      return [node.name];
    case "Property":
      return [
        node.key.type === "Identifier" ? node.key.name : text(node.key),
        ...(node.value.type === "CallExpression" ? subjectsOf(node.value, text) : []),
        ...containerOf(node, text),
      ];
    case "VariableDeclaration": {
      const [first] = node.declarations;

      if (first === undefined) return [];

      return first.init === null || first.init === undefined ? [text(first.id)] : subjectsOf(first.init, text);
    }
    case "ExportNamedDeclaration":
      return node.declaration === null || node.declaration === undefined ? [] : subjectsOf(node.declaration, text);
    case "ArrayExpression":
      return node.parent === undefined || node.parent === null ? [] : subjectsOf(node.parent, text);
    case "ArrowFunctionExpression":
      return node.body.type === "BlockStatement" ? [] : subjectsOf(node.body, text);
    case "ReturnStatement":
      return node.argument === null ? [] : subjectsOf(node.argument, text);
    default:
      return [text(node).split(/[\s(]/u)[0] ?? ""];
  }
};

// Whether a positive's text names a subject as a whole path, not as part of a longer name.
const names = (positive: string, subject: string) => {
  for (let at = positive.indexOf(subject); at >= 0; at = positive.indexOf(subject, at + 1)) {
    const before = positive[at - 1] ?? "";
    const after = positive[at + subject.length] ?? "";

    // A single name may be read as a member (`samples.values`); a path starts its own read.
    const joined = subject.includes(".") ? /[\w$.]/u : /[\w$]/u;

    if (!joined.test(before) && !/[\w$]/u.test(after)) return true;
  }

  return false;
};

// The type arguments that assert nothing: any type and the unknown type pass for every value.
const loose = new Set(["TSAnyKeyword", "TSUnknownKeyword"]);

// `expectTypeOf(x)…toEqualTypeOf<T>()` with no `.not` in the chain, `not` written as a computed key
// included, and a type argument that is neither `any` nor `unknown`: an exact positive.
const isExactPositive = (node: ESTree.CallExpression) => {
  if (node.callee.type !== "MemberExpression" || propertyName(node.callee) !== "toEqualTypeOf") return false;

  const [type] = node.typeArguments?.params ?? [];

  if (type === undefined ? node.arguments.length === 0 : loose.has(type.type)) return false;

  for (let at: ESTree.Node = node.callee.object; ; ) {
    if (at.type === "MemberExpression") {
      if (propertyName(at) === "not") return false;
      at = at.object;
    } else if (at.type === "CallExpression") {
      if (at.callee.type === "Identifier") return at.callee.name === "expectTypeOf";
      at = at.callee;
    } else return false;
  }
};

// `it(…)`, `it.fails(…)`, `test(…)`: a test's own callback bounds where its positives may sit.
const isTestCall = (node: ESTree.CallExpression) => {
  const callee = node.callee.type === "MemberExpression" ? node.callee.object : node.callee;

  return callee.type === "Identifier" && (callee.name === "it" || callee.name === "test");
};

type Span = { readonly start: number; readonly end: number };

const within = (inner: Span, outer: Span) => inner.start >= outer.start && inner.end <= outer.end;

// A refusal in a type test (`@ts-expect-error`) passes for the wrong reason when the type it reads
// became `never`, `any` or another error: the line still fails to compile. Beside every refusal the
// correct use of the same parameter is asserted exactly, in the same test: an
// `expectTypeOf(…).toEqualTypeOf<…>()` (no `.not`) whose text names what the refused line passes
// its wrong value to (a call's callee, a member read's object, a compared value, a property's key).
export const pairedRefusalsRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description: "Every `@ts-expect-error` in a type test has an exact positive on the same parameter in the same test.",
    },
    messages: {
      unplaced:
        "This refusal's line starts no statement or property the rule can read, so no positive can be checked. Put the refused value on a statement or property line of its own.",
      unpaired:
        "This refusal has no exact positive on `{{subject}}` in its test, so it passes if the type became `never`, `any` or another error. Assert the correct use with `expectTypeOf(…).toEqualTypeOf<…>()` naming `{{subject}}`.",
    },
    schema: [],
  },
  createOnce(context) {
    const text = (node: ESTree.Node) => context.sourceCode.getText(node);
    let positives: Array<Span & { readonly text: string; readonly line: number }> = [];
    let tests: Array<Span> = [];
    let lines: Array<ESTree.Node> = [];
    let parts: Array<ESTree.Node> = [];

    return {
      before() {
        const rel = relativePath(context.filename);

        if (rel === undefined || !isTypeTest(rel)) return false;
        positives = [];
        tests = [];
        lines = [];
        parts = [];

        return true;
      },
      CallExpression(node: ESTree.CallExpression) {
        if (isExactPositive(node))
          positives.push({ start: node.start, end: node.end, text: normal(text(node)), line: node.loc.start.line });

        if (isTestCall(node)) tests.push({ start: node.start, end: node.end });
      },
      ExpressionStatement(node: ESTree.ExpressionStatement) {
        lines.push(node);
      },
      // An argument or an array element on a line of its own is read as part of what holds it.
      "CallExpression > *"(node: ESTree.Node) {
        if (node.parent?.type === "CallExpression" && node.parent.callee !== node) parts.push(node);
      },
      "ArrayExpression > *"(node: ESTree.Node) {
        parts.push(node);
      },
      VariableDeclaration(node: ESTree.VariableDeclaration) {
        lines.push(node);
      },
      ExportNamedDeclaration(node: ESTree.ExportNamedDeclaration) {
        lines.push(node);
      },
      ReturnStatement(node: ESTree.ReturnStatement) {
        lines.push(node);
      },
      Property(node: ESTree.Property) {
        lines.push(node);
      },
      "Program:exit"(program: ESTree.Program) {
        const source = context.sourceCode.getText();
        const sourceLines = source.split("\n");
        const directives = context.sourceCode
          .getAllComments()
          .filter((comment) => /^\s*@ts-expect-error\b/u.test(comment.value));
        // The line a directive refuses: the next one that is not a comment line.
        const refusedBy = (directive: (typeof directives)[number]) => {
          let line = directive.loc.end.line + 1;

          while ((sourceLines[line - 1] ?? "").trim().startsWith("//")) line += 1;

          return line;
        };
        const refused = new Set(directives.map(refusedBy));

        for (const directive of directives) {
          const line = refusedBy(directive);
          // The refused line's first token, and the outermost node that starts there.
          const lineStart = source.split("\n").slice(0, line - 1).join("\n").length + 1;
          const first = lineStart + (/^\s*/u.exec(source.slice(lineStart))?.[0].length ?? 0);
          const outermost = (nodes: ReadonlyArray<ESTree.Node>) =>
            nodes
              .filter((n) => n.start === first)
              .reduce<ESTree.Node | undefined>((outer, n) => (outer === undefined || n.end > outer.end ? n : outer), undefined);
          const statement = outermost(lines);
          const part = outermost(parts);
          const node = statement ?? part;

          if (node === undefined) {
            context.report({
              loc: { start: { line, column: 0 }, end: { line, column: (sourceLines[line - 1] ?? "").length } },
              messageId: "unplaced",
            });
            continue;
          }
          const holder = statement === undefined ? part?.parent : undefined;
          const subjects = [...subjectsOf(holder ?? node, text), ...(holder === undefined ? [] : bindingOf(holder, text))]
            .map(normal)
            .filter((s) => s !== "");
          const enclosing = tests.filter((t) => within(node, t));
          const test = enclosing.reduce<Span>(
            (inner, t) => (t.end - t.start < inner.end - inner.start ? t : inner),
            program,
          );
          // A refusal outside every test pairs only with a positive outside every test.
          const counts = (p: Span) =>
            within(p, test) && (enclosing.length > 0 || !tests.some((t) => within(p, t)));
          const paired = positives.some(
            (p) => counts(p) && !refused.has(p.line) && subjects.some((s) => names(p.text, s)),
          );

          if (!paired) context.report({ node, messageId: "unpaired", data: { subject: subjects[0] ?? "this line" } });
        }
      },
    };
  },
});
