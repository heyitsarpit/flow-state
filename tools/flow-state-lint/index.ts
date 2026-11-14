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

// One rule per ban. Each covers all of packages/flow-state-v3 unless `except` names a folder (paths
// relative to the package, never single files), and the `except` option replaces the default folders.
const PACKAGE = "packages/flow-state-v3/";

const GLOBAL_OBJECTS = new Set(["global", "globalThis", "window"]);

type Ban = {
  readonly description: string;
  readonly message: string;
  // Bare global names, also caught as `globalThis.name`, `global.name` and `window.name`.
  readonly globals: ReadonlyArray<string>;
  // `object.property` calls; `object` is a global (Math, JSON) or an imported namespace (Effect).
  readonly properties: ReadonlyArray<readonly [object: string, property: string]>;
  readonly except: ReadonlyArray<string>;
  // Applies only below this folder.
  readonly only?: string;
  // Test files (`*.test.ts`, `test/`) are exempt.
  readonly exceptTests?: boolean;
};

const insideFolder = (path: string, folder: string) => path.startsWith(`${folder}/`);

const isTestFile = (path: string) =>
  /\.test\.tsx?$/u.test(path) || path.split("/").includes("test");

const relativePath = (filename: string) => {
  const at = filename.replaceAll("\\", "/").lastIndexOf(PACKAGE);

  return at < 0 ? undefined : filename.replaceAll("\\", "/").slice(at + PACKAGE.length);
};

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

const banRule = (ban: Ban) =>
  defineRule({
    meta: {
      type: "problem",
      docs: { description: ban.description },
      messages: { banned: "`{{name}}` is banned here. {{reason}}" },
      schema: [
        {
          type: "object",
          properties: { except: { type: "array", items: { type: "string" } } },
          additionalProperties: false,
        },
      ],
    },
    createOnce(context) {
      const globals = new Set(ban.globals);
      let applies = false;

      const report = (node: ESTree.Node, name: string) =>
        context.report({ node, messageId: "banned", data: { name, reason: ban.message } });

      // `globalThis.Math.random` and `globalThis["Math"].random` read as `Math.random`.
      const ownerName = (object: ESTree.Expression) => {
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
          const given: unknown = context.options[0]?.except;
          const except = Array.isArray(given) ? given.map(String) : ban.except;

          applies =
            rel !== undefined &&
            (ban.only === undefined || insideFolder(rel, ban.only)) &&
            !except.some((folder) => insideFolder(rel, folder)) &&
            !(ban.exceptTests === true && isTestFile(rel));

          return applies;
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

          const owner = ownerName(node.object);

          if (ban.properties.some(([object, name]) => object === owner && name === property))
            report(node, `${owner}.${property}`);
        },
      };
    },
  });

const platform = "src/host/platform";
const edgeClocks = [platform, "conformance/runner", "bench"];

const bans = {
  "no-json-stringify": banRule({
    description: "No JSON.stringify.",
    message:
      "Not for equality or keys, files or display: use the value's Schema codec, Schema.toEquivalence, or Effect's formatter.",
    globals: [],
    properties: [["JSON", "stringify"]],
    except: [],
  }),
  "no-entropy": banRule({
    description: "No Math.random or crypto.",
    message:
      "Runs are deterministic: ids come from the runtime's mint and the world's seed, so a story, replay or search reproduces.",
    globals: ["crypto"],
    properties: [["Math", "random"]],
    except: [platform],
  }),
  "no-clock": banRule({
    description: "No Date or performance.",
    message: "Use Effect's Clock, or the fake world's clock: a run must reproduce from its seed.",
    globals: ["Date", "performance"],
    properties: [],
    except: edgeClocks,
  }),
  "no-timers": banRule({
    description: "No setTimeout, clearTimeout, setInterval or queueMicrotask.",
    message:
      "Use Effect's Clock, Scheduler and Effect.sleep, or the fake world's tasks: the core returns work as data for the driver.",
    globals: ["setTimeout", "clearTimeout", "setInterval", "queueMicrotask"],
    properties: [],
    except: edgeClocks,
  }),
  "no-host-apis": banRule({
    description: "No window, document, navigator, indexedDB, localStorage or sessionStorage.",
    message: "Host APIs belong in src/host: the freeze bug, the bfcache lock, Safari's false oncomplete.",
    globals: ["window", "document", "navigator", "indexedDB", "localStorage", "sessionStorage"],
    properties: [],
    except: ["src/host"],
  }),
  "no-effect-runtime": banRule({
    description: "No Effect runtime or Promise in the core.",
    message:
      "The core is pure and synchronous: it returns work as data and the host runs it (0.2 ms turns; Effect.try costs 170 ns against 7 ns).",
    globals: ["Promise"],
    properties: ["gen", "runSync", "runPromise", "runFork", "try", "tryPromise"].map(
      (name) => ["Effect", name] as const,
    ),
    only: "src",
    except: ["src/host"],
    exceptTests: true,
  }),
};

const flowStateLintPlugin = eslintCompatPlugin({
  meta: { name: "flow-state" },
  rules: { "no-spec-ids": noSpecIdsRule, "derived-reports": derivedReportsRule, ...bans },
});

export default flowStateLintPlugin;
