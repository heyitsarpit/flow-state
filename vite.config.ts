import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    dts: {
      generator: "tsgo",
      tsconfig: "tsconfig.pack.json",
    },
    tsconfig: "tsconfig.pack.json",
  },
  staged: {
    "packages/flow-state-rewrite/**/*.{js,jsx,ts,tsx,json,jsonc,md,css,html,yaml,yml}":
      "vp check --fix",
  },
  lint: {
    jsPlugins: [
      { name: "vite-plus", specifier: "vite-plus/oxlint-plugin" },
      { name: "anti-slop", specifier: "./tools/oxlint/anti-slop/index.ts" },
    ],
    rules: {
      complexity: "error",
      "no-else-return": "error",
      "no-unneeded-ternary": "error",
      "typescript/no-empty-object-type": "warn",
      "typescript/no-extraneous-class": "error",
      "typescript/no-misused-promises": "warn",
      "typescript/no-namespace": "error",
      "typescript/no-unsafe-function-type": "error",
      "typescript/no-unsafe-type-assertion": "warn",
      "typescript/no-unnecessary-condition": "warn",
      "typescript/no-unnecessary-type-arguments": "warn",
      "typescript/no-unnecessary-type-assertion": "warn",
      "typescript/no-unnecessary-type-constraint": "error",
      "typescript/switch-exhaustiveness-check": "warn",
      "vite-plus/prefer-vite-plus-imports": "error",
      "anti-slop/no-excessive-cognitive-complexity": [
        "warn",
        { threshold: 15, minimumBranches: 3 },
      ],
      "anti-slop/no-for-each": "warn",
      "anti-slop/use-export-type": "warn",
      "anti-slop/use-import-type": "warn",
      "anti-slop/no-anonymous-default-export": "warn",
      // These external rules are review signals: syntax alone cannot prove the owner-level performance or tagged-value contract.
      "anti-slop/no-array-filter-map": "warn",
      "anti-slop/no-array-from-then-map": "error",
      "anti-slop/no-bivariant-callback": "error",
      "anti-slop/no-chained-type-assertions": "error",
      "anti-slop/no-conditional-empty-object-spread": "error",
      "anti-slop/no-conditional-array-spread": "error",
      "anti-slop/no-context-tag": "error",
      // "anti-slop/no-data-taggederror": "error", // Superseded by no-parallel-diagnostic-errors.
      "anti-slop/no-direct-process-env": [
        "warn",
        {
          sourceRoots: ["packages/flow-state/src", "packages/flow-state-rewrite/src"],
        },
      ],
      "anti-slop/no-effect-promise": "error",
      // "anti-slop/no-effect-promise-microtask": "error", // Subsumed by no-effect-promise.
      "anti-slop/no-unjustified-effect-try-promise": "error",
      "anti-slop/no-effect-runner-in-domain": [
        "error",
        {
          allowedFiles: [
            "packages/flow-state/src/core/orchestrator/orchestrator-system.ts",
            "packages/flow-state/src/core/runtime/services/host-signals.ts",
            "packages/flow-state/src/public/root.ts",
            "packages/flow-state/src/public/runtime.ts",
            "packages/flow-state/src/runtime/contract-runtime.ts",
          ],
        },
      ],
      // These are review signals: syntax cannot establish owner semantics or expected failure classification.
      "anti-slop/no-stateful-effect-construction": "warn",
      "anti-slop/no-eager-stateful-effect-succeed": "warn",
      "anti-slop/no-expected-failure-as-defect": "warn",
      "anti-slop/no-constant-effect-flatmap": "warn",
      "anti-slop/no-empty-context-make-unsafe": "warn",
      "anti-slop/no-public-runtime-infrastructure": [
        "error",
        {
          sourceRoots: ["packages/flow-state-rewrite/src/public"],
          allowedPathFragments: ["/src/public/adapter/", "/src/public/host/"],
        },
      ],
      "anti-slop/no-object-iteration-result-cast": "error",
      "anti-slop/no-effect-ref-read-then-write": "error",
      "anti-slop/no-escape-hatch-assertion": "error",
      "anti-slop/no-explicit-any": "error",
      "anti-slop/no-unknown": [
        "error",
        {
          // Adopt the unified rule at the public/domain boundary first; internal admission and runtime owners still contain intentional boundary erasure that must be migrated with their contracts.
          sourceRoots: ["packages/flow-state-rewrite/src/public"],
          allowedSchemaFields: [
            {
              file: "packages/flow-state-rewrite/src/machine/admission.ts",
              fields: ["default", "states", "on", "redirect", "activities", "timers"],
            },
            {
              file: "packages/flow-state-rewrite/src/operation/resource.ts",
              fields: ["gcTime", "staleTime"],
            },
          ],
          allowedParameters: [
            {
              file: "packages/flow-state-rewrite/src/diagnostic/diagnostic.ts",
              fields: ["defect"],
            },
            {
              file: "packages/flow-state-rewrite/src/public/root.ts",
              fields: ["cause"],
            },
          ],
        },
      ],
      "anti-slop/no-expect-in-if": "error",
      "anti-slop/no-implicit-effect-concurrency": "error",
      "anti-slop/no-manual-effect-error-tag": "warn",
      "anti-slop/no-manual-tag-comparison": "warn",
      "anti-slop/no-inward-module-dependency": [
        "warn",
        {
          profiles: [
            {
              sourceRoot: "packages/flow-state/src/core",
              forbiddenRoots: [
                "packages/flow-state/src/cli",
                "packages/flow-state/src/react",
                "packages/flow-state/src/testing",
                "packages/flow-state/src/runtime",
                "packages/flow-state/src/index.ts",
                "packages/flow-state/src/server.ts",
              ],
            },
            {
              sourceRoot: "packages/flow-state-rewrite/src/internal",
              forbiddenRoots: [
                "packages/flow-state-rewrite/src/public",
                "packages/flow-state-rewrite/src/index.ts",
                "packages/flow-state-rewrite/src/react-entry.ts",
                "packages/flow-state-rewrite/src/testing.ts",
                "packages/flow-state-rewrite/src/inspect.ts",
              ],
            },
          ],
        },
      ],
      "anti-slop/no-known-value-widening": "error",
      "anti-slop/no-inline-import-type-query": "error",
      "anti-slop/no-local-definite-assignment": "error",
      "anti-slop/no-module-mocking": "error",
      "anti-slop/no-numeric-duration": "error",
      "anti-slop/no-nested-conditional-expression": "error",
      // Contract-required public snapshots may be frozen; keep this as a review signal for private boundaries.
      "anti-slop/no-object-freeze": "warn",
      "anti-slop/no-generic-utility-module": "warn",
      "anti-slop/no-god-service-shape": ["warn", { threshold: 16 }],
      "anti-slop/no-large-production-file": [
        "warn",
        { productionThreshold: 500, testThreshold: 1000 },
      ],
      "anti-slop/no-object-type": ["error", { sourceRoots: ["packages/flow-state-rewrite"] }],
      "anti-slop/no-optional-domain-properties": [
        "error",
        {
          sourceRoots: [
            "packages/flow-state/src/core/api",
            "packages/flow-state/src/vnext",
            "packages/flow-state-rewrite/src/public",
          ],
        },
      ],
      "anti-slop/no-package-dist-or-self-import-in-src": [
        "error",
        {
          packages: [
            { packageName: "flow-state", sourceRoot: "packages/flow-state/src" },
            {
              packageName: "flow-state-rewrite",
              sourceRoot: "packages/flow-state-rewrite/src",
            },
          ],
        },
      ],
      "anti-slop/no-promise-microtask-barrier": "error",
      "anti-slop/no-raw-try-catch": "error",
      // Contract-required public shapes use readonly; keep this as a review signal for private state modeling.
      "anti-slop/no-readonly": "warn",
      "anti-slop/no-reduce-accumulator-copy": "warn",
      // Enable manually when the repository is ready to adopt this formatting policy.
      // "anti-slop/require-readable-spacing": "warn",
      "anti-slop/no-public-entrypoint-export-drift": [
        "error",
        {
          packages: [
            {
              sourceRoot: "packages/flow-state/src",
              entrypoints: ["index.ts", "react-entry.ts", "testing.ts", "server.ts", "inspect.ts"],
            },
            {
              sourceRoot: "packages/flow-state-rewrite/src",
              entrypoints: ["index.ts", "react-entry.ts", "testing.ts", "inspect.ts"],
            },
          ],
        },
      ],
      // "anti-slop/no-redundant-readonly-wrapper": "error",
      "anti-slop/prefer-inferred-return-types": "warn",
      "anti-slop/no-reflect-apply": "error",
      "anti-slop/no-reflect-get": "error",
      "anti-slop/no-runtime-typeof": ["error", { allowInTypeGuards: true }],
      "anti-slop/no-shallow-json-domain-cast": "error",
      "anti-slop/no-shape-in-symbol-names": "error",
      "anti-slop/no-service-shape-parameter-extraction": "error",
      "anti-slop/no-staged-object-assign": "error",
      "anti-slop/no-swallowed-cleanup-error": "error",
      "anti-slop/no-ternary-iife": "error",
      "anti-slop/no-top-level-mutable-production-state": "warn",
      "anti-slop/no-throw-in-effect-gen": "error",
      "anti-slop/no-unmanaged-effect-scope": "error",
      "anti-slop/no-parallel-diagnostic-errors": "error",
      "anti-slop/no-unwrapped-promise-in-effect-core": "error",
      "anti-slop/no-unsafe-dictionary-type": "error",
      "anti-slop/no-unsafe-fiber-methods": "error",
      "anti-slop/no-widen-then-assert": "error",
      "anti-slop/require-safety-comment-for-type-assertion": "error",
    },
    options: { typeAware: true, typeCheck: true },
    overrides: [
      {
        files: ["packages/flow-state/src/**", "packages/flow-state-rewrite/src/**"],
        rules: {
          "no-restricted-imports": [
            "warn",
            {
              patterns: [
                {
                  group: [
                    "flow-state",
                    "flow-state/*",
                    "flow-state-rewrite",
                    "flow-state-rewrite/*",
                  ],
                  message: "Package source must import its owning relative source module.",
                },
                {
                  group: ["**/dist/**"],
                  message: "Package source must not import built dist output.",
                },
              ],
            },
          ],
        },
      },
    ],
    // Reference applications intentionally use APIs that the library has not
    // implemented yet. They remain formatted and syntax-checked separately.
    ignorePatterns: ["reference/**", "tools/oxlint/anti-slop/**"],
  },
  fmt: {
    ignorePatterns: ["tools/oxlint/anti-slop/**"],
  },
  test: {
    include: ["packages/**/*.test.ts", "examples/**/*.test.ts", "examples/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      include: ["packages/flow-state-rewrite/src/**/*.ts"],
      exclude: ["**/test/**", "**/*.compile.ts", "**/*.d.ts"],
      reporter: ["text", "html", "json-summary"],
      reportsDirectory: "coverage/flow-state-rewrite",
    },
  },
});
