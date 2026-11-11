import { defineConfig } from "vite-plus";

// Lint and format cover Flow State v3 production code only. The rule choices and their reasons
// are in tools/lint-bomb/FLOW-STATE.md; change both together.
const production = "packages/flow-state-v3";
const productionSource = `${production}/src`;
// The conformance suite is production code too: an edge, so it may use Effect, but not the core.
const productionSuite = `${production}/conformance`;
const productionCode = [productionSource, productionSuite];

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

// The pure core: everything in src except host adapters and tests. `src/host/` is a proposed name;
// fix it when the module layout is decided (tools/lint-bomb/FLOW-STATE.md, "Deferred").
const productionHost = `${productionSource}/host/**`;

const productionTests = [
  `${productionSource}/**/*.test.{ts,tsx}`,
  `${productionSource}/**/*.spec.{ts,tsx}`,
  `${productionSource}/**/__tests__/**/*.{ts,tsx}`,
  `${productionSource}/**/test/**/*.{ts,tsx}`,
  `${productionSource}/**/testing/**/*.{ts,tsx}`,
];

export default defineConfig({
  pack: {
    dts: {
      generator: "tsgo",
      tsconfig: "tsconfig.pack.json",
    },
    tsconfig: "tsconfig.pack.json",
  },
  staged: {
    [`${production}/{src,conformance}/**/*.{js,jsx,ts,tsx,json,jsonc,md,css,html,yaml,yml}`]: "vp check --fix",
  },
  lint: {
    options: { typeAware: true, typeCheck: true },
    plugins: ["eslint", "typescript", "unicorn", "oxc", "import"],
    jsPlugins: [
      { name: "vite-plus", specifier: "vite-plus/oxlint-plugin" },
      { name: "lint-bomb", specifier: "./tools/lint-bomb/src/index.ts" },
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
      "typescript/no-unsafe-function-type": "error",
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
      "lint-bomb/no-allocation-in-loop": ["warn", { sourceRoots: [`${productionSource}/core/turn.ts`] }],
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
        // Public option bags use `?:` under exactOptionalPropertyTypes, as Effect does
        // (tools/lint-bomb/FLOW-STATE.md). The suite's machines are app code over those bags.
        files: [
          `${productionSource}/contract.ts`,
          `${productionSource}/definition.ts`,
          `${productionSource}/machine.ts`,
          `${productionSource}/flow.ts`,
          `${productionSource}/error.ts`,
          `${productionSource}/host/runtime.ts`,
          `${productionSuite}/machines/**/*.ts`,
        ],
        rules: { "lint-bomb/no-optional-domain-properties": "off" },
      },
      {
        files: [`${productionSource}/**/*.{ts,tsx}`, `${productionSuite}/**/*.{ts,tsx}`],
        rules: {
          "import/no-mutable-exports": "error",
          // props: a turn never mutates a value it was given, such as the previous turn's state.
          "no-param-reassign": ["error", { props: true }],
          "no-var": "error",
        },
      },
      {
        // Time, timers and randomness come from Effect's Clock, Scheduler and the host's entropy,
        // in all of src: only the real host's adapter touches the platform's own (the user,
        // 2026-11-11, T43). It comes before the core's wider ban, which replaces it for the core.
        files: [`${productionSource}/**/*.{ts,tsx}`],
        excludeFiles: [...productionTests, `${productionSource}/host/browser.ts`],
        rules: {
          "no-restricted-globals": [
            "error",
            ...["setTimeout", "clearTimeout"].map((name) => ({
              name,
              message: "Use Effect's Clock and Effect.sleep; only src/host/browser.ts touches the platform.",
            })),
          ],
          "no-restricted-properties": [
            "error",
            ...[
              ["Date", "now"],
              ["performance", "now"],
              ["Math", "random"],
            ].map(([object, property]) => ({
              object,
              property,
              message: "Use Effect's Clock or the host's entropy; only src/host/browser.ts touches the platform.",
            })),
          ],
        },
      },
      {
        // The core is pure, deterministic and host-free. Only src/host/ touches the platform.
        files: [`${productionSource}/**/*.{ts,tsx}`],
        excludeFiles: [...productionTests, productionHost],
        rules: {
          "no-restricted-globals": [
            "error",
            {
              globals: [
                { name: "Date", message: "Use the supplied Effect Clock at the host boundary." },
                {
                  name: "performance",
                  message: "Use the supplied Effect Clock at the host boundary.",
                },
                ...["window", "document", "navigator", "indexedDB", "localStorage", "sessionStorage"].map(
                  (name) => ({ name, message: "Host APIs belong in src/host/, not the core." }),
                ),
                ...["setTimeout", "clearTimeout", "setInterval", "queueMicrotask", "Promise"].map((name) => ({
                  name,
                  message: "The core schedules nothing itself: return the work as data for the driver.",
                })),
                {
                  name: "crypto",
                  message: "The core is deterministic: ids come from the runtime's own mint.",
                },
              ],
              checkGlobalObject: true,
              globalObjects: ["global", "globalThis", "window"],
            },
          ],
          "no-restricted-properties": [
            "error",
            {
              object: "Math",
              property: "random",
              message: "The core is deterministic: stories, replays and searches must reproduce a run.",
            },
            {
              object: "JSON",
              property: "stringify",
              message:
                "Not for equality or keys: use Schema.toEquivalence, or the key's Schema codec.",
            },
            ...["gen", "runSync", "runPromise", "runFork", "try", "tryPromise"].map((property) => ({
              object: "Effect",
              property,
              message: "No Effect runtime in the core: it returns work as data, the host runs it.",
            })),
          ],
        },
      },
      {
        // The suite is deterministic: a seed and the fake world reproduce every run. Only the runner
        // touches the process.
        files: [`${productionSuite}/**/*.{ts,tsx}`],
        excludeFiles: [`${productionSuite}/runner/**`],
        rules: {
          "no-restricted-globals": [
            "error",
            {
              globals: [
                ...["Date", "performance"].map((name) => ({
                  name,
                  message: "Use the fake world's clock: a run must reproduce from its seed.",
                })),
                ...["setTimeout", "setInterval", "queueMicrotask"].map((name) => ({
                  name,
                  message: "Schedule through the fake world's clock or tasks.",
                })),
                { name: "crypto", message: "Derive values from the world's seed." },
              ],
              checkGlobalObject: true,
              globalObjects: ["global", "globalThis"],
            },
          ],
          "no-restricted-properties": [
            "error",
            {
              object: "Math",
              property: "random",
              message: "Derive values from the world's seed: a run must reproduce.",
            },
          ],
        },
      },
      {
        files: productionTests,
        rules: {
          "no-restricted-globals": [
            "error",
            {
              globals: [
                {
                  name: "setInterval",
                  message: "Use TestClock, Deferred, or an explicit owner receipt.",
                },
                {
                  name: "setTimeout",
                  message: "Use TestClock, Deferred, or an explicit owner receipt.",
                },
              ],
              checkGlobalObject: true,
              globalObjects: ["global"],
            },
          ],
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
    include: ["packages/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["packages/flow-state-v3/src/**/*.ts", "packages/flow-state-v3/conformance/**/*.ts"],
      exclude: ["**/test/**", "**/*.compile.ts", "**/*.d.ts"],
      reporter: ["text", "html", "json-summary"],
      reportsDirectory: "coverage/flow-state-rewrite",
    },
  },
});
