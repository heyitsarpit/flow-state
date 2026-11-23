import { configDefaults, defineConfig } from "vite-plus";

// Lint and format cover Flow State v3 production code only. The rule choices and their reasons
// are in tools/lint-bomb/FLOW-STATE.md; change both together.
const production = "packages/flow-state-v3";
const productionSource = `${production}/src`;
// Flow State's own tests are production code too: an edge, so they may use Effect, but not the core.
const packageTests = `${production}/tests`;
const productionCode = [production];

// Frozen or throwaway code: never linted or formatted.
const frozen = [
  "packages/flow-state/**",
  "packages/flow-state-rewrite/**",
  `${production}/prototypes/**`,
  "codebases/**",
  "reference/**",
  "tools/lint-bomb/**",
  "tools/oxlint/**",
];

// The stress runs (stress Stories, their reload sweeps, generated stress seeds) live in
// `*.stress.test.ts` files: left out by default, and the only files run under FLOW_STRESS=1
// (`nub run test:stress`). tools/stress/select.test.ts checks both selections.
const stressTests = `${production}/**/*.stress.test.ts`;
const stressRun = process.env["FLOW_STRESS"] === "1";
// Frozen packages are never edited and fail on their own, so every run skips them.
const frozenTests = ["packages/flow-state/**", "packages/flow-state-rewrite/**"];

const productionTests = [
  `${productionSource}/**/*.test.{ts,tsx}`,
  `${productionSource}/**/*.test-d.ts`,
  `${productionSource}/**/*.spec.{ts,tsx}`,
  `${productionSource}/**/__tests__/**/*.{ts,tsx}`,
  `${productionSource}/**/test/**/*.{ts,tsx}`,
  `${productionSource}/**/testing/**/*.{ts,tsx}`,
];

// The package's import rules, as `no-restricted-imports` patterns. A pattern matches the import
// specifier, whatever the importing file's depth.
const outsideSource = {
  group: ["**/fixtures/**", "**/tests/**", "**/bench/**"],
  message: "Production code imports no fixture, test or bench.",
};
const hostFromCore = {
  group: ["**/host/**"],
  message: "The core imports nothing from the host.",
};
const testsFromFixtures = {
  group: ["**/tests/**", "**/bench/**"],
  message: "A fixture imports no test or bench.",
};
const sourceFromFixtures = {
  group: [
    "**/src/**",
    "!**/src/index.ts",
    "!**/src/host/testing/index.ts",
    "!**/src/host/persistence.ts",
  ],
  message: "A fixture imports only the public entry, the persistence route and the test tooling.",
};
const sourceFromTests = {
  group: [
    "**/src/**",
    "!**/src/index.ts",
    "!**/src/host/testing/index.ts",
    "!**/src/host/inspect.ts",
    "!**/src/host/trace.ts",
    "!**/src/host/cli/main.ts",
    "!**/src/host/persistence.ts",
    "!**/src/entry.ts",
    "!**/src/test/loose.ts",
  ],
  message:
    "A test imports only the public entry, the test tooling, the persistence route, inspection, the CLI's main, the registry of public functions and the untyped caller's helper.",
};

