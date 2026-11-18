import { defineRule, eslintCompatPlugin } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

// A Spec, Plan or Task id written into production text: the Spec owns its ids and tests cite
// them, so comments and strings in production code never do (Epic constraint: no plan or
// invariant ids in code).
const SPEC = "Actors|WriteLanes|WriteAhead|Turn|Reads|Restore|Compile|Codec|Diagnostics|StaticCli|Inspection|Runtime|Operations|Conformance";

const SPEC_ID = new RegExp(
  `\\b(?:${SPEC})(?:\\s+Spec(?:'s)?)?\\s+[A-Z]\\d+\\b|\\bT\\d+\\b|@(?:task|plan|spec)\\.`,
  "u",
);

type Located = { readonly text: string; readonly loc: ESTree.SourceLocation };

// Consecutive `//` lines read as one comment, so an id split across lines is still one id.
const commentRuns = (comments: ReadonlyArray<ESTree.Comment>): ReadonlyArray<Located> => {
  const runs: Array<Located> = [];

  for (const comment of comments) {
    const last = runs.at(-1);

    if (
      last !== undefined &&
      comment.type === "Line" &&
      comment.loc.start.line === last.loc.end.line + 1
    )
      runs[runs.length - 1] = {
        text: `${last.text} ${comment.value.trim()}`,
        loc: { start: last.loc.start, end: comment.loc.end },
      };
    else runs.push({ text: comment.value, loc: comment.loc });
  }

  return runs;
};

const noSpecIdsRule = defineRule({
  meta: {
    type: "suggestion",
    docs: { description: "No Spec, Plan or Task ids in production comments or strings." },
    messages: {
      specId:
        "Production text cites the id `{{id}}`. The Spec owns its ids and tests cite them; say what the code guarantees instead.",
    },
    schema: [],
  },
  createOnce(context) {
    const check = (text: string, loc: ESTree.SourceLocation) => {
      const found = SPEC_ID.exec(text);

      if (found !== null) context.report({ loc, messageId: "specId", data: { id: found[0] } });
    };

    return {
      Literal(node: ESTree.Literal) {
        if (typeof node.value === "string") check(node.value, node.loc);
      },
      TemplateElement(node: ESTree.TemplateElement) {
        check(node.value.raw, node.loc);
      },
      "Program:exit"(_node: ESTree.Program) {
        for (const run of commentRuns(context.sourceCode.getAllComments())) check(run.text, run.loc);
      },
    };
  },
});

// The reports an act determines: built only by evidenceOf, never beside the act.
const DERIVED = new Set(["Minted", "Sent", "Lane", "Ended"]);

const derivedReportsRule = defineRule({
  meta: {
    type: "problem",
    docs: { description: "Reports an act determines are built only in evidenceOf." },
    messages: {
      derived:
        "`{{kind}}` is a report an act determines: derive it in evidenceOf (src/core/evidence-of.ts), not beside the act.",
    },
    schema: [],
  },
  createOnce(context) {
    // Local names bound to the Evidence constructors, under any alias.
    let names = new Set<string>();

    return {
      Program() {
        names = new Set();
      },
      ImportDeclaration(node: ESTree.ImportDeclaration) {
        if (!String(node.source.value).endsWith("/evidence.ts")) return;

        for (const s of node.specifiers)
          if (
            s.type === "ImportSpecifier" &&
            s.imported.type === "Identifier" &&
            s.imported.name === "Evidence"
          )
            names.add(s.local.name);
          else if (s.type === "ImportNamespaceSpecifier") names.add(`${s.local.name}.Evidence`);
      },
      MemberExpression(node: ESTree.MemberExpression) {
        const owner = context.sourceCode.getText(node.object);

        if (!names.has(owner)) return;

        const kind =
          node.property.type === "Identifier" && !node.computed
            ? node.property.name
            : node.property.type === "Literal"
              ? String(node.property.value)
              : "";

        if (DERIVED.has(kind)) context.report({ node, messageId: "derived", data: { kind } });
      },
      Property(node: ESTree.Property) {
        const key =
          node.key.type === "Identifier" ? node.key.name : String((node.key as ESTree.Literal).value);

        if (
          key === "_tag" &&
          node.value.type === "Literal" &&
          DERIVED.has(String(node.value.value))
        )
          context.report({ node, messageId: "derived", data: { kind: String(node.value.value) } });
      },
    };
  },
});

