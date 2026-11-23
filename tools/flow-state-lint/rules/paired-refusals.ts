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

// What a positive must name: a path, or a key, which names its own object only, so a member read of
// another object with the same name (`bell.on` beside a refused `on:`) does not pair with it.
type Subject = { readonly name: string; readonly key: boolean };

const path = (name: string): Subject => ({ name, key: false });

const keyOf = (node: ESTree.Property, text: (node: ESTree.Node) => string): Subject => ({
  name: node.key.type === "Identifier" ? node.key.name : text(node.key),
  key: true,
});

// The parameter an object literal fills: the key of the property it is the value of. A property
// of a call's own argument names its parameter by its key alone.
const containerOf = (node: ESTree.Node, text: (node: ESTree.Node) => string): ReadonlyArray<Subject> => {
  const object = node.parent;
  const holder = object?.type === "ObjectExpression" ? object.parent : undefined;

  return holder?.type === "Property" ? [keyOf(holder, text)] : [];
};

// The name a declaration binds what holds a node to, when one does: `const right = machine(…)`.
const bindingOf = (node: ESTree.Node, text: (node: ESTree.Node) => string): ReadonlyArray<string> => {
  for (let at: ESTree.Node | null | undefined = node; at !== null && at !== undefined; at = at.parent)
    if (at.type === "VariableDeclarator") return [text(at.id)];

  return [];
};

// A call's callee as a positive writes it: the first call of a chain, type arguments dropped.
const calleeOf = (node: ESTree.CallExpression | ESTree.NewExpression, text: (node: ESTree.Node) => string): string => {
  const callee = node.callee;
  const object = callee.type === "MemberExpression" ? callee.object : undefined;
  const inner = object?.type === "ChainExpression" ? object.expression : object;

  if (inner?.type === "CallExpression") return calleeOf(inner, text);

  return normal(text(callee).replace(/<.*>$/su, ""));
};

// What a refused line passes a wrong value to, as the text a positive must assert on: a call's
// callee (the first call of a chain), the object of a member read, a comparison's left side, a
// property's key or the parameter the property's object fills; an argument or an array element by
// the call or the binding that holds it.
const subjectsOf = (node: ESTree.Node, text: (node: ESTree.Node) => string): ReadonlyArray<Subject> => {
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
      return node.left.type === "MemberExpression" ? [path(text(node.left))] : subjectsOf(node.left, text);
    case "LogicalExpression":
      return subjectsOf(node.left, text);
    case "AssignmentExpression":
      return subjectsOf(node.left, text);
    case "CallExpression":
    case "NewExpression":
      return [path(calleeOf(node, text))];
    case "MemberExpression":
      return [path(objectOf(node, text))];
    case "Identifier":
      return [path(node.name)];
    case "Property":
      return [
        keyOf(node, text),
        ...(node.value.type === "CallExpression" ? subjectsOf(node.value, text) : []),
        ...containerOf(node, text),
      ];
    case "VariableDeclaration": {
      const [first] = node.declarations;

      if (first === undefined) return [];

      return first.init === null || first.init === undefined ? [path(text(first.id))] : subjectsOf(first.init, text);
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
      return [path(text(node).split(/[\s(]/u)[0] ?? "")];
  }
};

// The call a refused key is written in: the nearest call within its statement that holds it as an
// argument.
const callOf = (node: ESTree.Node) => {
  for (let at: ESTree.Node | null | undefined = node; at?.parent !== null && at?.parent !== undefined; at = at.parent) {
    const up = at.parent;

    if (up.type === "BlockStatement" || up.type === "Program") return undefined;
    if ((up.type === "CallExpression" || up.type === "NewExpression") && up.callee !== at) return up;
  }

  return undefined;
};

const escaped = (text: string) => text.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);

// Whether a text names a path whole: not inside a longer name or path.
const hasPath = (text: string, name: string) => new RegExp(`(?:^|[^\\w$.])${escaped(name)}(?![\\w$])`, "u").test(text);

