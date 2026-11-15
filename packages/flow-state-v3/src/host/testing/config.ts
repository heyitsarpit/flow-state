import type { App } from "../runtime.ts";

/**
 * The key of a config's brand: how the CLI tells a `defineConfig` result from a lookalike.
 */
export const ConfigId = "~flow-state/Config";

/**
 * A project's Flow config: its apps, each with the files its Stories are in, and the files of
 * Stories with no app. Each file entry is a glob relative to the project root.
 */
export type Config = {
  readonly [ConfigId]: typeof ConfigId;
  readonly apps: ReadonlyArray<{ readonly app: App; readonly stories: ReadonlyArray<string> }>;
  readonly stories: ReadonlyArray<string>;
};

/**
 * Declares a project's Flow config, the default export of its `flow.config.ts`.
 *
 * **When to use**
 *
 * Once per project, so `flow story list`, `flow story run` and `flow trace` find its Stories.
 *
 * **Details**
 *
 * `apps` lists each app with globs, relative to the project root, of the files its Stories are
 * exported from; `stories` lists the files of Stories with no app. Every Story a matched file
 * exports at its top level is found, by its own id.
 *
 * **Gotchas**
 *
 * - A Story found under an app must run that app.
 * - Two Stories with one id, or a glob that matches no file, fail the command before any Story runs.
 *
 * @example
 * ```ts
 * import { defineConfig } from "flow-state/testing"
 * import { CheckoutApp } from "./app/app.ts"
 *
 * export default defineConfig({
 *   apps: [{ app: CheckoutApp, stories: ["features/**\/*.story.ts"] }],
 * })
 * ```
 */
// RETURN_TYPE: the exported Config contract, its brand included.
export const defineConfig = (config: {
  readonly apps: Config["apps"];
  // oxlint-disable-next-line lint-bomb/no-optional-domain-properties -- the Plan's public word: an omitted option takes its default
  readonly stories?: ReadonlyArray<string>;
}): Config => ({ [ConfigId]: ConfigId, apps: config.apps, stories: config.stories ?? [] });