// One rule per ban. Each covers all of packages/flow-state-v3 unless its options narrow it; vite.config.ts
// lists them, so where a rule applies is read in one place. Options (folders are relative to the
// package, never single files): `only` limits the rule to those folders, `except` exempts folders,
// and `exceptTests` exempts test files (`*.test.ts`, `test/`), a pattern rather than a file.
const PACKAGE = "packages/flow-state-v3/";

const GLOBAL_OBJECTS = new Set(["global", "globalThis", "window"]);

const EFFECT_MODULES = new Set(["effect", "effect/Effect"]);

type Ban = {
  readonly description: string;
  readonly message: string;
  // Bare global names, also caught as `globalThis.name`, `global.name` and `window.name`.
  readonly globals: ReadonlyArray<string>;
  // `object.property` uses; `object` is a global (Math, JSON), or `Effect`, which is resolved
  // through the imports: any binding of the Effect module, under any name.
  readonly properties: ReadonlyArray<readonly [object: string, property: string]>;
};

type Options = {
  readonly only?: ReadonlyArray<string>;
  readonly except?: ReadonlyArray<string>;
  readonly exceptTests?: boolean;
};

const insideFolder = (path: string, folder: string) => path.startsWith(`${folder}/`);

const isTestFile = (path: string) =>
  /\.test\.tsx?$/u.test(path) || path.split("/").includes("test");

const relativePath = (filename: string) => {
  const path = filename.replaceAll("\\", "/");
  const at = path.lastIndexOf(PACKAGE);

  return at < 0 ? undefined : path.slice(at + PACKAGE.length);
};

const appliesTo = (rel: string, options: Options) =>
  (options.only === undefined || options.only.some((folder) => insideFolder(rel, folder))) &&
  !(options.except ?? []).some((folder) => insideFolder(rel, folder)) &&
  !(options.exceptTests === true && isTestFile(rel));

const propertyName = (node: ESTree.MemberExpression) =>
  node.property.type === "Identifier" && !node.computed
    ? node.property.name
    : node.property.type === "Literal"
      ? String(node.property.value)
      : "";

const inTypePosition = (node: ESTree.Node) =>
  node.parent?.type === "TSTypeReference" ||
  node.parent?.type === "TSQualifiedName" ||
  node.parent?.type === "TSTypeQuery";

const importedName = (specifier: ESTree.ImportSpecifier) =>
  specifier.imported.type === "Identifier"
    ? specifier.imported.name
    : String(specifier.imported.value);