export default defineConfig({
  pack: {
    dts: {
      generator: "tsgo",
      tsconfig: "tsconfig.pack.json",
    },
    tsconfig: "tsconfig.pack.json",
  },
  staged: {
    [`${production}/{src,tests,fixtures,bench}/**/*.{js,jsx,ts,tsx,json,jsonc,md,css,html,yaml,yml}`]:
      "vp check --fix",
  },
  lint: {
    options: { typeAware: true, typeCheck: true },
    plugins: ["eslint", "typescript", "unicorn", "oxc", "import"],
    jsPlugins: [
      { name: "vite-plus", specifier: "vite-plus/oxlint-plugin" },
      { name: "lint-bomb", specifier: "./tools/lint-bomb/src/index.ts" },
      { name: "flow-state", specifier: "./tools/flow-state-lint/index.ts" },
    ],
    rules: {
      // Built-in rules, as in lint-bomb's own configuration.
      complexity: "error",
      "no-else-return": "error",
      "no-unneeded-ternary": "error",
      // Replaced by lint-bomb/no-empty-object-type, which allows `{}` as an empty TaggedEnum variant.
      "typescript/no-empty-object-type": "off",
      "typescript/no-extraneous-class": "error",
      "typescript/no-misused-promises": "error",
      "typescript/no-namespace": "error",
      "typescript/no-unsafe-argument": "error",
      "typescript/no-unsafe-assignment": "error",
      "typescript/no-unsafe-call": "error",
      "typescript/no-unsafe-function-type": "error",
      "typescript/no-unsafe-member-access": "error",
      "typescript/no-unsafe-return": "error",
      "typescript/no-unsafe-type-assertion": "error",
      "typescript/no-unnecessary-condition": "error",
      "typescript/no-unnecessary-type-arguments": "error",
      "typescript/no-unnecessary-type-assertion": "error",
      "typescript/no-unnecessary-type-constraint": "error",
      // A `default:` does not count as handling a tagged case: every variant is named.
      "typescript/switch-exhaustiveness-check": [
        "error",
        { considerDefaultExhaustiveForUnions: false },
      ],
      // A dropped promise at the host boundary is a lost write.
      "typescript/no-floating-promises": "error",
      // Shared turn state is never sorted or reversed in place.
      "unicorn/no-array-sort": "error",
      "unicorn/no-array-reverse": "error",
      "vite-plus/prefer-vite-plus-imports": "error",

      // lint-bomb, applied as shipped (59).
      "lint-bomb/no-anonymous-default-export": "error",
      "lint-bomb/no-array-from-then-map": "error",
      "lint-bomb/no-bivariant-callback": "error",
      "lint-bomb/no-chained-type-assertions": "error",
      "lint-bomb/no-conditional-array-spread": "error",
      "lint-bomb/no-conditional-empty-object-spread": "error",
      "lint-bomb/no-constant-effect-flatmap": "error",
      "lint-bomb/no-context-tag": "error",
      "lint-bomb/no-direct-process-env": ["error", { sourceRoots: productionCode }],
      "lint-bomb/no-effect-promise": "error",
      "lint-bomb/no-effect-ref-read-then-write": "error",
      "lint-bomb/no-empty-object-type": "error",
      // The core returns expected failures as values; only named defects may be thrown.
      "lint-bomb/no-throw-in-core": [
        "error",
        { sourceRoots: [productionSource], defects: ["Defect", "unreachable"] },
      ],
      // A review signal for hot paths: the turn's own module (T16 layout, 2026-11-11). The step and the
      // host build new values per change by design (plain immutable data), so they are not narrowed in.
      "lint-bomb/no-allocation-in-loop": [
        "warn",
        { sourceRoots: [`${productionSource}/core/turn.ts`] },
      ],
      // The host boundary that runs fibers gets allowedDirectories once the layout exists.
      "lint-bomb/no-effect-runner-in-domain": "error",
      "lint-bomb/no-empty-context-make-unsafe": "error",
      "lint-bomb/no-escape-hatch-assertion": "error",
      "lint-bomb/no-excessive-cognitive-complexity": [
        "error",
        { threshold: 15, minimumBranches: 3 },
      ],
      "lint-bomb/no-expect-in-if": "error",
      "lint-bomb/no-explicit-any": "error",
      "lint-bomb/no-for-each": "error",
      "lint-bomb/no-generic-utility-module": "error",
      "lint-bomb/no-implicit-effect-concurrency": "error",
      "lint-bomb/no-inline-import-type-query": "error",
      "lint-bomb/no-known-value-widening": "error",
      "lint-bomb/no-local-definite-assignment": "error",
      "lint-bomb/no-manual-effect-error-tag": "error",
      "lint-bomb/no-manual-tag-comparison": "error",
      "lint-bomb/no-module-level-mutable-state": ["error", { sourceRoots: productionCode }],
      "lint-bomb/no-module-mocking": "error",
      "lint-bomb/no-nested-conditional-expression": "error",
      "lint-bomb/no-nullish-function-contracts": "error",
      "lint-bomb/no-numeric-duration": "error",
      "lint-bomb/no-object-iteration-result-cast": "error",
      "lint-bomb/no-object-type": ["error", { sourceRoots: productionCode }],
      "lint-bomb/no-package-dist-or-self-import-in-src": [
        "error",
        { packageName: "flow-state-v3", sourceRoot: productionSource },
      ],
      "lint-bomb/no-promise-microtask-barrier": "error",
      "lint-bomb/no-raw-try-catch": "error",
      "lint-bomb/no-redundant-readonly-wrapper": "error",
      "lint-bomb/no-reduce-accumulator-copy": "error",
      "lint-bomb/no-reflect-apply": "error",
      "lint-bomb/no-reflect-get": "error",
      "lint-bomb/no-service-shape-parameter-extraction": "error",
      "lint-bomb/no-shallow-json-domain-cast": "error",
      "lint-bomb/no-shape-in-symbol-names": "error",
      "lint-bomb/no-staged-object-assign": "error",
      "lint-bomb/no-swallowed-cleanup-error": "error",
      "lint-bomb/no-ternary-iife": "error",
      "lint-bomb/no-throw-in-effect-gen": "error",
      "lint-bomb/no-unjustified-effect-try-promise": "error",
      "lint-bomb/no-unknown": ["error", { sourceRoots: productionCode }],
      "lint-bomb/no-unmanaged-effect-scope": "error",
      "lint-bomb/no-unsafe-dictionary-type": "error",
      "lint-bomb/no-unsafe-fiber-methods": "error",
      "lint-bomb/no-unwrapped-promise-in-effect-core": "error",
      "lint-bomb/no-widen-then-assert": "error",
      "lint-bomb/prefer-inferred-return-types": "error",
      "lint-bomb/require-readable-spacing": "error",
      "lint-bomb/require-safety-comment-for-type-assertion": "error",
      "lint-bomb/use-consistent-type-definitions": ["error", { preference: "type" }],
      "lint-bomb/use-export-type": "error",
      "lint-bomb/use-import-type": "error",

      // lint-bomb, softened (9): review signals, or rules that cannot yet tell public from internal.
      "lint-bomb/no-eager-stateful-effect-succeed": "warn",
      "lint-bomb/no-stateful-effect-construction": "warn",
      "lint-bomb/no-large-production-file": [
        "warn",
        { productionThreshold: 500, testThreshold: 1000 },
      ],
      "lint-bomb/no-god-service-shape": ["warn", { threshold: 16 }],
      "lint-bomb/no-object-freeze": "warn",
      "lint-bomb/prefer-effect-native-tagged-types": "warn",
      // Off: it exists to stop agents overusing readonly elsewhere; here readonly guards shared turn state.
      "lint-bomb/no-readonly": "off",
      // Internal records use Option; the public option-bag modules are exempt below (T16 layout).
      "lint-bomb/no-optional-domain-properties": ["error", { sourceRoots: productionCode }],
      // No exemption: user values arrive through their Schema, so typeof means a value skipped it.
      "lint-bomb/no-runtime-typeof": "error",

      // lint-bomb, disabled (2) until the production module layout and entrypoints exist.
      "lint-bomb/no-inward-module-dependency": "off",
      "lint-bomb/no-public-entrypoint-export-drift": "off",
    },
    overrides: [
      {
        // A type test holds each wrong line as an error-typed value beside its exact right one; its
        // exact assertions, which fail on any, are its guard.
        files: [`${production}/**/*.test-d.ts`, `${production}/tests/types/*.compile.ts`],
        rules: {
          "typescript/no-unsafe-argument": "off",
          "typescript/no-unsafe-assignment": "off",
          "typescript/no-unsafe-call": "off",
          "typescript/no-unsafe-member-access": "off",
          "typescript/no-unsafe-return": "off",
        },
      },
      {
        // Public option bags use `?:` under exactOptionalPropertyTypes, as Effect does
        // (tools/lint-bomb/FLOW-STATE.md), and so does compile-body.ts's AnyBody, the erased bag
        // every machine body assigns to. The suite's machines are app code over those bags.
        files: [
          `${productionSource}/contract.ts`,
          `${productionSource}/contract-reads.ts`,
          `${productionSource}/definition.ts`,
          `${productionSource}/derive.ts`,
          `${productionSource}/event-tokens.ts`,
          `${productionSource}/tokens.ts`,
          `${productionSource}/compile-body.ts`,
          `${productionSource}/flow.ts`,
          `${productionSource}/error.ts`,
          `${productionSource}/host/runtime.ts`,
          `${productionSource}/host/setup.ts`,
          `${production}/fixtures/shop/**/*.ts`,
          `${production}/fixtures/services/shop/**/*.ts`,
        ],
        rules: { "lint-bomb/no-optional-domain-properties": "off" },
      },
      {
        files: [`${productionSource}/**/*.{ts,tsx}`, `${packageTests}/**/*.{ts,tsx}`],
        rules: {
          "import/no-mutable-exports": "error",
          // props: a turn never mutates a value it was given, such as the previous turn's state.
          "no-param-reassign": ["error", { props: true }],
          "no-var": "error",
        },
      },
      {
        // One rule per ban, each over the whole package unless its options say otherwise. Folders are
        // relative to the package, never single files (tools/lint-bomb/FLOW-STATE.md has the reasons).
        files: [`${production}/**/*.{ts,tsx}`],
        rules: {
          "flow-state/no-json-stringify": "error",
          "flow-state/no-entropy": ["error", { except: ["src/host/platform"] }],
          "flow-state/no-clock": [
            "error",
            { except: ["src/host/platform", "bench", "tests/browser"] },
          ],
          "flow-state/no-timers": [
            "error",
            { except: ["src/host/platform", "bench", "tests/browser"] },
          ],
          "flow-state/no-host-apis": ["error", { except: ["src/host", "tests/browser"] }],
          "flow-state/no-effect-runtime": [
            "error",
            { only: ["src"], except: ["src/host"], exceptTests: true },
          ],
          // Decides by path itself: fixtures/<app>/stories and fixtures/<app>/machines only.
          "flow-state/no-raw-event": "error",
          // Decides by path itself: tests and fixtures only.
          "flow-state/no-event-name-filter": "error",
          "flow-state/paired-refusals": "error",
          "flow-state/no-hand-option": ["error", { only: ["src", "tests", "fixtures"] }],
          "flow-state/no-hand-typed-callback": [
            "error",
            { only: ["src", "tests", "fixtures", "bench"] },
          ],
          "flow-state/no-id-text": ["error", { only: ["src/core"], exceptTests: true }],
          "flow-state/no-tag-chain": ["error", { only: ["src"], exceptTests: true }],
          // Decides by path itself: the package, and outside it only when given `outside`.
          "flow-state/no-undeclared-schedule": "error",
          // Decides by path itself: src outside test files, except src/core/schedules.ts.
          "flow-state/timers-decided": "error",
          "flow-state/owners-only": [
            "error",
            {
              only: ["src/host"],
              except: ["src/host/owners", "src/host/testing", "src/host/platform", "src/host/cli"],
              exceptTests: true,
            },
          ],
        },
      },
      {
        // A public call refuses only by throwing a FlowError, and only error.ts throws one, from its
        // raise; the entry wrappers call it. Every other throw in src is a listed defect site.
        files: [`${productionSource}/error.ts`],
        rules: { "lint-bomb/no-throw-in-core": "off" },
      },
      {
        // Reports an act determines are derived from the act in one function, evidenceOf, alone in
        // its file (WriteLanes' production realization), never written beside the act.
        files: [`${productionSource}/core/**/*.ts`],
        excludeFiles: [...productionTests, `${productionSource}/core/evidence-of.ts`],
        rules: { "flow-state/derived-reports": "error" },
      },
      {
        files: [`${productionSource}/**/*.{ts,tsx}`],
        excludeFiles: productionTests,
        rules: { "flow-state/no-spec-ids": "error" },
      },
      // What may import what. Later entries replace earlier ones for a file, so each entry carries
      // every pattern its folder needs. tools/flow-state-lint/imports.test.ts plants a violation of each.
      {
        files: [`${productionSource}/**/*.{ts,tsx}`],
        rules: {
          "no-restricted-imports": ["error", { patterns: [outsideSource] }],
        },
      },
      {
        // The core is everything in src/ outside src/host/; src/index.ts is the public entry and
        // re-exports the host's Runtime.
        files: [`${productionSource}/**/*.{ts,tsx}`],
        excludeFiles: [`${productionSource}/host/**`, `${productionSource}/index.ts`],
        rules: {
          "no-restricted-imports": ["error", { patterns: [outsideSource, hostFromCore] }],
        },
      },
      {
        files: [`${production}/fixtures/**/*.{ts,tsx}`],
        rules: {
          "no-restricted-imports": ["error", { patterns: [testsFromFixtures, sourceFromFixtures] }],
        },
      },
      {
        files: [`${packageTests}/**/*.{ts,tsx}`, `${production}/bench/**/*.{ts,tsx}`],
        rules: {
          "no-restricted-imports": ["error", { patterns: [sourceFromTests] }],
        },
      },
      {
        files: productionTests,
        rules: {
          "no-restricted-properties": [
            "error",
            {
              object: "Effect",
              property: "delay",
              message: "Use TestClock, Deferred, or an explicit owner receipt.",
            },
            {
              object: "Effect",
              property: "sleep",
              message: "Use TestClock, Deferred, or an explicit owner receipt.",
            },
          ],
        },
      },
    ],
    ignorePatterns: frozen,
  },
  fmt: {
    ignorePatterns: frozen,
  },
  test: {
    include: stressRun ? [stressTests] : ["packages/**/*.test.ts"],
    // The real-browser tests run only under tools/browser/vitest.config.ts (`nub run test:browser`).
    exclude: [
      ...configDefaults.exclude,
      ...frozenTests,
      `${production}/**/*.browser.test.ts`,
      ...(stressRun ? [] : [stressTests]),
    ],
    // Type tests (`*.test-d.ts`) run in the default suite: the package's tsc checks them, and an
    // exact `expectTypeOf` that fails is a failed test.
    typecheck: {
      enabled: !stressRun,
      include: [`${production}/**/*.test-d.ts`],
      tsconfig: `${production}/tsconfig.json`,
    },
    coverage: {
      provider: "v8",
      include: ["packages/flow-state-v3/src/**/*.ts"],
      exclude: ["**/test/**", "**/*.d.ts"],
      reporter: ["text", "html", "json-summary"],
      reportsDirectory: "coverage/flow-state-v3",
    },
  },
});