// Whether a member chain ending a text starts at an owner: `m.on`, `Ends.success`, or a type over
// the owner, `Parameters<typeof m>[0].on`.
const rootedAt = (text: string, owner: string) =>
  new RegExp(`(?:^|[^\\w$.])${escaped(owner)}>?(?:\\.[\\w$]+)*$`, "u").test(text);

// Whether a positive's text names a subject as a whole path, not as part of a longer name. A single
// name may be read as a member (`samples.values`); a path starts its own read. A key counts only
// beside its own call: read as a member, its chain starts at the key's callee or a binding or type
// alias of a call to it (`const m = machine(…)`, then `m.on`); written any other way, the positive
// names one of those. So `bell.on` does not pair with `on:` in `machine(…)`.
const names = (positive: string, subject: Subject, owners: ReadonlyArray<string>) => {
  const { name } = subject;

  for (let at = positive.indexOf(name); at >= 0; at = positive.indexOf(name, at + 1)) {
    const before = positive[at - 1] ?? "";
    const after = positive[at + name.length] ?? "";
    const joined = name.includes(".") ? /[\w$.]/u : /[\w$]/u;
    const owned = () =>
      before === "."
        ? owners.some((owner) => rootedAt(positive.slice(0, at - 1), owner))
        : owners.some((owner) => hasPath(positive, owner));

    if (!joined.test(before) && !/[\w$]/u.test(after) && (!subject.key || owned())) return true;
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
    // Bindings and type aliases, each with the calls it stands for.
    let calls: Array<Span & { readonly name: string; readonly stands: (callee: string) => boolean }> = [];

    return {
      before() {
        const rel = relativePath(context.filename);

        if (rel === undefined || !isTypeTest(rel)) return false;
        positives = [];
        tests = [];
        lines = [];
        parts = [];
        calls = [];

        return true;
      },
      VariableDeclarator(node: ESTree.VariableDeclarator) {
        if (node.init?.type !== "CallExpression" && node.init?.type !== "NewExpression") return;
        const bound = calleeOf(node.init, text);

        calls.push({ start: node.start, end: node.end, name: normal(text(node.id)), stands: (callee) => bound === callee });
      },
      // A type alias stands for every call it names: `type Ends = Parameters<typeof pay.outcomes>[0]`.
      TSTypeAliasDeclaration(node: ESTree.TSTypeAliasDeclaration) {
        const alias = normal(text(node.typeAnnotation));

        calls.push({ start: node.start, end: node.end, name: node.id.name, stands: (callee) => hasPath(alias, callee) });
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
          const bound = bindingOf(holder ?? node, text).map(normal);
          const subjects = [...subjectsOf(holder ?? node, text), ...(holder === undefined ? [] : bound.map(path))]
            .map((s) => ({ ...s, name: normal(s.name) }))
            .filter((s) => s.name !== "");
          const enclosing = tests.filter((t) => within(node, t));
          const test = enclosing.reduce<Span>(
            (inner, t) => (t.end - t.start < inner.end - inner.start ? t : inner),
            program,
          );
          // A refusal outside every test pairs only with a positive outside every test.
          const counts = (p: Span) =>
            within(p, test) && (enclosing.length > 0 || !tests.some((t) => within(p, t)));
          // A binding or alias stands for the key's call only in the refusal's test or outside every test.
          const call = callOf(holder ?? node);
          const callee = call === undefined ? undefined : calleeOf(call, text);
          const inScope = (c: Span) => within(c, test) || !tests.some((t) => within(c, t));
          const owners = [
            ...bound,
            ...(callee === undefined
              ? []
              : [callee, ...calls.filter((c) => inScope(c) && c.stands(callee)).map((c) => c.name)]),
          ];
          const paired = positives.some(
            (p) => counts(p) && !refused.has(p.line) && subjects.some((s) => names(p.text, s, owners)),
          );

          if (!paired) context.report({ node, messageId: "unpaired", data: { subject: subjects[0]?.name ?? "this line" } });
        }
      },
    };
  },
});