const banRule = (ban: Ban) =>
  defineRule({
    meta: {
      type: "problem",
      docs: { description: ban.description },
      messages: { banned: "`{{name}}` is banned here. {{reason}}" },
      schema: [
        {
          type: "object",
          properties: {
            only: { type: "array", items: { type: "string" } },
            except: { type: "array", items: { type: "string" } },
            exceptTests: { type: "boolean" },
          },
          additionalProperties: false,
        },
      ],
    },
    createOnce(context) {
      const globals = new Set(ban.globals);
      const effectProperties = new Set(
        ban.properties.filter(([object]) => object === "Effect").map(([, name]) => name),
      );

      // Local names bound to the Effect module (`import * as E from "effect/Effect"`, `import {
      // Effect as Fx } from "effect"`), and to the package itself (`import * as E from "effect"`,
      // where `E.Effect` is the module).
      let effectModule = new Set<string>();
      let effectPackage = new Set<string>();

      const report = (node: ESTree.Node, name: string) =>
        context.report({ node, messageId: "banned", data: { name, reason: ban.message } });

      const isEffectModule = (object: ESTree.Expression) =>
        (object.type === "Identifier" && (object.name === "Effect" || effectModule.has(object.name))) ||
        (object.type === "MemberExpression" &&
          object.object.type === "Identifier" &&
          effectPackage.has(object.object.name) &&
          propertyName(object) === "Effect");

      // `globalThis.Math.random` and `globalThis["Math"].random` read as `Math.random`.
      const globalOwner = (object: ESTree.Expression) => {
        if (object.type === "Identifier") return object.name;

        if (
          object.type === "MemberExpression" &&
          object.object.type === "Identifier" &&
          GLOBAL_OBJECTS.has(object.object.name)
        )
          return propertyName(object);

        return "";
      };

      return {
        before() {
          const rel = relativePath(context.filename);
          const given: Options = context.options[0] ?? {};

          effectModule = new Set();
          effectPackage = new Set();

          return rel !== undefined && appliesTo(rel, given);
        },
        ImportDeclaration(node: ESTree.ImportDeclaration) {
          const source = String(node.source.value);

          if (!EFFECT_MODULES.has(source)) return;

          for (const specifier of node.specifiers)
            if (specifier.type === "ImportNamespaceSpecifier")
              (source === "effect" ? effectPackage : effectModule).add(specifier.local.name);
            else if (specifier.type === "ImportDefaultSpecifier") effectModule.add(specifier.local.name);
            else if (importedName(specifier) === "Effect" && source === "effect")
              effectModule.add(specifier.local.name);
            else if (source === "effect/Effect" && effectProperties.has(importedName(specifier)))
              report(specifier, `Effect.${importedName(specifier)}`);
        },
        // A bare global is a reference no module or function scope resolves: it falls through to
        // the global scope. A type position (`x: Date`) is not a use.
        Program() {
          const root = context.sourceCode.scopeManager.globalScope;

          if (root === null) return;

          const declaredGlobals = [...root.set.values()].filter((v) => v.defs.length === 0);
          const references = [...root.through, ...declaredGlobals.flatMap((v) => v.references)];
          const seen = new Set<ESTree.Node>();

          for (const { identifier } of references)
            if (
              globals.has(identifier.name) &&
              !seen.has(identifier) &&
              !inTypePosition(identifier)
            ) {
              seen.add(identifier);
              report(identifier, identifier.name);
            }
        },
        MemberExpression(node: ESTree.MemberExpression) {
          const property = propertyName(node);

          if (
            node.object.type === "Identifier" &&
            GLOBAL_OBJECTS.has(node.object.name) &&
            globals.has(property) &&
            !globals.has(node.object.name)
          )
            report(node, `${node.object.name}.${property}`);

          const owner = globalOwner(node.object);

          if (ban.properties.some(([object, name]) => object === owner && name === property))
            report(node, `${owner}.${property}`);

          if (effectProperties.has(property) && isEffectModule(node.object))
            report(node, `Effect.${property}`);
        },
      };
    },
  });

