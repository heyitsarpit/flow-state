import { defineConfig } from "vite-plus";

// Lint and format cover Flow State v3 production code only. The rule choices and their reasons
// are in tools/lint-bomb/FLOW-STATE.md; change both together.
const production = "packages/flow-state-v3";
const productionSource = `${production}/src`;

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
    [`${productionSource}/**/*.{js,jsx,ts,tsx,json,jsonc,md,css,html,yaml,yml}`]: "vp check --fix",
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
      "typescript/no-empty-object-type": "error",
      "typescript/no-extraneous-class": "error",
      "typescript/no-misused-promises": "error",
      "typescript/no-namespace": "error",
      "typescript/no-unsafe-function-type": "error",
      "typescript/no-unsafe-type-assertion": "error",
      "typescript/no-unnecessary-condition": "error",
      "typescript/no-unnecessary-type-arguments": "error",
      "typescript/no-unnecessary-type-assertion": "error",
      "typescript/no-unnecessary-type-constraint": "error",
      "typescript/switch-exhaustiveness-check": "error",
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
      "lint-bomb/no-direct-process-env": ["error", { sourceRoots: [productionSource] }],
      "lint-bomb/no-effect-promise": "error",
      "lint-bomb/no-effect-ref-read-then-write": "error",
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
      "lint-bomb/no-module-level-mutable-state": ["error", { sourceRoots: [productionSource] }],
      "lint-bomb/no-module-mocking": "error",
      "lint-bomb/no-nested-conditional-expression": "error",
      "lint-bomb/no-nullish-function-contracts": "error",
      "lint-bomb/no-numeric-duration": "error",
      "lint-bomb/no-object-iteration-result-cast": "error",
      "lint-bomb/no-object-type": ["error", { sourceRoots: [productionSource] }],
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
      "lint-bomb/no-unknown": ["error", { sourceRoots: [productionSource] }],
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
      "lint-bomb/no-readonly": "warn",
      "lint-bomb/no-optional-domain-properties": ["warn", { sourceRoots: [productionSource] }],
      "lint-bomb/no-runtime-typeof": ["error", { allowInTypeGuards: true }],

      // lint-bomb, disabled (2) until the production module layout and entrypoints exist.
      "lint-bomb/no-inward-module-dependency": "off",
      "lint-bomb/no-public-entrypoint-export-drift": "off",
    },
    overrides: [
      {
        files: [`${productionSource}/**/*.{ts,tsx}`],
        rules: {
          "import/no-mutable-exports": "error",
          "no-param-reassign": "error",
          "no-var": "error",
        },
      },
      {
        files: [`${productionSource}/**/*.{ts,tsx}`],
        excludeFiles: productionTests,
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
              ],
              checkGlobalObject: true,
              globalObjects: ["global"],
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
      include: ["packages/flow-state-rewrite/src/**/*.ts"],
      exclude: ["**/test/**", "**/*.compile.ts", "**/*.d.ts"],
      reporter: ["text", "html", "json-summary"],
      reportsDirectory: "coverage/flow-state-rewrite",
    },
  },
});