const bans = {
  "no-json-stringify": banRule({
    description: "No JSON.stringify.",
    message:
      "Not for equality or keys, files or display: use the value's Schema codec, Schema.toEquivalence, or Effect's formatter.",
    globals: [],
    properties: [["JSON", "stringify"]],
  }),
  "no-entropy": banRule({
    description: "No Math.random or crypto.",
    message:
      "Runs are deterministic: ids come from the runtime's mint and the world's seed, so a story, replay or search reproduces.",
    globals: ["crypto"],
    properties: [["Math", "random"]],
  }),
  "no-clock": banRule({
    description: "No Date or performance.",
    message: "Use Effect's Clock, or the fake world's clock: a run must reproduce from its seed.",
    globals: ["Date", "performance"],
    properties: [],
  }),
  "no-timers": banRule({
    description: "No setTimeout, clearTimeout, setInterval or queueMicrotask.",
    message:
      "Use Effect's Clock, Scheduler and Effect.sleep, or the fake world's tasks: the core returns work as data for the driver.",
    globals: ["setTimeout", "clearTimeout", "setInterval", "queueMicrotask"],
    properties: [],
  }),
  "no-host-apis": banRule({
    description: "No window, document, navigator, indexedDB, localStorage or sessionStorage.",
    message: "Host APIs belong in src/host: the freeze bug, the bfcache lock, Safari's false oncomplete.",
    globals: ["window", "document", "navigator", "indexedDB", "localStorage", "sessionStorage"],
    properties: [],
  }),
  "no-effect-runtime": banRule({
    description: "No Effect runtime or Promise in the core.",
    message:
      "The core is pure and synchronous: it returns work as data and the host runs it (0.2 ms turns; Effect.try costs 170 ns against 7 ns).",
    globals: ["Promise"],
    properties: ["gen", "runSync", "runPromise", "runFork", "try", "tryPromise"].map(
      (name) => ["Effect", name] as const,
    ),
  }),
};

// A key starting with `~`: one of Flow's own marks, which a caller can copy onto any value.
const isMarkKey = (node: ESTree.Node | undefined) =>
  (node?.type === "Literal" && typeof node.value === "string" && node.value.startsWith("~")) ||
  (node?.type === "TemplateLiteral" && (node.quasis[0]?.value.cooked ?? "").startsWith("~"));

const calleeName = (callee: ESTree.Node) =>
  callee.type === "Identifier"
    ? callee.name
    : callee.type === "MemberExpression"
      ? `${callee.object.type === "Identifier" ? callee.object.name : ""}.${propertyName(callee)}`
      : "";

const markProbes = new Set(["hasProperty", "Predicate.hasProperty", "Object.hasOwn"]);

// A value trusted because it carries a `~` mark: anyone can forge the mark, so a Flow-made value is
// recognised by identity (a WeakSet or WeakMap Flow fills when it makes the value) instead.
const noMarkProbeRule = defineRule({
  meta: {
    type: "problem",
    docs: { description: "No probe of a `~` mark: Flow-made values are recognised by identity." },
    messages: {
      probe:
        "`{{call}}` trusts a value by its `~` mark, which any caller can copy. Recognise a Flow-made value by identity: a WeakSet or WeakMap filled where Flow makes it.",
    },
    schema: [
      {
        type: "object",
        properties: {
          only: { type: "array", items: { type: "string" } },
          except: { type: "array", items: { type: "string" } },
          exceptTests: { type: "boolean" },
        },
        additionalProperties: false,
      },
    ],
  },
  createOnce(context) {
    return {
      before() {
        const rel = relativePath(context.filename);
        const given: Options = context.options[0] ?? {};

        return rel !== undefined && appliesTo(rel, given);
      },
      CallExpression(node: ESTree.CallExpression) {
        const name = calleeName(node.callee);
        const key = node.arguments[1];

        if (markProbes.has(name) && key !== undefined && key.type !== "SpreadElement" && isMarkKey(key))
          context.report({ node, messageId: "probe", data: { call: name } });
      },
      BinaryExpression(node: ESTree.BinaryExpression) {
        if (node.operator === "in" && isMarkKey(node.left))
          context.report({ node, messageId: "probe", data: { call: "in" } });
      },
    };
  },
});

const flowStateLintPlugin = eslintCompatPlugin({
  meta: { name: "flow-state" },
  rules: {
    "no-spec-ids": noSpecIdsRule,
    "derived-reports": derivedReportsRule,
    "no-mark-probe": noMarkProbeRule,
    ...bans,
  },
});

export default flowStateLintPlugin;
